"""
FastAPI dependency injection — Redis connections, services, auth.

All dependencies are async and use FastAPI's Depends() system.
"""

import os
from contextlib import asynccontextmanager
from typing import Annotated

import redis.asyncio as aioredis
from fastapi import Depends, Header, HTTPException, Request

from ..application.game_service import GameService
from ..infrastructure.broadcaster import Broadcaster
from ..infrastructure.event_store import EventStore

# Module-level singletons, initialized at startup
_redis_client: aioredis.Redis | None = None
_event_store: EventStore | None = None
_broadcaster: Broadcaster | None = None
_game_service: GameService | None = None


@asynccontextmanager
async def lifespan(app):
    """Initialize and teardown Redis connection."""
    global _redis_client, _event_store, _broadcaster, _game_service

    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    _redis_client = aioredis.from_url(redis_url, decode_responses=False)
    _event_store = EventStore(_redis_client)
    _broadcaster = Broadcaster(_redis_client)
    _game_service = GameService(_event_store, _broadcaster)

    yield

    if _redis_client:
        await _redis_client.aclose()


def get_game_service() -> GameService:
    """Provide the GameService singleton."""
    if _game_service is None:
        raise RuntimeError("GameService not initialized")
    return _game_service


def get_broadcaster() -> Broadcaster:
    """Provide the Broadcaster singleton."""
    if _broadcaster is None:
        raise RuntimeError("Broadcaster not initialized")
    return _broadcaster


def get_redis() -> aioredis.Redis:
    """Provide the Redis client singleton."""
    if _redis_client is None:
        raise RuntimeError("Redis not initialized")
    return _redis_client


# Type aliases for cleaner route signatures
GameServiceDep = Annotated[GameService, Depends(get_game_service)]
BroadcasterDep = Annotated[Broadcaster, Depends(get_broadcaster)]


async def require_host(
    room_id: str,
    request: Request,
    service: GameServiceDep,
) -> None:
    """Dependency that validates the caller is the host."""
    host_secret = request.headers.get("X-Host-Secret", "")
    if not host_secret:
        raise HTTPException(status_code=403, detail="Missing host secret")
    valid = await service.validate_host(room_id.upper(), host_secret)
    if not valid:
        raise HTTPException(status_code=403, detail="Invalid host secret")


async def require_session(
    room_id: str,
    request: Request,
    service: GameServiceDep,
    x_session_token: Annotated[str | None, Header()] = None,
) -> str:
    """Dependency that validates the session token. Returns the token."""
    token = x_session_token or ""
    if not token:
        raise HTTPException(status_code=403, detail="Missing session token")
    # We can't validate here without a username — validation happens in the route
    return token
