from datetime import datetime, timedelta
from typing import Dict, List, Optional
from uuid import uuid4

from .constants import MAX_PENNIES
from .models import GameState, PennyGame

ROOM_INACTIVITY_THRESHOLD = timedelta(minutes=60)
PLAYER_INACTIVITY_THRESHOLD = timedelta(minutes=5)

games: Dict[str, PennyGame] = {}
rooms: Dict[str, List] = {}
online_users: Dict[str, set] = {}


def create_new_game():
    room_id = str(uuid4())[:8]
    now = datetime.now()
    host_secret = str(uuid4())
    games[room_id] = PennyGame(
        room_id=room_id,
        players=[],
        pennies=[False] * MAX_PENNIES,  # False = Tails (starting state), True = Heads
        created_at=now,
        last_active_at=now,
        host_secret=host_secret,
        batch_size=MAX_PENNIES,  # Default batch size
        player_coins={},  # Track coins per player
        sent_coins={},  # Track sent coins between players
    )
    rooms[room_id] = []
    return room_id, host_secret


def get_game(room_id: str) -> Optional[PennyGame]:
    return games.get(room_id)


def remove_game(room_id: str):
    games.pop(room_id, None)
    rooms.pop(room_id, None)
    online_users.pop(room_id, None)


def get_tails_count(game: PennyGame) -> int:
    """Count how many pennies are still tails (False) - need to be flipped"""
    if not game.player_coins:
        return MAX_PENNIES  # All coins start as tails

    total_tails = 0
    for player_coins in game.player_coins.values():
        total_tails += sum(1 for coin in player_coins if not coin)
    return total_tails


def get_heads_count(game: PennyGame) -> int:
    """Count how many pennies are heads (True) - ready to be sent"""
    if not game.player_coins:
        return 0

    total_heads = 0
    for player_coins in game.player_coins.values():
        total_heads += sum(1 for coin in player_coins if coin)
    return total_heads


def initialize_player_coins(game: PennyGame):
    """Initialize coin distribution when game starts"""
    if not game.players:
        return

    # First player gets all coins initially as tails (need to be flipped)
    first_player = game.players[0]
    game.player_coins = {player: [] for player in game.players}
    game.sent_coins = {player: [] for player in game.players}

    # Give all coins (as tails) to first player
    game.player_coins[first_player] = [False] * MAX_PENNIES


def flip_coin(game: PennyGame, player: str, coin_index: int) -> bool:
    """
    Flip a specific coin from tails to heads for a player.
    Returns True if successful, False otherwise.
    """
    # Validate player exists and has coins
    if player not in game.player_coins:
        return False

    player_coins = game.player_coins[player]
    if coin_index >= len(player_coins) or coin_index < 0:
        return False

    # Can only flip tails to heads
    if player_coins[coin_index]:  # Already heads
        return False

    # Flip the coin from tails to heads
    player_coins[coin_index] = True
    return True


def can_send_batch(game: PennyGame, player: str) -> bool:
    """Check if player can send a batch based on batch size rules"""
    if player not in game.player_coins:
        return False

    player_coins = game.player_coins[player]
    heads_count = sum(1 for coin in player_coins if coin)

    # Can send if we have enough flipped coins for a full batch
    # OR if we have all remaining coins flipped (last partial batch)
    return heads_count >= game.batch_size or heads_count == len(player_coins)


def send_batch(game: PennyGame, player: str) -> bool:
    """
    Send a batch of coins to the next player in the chain.
    Returns True if successful, False otherwise.
    """
    if not can_send_batch(game, player):
        return False

    player_index = game.players.index(player)
    if player_index == len(game.players) - 1:
        # Last player - coins are delivered (game might end)
        return send_to_completion(game, player)

    next_player = game.players[player_index + 1]
    player_coins = game.player_coins[player]

    # Find coins to send (heads only, up to batch size)
    coins_to_send = []
    remaining_coins = []

    heads_sent = 0
    for coin in player_coins:
        if coin and heads_sent < game.batch_size:  # Heads and within batch limit
            coins_to_send.append(coin)
            heads_sent += 1
        else:
            remaining_coins.append(coin)

    # Update player states
    game.player_coins[player] = remaining_coins
    if next_player not in game.player_coins:
        game.player_coins[next_player] = []

    # Send coins as tails to next player (they need to flip them)
    game.player_coins[next_player].extend([False] * len(coins_to_send))

    # Track sent coins for statistics
    if player not in game.sent_coins:
        game.sent_coins[player] = []
    game.sent_coins[player].append({"count": len(coins_to_send), "timestamp": datetime.now(), "to_player": next_player})

    return True


def send_to_completion(game: PennyGame, player: str) -> bool:
    """Last player sends coins to completion"""
    if player != game.players[-1]:  # Only last player can complete
        return False

    player_coins = game.player_coins[player]
    heads_count = sum(1 for coin in player_coins if coin)

    if heads_count == 0:
        return False

    # Send all heads to completion
    completed_coins = []
    remaining_coins = []

    for coin in player_coins:
        if coin:  # Heads
            completed_coins.append(coin)
        else:  # Tails
            remaining_coins.append(coin)

    game.player_coins[player] = remaining_coins

    # Track completion
    if player not in game.sent_coins:
        game.sent_coins[player] = []
    game.sent_coins[player].append(
        {"count": len(completed_coins), "timestamp": datetime.now(), "to_player": "COMPLETED"}
    )

    return True


def is_game_over(game: PennyGame) -> bool:
    """Check if all coins have been completed by the last player"""
    if not game.players:
        return False

    # Game is over when all coins have been processed through the entire chain
    total_completed = get_total_completed_coins(game)
    return total_completed >= MAX_PENNIES


def get_total_completed_coins(game: PennyGame) -> int:
    """Get total number of coins that have been completed"""
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
    """
    Process a player's action to flip a coin.
    Returns a dict with success status and any relevant information.
    """
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
    now = datetime.now()
    game.last_active_at = now

    # Check if game is over (all coins completed)
    game_over = is_game_over(game)

    if game_over:
        game.state = GameState.RESULTS

    return {
        "success": True,
        "game_over": game_over,
        "player_coins": game.player_coins.copy(),
        "sent_coins": game.sent_coins.copy(),
        "total_completed": get_total_completed_coins(game),
        "state": game.state.value,
    }


def process_send(game: PennyGame, player: str) -> dict:
    """
    Process a player's action to send a batch of coins.
    Returns a dict with success status and any relevant information.
    """
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
    now = datetime.now()
    game.last_active_at = now

    # Check if game is over (all coins completed)
    game_over = is_game_over(game)

    if game_over:
        game.state = GameState.RESULTS

    return {
        "success": True,
        "game_over": game_over,
        "player_coins": game.player_coins.copy(),
        "sent_coins": game.sent_coins.copy(),
        "total_completed": get_total_completed_coins(game),
        "state": game.state.value,
    }


def reset_game(game: PennyGame):
    """Reset the game to initial state"""
    game.pennies = [False] * MAX_PENNIES  # All tails
    game.state = GameState.LOBBY
    game.started_at = None
    game.turn_timestamps = []
    game.batch_size = MAX_PENNIES  # Reset to default
    game.player_coins = {}
    game.sent_coins = {}
    game.last_active_at = datetime.now()


def set_batch_size(game: PennyGame, batch_size: int) -> bool:
    """Set the batch size for the game (only in lobby)"""
    if game.state != GameState.LOBBY:
        return False

    # Validate batch size - must be a divisor of MAX_PENNIES for clean batches
    valid_batch_sizes = [1, 2, 3, 4, 6, 12]  # Divisors of 12
    if batch_size not in valid_batch_sizes:
        return False

    game.batch_size = batch_size
    return True


def cleanup():
    """Clean up inactive games and players"""
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
