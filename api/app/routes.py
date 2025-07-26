import json
from datetime import datetime, timedelta

from fastapi import APIRouter, Body, Cookie, HTTPException, Response

from .constants import MAX_PLAYERS
from .game_logic import (
    cleanup,
    create_new_game,
    get_current_player,
    get_game,
    get_heads_count,
    process_move,
    reset_game,
    rooms,
)
from .models import ChangeRoleRequest, GameState, JoinRequest, MoveRequest
from .websocket import broadcast_activity, broadcast_game_state, broadcast_game_update

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
async def join_game(room_id: str, join: JoinRequest, spectator: bool = False):
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

    # Determine current game state
    if game.started_at is None:
        current_state = GameState.LOBBY
    elif all(not v for v in game.pennies):
        current_state = GameState.RESULTS
    else:
        current_state = GameState.ACTIVE

    # Handle host joining
    if game.host is None:
        game.host = username
        await broadcast_activity(room_id)
        return {
            "success": True,
            "players": game.players,
            "spectators": game.spectators,
            "host": game.host,
            "pennies": game.pennies,
            "state": current_state.value,
            "current_player": get_current_player(game),
            "heads_remaining": get_heads_count(game),
            "note": "Host created the room and does not play.",
        }

    # Handle spectator joining
    if spectator:
        game.spectators.append(username)
        await broadcast_activity(room_id)
        return {
            "success": True,
            "players": game.players,
            "spectators": game.spectators,
            "host": game.host,
            "pennies": game.pennies,
            "state": current_state.value,
            "current_player": get_current_player(game),
            "heads_remaining": get_heads_count(game),
        }

    # Handle player joining (or spectator if game is full)
    if len(game.players) >= MAX_PLAYERS:
        game.spectators.append(username)
        await broadcast_activity(room_id)
        return {
            "success": True,
            "players": game.players,
            "spectators": game.spectators,
            "host": game.host,
            "note": "Joined as spectator (game full)",
            "pennies": game.pennies,
            "state": current_state.value,
            "current_player": get_current_player(game),
            "heads_remaining": get_heads_count(game),
        }

    game.players.append(username)
    await broadcast_activity(room_id)
    return {
        "success": True,
        "players": game.players,
        "spectators": game.spectators,
        "host": game.host,
        "pennies": game.pennies,
        "state": current_state.value,
        "current_player": get_current_player(game),
        "heads_remaining": get_heads_count(game),
    }


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
    game.state = GameState.ACTIVE
    game.turn = 0  # Start with first player

    # Broadcast game start to all clients
    await broadcast_game_state(room_id, state=GameState.ACTIVE)
    await broadcast_game_update(
        room_id,
        {
            "type": "game_started",
            "current_player": get_current_player(game),
            "heads_remaining": get_heads_count(game),
            "pennies": game.pennies,
            "players": game.players,
            "turn": game.turn,
        },
    )

    return {
        "success": True,
        "state": GameState.ACTIVE.value,
        "current_player": get_current_player(game),
        "heads_remaining": get_heads_count(game),
    }


@router.post("/game/move/{room_id}")
async def make_move(room_id: str, move: MoveRequest):
    game = get_game(room_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    if len(game.players) < 2:
        raise HTTPException(status_code=400, detail="Need 2 players")
    if move.username == game.host:  # Host cannot play
        raise HTTPException(status_code=400, detail="Host does not play")

    # Process the move using the game logic
    result = process_move(game, move.username, move.flip)

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])

    # Prepare game data for response (remove sensitive info)
    game_data = game.model_dump()
    if "host_secret" in game_data:
        del game_data["host_secret"]

    # Broadcast the move to all clients
    move_data = {
        "type": "move_made",
        "player": move.username,
        "flip_count": move.flip,
        "pennies": result["pennies"],
        "current_player": result["current_player"],
        "heads_remaining": result["heads_remaining"],
        "turn": result["turn"],
        "game_over": result["game_over"],
        "winner": result.get("winner"),
        "state": result["state"],
    }

    await broadcast_game_update(room_id, move_data)

    # If game is over, broadcast final state
    if result["game_over"]:
        await broadcast_game_state(room_id, state=GameState.RESULTS)
        await broadcast_game_update(
            room_id, {"type": "game_over", "winner": result["winner"], "final_state": game_data}
        )

    return game_data


@router.post("/game/reset/{room_id}")
async def reset_game_endpoint(room_id: str, host_secret: str = Cookie(None)):
    """Reset the game to lobby state (host only)"""
    game = get_game(room_id)

    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    if not host_secret or host_secret != game.host_secret:
        raise HTTPException(status_code=403, detail="Invalid host secret")

    reset_game(game)

    # Broadcast reset to all clients
    await broadcast_game_state(room_id, state=GameState.LOBBY)
    await broadcast_game_update(
        room_id,
        {
            "type": "game_reset",
            "pennies": game.pennies,
            "state": game.state.value,
            "current_player": None,
            "heads_remaining": get_heads_count(game),
        },
    )

    return {
        "success": True,
        "state": GameState.LOBBY.value,
        "pennies": game.pennies,
        "heads_remaining": get_heads_count(game),
    }


@router.get("/game/state/{room_id}")
def get_game_state(room_id: str):
    game = get_game(room_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    data = game.model_dump()
    if "host_secret" in data:
        del data["host_secret"]

    # Add computed fields
    data["current_player"] = get_current_player(game)
    data["heads_remaining"] = get_heads_count(game)

    return data


@router.post("/cleanup")
def cleanup_inactive_games():
    return cleanup()


@router.post("/game/change_role/{room_id}")
async def change_role(room_id: str, req: ChangeRoleRequest = Body(...)):
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
            # Adjust turn if necessary
            if game.players and game.turn >= len(game.players):
                game.turn = 0
        else:
            raise HTTPException(status_code=400, detail="User is not a player")
    else:
        raise HTTPException(status_code=400, detail="Invalid role")

    game.last_active_at = datetime.now()
    await broadcast_activity(room_id)

    return {
        "success": True,
        "players": game.players,
        "spectators": game.spectators,
        "host": game.host,
        "pennies": game.pennies,
        "current_player": get_current_player(game),
        "heads_remaining": get_heads_count(game),
    }
