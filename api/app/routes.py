import asyncio
import json
from datetime import datetime, timedelta

from fastapi import APIRouter, Body, Cookie, HTTPException, Response

from .game_logic import MAX_PLAYERS, cleanup, create_new_game, get_game, rooms
from .models import ChangeRoleRequest, GameState, JoinRequest, MoveRequest
from .websocket import broadcast_activity, broadcast_game_state

router = APIRouter()


@router.post("/game/create")
def create_game():
    room_id, host_secret = create_new_game()
    response = Response(content=json.dumps({"room_id": room_id}), media_type="application/json")
    response.set_cookie(
        key="host_secret",
        value=host_secret,
        httponly=True,
        samesite="strict",
        max_age=int(timedelta(minutes=30).total_seconds()),
    )
    return response


@router.post("/game/join/{room_id}")
def join_game(room_id: str, join: JoinRequest, spectator: bool = False):
    game = get_game(room_id)

    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    username = join.username

    if username == game.host or username in game.players or username in game.spectators:
        raise HTTPException(status_code=400, detail="Username already taken")
    if room_id not in rooms:
        rooms[room_id] = []

    now = datetime.now()
    game.last_active_at = now

    if game.started_at is None:
        current_state = GameState.LOBBY
    elif all(not v for v in game.pennies):
        current_state = GameState.RESULTS
    else:
        current_state = GameState.ACTIVE

    if game.host is None:
        game.host = username
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
    return {
        "success": True,
        "players": game.players,
        "spectators": game.spectators,
        "host": game.host,
        "pennies": game.pennies,
        "state": current_state.value,
    }


# New endpoint to start the game (host only)
@router.post("/game/start/{room_id}")
async def start_game(room_id: str, host_secret: str = Cookie(None)):
    game = get_game(room_id)

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
    game.last_active_at = now

    await broadcast_game_state(room_id, state=GameState.ACTIVE)
    return {"success": True, "state": GameState.ACTIVE}


@router.post("/game/move/{room_id}")
def make_move(room_id: str, move: MoveRequest):
    game = get_game(room_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    if len(game.players) < 2:
        raise HTTPException(status_code=400, detail="Need 2 players")
    if move.username == game.host:  # Host cannot play
        raise HTTPException(status_code=400, detail="Host does not play")
    if game.players[game.turn] != move.username:
        raise HTTPException(status_code=400, detail="Not your turn")
    if move.flip not in [1, 2, 3]:
        raise HTTPException(status_code=400, detail="Invalid move")

    penny_list = game.pennies
    heads_indices = [i for i, v in enumerate(penny_list) if v]

    if len(heads_indices) < move.flip:
        raise HTTPException(status_code=400, detail="Not enough heads to flip")

    for i in heads_indices[: move.flip]:
        penny_list[i] = False

    now = datetime.now()
    game.last_active_at = now
    game.turn_timestamps.append(now)
    game.turn = (game.turn + 1) % len(game.players)

    if all(not v for v in game.pennies):
        asyncio.create_task(broadcast_game_state(room_id, state=GameState.RESULTS))

    data = game.model_dump()
    if "host_secret" in data:
        del data["host_secret"]
    return data


@router.get("/game/state/{room_id}")
def get_game_state(room_id: str):
    game = get_game(room_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    data = game.model_dump()
    if "host_secret" in data:
        del data["host_secret"]
    return data


@router.post("/cleanup")
def cleanup_inactive_games():
    return cleanup()


@router.post("/game/change_role/{room_id}")
def change_role(room_id: str, req: ChangeRoleRequest = Body(...)):
    game = get_game(room_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    username = req.username
    new_role = req.role
    if username == game.host:
        raise HTTPException(status_code=400, detail="Host role cannot be changed")
    if new_role == "player":
        if username in game.spectators:
            if len(game.players) >= MAX_PLAYERS:
                raise HTTPException(status_code=400, detail="Player limit reached")
            game.spectators.remove(username)
            game.players.append(username)
        else:
            raise HTTPException(status_code=400, detail="User is not a spectator")
    elif new_role == "spectator":
        if username in game.players:
            game.players.remove(username)
            game.spectators.append(username)
        else:
            raise HTTPException(status_code=400, detail="User is not a player")
    else:
        raise HTTPException(status_code=400, detail="Invalid role")

    game.last_active_at = datetime.now()
    asyncio.run(broadcast_activity(room_id))

    return {
        "success": True,
        "players": game.players,
        "spectators": game.spectators,
        "host": game.host,
        "pennies": game.pennies,
    }
