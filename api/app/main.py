import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import router
from .websocket import websocket_endpoint

# Configure logging for production
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Penny Game API",
    version="1.0.0",
    description="A Lean simulation game for measuring flow efficiency and lead time",
)

# Production CORS configuration
ALLOWED_ORIGINS = [
    "https://vianpyro.github.io",  # Production frontend
    "http://localhost:4321",  # Development frontend
    "http://127.0.0.1:4321",  # Development frontend alternative
]

# Allow additional origins from environment variable
if os.getenv("ADDITIONAL_ORIGINS"):
    additional_origins = os.getenv("ADDITIONAL_ORIGINS").split(",")
    ALLOWED_ORIGINS.extend([origin.strip() for origin in additional_origins])

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(router)
app.websocket("/ws/{room_id}/{username}")(websocket_endpoint)


@app.get("/")
async def health_check():
    return {"status": "ok", "message": "Penny Game API is running", "version": "1.0.0"}


@app.get("/health")
async def detailed_health_check():
    return {
        "status": "healthy",
        "service": "penny-game-api",
        "version": "1.0.0",
        "environment": os.getenv("ENVIRONMENT", "production"),
    }
