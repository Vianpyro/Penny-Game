from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from typing import Dict, List
from uuid import uuid4

app = FastAPI()

# Global in-memory state (for MVP only)
rooms: Dict[str, List[WebSocket]] = {}

@app.websocket("/ws/{room_id}/{username}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, username: str):
    await websocket.accept()
    
    # Create room if it doesn't exist
    if room_id not in rooms:
        rooms[room_id] = []
    
    # Add user to room
    rooms[room_id].append(websocket)
    await broadcast(room_id, f"🔵 {username} joined the room.")

    try:
        while True:
            data = await websocket.receive_text()
            await broadcast(room_id, f"{username}: {data}")
    except WebSocketDisconnect:
        rooms[room_id].remove(websocket)
        await broadcast(room_id, f"🔴 {username} left the room.")
        if not rooms[room_id]:
            del rooms[room_id]  # Cleanup empty room

async def broadcast(room_id: str, message: str):
    for client in rooms.get(room_id, []):
        await client.send_text(message)
