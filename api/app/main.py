from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from typing import Dict, List
from uuid import uuid4
from datetime import timedelta
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

app = FastAPI()

MAX_PLAYERS = 5
MAX_CONNECTIONS = 50
ROOM_INACTIVITY_THRESHOLD = timedelta(minutes=60)
PLAYER_INACTIVITY_THRESHOLD = timedelta(minutes=5)

# Allow all origins for MVP simplicity
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global in-memory state (for MVP only)
rooms: Dict[str, List[WebSocket]] = {}

# Penny Game state
from datetime import datetime

class PennyGame(BaseModel):
    room_id: str
    players: List[str]
    spectators: List[str] = []
    host: Optional[str] = None
    pennies: int = 20  # Default starting pennies
    turn: int = 0  # Index of current player
    winner: Optional[str] = None
    created_at: datetime
    last_active_at: datetime

# In-memory games
games: Dict[str, PennyGame] = {}

# REST endpoints for Penny Game
@app.post("/game/create")
def create_game():
    room_id = str(uuid4())[:8]
    now = datetime.now()
    games[room_id] = PennyGame(room_id=room_id, players=[], created_at=now, last_active_at=now)
    return {"room_id": room_id}


class JoinRequest(BaseModel):
    username: str


@app.post("/game/join/{room_id}")
def join_game(room_id: str, join: JoinRequest, spectator: Optional[bool] = False):
    game = games.get(room_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    username = join.username
    if username in game.players or username in game.spectators:
        raise HTTPException(status_code=400, detail="User already joined")
    if room_id not in rooms:
        rooms[room_id] = []
    now = datetime.now()
    game.last_active_at = now
    if spectator:
        game.spectators.append(username)
        return {"success": True, "players": game.players, "spectators": game.spectators, "host": game.host}
    if len(game.players) >= 2:
        # If game is full, allow joining as spectator
        game.spectators.append(username)
        return {"success": True, "players": game.players, "spectators": game.spectators, "host": game.host, "note": "Joined as spectator (game full)"}
    game.players.append(username)
    if game.host is None:
        game.host = username
    return {"success": True, "players": game.players, "spectators": game.spectators, "host": game.host}

class MoveRequest(BaseModel):
    username: str
    take: int

@app.post("/game/move/{room_id}")
def make_move(room_id: str, move: MoveRequest):
    game = games.get(room_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    if game.winner:
        raise HTTPException(status_code=400, detail="Game over")
    if len(game.players) < 2:
        raise HTTPException(status_code=400, detail="Need 2 players")
    if game.players[game.turn] != move.username:
        raise HTTPException(status_code=400, detail="Not your turn")
    if move.take not in [1, 2, 3]:
        raise HTTPException(status_code=400, detail="Invalid move")
    if move.take > game.pennies:
        raise HTTPException(status_code=400, detail="Not enough pennies left")
    game.pennies -= move.take
    now = datetime.now()
    game.last_active_at = now
    if game.pennies == 0:
        game.winner = move.username
    else:
        game.turn = (game.turn + 1) % len(game.players)
    return game.model_dump()

@app.get("/game/state/{room_id}")
def get_game_state(room_id: str):
    game = games.get(room_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    return game.model_dump()


# Cleanup endpoint to remove inactive games and players
@app.post("/cleanup")
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


@app.websocket("/ws/{room_id}/{username}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, username: str):
    total_connections = sum(len(clients) for clients in rooms.values())
    if total_connections >= MAX_CONNECTIONS:
        await websocket.close(code=4000, reason="Too many connections")
        return
    await websocket.accept()

    # Reject if room does not exist
    if room_id not in rooms:
        await websocket.close(code=4001, reason="Room does not exist")
        return

    rooms[room_id].append(websocket)
    await broadcast(room_id, f"🔵 {username} joined the room.")

    try:
        while True:
            data = await websocket.receive_text()
            await broadcast(room_id, f"{username}: {data}")
    except WebSocketDisconnect:
        rooms[room_id].remove(websocket)
        await broadcast(room_id, f"🔴 {username} left the room.")
        if not rooms[room_id]:
            del rooms[room_id]  # Cleanup empty room

async def broadcast(room_id: str, message: str):
    for client in rooms.get(room_id, []):
        await client.send_text(message)
