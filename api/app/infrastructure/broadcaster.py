"""
Redis Pub/Sub broadcaster for real-time WebSocket updates.

Uses Redis Pub/Sub so that multiple API instances can broadcast
to all connected WebSocket clients, not just local ones.
"""

import json
from datetime import datetime

import redis.asyncio as redis


class Broadcaster:
    """Publishes and subscribes to game room channels via Redis Pub/Sub."""

    def __init__(self, client: redis.Redis) -> None:
        self._redis = client

    def _channel(self, room_id: str) -> str:
        return f"ws:{room_id}"

    async def publish(self, room_id: str, message: dict) -> None:
        """Publish a message to all subscribers of a room."""
        payload = json.dumps(message, default=_json_serializer)
        await self._redis.publish(self._channel(room_id), payload)

    def subscribe(self, room_id: str) -> redis.client.PubSub:
        """Return a PubSub instance subscribed to a room's channel."""
        pubsub = self._redis.pubsub()
        return pubsub, self._channel(room_id)


def _json_serializer(obj: object) -> str:
    """Handle datetime serialization in JSON."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")
