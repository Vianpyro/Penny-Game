import json
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Body, Cookie, HTTPException, Response

from .game_logic import (
    cleanup,
    create_new_game,
    get_batch_sizes_for_round_type,
    get_game,
    get_total_rounds,
    initialize_player_coins,
    process_flip,
    process_send,
    reset_game,
    rooms,
    set_round_config,
    start_next_round,
)
from .models import ChangeRoleRequest, FlipRequest, GameState, JoinRequest, RoundConfigRequest, RoundType, SendRequest
from .response_builder import GameResponseBuilder
from .validators import GameValidator
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
        samesite="none",
        secure=True,
        max_age=int(timedelta(minutes=30).total_seconds()),
        path="/",
    )
    logger.info(f"Game created: {room_id}")
    return response


@router.post("/game/join/{room_id}")
async def join_game(room_id: str, join: JoinRequest, spectator: bool = False):
    game = get_game(room_id)
    username = join.username

    # Validate game exists
    is_valid, error = GameValidator.validate_game_exists(game)
    if not is_valid:
        raise HTTPException(status_code=404, detail=error)

    # Validate username availability
    is_valid, error = GameValidator.validate_username_available(game, username)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error)

    if room_id not in rooms:
        rooms[room_id] = []

    now = datetime.now()
    game.last_active_at = now

    # Handle host joining
    if game.host is None:
        game.host = username
        await broadcast_activity(room_id)
        logger.info(f"Host {username} joined game {room_id}")
        return GameResponseBuilder.build_join_response(game, note="Host created the room and does not play.")

    # Handle spectator joining
    if spectator:
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
            },
        )
        logger.info(f"Spectator {username} joined game {room_id}")
        return GameResponseBuilder.build_join_response(game)

    # Handle player joining (or spectator if game is full)
    is_valid, error = GameValidator.validate_player_limit(game)
    if not is_valid:
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
        logger.info(f"Player {username} joined as spectator (game full) in {room_id}")
        return GameResponseBuilder.build_join_response(game, note="Joined as spectator (game full)")

    # Add player to the game
    game.players.append(username)

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

    logger.info(f"Player {username} joined game {room_id}")
    return GameResponseBuilder.build_join_response(game)


@router.post("/game/round_config/{room_id}")
async def set_round_configuration(room_id: str, req: RoundConfigRequest, host_secret: str = Cookie(None)):
    """Set round configuration for the game (host only, lobby only)"""
    game = get_game(room_id)

    # Validate game exists
    is_valid, error = GameValidator.validate_game_exists(game)
    if not is_valid:
        raise HTTPException(status_code=404, detail=error)

    # Validate host permissions
    is_valid, error = GameValidator.validate_host_action(game, host_secret)
    if not is_valid:
        raise HTTPException(status_code=403, detail=error)

    # Validate lobby state
    is_valid, error = GameValidator.validate_lobby_state(game)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error)

    # Convert string to enum
    try:
        round_type = RoundType(req.round_type)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid round type")

    # Validate single round has batch size
    if round_type == RoundType.SINGLE and not req.selected_batch_size:
        raise HTTPException(status_code=400, detail="Selected batch size required for single round")

    # Validate batch size
    if req.selected_batch_size and req.selected_batch_size not in [1, 4, 12]:
        raise HTTPException(status_code=400, detail="Invalid batch size. Must be 1, 4, or 12")

    if not set_round_config(game, round_type, req.required_players, req.selected_batch_size):
        raise HTTPException(status_code=400, detail="Failed to set round configuration")

    total_rounds = get_total_rounds(round_type)

    await broadcast_game_update(
        room_id,
        {
            "type": "round_config_update",
            "round_type": game.round_type.value,
            "required_players": game.required_players,
            "selected_batch_size": game.selected_batch_size,
            "total_rounds": total_rounds,
        },
    )

    logger.info(f"Round config updated in game {room_id}: {req.round_type}, {req.required_players} players")
    return {
        "success": True,
        "round_type": game.round_type.value,
        "required_players": game.required_players,
        "selected_batch_size": game.selected_batch_size,
        "total_rounds": total_rounds,
    }


@router.post("/game/start/{room_id}")
async def start_game(room_id: str, host_secret: str = Cookie(None)):
    game = get_game(room_id)

    # Multiple validations using the validator
    validations = [
        GameValidator.validate_game_exists(game),
        GameValidator.validate_game_not_started(game),
        GameValidator.validate_host_action(game, host_secret),
    ]

    is_valid, error = GameValidator.validate_multiple(validations)
    if not is_valid:
        status_code = 404 if "not found" in error else 403 if "Invalid host" in error else 400
        raise HTTPException(status_code=status_code, detail=error)

    # Check if we have enough players for the required amount
    if len(game.players) < game.required_players:
        raise HTTPException(
            status_code=400,
            detail=f"Need {game.required_players} players to start the game. Currently have {len(game.players)}.",
        )

    # Start the first round
    if not start_next_round(game):
        raise HTTPException(status_code=400, detail="Failed to start game")

    batch_sizes = get_batch_sizes_for_round_type(game.round_type, game.selected_batch_size)
    total_rounds = len(batch_sizes)

    await broadcast_game_state(room_id, state=GameState.ACTIVE)
    await broadcast_game_update(
        room_id,
        {
            "type": "game_started",
            "round_type": game.round_type.value,
            "current_round": game.current_round,
            "total_rounds": total_rounds,
            "batch_size": game.batch_size,
            "players": game.players,
            "player_coins": game.player_coins,
            "total_completed": 0,
            "tails_remaining": 12,
            "player_timers": GameResponseBuilder._format_player_timers(game),
            "game_duration_seconds": game.game_duration_seconds,
        },
    )

    logger.info(f"Game started: {room_id} with {len(game.players)} players, round {game.current_round}/{total_rounds}")
    return GameResponseBuilder.build_start_game_response(game)


@router.post("/game/next_round/{room_id}")
async def start_next_round_endpoint(room_id: str, host_secret: str = Cookie(None)):
    """Start the next round (host only, round_complete state only)"""
    game = get_game(room_id)

    # Validate game exists and host permissions
    validations = [
        GameValidator.validate_game_exists(game),
        GameValidator.validate_host_action(game, host_secret),
    ]

    is_valid, error = GameValidator.validate_multiple(validations)
    if not is_valid:
        status_code = 404 if "not found" in error else 403
        raise HTTPException(status_code=status_code, detail=error)

    # Check if we're in the right state
    if game.state != GameState.ROUND_COMPLETE:
        raise HTTPException(status_code=400, detail="Can only start next round when current round is complete")

    # Start the next round
    if not start_next_round(game):
        raise HTTPException(status_code=400, detail="No more rounds to play")

    batch_sizes = get_batch_sizes_for_round_type(game.round_type, game.selected_batch_size)
    total_rounds = len(batch_sizes)

    await broadcast_game_state(room_id, state=GameState.ACTIVE)
    await broadcast_game_update(
        room_id,
        {
            "type": "round_started",
            "current_round": game.current_round,
            "total_rounds": total_rounds,
            "batch_size": game.batch_size,
            "players": game.players,
            "player_coins": game.player_coins,
            "total_completed": 0,
            "tails_remaining": 12,
            "player_timers": GameResponseBuilder._format_player_timers(game),
            "game_duration_seconds": None,
        },
    )

    logger.info(f"Next round started: {room_id}, round {game.current_round}/{total_rounds}")
    return {
        "success": True,
        "current_round": game.current_round,
        "total_rounds": total_rounds,
        "batch_size": game.batch_size,
        "state": game.state.value,
    }


@router.post("/game/flip/{room_id}")
async def flip_coin(room_id: str, flip: FlipRequest):
    game = get_game(room_id)

    # Validate game exists
    is_valid, error = GameValidator.validate_game_exists(game)
    if not is_valid:
        raise HTTPException(status_code=404, detail=error)

    # Validate player count (minimum requirement)
    if len(game.players) < game.required_players:
        raise HTTPException(status_code=400, detail=f"Need {game.required_players} players")

    # Validate flip request
    is_valid, error = GameValidator.validate_flip_request(game, flip.username)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error)

    result = process_flip(game, flip.username, flip.coin_index)

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])

    # Build action data for WebSocket broadcast
    action_data = GameResponseBuilder.build_websocket_action_data(
        flip.username, "flip", result, {"coin_index": flip.coin_index}
    )

    await broadcast_game_update(room_id, action_data)

    # Handle round completion
    if result["round_complete"]:
        if result["game_over"]:
            await broadcast_game_state(room_id, state=GameState.RESULTS)
            game_data = GameResponseBuilder.build_game_state_response(game)
            await broadcast_game_update(room_id, {"type": "game_over", "final_state": game_data})
            logger.info(f"Game completed: {room_id}")
        else:
            await broadcast_game_state(room_id, state=GameState.ROUND_COMPLETE)
            round_result = game.round_results[-1] if game.round_results else None
            batch_sizes = get_batch_sizes_for_round_type(game.round_type, game.selected_batch_size)
            next_round = game.current_round + 1 if game.current_round < len(batch_sizes) else None
            next_batch_size = batch_sizes[game.current_round] if next_round else None

            await broadcast_game_update(
                room_id,
                {
                    "type": "round_complete",
                    "round_number": game.current_round,
                    "next_round": next_round,
                    "batch_size": next_batch_size,
                    "round_result": round_result.dict() if round_result else None,
                    "game_over": False,
                },
            )
            logger.info(f"Round {game.current_round} completed: {room_id}")

    return GameResponseBuilder.build_game_state_response(game)


@router.post("/game/send/{room_id}")
async def send_batch_endpoint(room_id: str, send: SendRequest):
    try:
        game = get_game(room_id)

        # Validate game exists
        is_valid, error = GameValidator.validate_game_exists(game)
        if not is_valid:
            raise HTTPException(status_code=404, detail=error)

        # Validate player count
        if len(game.players) < game.required_players:
            raise HTTPException(status_code=400, detail=f"Need {game.required_players} players")

        # Validate send batch request
        is_valid, error = GameValidator.validate_send_batch_request(game, send.username)
        if not is_valid:
            raise HTTPException(status_code=400, detail=error)

        if send.username not in game.players:
            raise HTTPException(status_code=400, detail="User is not a player in this game")

        result = process_send(game, send.username)

        if not result["success"]:
            raise HTTPException(status_code=400, detail=result["error"])

        # Calculate batch count
        batch_count = 0
        if send.username in game.sent_coins and game.sent_coins[send.username]:
            batch_count = game.sent_coins[send.username][-1]["count"]

        # Build action data for WebSocket broadcast
        action_data = GameResponseBuilder.build_websocket_action_data(
            send.username, "send", result, {"batch_count": batch_count}
        )

        await broadcast_game_update(room_id, action_data)

        # Handle round completion
        if result["round_complete"]:
            if result["game_over"]:
                await broadcast_game_state(room_id, state=GameState.RESULTS)
                game_data = GameResponseBuilder.build_game_state_response(game)
                await broadcast_game_update(room_id, {"type": "game_over", "final_state": game_data})
                logger.info(f"Game completed: {room_id}")
            else:
                await broadcast_game_state(room_id, state=GameState.ROUND_COMPLETE)
                round_result = game.round_results[-1] if game.round_results else None
                batch_sizes = get_batch_sizes_for_round_type(game.round_type, game.selected_batch_size)
                next_round = game.current_round + 1 if game.current_round < len(batch_sizes) else None
                next_batch_size = batch_sizes[game.current_round] if next_round else None

                await broadcast_game_update(
                    room_id,
                    {
                        "type": "round_complete",
                        "round_number": game.current_round,
                        "next_round": next_round,
                        "batch_size": next_batch_size,
                        "round_result": round_result.dict() if round_result else None,
                        "game_over": False,
                    },
                )
                logger.info(f"Round {game.current_round} completed: {room_id}")

        return {
            "success": True,
            "message": "Batch sent successfully",
            "batch_count": batch_count,
            "round_complete": result["round_complete"],
            "game_over": result["game_over"],
            "current_round": result["current_round"],
            "total_completed": result["total_completed"],
            "player_timers": result["player_timers"],
            "game_duration_seconds": result["game_duration_seconds"],
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

    # Validate game exists and host permissions
    validations = [
        GameValidator.validate_game_exists(game),
        GameValidator.validate_host_action(game, host_secret),
    ]

    is_valid, error = GameValidator.validate_multiple(validations)
    if not is_valid:
        status_code = 404 if "not found" in error else 403
        raise HTTPException(status_code=status_code, detail=error)

    reset_game(game)

    await broadcast_game_state(room_id, state=GameState.LOBBY)
    await broadcast_game_update(
        room_id,
        {
            "type": "game_reset",
            "round_type": game.round_type.value,
            "required_players": game.required_players,
            "selected_batch_size": game.selected_batch_size,
            "current_round": game.current_round,
            "state": game.state.value,
            "player_coins": game.player_coins,
            "total_completed": 0,
            "tails_remaining": 12,
            "player_timers": game.player_timers,
            "game_duration_seconds": game.game_duration_seconds,
        },
    )

    logger.info(f"Game reset: {room_id}")
    return GameResponseBuilder.build_reset_response(game)


@router.get("/game/state/{room_id}")
def get_game_state(room_id: str):
    game = get_game(room_id)

    is_valid, error = GameValidator.validate_game_exists(game)
    if not is_valid:
        raise HTTPException(status_code=404, detail=error)

    return GameResponseBuilder.build_game_state_response(game)


@router.post("/cleanup")
def cleanup_inactive_games():
    return cleanup()


@router.post("/game/change_role/{room_id}")
async def change_role(room_id: str, req: ChangeRoleRequest = Body(...)):
    game = get_game(room_id)

    is_valid, error = GameValidator.validate_game_exists(game)
    if not is_valid:
        raise HTTPException(status_code=404, detail=error)

    username = req.username
    new_role = req.role

    # Validate role change
    is_valid, error = GameValidator.validate_role_change(game, username, new_role)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error)

    # Execute role change
    if new_role == "player":
        game.spectators.remove(username)
        game.players.append(username)
    elif new_role == "spectator":
        game.players.remove(username)
        game.spectators.append(username)
        if game.state == GameState.ACTIVE:
            initialize_player_coins(game)

    game.last_active_at = datetime.now()
    await broadcast_activity(room_id)

    logger.info(f"Role changed: {username} -> {new_role} in game {room_id}")
    return GameResponseBuilder.build_game_state_response(game)
