"""
Core game logic for the Penny Game.
Handles all game mechanics including coin flipping, batch sending, and round management.
"""

import logging
from datetime import datetime
from typing import Dict, List, Optional
from uuid import uuid4

from .constants import (
    DEFAULT_BATCH_SIZE,
    DEFAULT_REQUIRED_PLAYERS,
    PLAYER_INACTIVITY_THRESHOLD,
    ROOM_INACTIVITY_THRESHOLD,
    ROUND_TYPE_BATCH_SIZES,
    TOTAL_COINS,
    get_valid_batch_sizes,
)
from .models import GameState, PennyGame, PlayerTimer, RoundResult, RoundType

logger = logging.getLogger(__name__)

# Module-level storage
games: Dict[str, PennyGame] = {}
rooms: Dict[str, List] = {}
online_users: Dict[str, set] = {}


def create_new_game() -> tuple[str, str]:
    """Create a new game and return room ID and host secret."""
    room_id = str(uuid4())[:5]
    now = datetime.now()
    host_secret = str(uuid4())

    games[room_id] = PennyGame(
        room_id=room_id,
        players=[],
        pennies=[False] * TOTAL_COINS,
        created_at=now,
        last_active_at=now,
        host_secret=host_secret,
        batch_size=DEFAULT_BATCH_SIZE,
        player_coins={},
        sent_coins={},
        player_timers={},
        round_type=RoundType.THREE_ROUNDS,
        required_players=DEFAULT_REQUIRED_PLAYERS,
        current_round=0,
        round_results=[],
    )
    rooms[room_id] = []
    return room_id, host_secret


def get_game(room_id: str) -> Optional[PennyGame]:
    """Get a game by room ID."""
    return games.get(room_id)


def remove_game(room_id: str) -> None:
    """Remove a game and its associated data."""
    games.pop(room_id, None)
    rooms.pop(room_id, None)
    online_users.pop(room_id, None)


def get_tails_count(game: PennyGame) -> int:
    """Count how many pennies are still tails (False) - need to be flipped."""
    if not game.player_coins:
        return TOTAL_COINS  # All coins start as tails

    total_tails = 0
    for player_coins in game.player_coins.values():
        total_tails += sum(1 for coin in player_coins if not coin)
    return total_tails


def get_heads_count(game: PennyGame) -> int:
    """Count how many pennies are heads (True) - ready to be sent."""
    if not game.player_coins:
        return 0

    total_heads = 0
    for player_coins in game.player_coins.values():
        total_heads += sum(1 for coin in player_coins if coin)
    return total_heads


def get_total_rounds(round_type: RoundType) -> int:
    """Get total number of rounds for the round type."""
    round_counts = {
        RoundType.SINGLE: 1,
        RoundType.TWO_ROUNDS: 2,
        RoundType.THREE_ROUNDS: 3,
    }
    return round_counts.get(round_type, 1)


def get_batch_sizes_for_round_type(round_type: RoundType, selected_batch_size: Optional[int] = None) -> List[int]:
    """Get the batch sizes to play for a given round type."""
    if round_type == RoundType.SINGLE:
        return [selected_batch_size] if selected_batch_size else [TOTAL_COINS]
    elif round_type == RoundType.TWO_ROUNDS:
        return ROUND_TYPE_BATCH_SIZES["two_rounds"]
    elif round_type == RoundType.THREE_ROUNDS:
        return ROUND_TYPE_BATCH_SIZES["three_rounds"]
    return [TOTAL_COINS]


def set_round_config(
    game: PennyGame, round_type: RoundType, required_players: int, selected_batch_size: Optional[int] = None
) -> bool:
    """Set the round configuration for the game (only in lobby)."""
    if game.state != GameState.LOBBY:
        return False

    # Validate configuration
    if round_type == RoundType.SINGLE and not selected_batch_size:
        return False

    valid_batch_sizes = get_valid_batch_sizes()
    if selected_batch_size and selected_batch_size not in valid_batch_sizes:
        return False

    if required_players < 2 or required_players > 5:
        return False

    # Apply configuration
    game.round_type = round_type
    game.required_players = required_players
    game.selected_batch_size = selected_batch_size
    game.current_round = 0
    game.round_results = []

    return True


def initialize_player_coins(game: PennyGame, is_new_round: bool = True) -> None:
    """Initialize coin distribution when round starts."""
    if not game.players:
        return

    # Reset all player coins
    game.player_coins = {player: [] for player in game.players}
    game.sent_coins = {player: [] for player in game.players}

    # Give all coins (as tails) to first player
    first_player = game.players[0]
    game.player_coins[first_player] = [False] * TOTAL_COINS

    # Initialize player timers
    _initialize_player_timers(game)

    # Reset lead time tracking
    if is_new_round:
        game.first_flip_at = None
        game.first_delivery_at = None
        game.lead_time_seconds = None


def _initialize_player_timers(game: PennyGame) -> None:
    """Initialize player timers for all players."""
    if not hasattr(game, "player_timers") or game.player_timers is None:
        game.player_timers = {}

    for player in game.players:
        game.player_timers[player] = PlayerTimer(player=player)


def start_next_round(game: PennyGame) -> bool:
    """Start the next round in the sequence."""
    if game.state not in [GameState.LOBBY, GameState.ROUND_COMPLETE]:
        return False

    batch_sizes = get_batch_sizes_for_round_type(game.round_type, game.selected_batch_size)

    if game.current_round >= len(batch_sizes):
        return False  # All rounds completed

    # Configure round
    game.current_round += 1
    game.batch_size = batch_sizes[game.current_round - 1]

    # Initialize round state
    now = datetime.now()
    game.started_at = now
    game.ended_at = None
    game.game_duration_seconds = None
    game.turn_timestamps = [now]
    game.last_active_at = now
    game.state = GameState.ACTIVE

    # Reset game mechanics for new round
    game.pennies = [False] * TOTAL_COINS
    initialize_player_coins(game, is_new_round=True)

    game.first_flip_at = None
    game.first_delivery_at = None
    game.lead_time_seconds = None

    return True


def complete_current_round(game: PennyGame) -> None:
    """Complete the current round and save results."""
    if game.state != GameState.ACTIVE:
        return

    # End game timer
    if game.started_at and game.ended_at is None:
        game.ended_at = datetime.now()
        game.game_duration_seconds = (game.ended_at - game.started_at).total_seconds()

    # End all running player timers
    for timer in game.player_timers.values():
        _end_timer_if_running(timer)

    # Log lead time status before saving
    logger.info(f"Completing round {game.current_round} with lead_time_seconds: {game.lead_time_seconds}")

    # Save round result
    round_result = RoundResult(
        round_number=game.current_round,
        batch_size=game.batch_size,
        game_duration_seconds=game.game_duration_seconds,
        lead_time_seconds=game.lead_time_seconds,
        first_flip_at=game.first_flip_at,
        first_delivery_at=game.first_delivery_at,
        player_timers=game.player_timers.copy(),
        total_completed=get_total_completed_coins(game),
        started_at=game.started_at,
        ended_at=game.ended_at,
    )

    game.round_results.append(round_result)

    # Log the saved result
    logger.info(f"Saved round result with lead_time_seconds: {round_result.lead_time_seconds}")


def _end_timer_if_running(timer: PlayerTimer) -> None:
    """End a timer if it's currently running."""
    if timer.started_at and timer.ended_at is None:
        timer.ended_at = datetime.now()
        timer.duration_seconds = (timer.ended_at - timer.started_at).total_seconds()


def start_player_timer(game: PennyGame, player: str) -> None:
    """Start timer for a player when they flip their first coin."""
    if not hasattr(game, "player_timers") or game.player_timers is None:
        game.player_timers = {}

    if player not in game.player_timers:
        game.player_timers[player] = PlayerTimer(player=player)

    if game.player_timers[player].started_at is None:
        now = datetime.now()
        game.player_timers[player].started_at = now

        # Track the very first flip across all players for lead time
        if game.first_flip_at is None:
            game.first_flip_at = now
            logger.info(f"First coin flip recorded at {now} by {player}")


def end_player_timer(game: PennyGame, player: str) -> None:
    """End timer for a player when they have completely finished their work."""
    if not hasattr(game, "player_timers") or game.player_timers is None:
        return

    if player not in game.player_timers:
        return

    timer = game.player_timers[player]

    # Only end timer if it has started, hasn't ended, and player has finished
    if timer.started_at and timer.ended_at is None and has_player_finished(game, player):
        timer.ended_at = datetime.now()
        timer.duration_seconds = (timer.ended_at - timer.started_at).total_seconds()


def check_and_end_all_finished_timers(game: PennyGame) -> None:
    """Check all players and end timers for those who have finished."""
    if not hasattr(game, "player_timers") or game.player_timers is None:
        return

    for player in game.players:
        if has_player_finished(game, player):
            end_player_timer(game, player)


def has_player_finished(game: PennyGame, player: str) -> bool:
    """Check if a player has completely finished their work in the current round."""
    if player not in game.player_coins:
        return False

    # Player is finished if they have no coins left AND all previous players are finished
    player_index = game.players.index(player)

    # Check if this player has no coins left
    if len(game.player_coins[player]) > 0:
        return False

    # For the first player, they're finished when they have no coins
    if player_index == 0:
        return True

    # For other players, check that all previous players are also finished
    for i in range(player_index):
        previous_player = game.players[i]
        if len(game.player_coins.get(previous_player, [])) > 0:
            return False

    return True


def flip_coin(game: PennyGame, player: str, coin_index: int) -> bool:
    """Flip a specific coin from tails to heads for a player."""
    if player not in game.player_coins:
        return False

    player_coins = game.player_coins[player]
    if coin_index >= len(player_coins) or coin_index < 0:
        return False

    # Can only flip tails to heads
    if player_coins[coin_index]:  # Already heads
        return False

    # Start player timer on first coin flip
    start_player_timer(game, player)

    # Debug logging for lead time
    if game.first_flip_at:
        logger.debug(f"First flip was at {game.first_flip_at}, current player: {player}")
    else:
        logger.debug(f"This is the FIRST flip in the round by {player}")

    # Flip the coin from tails to heads
    player_coins[coin_index] = True
    return True


def can_send_batch(game: PennyGame, player: str) -> bool:
    """Check if player can send a batch based on batch size rules."""
    if player not in game.player_coins:
        return False

    player_coins = game.player_coins[player]
    heads_count = sum(1 for coin in player_coins if coin)

    # Can send if we have enough flipped coins for a full batch
    # OR if we have all remaining coins flipped (last partial batch)
    return heads_count >= game.batch_size or heads_count == len(player_coins)


def send_batch(game: PennyGame, player: str) -> bool:
    """Send a batch of coins to the next player in the chain."""
    if not can_send_batch(game, player):
        return False

    player_index = game.players.index(player)

    # Last player case - send to completion
    if player_index == len(game.players) - 1:
        success = send_to_completion(game, player)
        if success:
            check_and_end_all_finished_timers(game)
        return success

    # Regular case - send to next player
    next_player = game.players[player_index + 1]
    coins_to_send, remaining_coins = _prepare_batch_transfer(game, player)

    # Update player states
    game.player_coins[player] = remaining_coins
    if next_player not in game.player_coins:
        game.player_coins[next_player] = []

    # Send coins as tails to next player (they need to flip them)
    game.player_coins[next_player].extend([False] * len(coins_to_send))

    # Track sent coins for statistics
    _record_sent_batch(game, player, len(coins_to_send), next_player)

    # Check if any players have finished
    check_and_end_all_finished_timers(game)

    return True


def _prepare_batch_transfer(game: PennyGame, player: str) -> tuple[List[bool], List[bool]]:
    """Prepare coins for batch transfer, separating coins to send from remaining."""
    player_coins = game.player_coins[player]
    coins_to_send = []
    remaining_coins = []

    heads_sent = 0
    for coin in player_coins:
        if coin and heads_sent < game.batch_size:  # Heads and within batch limit
            coins_to_send.append(coin)
            heads_sent += 1
        else:
            remaining_coins.append(coin)

    return coins_to_send, remaining_coins


def _record_sent_batch(game: PennyGame, player: str, count: int, to_player: str) -> None:
    """Record a sent batch for statistics tracking."""
    if player not in game.sent_coins:
        game.sent_coins[player] = []

    game.sent_coins[player].append({"count": count, "timestamp": datetime.now(), "to_player": to_player})


def send_to_completion(game: PennyGame, player: str) -> bool:
    """Last player sends coins to completion."""
    if player != game.players[-1]:  # Only last player can complete
        return False

    player_coins = game.player_coins[player]
    heads_count = sum(1 for coin in player_coins if coin)

    if heads_count == 0:
        return False

    # Determine how many coins to send based on batch size
    coins_to_complete = min(heads_count, game.batch_size)

    # Track first delivery for lead time
    if coins_to_complete > 0 and game.first_delivery_at is None:
        game.first_delivery_at = datetime.now()

        # Calculate lead time if we have both timestamps
        if game.first_flip_at:
            game.lead_time_seconds = (game.first_delivery_at - game.first_flip_at).total_seconds()
            logger.info(f"First delivery recorded. Lead time: {game.lead_time_seconds:.2f} seconds")
            logger.info(f"First flip was at: {game.first_flip_at}, First delivery at: {game.first_delivery_at}")
        else:
            logger.warning("First delivery recorded but no first flip timestamp available!")

    completed_coins, remaining_coins = _prepare_completion_transfer(player_coins, coins_to_complete)

    # Update player state
    game.player_coins[player] = remaining_coins

    # Track completion
    _record_sent_batch(game, player, len(completed_coins), "COMPLETED")

    # Check if any players have finished
    check_and_end_all_finished_timers(game)

    return True


def _prepare_completion_transfer(player_coins: List[bool], coins_to_complete: int) -> tuple[List[bool], List[bool]]:
    """Prepare coins for completion transfer."""
    completed_coins = []
    remaining_coins = []

    heads_processed = 0
    for coin in player_coins:
        if coin and heads_processed < coins_to_complete:  # Heads and within batch limit
            completed_coins.append(coin)
            heads_processed += 1
        else:
            remaining_coins.append(coin)

    return completed_coins, remaining_coins


def is_round_over(game: PennyGame) -> bool:
    """Check if current round is complete."""
    if not game.players:
        return False

    # Round is over when all coins have been completed by the last player
    total_completed = get_total_completed_coins(game)

    # Check if all players have finished their work
    all_players_finished = all(has_player_finished(game, player) for player in game.players)

    return total_completed >= TOTAL_COINS or all_players_finished


def get_total_completed_coins(game: PennyGame) -> int:
    """Get total number of coins that have been completed."""
    if not game.players:
        return 0

    last_player = game.players[-1]
    if last_player not in game.sent_coins:
        return 0

    total = 0
    for batch in game.sent_coins[last_player]:
        if batch.get("to_player") == "COMPLETED":
            total += batch["count"]

    return total


def process_flip(game: PennyGame, player: str, coin_index: int) -> dict:
    """Process a player's action to flip a coin."""
    # Validate game state
    if game.state != GameState.ACTIVE:
        return {"success": False, "error": "Game is not active"}

    if not game.players:
        return {"success": False, "error": "No players in game"}

    if player not in game.players:
        return {"success": False, "error": "Player not in game"}

    # Execute the flip
    if not flip_coin(game, player, coin_index):
        return {"success": False, "error": "Cannot flip this coin"}

    # Update game state
    game.last_active_at = datetime.now()

    # Check if any players have finished
    check_and_end_all_finished_timers(game)

    # Check if round is over AFTER the action
    round_complete = is_round_over(game)
    game_over = False

    if round_complete:
        logger.info(f"Round {game.current_round} completed after flip by {player}")
        complete_current_round(game)
        game_over = game.state == GameState.RESULTS
        logger.info(f"After complete_current_round: state={game.state.value}, game_over={game_over}")

    # Ensure we have player_timers in the response
    if not hasattr(game, "player_timers") or game.player_timers is None:
        game.player_timers = {}

    return _build_action_response(game, round_complete, game_over)


def process_send(game: PennyGame, player: str) -> dict:
    """Process a player's action to send a batch of coins."""
    # Validate game state
    if game.state != GameState.ACTIVE:
        return {"success": False, "error": "Game is not active"}

    if not game.players:
        return {"success": False, "error": "No players in game"}

    if player not in game.players:
        return {"success": False, "error": "Player not in game"}

    # Execute the send
    if not send_batch(game, player):
        return {"success": False, "error": "Cannot send batch - not enough flipped coins or invalid batch size"}

    # Update game state
    game.last_active_at = datetime.now()

    # Check if round is over AFTER the action
    round_complete = is_round_over(game)
    game_over = False

    if round_complete:
        logger.info(f"Round {game.current_round} completed after send by {player}")
        complete_current_round(game)
        game_over = game.state == GameState.RESULTS
        logger.info(f"After complete_current_round: state={game.state.value}, game_over={game_over}")

    # Ensure we have player_timers in the response
    if not hasattr(game, "player_timers") or game.player_timers is None:
        game.player_timers = {}

    return _build_action_response(game, round_complete, game_over)


def _build_action_response(game: PennyGame, round_complete: bool, game_over: bool) -> dict:
    """Build standardized action response."""
    response = {
        "success": True,
        "round_complete": round_complete,
        "game_over": game_over,
        "player_coins": game.player_coins.copy(),
        "sent_coins": game.sent_coins.copy(),
        "total_completed": get_total_completed_coins(game),
        "state": game.state.value,
        "current_round": game.current_round,
        "player_timers": {k: v.to_dict() for k, v in game.player_timers.items()} if game.player_timers else {},
        "game_duration_seconds": game.game_duration_seconds,
        "lead_time_seconds": game.lead_time_seconds,
        "first_flip_at": game.first_flip_at.isoformat() if game.first_flip_at else None,
        "first_delivery_at": game.first_delivery_at.isoformat() if game.first_delivery_at else None,
    }

    logger.debug(
        f"Action response: round_complete={round_complete}, state={game.state.value}, lead_time={game.lead_time_seconds}"
    )
    return response


def reset_game(game: PennyGame) -> None:
    """Reset the game to initial state."""
    game.pennies = [False] * TOTAL_COINS  # All tails
    game.state = GameState.LOBBY
    game.started_at = None
    game.ended_at = None
    game.turn_timestamps = []
    game.batch_size = DEFAULT_BATCH_SIZE  # Reset to default
    game.player_coins = {}
    game.sent_coins = {}
    game.player_timers = {}
    game.game_duration_seconds = None
    game.current_round = 0
    game.round_results = []
    game.last_active_at = datetime.now()
    game.first_flip_at = None
    game.first_delivery_at = None
    game.lead_time_seconds = None


def cleanup() -> dict:
    """Clean up inactive games and players."""
    now = datetime.now()
    removed_games = []

    for room_id, game in list(games.items()):
        # Remove inactive players
        active_players = []
        for player in game.players:
            if now - game.last_active_at < PLAYER_INACTIVITY_THRESHOLD:
                active_players.append(player)

        if len(active_players) < len(game.players):
            game.players = active_players
            # Reinitialize player coins if game is active
            if game.state == GameState.ACTIVE:
                initialize_player_coins(game)

        # Remove inactive rooms
        if now - game.last_active_at > ROOM_INACTIVITY_THRESHOLD:
            removed_games.append(room_id)
            remove_game(room_id)

    return {"removed_games": removed_games}
