import asyncio
import json
from datetime import datetime, timedelta
from enum import Enum
from typing import Dict, List, Optional
from uuid import uuid4

from fastapi import Body, Cookie, FastAPI, HTTPException, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

MAX_PLAYERS = 5
MAX_CONNECTIONS = 50
ROOM_INACTIVITY_THRESHOLD = timedelta(minutes=60)
PLAYER_INACTIVITY_THRESHOLD = timedelta(minutes=5)

# Allow all origins for MVP simplicity
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4321"],  # Set to your front-end origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class GameState(Enum):
    LOBBY = "lobby"
    ACTIVE = "active"
    RESULTS = "results"


# Global in-memory state (for MVP only)
rooms: Dict[str, List[WebSocket]] = {}

# Track online users per room
online_users: Dict[str, set] = {}


class PennyGame(BaseModel):
    started_at: Optional[datetime] = None  # Timestamp when game starts
    turn_timestamps: List[datetime] = []  # Timestamp for each turn
    room_id: str
    players: List[str]
    spectators: List[str] = []
    host: Optional[str] = None
    host_secret: Optional[str] = None  # Secret token for host actions
    pennies: List[bool] = [True] * 20  # Shared coins, True=heads, False=tails
    turn: int = 0  # Index of current player
    created_at: datetime
    last_active_at: datetime
    state: GameState = GameState.LOBBY


# In-memory games
games: Dict[str, PennyGame] = {}


# REST endpoints for Penny Game
@app.post("/game/create")
def create_game():
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

    response = Response(content=json.dumps({"room_id": room_id}), media_type="application/json")
    response.set_cookie(
        key="host_secret",
        value=host_secret,
        httponly=True,
        samesite="strict",
        max_age=10,
    )
    return response


class JoinRequest(BaseModel):
    username: str


@app.post("/game/join/{room_id}")
def join_game(room_id: str, join: JoinRequest, spectator: Optional[bool] = False):
    game = games.get(room_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    username = join.username
    if username == game.host:
        raise HTTPException(status_code=400, detail="Host cannot join as player or spectator")
    if username in game.players or username in game.spectators:
        raise HTTPException(status_code=400, detail="User already joined")
    if room_id not in rooms:
        rooms[room_id] = []
    now = datetime.now()
    game.last_active_at = now
    # Determine current game state
    if game.started_at is None:
        current_state = GameState.LOBBY
    elif all(not v for v in game.pennies):
        current_state = GameState.RESULTS
    else:
        current_state = GameState.ACTIVE
    # Add user to the game
    if game.host is None:
        game.host = username
        # Inform all clients of the current state
        asyncio.run(broadcast_game_state(room_id, state=current_state))
        return {
            "success": True,
            "players": game.players,
            "spectators": game.spectators,
            "host": game.host,
            "pennies": game.pennies,
            "state": current_state.value,
            "note": "Host created the room and does not play.",
        }
    if spectator:
        game.spectators.append(username)
        asyncio.run(broadcast_game_state(room_id, state=current_state))
        return {
            "success": True,
            "players": game.players,
            "spectators": game.spectators,
            "host": game.host,
            "pennies": game.pennies,
            "state": current_state.value,
        }
    if len(game.players) >= MAX_PLAYERS:
        game.spectators.append(username)
        asyncio.run(broadcast_game_state(room_id, state=current_state))
        return {
            "success": True,
            "players": game.players,
            "spectators": game.spectators,
            "host": game.host,
            "note": "Joined as spectator (game full)",
            "pennies": game.pennies,
            "state": current_state.value,
        }
    game.players.append(username)
    # No per-player pennies, shared coins only
    asyncio.run(broadcast_game_state(room_id, state=current_state))
    return {
        "success": True,
        "players": game.players,
        "spectators": game.spectators,
        "host": game.host,
        "pennies": game.pennies,
        "state": current_state.value,
    }


class MoveRequest(BaseModel):
    username: str
    flip: int


# New endpoint to start the game (host only)
@app.post("/game/start/{room_id}")
async def start_game(room_id: str, host_secret: str = Cookie(None)):
    game = games.get(room_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    if game.started_at is not None:
        raise HTTPException(status_code=400, detail="Game already started")
    if len(game.players) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 players to start the game")
    if not host_secret or host_secret != game.host_secret:
        raise HTTPException(status_code=403, detail="Invalid host secret")
    now = datetime.now()
    game.started_at = now
    game.turn_timestamps.append(now)
    # Do not rotate turn here; first move will do that
    game.last_active_at = now
    # Broadcast game state change to all clients
    await broadcast_game_state(room_id, state=GameState.ACTIVE)
    return {"success": True, "state": GameState.ACTIVE}


@app.post("/game/move/{room_id}")
def make_move(room_id: str, move: MoveRequest):
    game = games.get(room_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    if len(game.players) < 2:
        raise HTTPException(status_code=400, detail="Need 2 players")
    # Host cannot play
    if move.username == game.host:
        raise HTTPException(status_code=400, detail="Host does not play")
    if game.players[game.turn] != move.username:
        raise HTTPException(status_code=400, detail="Not your turn")
    if move.flip not in [1, 2, 3]:
        raise HTTPException(status_code=400, detail="Invalid move")
    # Shared coins logic
    penny_list = game.pennies
    heads_indices = [i for i, v in enumerate(penny_list) if v]
    if len(heads_indices) < move.flip:
        raise HTTPException(status_code=400, detail="Not enough heads to flip")
    # Flip the first 'move.flip' heads to tails
    for i in heads_indices[: move.flip]:
        penny_list[i] = False
    now = datetime.now()
    game.last_active_at = now
    # Record timestamp for this turn
    game.turn_timestamps.append(now)
    # Rotate turn
    game.turn = (game.turn + 1) % len(game.players)

    # If all pennies are tails, game is over, show results
    if all(not v for v in game.pennies):
        asyncio.create_task(broadcast_game_state(room_id, state=GameState.RESULTS))

    data = game.model_dump()
    if "host_secret" in data:
        del data["host_secret"]
    return data


# Broadcast game state (menu, game, results) to all clients
async def broadcast_game_state(room_id: str, state: GameState):
    msg = {"type": "game_state", "state": state.value}
    for client in rooms.get(room_id, []):
        await client.send_text(json.dumps(msg))


@app.get("/game/state/{room_id}")
def get_game_state(room_id: str):
    game = games.get(room_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    data = game.model_dump()
    if "host_secret" in data:
        del data["host_secret"]
    return data


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


class ChangeRoleRequest(BaseModel):
    username: str
    role: str


@app.post("/game/change_role/{room_id}")
def change_role(room_id: str, req: ChangeRoleRequest = Body(...)):
    game = games.get(room_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    username = req.username
    new_role = req.role
    if username == game.host:
        raise HTTPException(status_code=400, detail="Host role cannot be changed")
    if new_role == "player":
        # Move from spectators to players
        if username in game.spectators:
            if len(game.players) >= MAX_PLAYERS:
                raise HTTPException(status_code=400, detail="Player limit reached")
            game.spectators.remove(username)
            game.players.append(username)
            # No per-player pennies, shared coins only
        else:
            raise HTTPException(status_code=400, detail="User is not a spectator")
    elif new_role == "spectator":
        # Move from players to spectators
        if username in game.players:
            game.players.remove(username)
            game.spectators.append(username)
            # No per-player pennies, shared coins only
        else:
            raise HTTPException(status_code=400, detail="User is not a player")
    else:
        raise HTTPException(status_code=400, detail="Invalid role")
    # Update last active
    game.last_active_at = datetime.now()
    # Broadcast activity update to all clients in the room

    # Use asyncio.run to execute broadcast_activity from sync context
    asyncio.run(broadcast_activity(room_id))
    return {
        "success": True,
        "players": game.players,
        "spectators": game.spectators,
        "host": game.host,
        "pennies": game.pennies,
    }


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
    if room_id not in online_users:
        online_users[room_id] = set()
    online_users[room_id].add(username)
    await broadcast_activity(room_id)

    try:
        while True:
            data = await websocket.receive_text()
            await broadcast(room_id, f"{username}: {data}")
    except WebSocketDisconnect:
        rooms[room_id].remove(websocket)
        if room_id in online_users and username in online_users[room_id]:
            online_users[room_id].remove(username)
        # If host leaves, delete room/game and notify others
        game = games.get(room_id)
        if game and username == game.host:
            # Notify all clients before deleting
            await broadcast(room_id, f"🔴 Host {username} left the room.")
            # Remove all connections
            for ws in rooms.get(room_id, []):
                await ws.close(code=4002, reason="Host left, room closed")
            games.pop(room_id, None)
            rooms.pop(room_id, None)
            online_users.pop(room_id, None)
            return
        await broadcast_activity(room_id)
        if not rooms[room_id]:
            del rooms[room_id]  # Cleanup empty room
            online_users.pop(room_id, None)


async def broadcast(room_id: str, message: str):
    for client in rooms.get(room_id, []):
        await client.send_text(message)


# Broadcast structured activity state
async def broadcast_activity(room_id: str):
    game = games.get(room_id)
    if not game:
        return
    # Compose activity state for all users
    users = set(game.players + game.spectators)
    host = game.host
    online = online_users.get(room_id, set())
    activity = {user: (user in online) for user in users}
    msg = {
        "type": "activity",
        "players": game.players,
        "spectators": game.spectators,
        "host": host,
        "activity": activity,
    }
    for client in rooms.get(room_id, []):
        await client.send_text(json.dumps(msg))
