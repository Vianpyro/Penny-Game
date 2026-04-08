"""
WebSocket endpoint for real-time game updates.

Each connected client subscribes to the room's Redis Pub/Sub channel.
This means multiple API instances can broadcast to all clients.
"""

import asyncio
import json
import logging

from fastapi import WebSocket, WebSocketDisconnect

from .application.game_service import GameService
from .dependencies import get_broadcaster, get_game_service
from .infrastructure.broadcaster import Broadcaster

logger = logging.getLogger(__name__)

MAX_MESSAGE_SIZE = 8192
CLOSE_CODE_UNAUTHORIZED = 4403


async def websocket_endpoint(websocket: WebSocket, room_id: str, username: str) -> None:
    """Main WebSocket handler. Authenticates, subscribes to Redis Pub/Sub, relays messages."""
    room_id = room_id.upper()
    service = get_game_service()
    broadcaster = get_broadcaster()

    if not await _authenticate(websocket, service, room_id, username):
        return

    await websocket.accept()
    await _send_welcome(websocket, service, room_id, username)
    await _run_session(websocket, broadcaster, room_id, username)


async def _authenticate(websocket: WebSocket, service: GameService, room_id: str, username: str) -> bool:
    """Validate the WebSocket token. Returns False and closes on failure."""
    token = websocket.query_params.get("token", "")
    if not token or not await service.validate_session(room_id, username, token):
        await websocket.close(code=CLOSE_CODE_UNAUTHORIZED, reason="Invalid or missing token")
        return False
    return True


async def _run_session(websocket: WebSocket, broadcaster: Broadcaster, room_id: str, username: str) -> None:
    """Run the pub/sub relay and client receiver until disconnect."""
    pubsub, channel = broadcaster.subscribe(room_id)
    await pubsub.subscribe(channel)

    try:
        relay_task = asyncio.create_task(_relay_pubsub(websocket, pubsub))
        receive_task = asyncio.create_task(_receive_client(websocket, broadcaster, room_id, username))

        _done, pending = await asyncio.wait(
            {relay_task, receive_task},
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()

    except WebSocketDisconnect:
        logger.info("Client %s disconnected from %s", username, room_id)
    except Exception as e:
        logger.error("WebSocket error for %s in %s: %s", username, room_id, e)
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.aclose()
        await broadcaster.publish(
            room_id,
            {
                "type": "user_disconnected",
                "username": username,
                "message": f"🔴 {username} left the room",
            },
        )


async def _send_welcome(websocket: WebSocket, service: GameService, room_id: str, username: str) -> None:
    """Send current game state as a welcome message."""
    try:
        state = await service.get_state(room_id)
        welcome = {"type": "welcome", "room_id": room_id, "username": username, "game_state": state}
        await websocket.send_json(welcome)
    except Exception as e:
        logger.warning("Failed to send welcome to %s: %s", username, e)


async def _relay_pubsub(websocket: WebSocket, pubsub) -> None:
    """Relay messages from Redis Pub/Sub to the WebSocket client."""
    while True:
        message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
        if message and message["type"] == "message":
            data = message["data"]
            text = data.decode() if isinstance(data, bytes) else data
            await websocket.send_text(text)
        else:
            await asyncio.sleep(0.01)


async def _receive_client(websocket: WebSocket, broadcaster: Broadcaster, room_id: str, username: str) -> None:
    """Receive and handle messages from the WebSocket client."""
    while True:
        data = await websocket.receive_text()
        if len(data) <= MAX_MESSAGE_SIZE:
            await _handle_client_message(data, broadcaster, room_id, username)


async def _handle_client_message(data: str, broadcaster: Broadcaster, room_id: str, username: str) -> None:
    """Parse and route a single client message."""
    try:
        msg = json.loads(data)
    except json.JSONDecodeError:
        return

    if msg.get("type") == "chat":
        await broadcaster.publish(
            room_id,
            {
                "type": "chat",
                "username": username,
                "message": msg.get("message", ""),
            },
        )
