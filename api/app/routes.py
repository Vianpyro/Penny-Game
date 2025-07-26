import json
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Body, Cookie, HTTPException, Response

from .constants import MAX_PLAYERS
from .game_logic import (
    cleanup,
    create_new_game,
    get_game,
    get_tails_count,
    get_total_completed_coins,
    initialize_player_coins,
    process_flip,
    process_send,
    reset_game,
    rooms,
    set_batch_size,
)
from .models import BatchSizeRequest, ChangeRoleRequest, FlipRequest, GameState, JoinRequest, SendRequest
from .websocket import broadcast_activity, broadcast_game_state, broadcast_game_update

router = APIRouter()
logger = logging.getLogger(__name__)


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
    elif len(game.player_coins) == 0 or not any(game.player_coins.values()):
        current_state = GameState.RESULTS
    else:
        current_state = GameState.ACTIVE

    # Handle host joining
    if game.host is None:
        game.host = username
        # IMPORTANT: Broadcast immediately after setting host
        await broadcast_activity(room_id)
        return {
            "success": True,
            "players": game.players,
            "spectators": game.spectators,
            "host": game.host,
            "batch_size": game.batch_size,
            "state": current_state.value,
            "player_coins": game.player_coins,
            "total_completed": get_total_completed_coins(game),
            "tails_remaining": get_tails_count(game),
            "note": "Host created the room and does not play.",
        }

    # Handle spectator joining
    if spectator:
        game.spectators.append(username)
        # Broadcast activity update for spectator join
        await broadcast_activity(room_id)
        # Also broadcast a join message
        await broadcast_game_update(
            room_id,
            {
                "type": "user_joined",
                "username": username,
                "role": "spectator",
                "players": game.players,
                "spectators": game.spectators,
            },
        )
        return {
            "success": True,
            "players": game.players,
            "spectators": game.spectators,
            "host": game.host,
            "batch_size": game.batch_size,
            "state": current_state.value,
            "player_coins": game.player_coins,
            "total_completed": get_total_completed_coins(game),
            "tails_remaining": get_tails_count(game),
        }

    # Handle player joining (or spectator if game is full)
    if len(game.players) >= MAX_PLAYERS:
        game.spectators.append(username)
        await broadcast_activity(room_id)
        await broadcast_game_update(
            room_id,
            {
                "type": "user_joined",
                "username": username,
                "role": "spectator",
                "players": game.players,
                "spectators": game.spectators,
                "note": "Joined as spectator (game full)",
            },
        )
        return {
            "success": True,
            "players": game.players,
            "spectators": game.spectators,
            "host": game.host,
            "note": "Joined as spectator (game full)",
            "batch_size": game.batch_size,
            "state": current_state.value,
            "player_coins": game.player_coins,
            "total_completed": get_total_completed_coins(game),
            "tails_remaining": get_tails_count(game),
        }

    # Add player to the game
    game.players.append(username)

    # Broadcast activity AND game update when player joins
    await broadcast_activity(room_id)
    await broadcast_game_update(
        room_id,
        {
            "type": "user_joined",
            "username": username,
            "role": "player",
            "players": game.players,
            "spectators": game.spectators,
        },
    )

    return {
        "success": True,
        "players": game.players,
        "spectators": game.spectators,
        "host": game.host,
        "batch_size": game.batch_size,
        "state": current_state.value,
        "player_coins": game.player_coins,
        "total_completed": get_total_completed_coins(game),
        "tails_remaining": get_tails_count(game),
    }


@router.post("/game/batch_size/{room_id}")
async def set_game_batch_size(room_id: str, req: BatchSizeRequest, host_secret: str = Cookie(None)):
    """Set batch size for the game (host only, lobby only)"""
    game = get_game(room_id)

    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    if not host_secret or host_secret != game.host_secret:
        raise HTTPException(status_code=403, detail="Invalid host secret")
    if game.state != GameState.LOBBY:
        raise HTTPException(status_code=400, detail="Can only change batch size in lobby")

    # Validate batch size - must be 1, 4, or 12 for the penny game
    valid_batch_sizes = [1, 4, 12]
    if req.batch_size not in valid_batch_sizes:
        raise HTTPException(status_code=400, detail=f"Invalid batch size. Must be one of: {valid_batch_sizes}")

    if not set_batch_size(game, req.batch_size):
        raise HTTPException(status_code=400, detail=f"Failed to set batch size to {req.batch_size}")

    # Broadcast batch size update
    await broadcast_game_update(
        room_id,
        {
            "type": "batch_size_update",
            "batch_size": game.batch_size,
        },
    )

    return {
        "success": True,
        "batch_size": game.batch_size,
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

    # Initialize player coins
    initialize_player_coins(game)

    # Broadcast game start to all clients
    await broadcast_game_state(room_id, state=GameState.ACTIVE)
    await broadcast_game_update(
        room_id,
        {
            "type": "game_started",
            "batch_size": game.batch_size,
            "players": game.players,
            "player_coins": game.player_coins,
            "total_completed": get_total_completed_coins(game),
            "tails_remaining": get_tails_count(game),
        },
    )

    return {
        "success": True,
        "state": GameState.ACTIVE.value,
        "batch_size": game.batch_size,
        "player_coins": game.player_coins,
        "total_completed": get_total_completed_coins(game),
        "tails_remaining": get_tails_count(game),
    }


@router.post("/game/flip/{room_id}")
async def flip_coin(room_id: str, flip: FlipRequest):
    game = get_game(room_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    if len(game.players) < 2:
        raise HTTPException(status_code=400, detail="Need 2 players")
    if flip.username == game.host:  # Host cannot play
        raise HTTPException(status_code=400, detail="Host does not play")

    # Process the flip using the game logic
    result = process_flip(game, flip.username, flip.coin_index)

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])

    # Prepare game data for response (remove sensitive info)
    game_data = game.model_dump()
    if "host_secret" in game_data:
        del game_data["host_secret"]

    # Broadcast the action to all clients
    action_data = {
        "type": "action_made",
        "player": flip.username,
        "action": "flip",
        "coin_index": flip.coin_index,
        "player_coins": result["player_coins"],
        "sent_coins": result["sent_coins"],
        "total_completed": result["total_completed"],
        "game_over": result["game_over"],
        "state": result["state"],
    }

    await broadcast_game_update(room_id, action_data)

    # If game is over, broadcast final state
    if result["game_over"]:
        await broadcast_game_state(room_id, state=GameState.RESULTS)
        await broadcast_game_update(room_id, {"type": "game_over", "final_state": game_data})

    return game_data


@router.post("/game/send/{room_id}")
async def send_batch_endpoint(room_id: str, send: SendRequest):
    try:
        logger.info(f"Send batch request: room_id={room_id}, username={send.username}")

        game = get_game(room_id)
        if not game:
            logger.warning(f"Game not found: {room_id}")
            raise HTTPException(status_code=404, detail="Game not found")

        if len(game.players) < 2:
            logger.warning(f"Not enough players in game {room_id}: {len(game.players)}")
            raise HTTPException(status_code=400, detail="Need 2 players")

        if send.username == game.host:  # Host cannot play
            logger.warning(f"Host {send.username} trying to play in game {room_id}")
            raise HTTPException(status_code=400, detail="Host does not play")

        # Validate that the user is actually a player in the game
        if send.username not in game.players:
            logger.warning(f"User {send.username} not in players list for game {room_id}")
            raise HTTPException(status_code=400, detail="User is not a player in this game")

        # Check if game is in correct state
        if game.state != GameState.ACTIVE:
            logger.warning(f"Game {room_id} not in active state: {game.state}")
            raise HTTPException(status_code=400, detail="Game is not active")

        logger.info(f"Processing send for {send.username} in game {room_id}")

        # Process the send using the game logic
        result = process_send(game, send.username)

        if not result["success"]:
            logger.warning(f"Send failed for {send.username}: {result['error']}")
            raise HTTPException(status_code=400, detail=result["error"])

        logger.info(f"Send successful for {send.username}")

        # Calculate batch count for the action
        batch_count = 0
        if send.username in game.sent_coins and game.sent_coins[send.username]:
            batch_count = game.sent_coins[send.username][-1]["count"]

        # Broadcast the action to all clients
        action_data = {
            "type": "action_made",
            "player": send.username,
            "action": "send",
            "batch_count": batch_count,
            "player_coins": result["player_coins"],
            "sent_coins": result["sent_coins"],
            "total_completed": result["total_completed"],
            "game_over": result["game_over"],
            "state": result["state"],
        }

        await broadcast_game_update(room_id, action_data)

        # If game is over, broadcast final state
        if result["game_over"]:
            await broadcast_game_state(room_id, state=GameState.RESULTS)
            await broadcast_game_update(
                room_id, {"type": "game_over", "final_state": game.model_dump(exclude={"host_secret"})}
            )

        # Return a simple success response instead of the full game data
        return {
            "success": True,
            "message": "Batch sent successfully",
            "batch_count": batch_count,
            "game_over": result["game_over"],
            "total_completed": result["total_completed"],
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in send_batch_endpoint: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


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
            "batch_size": game.batch_size,
            "state": game.state.value,
            "player_coins": game.player_coins,
            "total_completed": get_total_completed_coins(game),
            "tails_remaining": get_tails_count(game),
        },
    )

    return {
        "success": True,
        "state": GameState.LOBBY.value,
        "batch_size": game.batch_size,
        "player_coins": game.player_coins,
        "total_completed": get_total_completed_coins(game),
        "tails_remaining": get_tails_count(game),
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
    data["total_completed"] = get_total_completed_coins(game)
    data["tails_remaining"] = get_tails_count(game)

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
            # If game is active, reinitialize coins
            if game.state == GameState.ACTIVE:
                initialize_player_coins(game)
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
        "batch_size": game.batch_size,
        "player_coins": game.player_coins,
        "total_completed": get_total_completed_coins(game),
        "tails_remaining": get_tails_count(game),
    }
