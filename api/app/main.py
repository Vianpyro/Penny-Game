import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import router
from .websocket import websocket_endpoint

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Penny Game API", version="1.0.0")

# More permissive CORS configuration for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for debugging
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
)


# Add logging middleware to debug requests
@app.middleware("http")
async def log_requests(request, call_next):
    logger.info(f"Request: {request.method} {request.url}")
    response = await call_next(request)
    logger.info(f"Response: {response.status_code}")
    return response


app.include_router(router)
app.websocket("/ws/{room_id}/{username}")(websocket_endpoint)


# Add a health check endpoint
@app.get("/")
async def health_check():
    return {"status": "ok", "message": "Penny Game API is running"}


# Add a debug endpoint to check if the API is reachable
@app.get("/debug/cors")
async def debug_cors():
    return {"message": "CORS is working", "status": "ok"}


# Add an endpoint to test POST requests
@app.post("/debug/test")
async def debug_post():
    return {"message": "POST request successful", "status": "ok"}
