from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel


class GameState(Enum):
    LOBBY = "lobby"
    ACTIVE = "active"
    RESULTS = "results"


class PennyGame(BaseModel):
    started_at: Optional[datetime] = None
    turn_timestamps: List[datetime] = []
    room_id: str
    players: List[str]
    spectators: List[str] = []
    host: Optional[str] = None
    host_secret: Optional[str] = None
    pennies: List[bool] = [True] * 20
    turn: int = 0
    created_at: datetime
    last_active_at: datetime
    state: GameState = GameState.LOBBY


class JoinRequest(BaseModel):
    username: str


class MoveRequest(BaseModel):
    username: str
    flip: int


class ChangeRoleRequest(BaseModel):
    username: str
    role: str
