import json
import logging

from fastapi import WebSocket, WebSocketDisconnect

from .game_logic import get_game, online_users, remove_game, rooms

logger = logging.getLogger(__name__)


async def broadcast_game_state(room_id: str, state):
    """Broadcast game state change to all clients in the room"""
    msg = {"type": "game_state", "state": state.value}
    await broadcast_to_room(room_id, msg)


async def broadcast_game_update(room_id: str, update_data: dict):
    """Broadcast game updates (moves, turns, etc.) to all clients in the room"""
    await broadcast_to_room(room_id, update_data)


async def broadcast_to_room(room_id: str, message: dict):
    """Broadcast a message to all websocket clients in a room"""
    if room_id not in rooms:
        return

    message_str = json.dumps(message)
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


async def broadcast(room_id: str, message: str):
    """Broadcast a plain text message (for chat)"""
    if room_id not in rooms:
        return

    disconnected_clients = []

    for client in rooms[room_id]:
        try:
            await client.send_text(message)
        except Exception as e:
            logger.warning(f"Failed to send chat message to client in room {room_id}: {e}")
            disconnected_clients.append(client)

    # Remove disconnected clients
    for client in disconnected_clients:
        if client in rooms[room_id]:
            rooms[room_id].remove(client)


async def broadcast_activity(room_id: str):
    """Broadcast user activity status to all clients in the room"""
    game = get_game(room_id)
    if not game:
        return

    users = set(game.players + game.spectators)
    if game.host:
        users.add(game.host)

    online = online_users.get(room_id, set())
    activity = {user: (user in online) for user in users}

    msg = {
        "type": "activity",
        "players": game.players,
        "spectators": game.spectators,
        "host": game.host,
        "activity": activity,
    }

    await broadcast_to_room(room_id, msg)


async def send_welcome_message(websocket: WebSocket, room_id: str, username: str):
    """Send initial game state to a newly connected client"""
    game = get_game(room_id)
    if not game:
        return

    from .game_logic import get_current_player, get_heads_count

    welcome_msg = {
        "type": "welcome",
        "room_id": room_id,
        "username": username,
        "game_state": {
            "players": game.players,
            "spectators": game.spectators,
            "host": game.host,
            "pennies": game.pennies,
            "state": game.state.value,
            "current_player": get_current_player(game),
            "heads_remaining": get_heads_count(game),
            "turn": game.turn,
        },
    }

    try:
        await websocket.send_text(json.dumps(welcome_msg))
    except Exception as e:
        logger.warning(f"Failed to send welcome message to {username} in room {room_id}: {e}")


async def handle_client_message(room_id: str, username: str, message: str):
    """Handle incoming messages from clients"""
    try:
        data = json.loads(message)
        msg_type = data.get("type", "chat")

        if msg_type == "chat":
            # Broadcast chat message
            chat_msg = {
                "type": "chat",
                "username": username,
                "message": data.get("message", ""),
                "timestamp": data.get("timestamp"),
            }
            await broadcast_to_room(room_id, chat_msg)

        elif msg_type == "ping":
            # Handle ping/pong for connection health
            pong_msg = {"type": "pong", "timestamp": data.get("timestamp")}
            # Send only to the client who pinged
            # This would require client-specific sending, which is handled in websocket_endpoint
            pass

        # Add more message types as needed

    except json.JSONDecodeError:
        # Handle as plain text chat message for backward compatibility
        chat_msg = f"{username}: {message}"
        await broadcast(room_id, chat_msg)
    except Exception as e:
        logger.error(f"Error handling client message from {username} in room {room_id}: {e}")


async def websocket_endpoint(websocket: WebSocket, room_id: str, username: str):
    """Main websocket endpoint for handling client connections"""
    # Check connection limits
    total_connections = sum(len(clients) for clients in rooms.values())
    if total_connections >= 50:
        await websocket.close(code=4000, reason="Too many connections")
        return

    await websocket.accept()

    # Check if room exists
    if room_id not in rooms:
        await websocket.close(code=4001, reason="Room does not exist")
        return

    # Add client to room
    rooms[room_id].append(websocket)

    # Track online user
    if room_id not in online_users:
        online_users[room_id] = set()
    online_users[room_id].add(username)

    try:
        # Send welcome message with current game state
        await send_welcome_message(websocket, room_id, username)

        # Broadcast that user is now online
        await broadcast_activity(room_id)

        # Notify room that user connected
        connect_msg = {"type": "user_connected", "username": username, "message": f"🟢 {username} joined the room"}
        await broadcast_to_room(room_id, connect_msg)

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


async def handle_disconnect(websocket: WebSocket, room_id: str, username: str):
    """Handle client disconnection cleanup"""
    # Remove client from room
    if room_id in rooms and websocket in rooms[room_id]:
        rooms[room_id].remove(websocket)

    # Remove from online users
    if room_id in online_users and username in online_users[room_id]:
        online_users[room_id].remove(username)

    game = get_game(room_id)

    # Handle host disconnect - close room
    if game and username == game.host:
        disconnect_msg = {
            "type": "host_disconnected",
            "message": f"🔴 Host {username} left the room. Room will be closed.",
            "username": username,
        }
        await broadcast_to_room(room_id, disconnect_msg)

        # Close all connections in the room
        for ws in rooms.get(room_id, []):
            try:
                await ws.close(code=4002, reason="Host left, room closed")
            except Exception as e:
                logger.warning(f"Error closing websocket: {e}")

        # Remove the game
        remove_game(room_id)
        return

    # Broadcast user disconnect
    if game:
        disconnect_msg = {"type": "user_disconnected", "username": username, "message": f"🔴 {username} left the room"}
        await broadcast_to_room(room_id, disconnect_msg)
        await broadcast_activity(room_id)

    # Clean up empty room
    if room_id in rooms and not rooms[room_id]:
        del rooms[room_id]
        online_users.pop(room_id, None)
