from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import router
from .websocket import websocket_endpoint

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4321", "https://vianpyro.github.io"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.websocket("/ws/{room_id}/{username}")(websocket_endpoint)
