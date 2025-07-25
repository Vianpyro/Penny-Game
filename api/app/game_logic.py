from datetime import datetime, timedelta
from typing import Dict, List, Optional
from uuid import uuid4

from .models import GameState, PennyGame

MAX_PLAYERS = 5
MAX_CONNECTIONS = 50
MAX_PENNIES = 12
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
        pennies=[True] * MAX_PENNIES,  # True = Heads, False = Tails
        created_at=now,
        last_active_at=now,
        host_secret=host_secret,
    )
    rooms[room_id] = []
    return room_id, host_secret


def get_game(room_id: str) -> Optional[PennyGame]:
    return games.get(room_id)


def remove_game(room_id: str):
    games.pop(room_id, None)
    rooms.pop(room_id, None)
    online_users.pop(room_id, None)


def get_current_player(game: PennyGame) -> Optional[str]:
    """Get the current player whose turn it is"""
    if not game.players or game.state != GameState.ACTIVE:
        return None
    return game.players[game.turn % len(game.players)]


def get_heads_count(game: PennyGame) -> int:
    """Count how many pennies are still heads (True)"""
    return sum(1 for penny in game.pennies if penny)


def flip_pennies(game: PennyGame, count: int) -> bool:
    """
    Flip the specified number of pennies from heads to tails.
    Returns True if successful, False if not enough heads available.
    """
    heads_indices = [i for i, penny in enumerate(game.pennies) if penny]

    if len(heads_indices) < count:
        return False

    # Flip the first 'count' heads to tails
    for i in range(count):
        game.pennies[heads_indices[i]] = False

    return True


def advance_turn(game: PennyGame):
    """Advance to the next player's turn"""
    if game.players:
        game.turn = (game.turn + 1) % len(game.players)


def is_game_over(game: PennyGame) -> bool:
    """Check if all pennies have been flipped to tails"""
    return all(not penny for penny in game.pennies)


def get_winner(game: PennyGame) -> Optional[str]:
    """
    Get the winner of the game. In the Penny Game, the player who flips
    the last penny (making all pennies tails) loses, so the winner is
    the previous player in turn order.
    """
    if not is_game_over(game) or not game.players:
        return None

    # The loser is the current player (who just made the losing move)
    loser_index = game.turn
    # The winner is the previous player
    winner_index = (loser_index - 1) % len(game.players)
    return game.players[winner_index]


def process_move(game: PennyGame, username: str, flip_count: int) -> dict:
    """
    Process a player's move to flip pennies.
    Returns a dict with success status and any relevant information.
    """
    # Validate game state
    if game.state != GameState.ACTIVE:
        return {"success": False, "error": "Game is not active"}

    if not game.players:
        return {"success": False, "error": "No players in game"}

    # Validate it's the player's turn
    current_player = get_current_player(game)
    if current_player != username:
        return {"success": False, "error": f"Not your turn. Current player: {current_player}"}

    # Validate move
    if flip_count not in [1, 2, 3]:
        return {"success": False, "error": "Invalid move. Must flip 1, 2, or 3 pennies"}

    heads_count = get_heads_count(game)
    if heads_count < flip_count:
        return {"success": False, "error": f"Not enough heads available. Only {heads_count} heads remaining"}

    # Execute the move
    if not flip_pennies(game, flip_count):
        return {"success": False, "error": "Failed to flip pennies"}

    # Update game state
    now = datetime.now()
    game.last_active_at = now
    game.turn_timestamps.append(now)

    # Check if game is over
    game_over = is_game_over(game)
    winner = None

    if game_over:
        game.state = GameState.RESULTS
        winner = get_winner(game)
    else:
        advance_turn(game)

    return {
        "success": True,
        "game_over": game_over,
        "winner": winner,
        "current_player": get_current_player(game),
        "heads_remaining": get_heads_count(game),
        "pennies": game.pennies.copy(),
        "turn": game.turn,
        "state": game.state.value,
    }


def reset_game(game: PennyGame):
    """Reset the game to initial state"""
    game.pennies = [True] * 20
    game.turn = 0
    game.state = GameState.LOBBY
    game.started_at = None
    game.turn_timestamps = []
    game.last_active_at = datetime.now()


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
            # Reset turn if current player was removed
            if game.players and game.turn >= len(game.players):
                game.turn = 0

        # Remove inactive rooms
        if now - game.last_active_at > ROOM_INACTIVITY_THRESHOLD:
            removed_games.append(room_id)
            remove_game(room_id)

    return {"removed_games": removed_games}
