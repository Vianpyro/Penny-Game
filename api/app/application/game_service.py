"""
Game service — application layer.

Orchestrates the domain (aggregate + events), the event store,
and the broadcaster. Each public method follows the pattern:
  1. Load events → rebuild aggregate
  2. Validate the command
  3. Create new events
  4. Persist events
  5. Apply events to aggregate (for return value)
  6. Broadcast updates
"""

import random
from uuid import uuid4

from ..domain.aggregate import GameAggregate
from ..domain.constants import MAX_PLAYERS, MIN_PLAYERS, TOTAL_COINS, VALID_BATCH_SIZES
from ..domain.events import (
    DomainEvent,
    batch_completed,
    batch_sent,
    coin_flipped,
    game_created,
    game_reset,
    player_joined,
    role_changed,
    round_config_set,
    round_ended,
    round_started,
    spectator_joined,
)
from ..infrastructure.broadcaster import Broadcaster
from ..infrastructure.event_store import EventStore


class GameError(Exception):
    """Domain validation error."""

    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


class GameService:
    """Application service coordinating event-sourced game operations."""

    def __init__(self, store: EventStore, broadcaster: Broadcaster) -> None:
        self._store = store
        self._broadcaster = broadcaster

    async def _load_aggregate(self, room_id: str) -> GameAggregate:
        events = await self._store.load(room_id)
        game = GameAggregate()
        game.apply_many(events)
        return game

    async def _persist_and_apply(self, game: GameAggregate, events: list[DomainEvent]) -> None:
        await self._store.append_many(events)
        game.apply_many(events)

    # --- Commands ---

    async def create_game(self, host_username: str) -> dict:
        room_id = _generate_room_code()
        while await self._store.exists(room_id):
            room_id = _generate_room_code()

        host_secret = uuid4().hex
        session_token = uuid4().hex

        events = [
            game_created(room_id, host_username, host_secret),
            # Host also gets a session token for WebSocket auth
        ]
        await self._store.append_many(events)

        return {
            "room_id": room_id,
            "host_secret": host_secret,
            "session_token": session_token,
        }

    async def join_game(self, room_id: str, username: str, as_spectator: bool = False) -> dict:
        game = await self._load_aggregate(room_id)
        session_token = uuid4().hex
        event = _create_join_event(game, room_id, username, session_token, as_spectator)

        await self._persist_and_apply(game, [event])
        await self._broadcast_state(game)
        return _build_join_response(game, session_token)

    async def set_round_config(
        self,
        room_id: str,
        round_type: str,
        required_players: int,
        selected_batch_size: int | None,
    ) -> dict:
        game = await self._load_aggregate(room_id)
        error = game.can_set_config()
        if error:
            raise GameError(error)

        _validate_round_config(round_type, required_players, selected_batch_size)

        event = round_config_set(room_id, round_type, required_players, selected_batch_size)
        await self._persist_and_apply(game, [event])

        msg = {
            "type": "round_config_update",
            "round_type": round_type,
            "required_players": required_players,
            "selected_batch_size": selected_batch_size,
            "total_rounds": game.total_rounds,
        }
        await self._broadcaster.publish(room_id, msg)
        return msg

    async def start_game(self, room_id: str) -> dict:
        game = await self._load_aggregate(room_id)
        error = game.can_start()
        if error:
            raise GameError(error)

        batch_sizes = game.batch_sizes_for_game
        event = round_started(room_id, 1, batch_sizes[0], game.state.players)
        await self._persist_and_apply(game, [event])

        await self._broadcast_game_started(game)
        return _build_state_response(game)

    async def start_next_round(self, room_id: str) -> dict:
        game = await self._load_aggregate(room_id)
        error = game.can_start_next_round()
        if error:
            raise GameError(error)

        next_round = game.state.current_round + 1
        batch_sizes = game.batch_sizes_for_game
        event = round_started(room_id, next_round, batch_sizes[next_round - 1], game.state.players)
        await self._persist_and_apply(game, [event])

        await self._broadcast_round_started(game)
        return _build_state_response(game)

    async def flip_coin(self, room_id: str, player: str, coin_index: int) -> dict:
        game = await self._load_aggregate(room_id)
        error = game.can_flip(player, coin_index)
        if error:
            raise GameError(error)

        events: list[DomainEvent] = [coin_flipped(room_id, player, coin_index)]
        await self._persist_and_apply(game, events)

        # Check if round is over after flip
        await self._check_round_completion(game, room_id)
        await self._broadcast_action(game, player, "flip", coin_index=coin_index)
        return _build_state_response(game)

    async def send_batch(self, room_id: str, player: str) -> dict:
        game = await self._load_aggregate(room_id)
        error = game.can_send(player)
        if error:
            raise GameError(error)

        send_ops = game.compute_send(player)
        events: list[DomainEvent] = []
        for op in send_ops:
            if op["type"] == "complete":
                events.append(batch_completed(room_id, op["player"], op["count"]))
            else:
                events.append(batch_sent(room_id, op["player"], op["count"], op["to_player"]))

        await self._persist_and_apply(game, events)

        await self._check_round_completion(game, room_id)
        await self._broadcast_action(game, player, "send")
        return _build_state_response(game)

    async def change_role(self, room_id: str, username: str, new_role: str) -> dict:
        game = await self._load_aggregate(room_id)
        error = game.can_change_role(username, new_role)
        if error:
            raise GameError(error)

        event = role_changed(room_id, username, new_role)
        await self._persist_and_apply(game, [event])
        await self._broadcast_state(game)
        return _build_state_response(game)

    async def reset_game(self, room_id: str) -> dict:
        game = await self._load_aggregate(room_id)
        event = game_reset(room_id)
        await self._persist_and_apply(game, [event])

        msg = {"type": "game_reset", **_build_state_response(game)}
        await self._broadcaster.publish(room_id, msg)
        return _build_state_response(game)

    async def get_state(self, room_id: str) -> dict:
        game = await self._load_aggregate(room_id)
        return _build_state_response(game)

    async def validate_session(self, room_id: str, username: str, token: str) -> bool:
        game = await self._load_aggregate(room_id)
        expected = game.state.session_tokens.get(username)
        return expected is not None and expected == token

    async def validate_host(self, room_id: str, host_secret: str) -> bool:
        game = await self._load_aggregate(room_id)
        return game.state.host_secret == host_secret

    # --- Private helpers ---

    async def _check_round_completion(self, game: GameAggregate, room_id: str) -> None:
        if not _is_round_complete(game):
            return
        duration = game.round_duration_seconds
        lead_time = game.lead_time_seconds
        event = round_ended(room_id, game.state.current_round, duration, lead_time)
        await self._persist_and_apply(game, [event])

    async def _broadcast_state(self, game: GameAggregate) -> None:
        msg = {"type": "activity", **_build_activity_response(game)}
        await self._broadcaster.publish(game.state.room_id, msg)

    async def _broadcast_action(self, game: GameAggregate, player: str, action: str, **extra) -> None:
        msg = {
            "type": "action_made",
            "player": player,
            "action": action,
            **extra,
            **_build_state_response(game),
        }
        await self._broadcaster.publish(game.state.room_id, msg)

        if game.state.phase in ("round_complete", "results"):
            await self._broadcast_phase_change(game)

    async def _broadcast_phase_change(self, game: GameAggregate) -> None:
        s = game.state
        if s.phase == "results":
            msg = {"type": "game_over", **_build_state_response(game)}
        else:
            result = s.round_results[-1] if s.round_results else None
            batch_sizes = game.batch_sizes_for_game
            next_round = s.current_round + 1 if s.current_round < len(batch_sizes) else None
            msg = {
                "type": "round_complete",
                "round_number": s.current_round,
                "next_round": next_round,
                "next_batch_size": batch_sizes[s.current_round] if next_round else None,
                "round_result": _serialize_round_result(result) if result else None,
            }
        await self._broadcaster.publish(s.room_id, msg)

    async def _broadcast_game_started(self, game: GameAggregate) -> None:
        msg = {"type": "game_started", **_build_state_response(game)}
        await self._broadcaster.publish(game.state.room_id, msg)

    async def _broadcast_round_started(self, game: GameAggregate) -> None:
        msg = {"type": "round_started", **_build_state_response(game)}
        await self._broadcaster.publish(game.state.room_id, msg)


# --- Pure helper functions ---


def _generate_room_code(length: int = 4) -> str:
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(random.choices(chars, k=length))


def _validate_round_config(round_type: str, required_players: int, selected_batch_size: int | None) -> None:
    valid_types = {"single", "two_rounds", "three_rounds"}
    if round_type not in valid_types:
        raise GameError(f"Invalid round type: {round_type}")
    if required_players < MIN_PLAYERS or required_players > MAX_PLAYERS:
        raise GameError(f"Required players must be {MIN_PLAYERS}-{MAX_PLAYERS}")
    if round_type == "single" and not selected_batch_size:
        raise GameError("Batch size required for single round")
    if selected_batch_size and selected_batch_size not in VALID_BATCH_SIZES:
        raise GameError(f"Invalid batch size. Valid: {VALID_BATCH_SIZES}")


def _create_join_event(
    game: GameAggregate,
    room_id: str,
    username: str,
    session_token: str,
    as_spectator: bool,
) -> DomainEvent:
    """Decide whether the user joins as player or spectator, raising on error."""
    if as_spectator:
        return _join_as_spectator(game, room_id, username, session_token)

    error = game.can_join_as_player(username)
    if not error:
        return player_joined(room_id, username, session_token)

    # Player slots full — try spectator fallback
    if "limit" not in error.lower():
        raise GameError(error)
    return _join_as_spectator(game, room_id, username, session_token)


def _join_as_spectator(game: GameAggregate, room_id: str, username: str, session_token: str) -> DomainEvent:
    """Validate and create a spectator join event."""
    error = game.can_join_as_spectator(username)
    if error:
        raise GameError(error)
    return spectator_joined(room_id, username, session_token)


def _is_round_complete(game: GameAggregate) -> bool:
    s = game.state
    if s.phase != "active":
        return False
    if s.total_completed >= TOTAL_COINS:
        return True
    return all(len(s.player_coins.get(p, [])) == 0 for p in s.players)


def _build_state_response(game: GameAggregate) -> dict:
    s = game.state
    return {
        "room_id": s.room_id,
        "phase": s.phase.value,
        "host": s.host,
        "players": s.players,
        "spectators": s.spectators,
        "batch_size": s.batch_size,
        "player_coins": s.player_coins,
        "sent_coins": s.sent_coins,
        "total_completed": s.total_completed,
        "tails_remaining": game.tails_remaining,
        "current_round": s.current_round,
        "total_rounds": game.total_rounds,
        "round_type": s.round_type.value,
        "required_players": s.required_players,
        "selected_batch_size": s.selected_batch_size,
        "player_timers": {p: t.to_dict() for p, t in s.player_timers.items()},
        "round_results": [_serialize_round_result(r) for r in s.round_results],
        "lead_time_seconds": game.lead_time_seconds,
        "first_flip_at": s.first_flip_at.isoformat() if s.first_flip_at else None,
        "first_delivery_at": s.first_delivery_at.isoformat() if s.first_delivery_at else None,
    }


def _build_join_response(game: GameAggregate, session_token: str) -> dict:
    resp = _build_state_response(game)
    resp["session_token"] = session_token
    return resp


def _build_activity_response(game: GameAggregate) -> dict:
    s = game.state
    return {
        "players": s.players,
        "spectators": s.spectators,
        "host": s.host,
    }


def _serialize_round_result(result) -> dict:
    return {
        "round_number": result.round_number,
        "batch_size": result.batch_size,
        "duration_seconds": result.duration_seconds,
        "lead_time_seconds": result.lead_time_seconds,
        "total_completed": result.total_completed,
        "player_timers": {p: t.to_dict() for p, t in result.player_timers.items()},
    }
