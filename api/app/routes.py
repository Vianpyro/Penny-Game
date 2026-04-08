"""
HTTP routes for the Penny Game API.

Routes are thin — they validate input, delegate to GameService, and return responses.
Auth is handled via dependency injection.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request

from .application.game_service import GameError, GameService
from .dependencies import GameServiceDep, require_host
from .schemas import ChangeRoleRequest, FlipRequest, JoinRequest, RoundConfigRequest, SendRequest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/game")


@router.post("/create")
async def create_game(request: Request, service: GameServiceDep):
    """Create a new game room. The caller becomes the host."""
    # Host username will be set when they join
    result = await service.create_game(host_username="__pending__")
    logger.info("Game created: %s", result["room_id"])
    return result


@router.post("/join/{room_id}")
async def join_game(
    room_id: str,
    body: JoinRequest,
    service: GameServiceDep,
    spectator: bool = False,
):
    """Join a game as a player or spectator."""
    room_id = room_id.upper()
    try:
        result = await service.join_game(room_id, body.username, as_spectator=spectator)
        logger.info("User %s joined %s", body.username, room_id)
        return result
    except GameError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))


@router.post("/round_config/{room_id}")
async def set_round_config(
    room_id: str,
    body: RoundConfigRequest,
    service: GameServiceDep,
    _host: None = Depends(require_host),
):
    """Configure round settings (host only, lobby only)."""
    room_id = room_id.upper()
    try:
        return await service.set_round_config(room_id, body.round_type, body.required_players, body.selected_batch_size)
    except GameError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))


@router.post("/start/{room_id}")
async def start_game(
    room_id: str,
    service: GameServiceDep,
    _host: None = Depends(require_host),
):
    """Start the first round (host only)."""
    room_id = room_id.upper()
    try:
        return await service.start_game(room_id)
    except GameError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))


@router.post("/next_round/{room_id}")
async def next_round(
    room_id: str,
    service: GameServiceDep,
    _host: None = Depends(require_host),
):
    """Start the next round (host only)."""
    room_id = room_id.upper()
    try:
        return await service.start_next_round(room_id)
    except GameError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))


@router.post("/flip/{room_id}")
async def flip_coin(
    room_id: str,
    body: FlipRequest,
    request: Request,
    service: GameServiceDep,
):
    """Flip a coin (player only)."""
    room_id = room_id.upper()
    await _validate_session(service, room_id, body.username, request)
    try:
        return await service.flip_coin(room_id, body.username, body.coin_index)
    except GameError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))


@router.post("/send/{room_id}")
async def send_batch(
    room_id: str,
    body: SendRequest,
    request: Request,
    service: GameServiceDep,
):
    """Send a batch of coins to the next player."""
    room_id = room_id.upper()
    await _validate_session(service, room_id, body.username, request)
    try:
        return await service.send_batch(room_id, body.username)
    except GameError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))


@router.post("/change_role/{room_id}")
async def change_role(
    room_id: str,
    body: ChangeRoleRequest,
    request: Request,
    service: GameServiceDep,
):
    """Change a user's role between player and spectator."""
    room_id = room_id.upper()
    # Either host secret or session token is valid
    host_secret = request.headers.get("X-Host-Secret", "")
    if host_secret:
        valid = await service.validate_host(room_id, host_secret)
        if not valid:
            raise HTTPException(status_code=403, detail="Invalid host secret")
    else:
        await _validate_session(service, room_id, body.username, request)
    try:
        return await service.change_role(room_id, body.username, body.role)
    except GameError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))


@router.post("/reset/{room_id}")
async def reset_game(
    room_id: str,
    service: GameServiceDep,
    _host: None = Depends(require_host),
):
    """Reset the game to lobby (host only)."""
    room_id = room_id.upper()
    try:
        return await service.reset_game(room_id)
    except GameError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))


@router.get("/state/{room_id}")
async def get_state(room_id: str, service: GameServiceDep):
    """Get current game state."""
    room_id = room_id.upper()
    try:
        return await service.get_state(room_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Game not found")


async def _validate_session(service: GameService, room_id: str, username: str, request: Request) -> None:
    """Extract and validate session token from request headers."""
    token = request.headers.get("X-Session-Token", "")
    if not token:
        raise HTTPException(status_code=403, detail="Missing session token")
    valid = await service.validate_session(room_id, username, token)
    if not valid:
        raise HTTPException(status_code=403, detail="Invalid session token")
