"""
WebSocket functionality for real-time communication in the Penny Game.
Handles client connections, message broadcasting, and connection management.
"""

import json
import logging
from datetime import datetime

from fastapi import WebSocket, WebSocketDisconnect

from .game_logic import get_game, get_tails_count, get_total_completed_coins, online_users, remove_game, rooms

logger = logging.getLogger(__name__)

# Configuration constants
MAX_CONNECTIONS = 50
CLOSE_CODE_TOO_MANY_CONNECTIONS = 4000
CLOSE_CODE_ROOM_NOT_EXISTS = 4001
CLOSE_CODE_HOST_LEFT = 4002


class DateTimeEncoder(json.JSONEncoder):
    """Custom JSON encoder for datetime objects."""

    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)


class WebSocketManager:
    """Manages WebSocket connections and broadcasting."""

    @staticmethod
    async def broadcast_game_state(room_id: str, state) -> None:
        """Broadcast game state change to all clients in the room."""
        msg = {"type": "game_state", "state": state.value}
        await WebSocketManager.broadcast_to_room(room_id, msg)

    @staticmethod
    async def broadcast_game_update(room_id: str, update_data: dict) -> None:
        """Broadcast game updates (moves, turns, etc.) to all clients in the room."""
        await WebSocketManager.broadcast_to_room(room_id, update_data)

    @staticmethod
    async def broadcast_to_room(room_id: str, message: dict) -> None:
        """Broadcast a message to all websocket clients in a room."""
        if room_id not in rooms:
            return

        # Use custom encoder to handle datetime objects
        message_str = json.dumps(message, cls=DateTimeEncoder)
        disconnected_clients = []

        for client in rooms[room_id]:
            try:
                await client.send_text(message_str)
            except Exception as e:
                logger.warning(f"Failed to send message to client in room {room_id}: {e}")
                disconnected_clients.append(client)

        # Remove disconnected clients
        for client in disconnected_clients:
            if client in rooms[room_id]:
                rooms[room_id].remove(client)

    @staticmethod
    async def broadcast_activity(room_id: str) -> None:
        """Broadcast user activity status to all clients in the room."""
        game = get_game(room_id)
        if not game:
            return

        # Get all users (players + spectators + host)
        users = set(game.players + game.spectators)
        if game.host:
            users.add(game.host)

        # Get online status
        online = online_users.get(room_id, set())
        activity = {user: (user in online) for user in users}

        msg = {
            "type": "activity",
            "players": game.players,
            "spectators": game.spectators,
            "host": game.host,
            "activity": activity,
        }

        await WebSocketManager.broadcast_to_room(room_id, msg)
        logger.debug(
            f"Activity broadcast for room {room_id}: "
            f"players={game.players}, spectators={game.spectators}, host={game.host}"
        )

    @staticmethod
    async def send_welcome_message(websocket: WebSocket, room_id: str, username: str) -> None:
        """Send initial game state to a newly connected client."""
        game = get_game(room_id)
        if not game:
            return

        # Create comprehensive welcome message with all necessary data
        welcome_msg = {
            "type": "welcome",
            "room_id": room_id,
            "username": username,
            "game_state": {
                "players": game.players,
                "spectators": game.spectators,
                "host": game.host,
                "state": game.state.value,
                "batch_size": game.batch_size,
                "player_coins": game.player_coins,
                "sent_coins": game.sent_coins,
                "total_completed": get_total_completed_coins(game),
                "tails_remaining": get_tails_count(game),
            },
        }

        try:
            # Use custom encoder for datetime serialization
            welcome_str = json.dumps(welcome_msg, cls=DateTimeEncoder)
            await websocket.send_text(welcome_str)
            logger.info(f"Welcome message sent to {username} in room {room_id}")
        except Exception as e:
            logger.warning(f"Failed to send welcome message to {username} in room {room_id}: {e}")


class ConnectionManager:
    """Manages individual WebSocket connections."""

    @staticmethod
    def validate_connection_limit() -> bool:
        """Check if connection limit is reached."""
        total_connections = sum(len(clients) for clients in rooms.values())
        return total_connections < MAX_CONNECTIONS

    @staticmethod
    def add_client_to_room(room_id: str, websocket: WebSocket, username: str) -> None:
        """Add a client to a room and track them as online."""
        if room_id not in rooms:
            rooms[room_id] = []

        rooms[room_id].append(websocket)

        # Track online user
        if room_id not in online_users:
            online_users[room_id] = set()
        online_users[room_id].add(username)

    @staticmethod
    async def remove_client_from_room(room_id: str, websocket: WebSocket, username: str) -> None:
        """Remove a client from a room and handle cleanup."""
        # Remove client from room
        if room_id in rooms and websocket in rooms[room_id]:
            rooms[room_id].remove(websocket)

        # Remove from online users
        if room_id in online_users and username in online_users[room_id]:
            online_users[room_id].remove(username)

        # Clean up empty room
        if room_id in rooms and not rooms[room_id]:
            del rooms[room_id]
            online_users.pop(room_id, None)


async def handle_client_message(room_id: str, username: str, message: str) -> None:
    """Handle incoming messages from clients."""
    try:
        data = json.loads(message)
        msg_type = data.get("type", "chat")

        if msg_type == "chat":
            await _handle_chat_message(room_id, username, data)
        elif msg_type == "ping":
            # Handle ping/pong for connection health
            # Note: Individual client responses would need client-specific handling
            pass
        # Add more message types as needed

    except json.JSONDecodeError:
        # Handle as plain text chat message for backward compatibility
        chat_msg = f"{username}: {message}"
        await WebSocketManager.broadcast_to_room(room_id, {"type": "chat", "message": chat_msg})
    except Exception as e:
        logger.error(f"Error handling client message from {username} in room {room_id}: {e}")


async def _handle_chat_message(room_id: str, username: str, data: dict) -> None:
    """Handle chat message from a client."""
    chat_msg = {
        "type": "chat",
        "username": username,
        "message": data.get("message", ""),
        "timestamp": data.get("timestamp"),
    }
    await WebSocketManager.broadcast_to_room(room_id, chat_msg)


async def handle_disconnect(websocket: WebSocket, room_id: str, username: str) -> None:
    """Handle client disconnection cleanup."""
    await ConnectionManager.remove_client_from_room(room_id, websocket, username)

    game = get_game(room_id)

    # Handle host disconnect - close room
    if game and username == game.host:
        await _handle_host_disconnect(room_id, username)
        return

    # Broadcast user disconnect
    if game:
        await _broadcast_user_disconnect(room_id, username)
        await WebSocketManager.broadcast_activity(room_id)


async def _handle_host_disconnect(room_id: str, username: str) -> None:
    """Handle host disconnection - close the entire room."""
    disconnect_msg = {
        "type": "host_disconnected",
        "message": f"🔴 Host {username} left the room. Room will be closed.",
        "username": username,
    }
    await WebSocketManager.broadcast_to_room(room_id, disconnect_msg)

    # Close all connections in the room
    for ws in rooms.get(room_id, []):
        try:
            await ws.close(code=CLOSE_CODE_HOST_LEFT, reason="Host left, room closed")
        except Exception as e:
            logger.warning(f"Error closing websocket: {e}")

    # Remove the game
    remove_game(room_id)


async def _broadcast_user_disconnect(room_id: str, username: str) -> None:
    """Broadcast that a user has disconnected."""
    disconnect_msg = {"type": "user_disconnected", "username": username, "message": f"🔴 {username} left the room"}
    await WebSocketManager.broadcast_to_room(room_id, disconnect_msg)


async def _broadcast_user_connect(room_id: str, username: str, is_reconnection: bool = False) -> None:
    """Broadcast that a user has connected."""
    if is_reconnection:
        connect_msg = {
            "type": "user_reconnected",
            "username": username,
            "message": f"🟢 {username} reconnected",
        }
    else:
        connect_msg = {
            "type": "user_connected",
            "username": username,
            "message": f"🟢 {username} connected to the room",
        }

    await WebSocketManager.broadcast_to_room(room_id, connect_msg)


async def websocket_endpoint(websocket: WebSocket, room_id: str, username: str) -> None:
    """Main websocket endpoint for handling client connections."""
    # Check connection limits
    if not ConnectionManager.validate_connection_limit():
        await websocket.close(code=CLOSE_CODE_TOO_MANY_CONNECTIONS, reason="Too many connections")
        return

    await websocket.accept()

    # Check if room exists
    if room_id not in rooms:
        await websocket.close(code=CLOSE_CODE_ROOM_NOT_EXISTS, reason="Room does not exist")
        return

    # Add client to room
    ConnectionManager.add_client_to_room(room_id, websocket, username)

    try:
        # Send welcome message with current game state
        await WebSocketManager.send_welcome_message(websocket, room_id, username)

        # Broadcast activity update immediately after connection
        await WebSocketManager.broadcast_activity(room_id)

        # Determine if this is a reconnection and broadcast accordingly
        game = get_game(room_id)
        is_reconnection = game and (username in game.players or username in game.spectators or username == game.host)

        await _broadcast_user_connect(room_id, username, is_reconnection)

        # Handle incoming messages
        while True:
            try:
                data = await websocket.receive_text()
                await handle_client_message(room_id, username, data)
            except Exception as e:
                logger.warning(f"Error receiving message from {username} in room {room_id}: {e}")
                break

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"Unexpected error in websocket for {username} in room {room_id}: {e}")
    finally:
        # Clean up on disconnect
        await handle_disconnect(websocket, room_id, username)


# Export the main functions that other modules need
broadcast_game_state = WebSocketManager.broadcast_game_state
broadcast_game_update = WebSocketManager.broadcast_game_update
broadcast_activity = WebSocketManager.broadcast_activity
