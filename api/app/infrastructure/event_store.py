"""
Redis-backed event store using Redis Streams.

Each game room gets its own stream: `events:{room_id}`.
Events are appended with XADD and replayed with XRANGE.
Streams auto-expire via TTL for ephemeral game rooms.
"""

import redis.asyncio as redis

from ..domain.constants import ROOM_TTL_SECONDS
from ..domain.events import DomainEvent


class EventStore:
    """Append-only event store backed by Redis Streams."""

    def __init__(self, client: redis.Redis) -> None:
        self._redis = client

    def _stream_key(self, room_id: str) -> str:
        return f"events:{room_id}"

    async def append(self, event: DomainEvent) -> str:
        """Append an event to the room's stream. Returns the stream entry ID."""
        key = self._stream_key(event.room_id)
        entry_id = await self._redis.xadd(key, event.serialize())
        await self._redis.expire(key, ROOM_TTL_SECONDS)
        return entry_id

    async def append_many(self, events: list[DomainEvent]) -> list[str]:
        """Append multiple events atomically via pipeline."""
        if not events:
            return []
        pipe = self._redis.pipeline()
        room_id = events[0].room_id
        key = self._stream_key(room_id)
        for event in events:
            pipe.xadd(key, event.serialize())
        pipe.expire(key, ROOM_TTL_SECONDS)
        results = await pipe.execute()
        return results[:-1]  # Exclude the EXPIRE result

    async def load(self, room_id: str) -> list[DomainEvent]:
        """Load all events for a room, in order."""
        key = self._stream_key(room_id)
        raw_entries = await self._redis.xrange(key)
        return [DomainEvent.deserialize(_decode_entry(entry_data)) for _entry_id, entry_data in raw_entries]

    async def exists(self, room_id: str) -> bool:
        """Check if a room's event stream exists."""
        return bool(await self._redis.exists(self._stream_key(room_id)))

    async def delete(self, room_id: str) -> None:
        """Delete a room's entire event stream."""
        await self._redis.delete(self._stream_key(room_id))


def _decode_entry(entry_data: dict) -> dict[str, str]:
    """Decode Redis byte keys/values to strings."""
    return {
        (k.decode() if isinstance(k, bytes) else k): (v.decode() if isinstance(v, bytes) else v)
        for k, v in entry_data.items()
    }
