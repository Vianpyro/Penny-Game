"""
Main FastAPI application for the Penny Game.
Configures CORS, middleware, and routes.
"""

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import router
from .websocket import websocket_endpoint

# Configure logging for production
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Application configuration
APP_CONFIG = {
    "title": "Penny Game API",
    "version": "1.0.0",
    "description": "A Lean simulation game for measuring flow efficiency and lead time",
}

# CORS configuration
ALLOWED_ORIGINS = []

# Environment configuration
ENVIRONMENT = os.getenv("ENVIRONMENT", "production")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(**APP_CONFIG)

    # Configure CORS
    _configure_cors(app)

    # Include routes
    app.include_router(router)
    app.websocket("/ws/{room_id}/{username}")(websocket_endpoint)

    # Add health check endpoints
    _add_health_endpoints(app)

    return app


def _configure_cors(app: FastAPI) -> None:
    """Configure CORS middleware."""
    # Allow additional origins from environment variable
    allowed_origins = ALLOWED_ORIGINS.copy()
    if os.getenv("ADDITIONAL_ORIGINS"):
        additional_origins = os.getenv("ADDITIONAL_ORIGINS").split(",")
        allowed_origins.extend([origin.strip() for origin in additional_origins])

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["Set-Cookie"],
    )


def _add_health_endpoints(app: FastAPI) -> None:
    """Add health check endpoints."""

    @app.get("/")
    async def health_check():
        """Basic health check endpoint."""
        return {"status": "ok", "message": "Penny Game API is running", "version": APP_CONFIG["version"]}

    @app.get("/health")
    async def detailed_health_check():
        """Detailed health check endpoint."""
        return {
            "status": "healthy",
            "service": "penny-game-api",
            "version": APP_CONFIG["version"],
            "environment": ENVIRONMENT,
        }


# Create the application instance
app = create_app()
