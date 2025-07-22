import json

from fastapi import WebSocket, WebSocketDisconnect

from .game_logic import get_game, online_users, remove_game, rooms


async def broadcast_game_state(room_id: str, state):
    msg = {"type": "game_state", "state": state.value}
    for client in rooms.get(room_id, []):
        await client.send_text(json.dumps(msg))


async def broadcast(room_id: str, message: str):
    for client in rooms.get(room_id, []):
        await client.send_text(message)


async def broadcast_activity(room_id: str):
    game = get_game(room_id)
    if not game:
        return
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


async def websocket_endpoint(websocket: WebSocket, room_id: str, username: str):
    total_connections = sum(len(clients) for clients in rooms.values())
    if total_connections >= 50:
        await websocket.close(code=4000, reason="Too many connections")
        return
    await websocket.accept()
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
        game = get_game(room_id)
        if game and username == game.host:
            await broadcast(room_id, f"🔴 Host {username} left the room.")
            for ws in rooms.get(room_id, []):
                await ws.close(code=4002, reason="Host left, room closed")
            remove_game(room_id)
            return
        await broadcast_activity(room_id)
        if not rooms[room_id]:
            del rooms[room_id]
            online_users.pop(room_id, None)
