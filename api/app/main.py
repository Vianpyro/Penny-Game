"""
Penny Game API — main application entry point.

Event-sourced, Redis-backed, real-time cooperative game.
"""

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .dependencies import lifespan
from .routes import router
from .websocket import websocket_endpoint

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)

ALLOWED_ORIGINS = [
    "http://localhost:4321",
    "http://127.0.0.1:4321",
]


def create_app() -> FastAPI:
    app = FastAPI(
        title="Penny Game API",
        version="2.0.0",
        description="Event-sourced Lean simulation game",
        lifespan=lifespan,
    )

    # CORS
    origins = ALLOWED_ORIGINS.copy()
    extra = os.getenv("ADDITIONAL_ORIGINS", "")
    if extra:
        origins.extend(o.strip() for o in extra.split(",") if o.strip() and o.strip() != "*")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    app.include_router(router)
    app.websocket("/ws/{room_id}/{username}")(websocket_endpoint)

    @app.get("/")
    async def health():
        return {"status": "ok", "version": "2.0.0"}

    @app.get("/health")
    async def health_detail():
        return {"status": "healthy", "service": "penny-game-api", "version": "2.0.0"}

    return app


app = create_app()
