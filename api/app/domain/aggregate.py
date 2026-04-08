"""
Game aggregate — the core domain model.

State is derived exclusively by applying domain events.
All business rules and invariants are enforced here.
No I/O, no side effects — pure domain logic.
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum

from .constants import MAX_PLAYERS, ROUND_TYPE_BATCH_SIZES, TOTAL_COINS
from .events import DomainEvent, EventType


class GamePhase(StrEnum):
    LOBBY = "lobby"
    ACTIVE = "active"
    ROUND_COMPLETE = "round_complete"
    RESULTS = "results"


class RoundType(StrEnum):
    SINGLE = "single"
    TWO_ROUNDS = "two_rounds"
    THREE_ROUNDS = "three_rounds"


@dataclass
class PlayerTimer:
    started_at: datetime | None = None
    ended_at: datetime | None = None

    @property
    def duration_seconds(self) -> float | None:
        if self.started_at and self.ended_at:
            return (self.ended_at - self.started_at).total_seconds()
        return None

    def to_dict(self) -> dict:
        return {
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
            "duration_seconds": self.duration_seconds,
        }


@dataclass
class RoundResult:
    round_number: int
    batch_size: int
    duration_seconds: float | None = None
    lead_time_seconds: float | None = None
    player_timers: dict[str, PlayerTimer] = field(default_factory=dict)
    total_completed: int = 0


@dataclass
class GameState:
    """Mutable projection of the game built from events."""

    room_id: str = ""
    host: str = ""
    host_secret: str = ""
    phase: GamePhase = GamePhase.LOBBY

    players: list[str] = field(default_factory=list)
    spectators: list[str] = field(default_factory=list)
    session_tokens: dict[str, str] = field(default_factory=dict)

    # Round configuration
    round_type: RoundType = RoundType.THREE_ROUNDS
    required_players: int = MAX_PLAYERS
    selected_batch_size: int | None = None
    current_round: int = 0
    round_results: list[RoundResult] = field(default_factory=list)

    # Active round state
    batch_size: int = TOTAL_COINS
    player_coins: dict[str, list[bool]] = field(default_factory=dict)
    sent_coins: dict[str, list[dict]] = field(default_factory=dict)
    player_timers: dict[str, PlayerTimer] = field(default_factory=dict)
    total_completed: int = 0
    round_started_at: datetime | None = None
    first_flip_at: datetime | None = None
    first_delivery_at: datetime | None = None


class GameAggregate:
    """
    Applies events to build state and enforces business rules.

    Usage:
        game = GameAggregate()
        for event in event_store.load("room-123"):
            game.apply(event)
        # game.state now reflects the current state
    """

    def __init__(self) -> None:
        self.state = GameState()
        self.version: int = 0

    def apply(self, event: DomainEvent) -> None:
        """Apply a single event to update state. Dispatches by event type."""
        handler = _EVENT_HANDLERS.get(event.event_type)
        if handler:
            handler(self.state, event)
        self.version += 1

    def apply_many(self, events: list[DomainEvent]) -> None:
        for event in events:
            self.apply(event)

    # --- Query methods (read from state) ---

    @property
    def tails_remaining(self) -> int:
        return sum(coin is False for coins in self.state.player_coins.values() for coin in coins)

    @property
    def total_rounds(self) -> int:
        return _total_rounds(self.state.round_type)

    @property
    def batch_sizes_for_game(self) -> list[int]:
        return _batch_sizes(self.state.round_type, self.state.selected_batch_size)

    @property
    def lead_time_seconds(self) -> float | None:
        s = self.state
        if s.first_flip_at and s.first_delivery_at:
            return (s.first_delivery_at - s.first_flip_at).total_seconds()
        return None

    @property
    def round_duration_seconds(self) -> float | None:
        s = self.state
        if not s.round_started_at:
            return None
        end = datetime.now(UTC)
        return (end - s.round_started_at).total_seconds()

    # --- Validation methods (enforce invariants) ---

    def can_join_as_player(self, username: str) -> str | None:
        """Return error message or None if valid."""
        if username in self.state.players or username in self.state.spectators:
            return "Username already taken"
        if username == self.state.host:
            return "Username already taken"
        if len(self.state.players) >= MAX_PLAYERS:
            return "Player limit reached"
        return None

    def can_join_as_spectator(self, username: str) -> str | None:
        if username in self.state.players or username in self.state.spectators:
            return "Username already taken"
        if username == self.state.host:
            return "Username already taken"
        return None

    def can_start(self) -> str | None:
        if self.state.phase != GamePhase.LOBBY:
            return "Game already started"
        if len(self.state.players) != self.state.required_players:
            return f"Need exactly {self.state.required_players} players"
        return None

    def can_flip(self, player: str, coin_index: int) -> str | None:
        if self.state.phase != GamePhase.ACTIVE:
            return "Game is not active"
        if player not in self.state.player_coins:
            return "Player not in game"
        coins = self.state.player_coins[player]
        if coin_index < 0 or coin_index >= len(coins):
            return "Invalid coin index"
        if coins[coin_index]:
            return "Coin already flipped"
        return None

    def can_send(self, player: str) -> str | None:
        if self.state.phase != GamePhase.ACTIVE:
            return "Game is not active"
        if player not in self.state.player_coins:
            return "Player not in game"
        coins = self.state.player_coins[player]
        heads = sum(1 for c in coins if c)
        if heads == 0:
            return "No flipped coins to send"
        if heads < self.state.batch_size and heads < len(coins):
            return "Not enough flipped coins for a batch"
        return None

    def can_start_next_round(self) -> str | None:
        if self.state.phase != GamePhase.ROUND_COMPLETE:
            return "Not in round complete state"
        if self.state.current_round >= len(self.batch_sizes_for_game):
            return "All rounds completed"
        return None

    def can_change_role(self, username: str, new_role: str) -> str | None:
        if username == self.state.host:
            return "Host role cannot be changed"
        validators = {
            "player": self._can_become_player,
            "spectator": self._can_become_spectator,
        }
        validator = validators.get(new_role)
        if validator is None:
            return "Invalid role"
        return validator(username)

    def _can_become_player(self, username: str) -> str | None:
        if username not in self.state.spectators:
            return "User is not a spectator"
        if len(self.state.players) >= MAX_PLAYERS:
            return "Player limit reached"
        return None

    def _can_become_spectator(self, username: str) -> str | None:
        if username not in self.state.players:
            return "User is not a player"
        return None

    def can_set_config(self) -> str | None:
        if self.state.phase != GamePhase.LOBBY:
            return "Can only configure in lobby"
        return None

    # --- Command helpers (compute what events to emit) ---

    def compute_send(self, player: str) -> list[dict]:
        """Compute the events needed for a send action. Returns event data dicts."""
        coins = self.state.player_coins[player]
        heads = sum(1 for c in coins if c)
        count = min(heads, self.state.batch_size)

        player_idx = self.state.players.index(player)
        is_last = player_idx == len(self.state.players) - 1

        if is_last:
            return [{"type": "complete", "player": player, "count": count}]
        else:
            next_player = self.state.players[player_idx + 1]
            return [{"type": "send", "player": player, "count": count, "to_player": next_player}]


# --- Private event handler functions ---
# Each has complexity ≤ 3, handling one event type


def _on_game_created(state: GameState, event: DomainEvent) -> None:
    state.room_id = event.room_id
    state.host = event.data["host"]
    state.host_secret = event.data["host_secret"]
    state.phase = GamePhase.LOBBY


def _on_player_joined(state: GameState, event: DomainEvent) -> None:
    username = event.data["username"]
    state.players.append(username)
    state.session_tokens[username] = event.data["session_token"]


def _on_spectator_joined(state: GameState, event: DomainEvent) -> None:
    username = event.data["username"]
    state.spectators.append(username)
    state.session_tokens[username] = event.data["session_token"]


def _on_role_changed(state: GameState, event: DomainEvent) -> None:
    username = event.data["username"]
    new_role = event.data["new_role"]
    if new_role == "player":
        state.spectators.remove(username)
        state.players.append(username)
    elif new_role == "spectator":
        state.players.remove(username)
        state.spectators.append(username)


def _on_round_config_set(state: GameState, event: DomainEvent) -> None:
    state.round_type = RoundType(event.data["round_type"])
    state.required_players = event.data["required_players"]
    state.selected_batch_size = event.data.get("selected_batch_size")


def _on_round_started(state: GameState, event: DomainEvent) -> None:
    state.phase = GamePhase.ACTIVE
    state.current_round = event.data["round_number"]
    state.batch_size = event.data["batch_size"]
    state.round_started_at = event.timestamp
    state.total_completed = 0
    state.first_flip_at = None
    state.first_delivery_at = None

    players = event.data["players"]
    state.player_coins = {p: [] for p in players}
    state.sent_coins = {p: [] for p in players}
    state.player_timers = {p: PlayerTimer() for p in players}
    state.player_coins[players[0]] = [False] * TOTAL_COINS


def _on_coin_flipped(state: GameState, event: DomainEvent) -> None:
    player = event.data["player"]
    idx = event.data["coin_index"]
    state.player_coins[player][idx] = True

    timer = state.player_timers.get(player)
    if timer and timer.started_at is None:
        timer.started_at = event.timestamp

    if state.first_flip_at is None:
        state.first_flip_at = event.timestamp


def _on_batch_sent(state: GameState, event: DomainEvent) -> None:
    player = event.data["player"]
    count = event.data["count"]
    to_player = event.data["to_player"]

    _remove_heads(state.player_coins[player], count)
    state.player_coins[to_player].extend([False] * count)
    state.sent_coins[player].append(
        {
            "count": count,
            "to_player": to_player,
            "timestamp": event.timestamp.isoformat(),
        }
    )
    _check_finished_timers(state, event.timestamp)


def _on_batch_completed(state: GameState, event: DomainEvent) -> None:
    player = event.data["player"]
    count = event.data["count"]

    _remove_heads(state.player_coins[player], count)
    state.total_completed += count
    state.sent_coins[player].append(
        {
            "count": count,
            "to_player": "COMPLETED",
            "timestamp": event.timestamp.isoformat(),
        }
    )

    if state.first_delivery_at is None:
        state.first_delivery_at = event.timestamp

    _check_finished_timers(state, event.timestamp)


def _on_round_ended(state: GameState, event: DomainEvent) -> None:
    duration = event.data["duration_seconds"]
    lead_time = event.data.get("lead_time_seconds")

    # End all running timers
    for timer in state.player_timers.values():
        if timer.started_at and timer.ended_at is None:
            timer.ended_at = event.timestamp

    result = RoundResult(
        round_number=event.data["round_number"],
        batch_size=state.batch_size,
        duration_seconds=duration,
        lead_time_seconds=lead_time,
        player_timers=dict(state.player_timers),
        total_completed=state.total_completed,
    )
    state.round_results.append(result)

    all_rounds = _batch_sizes(state.round_type, state.selected_batch_size)
    if state.current_round >= len(all_rounds):
        state.phase = GamePhase.RESULTS
    else:
        state.phase = GamePhase.ROUND_COMPLETE


def _on_game_reset(state: GameState, event: DomainEvent) -> None:
    # Preserve room identity and participants
    room_id = state.room_id
    host = state.host
    host_secret = state.host_secret
    players = state.players
    spectators = state.spectators
    tokens = state.session_tokens

    new = GameState()
    new.room_id = room_id
    new.host = host
    new.host_secret = host_secret
    new.players = players
    new.spectators = spectators
    new.session_tokens = tokens
    new.phase = GamePhase.LOBBY

    # Replace state in-place
    state.__dict__.update(new.__dict__)


# --- Helpers ---


def _remove_heads(coins: list[bool], count: int) -> None:
    """Remove `count` heads (True) from a coin list."""
    removed = 0
    i = 0
    while i < len(coins) and removed < count:
        if coins[i]:
            coins.pop(i)
            removed += 1
        else:
            i += 1


def _check_finished_timers(state: GameState, now: datetime) -> None:
    """End timers for players who have no coins left and all predecessors are done."""
    for idx, player in enumerate(state.players):
        timer = state.player_timers.get(player)
        if not timer or timer.ended_at is not None or timer.started_at is None:
            continue
        if len(state.player_coins.get(player, [])) > 0:
            continue
        predecessors_done = all(len(state.player_coins.get(state.players[j], [])) == 0 for j in range(idx))
        if predecessors_done:
            timer.ended_at = now


def _total_rounds(round_type: RoundType) -> int:
    match round_type:
        case RoundType.SINGLE:
            return 1
        case RoundType.TWO_ROUNDS:
            return 2
        case RoundType.THREE_ROUNDS:
            return 3


def _batch_sizes(round_type: RoundType, selected: int | None) -> list[int]:
    if round_type == RoundType.SINGLE:
        return [selected] if selected else [TOTAL_COINS]
    sizes = ROUND_TYPE_BATCH_SIZES.get(round_type.value)
    return sizes if sizes else [TOTAL_COINS]


# Event handler dispatch table
_EVENT_HANDLERS: dict[EventType, callable] = {
    EventType.GAME_CREATED: _on_game_created,
    EventType.PLAYER_JOINED: _on_player_joined,
    EventType.SPECTATOR_JOINED: _on_spectator_joined,
    EventType.ROLE_CHANGED: _on_role_changed,
    EventType.ROUND_CONFIG_SET: _on_round_config_set,
    EventType.ROUND_STARTED: _on_round_started,
    EventType.COIN_FLIPPED: _on_coin_flipped,
    EventType.BATCH_SENT: _on_batch_sent,
    EventType.BATCH_COMPLETED: _on_batch_completed,
    EventType.ROUND_ENDED: _on_round_ended,
    EventType.GAME_RESET: _on_game_reset,
}
