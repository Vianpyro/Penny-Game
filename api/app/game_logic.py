from datetime import datetime, timedelta
from typing import Dict, List, Optional
from uuid import uuid4

from .models import PennyGame

MAX_PLAYERS = 5
MAX_CONNECTIONS = 50
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
        pennies=[True] * 20,
        created_at=now,
        last_active_at=now,
        host_secret=host_secret,
    )
    return room_id, host_secret


def get_game(room_id: str) -> Optional[PennyGame]:
    return games.get(room_id)


def remove_game(room_id: str):
    games.pop(room_id, None)
    rooms.pop(room_id, None)
    online_users.pop(room_id, None)


def cleanup():
    now = datetime.now()
    removed_games = []
    for room_id, game in list(games.items()):
        active_players = []
        for player in game.players:
            if now - game.last_active_at < PLAYER_INACTIVITY_THRESHOLD:
                active_players.append(player)
        if len(active_players) < len(game.players):
            game.players = active_players
        if now - game.last_active_at > ROOM_INACTIVITY_THRESHOLD:
            removed_games.append(room_id)
            games.pop(room_id)
            rooms.pop(room_id, None)
    return {"removed_games": removed_games}
