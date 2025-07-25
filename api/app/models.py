from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class GameState(Enum):
    LOBBY = "lobby"
    ACTIVE = "active"
    RESULTS = "results"


class PennyGame(BaseModel):
    room_id: str
    players: List[str] = Field(default_factory=list)
    spectators: List[str] = Field(default_factory=list)
    host: Optional[str] = None
    host_secret: Optional[str] = None
    pennies: List[bool] = Field(default_factory=lambda: [True] * 20)  # True = Heads, False = Tails
    turn: int = 0  # Index of current player
    created_at: datetime
    last_active_at: datetime
    started_at: Optional[datetime] = None
    turn_timestamps: List[datetime] = Field(default_factory=list)
    state: GameState = GameState.LOBBY

    class Config:
        use_enum_values = True


class JoinRequest(BaseModel):
    username: str

    class Config:
        str_strip_whitespace = True
        min_anystr_length = 1
        max_anystr_length = 20


class MoveRequest(BaseModel):
    username: str
    flip: int = Field(ge=1, le=3, description="Number of pennies to flip (1-3)")

    class Config:
        str_strip_whitespace = True


class ChangeRoleRequest(BaseModel):
    username: str
    role: str = Field(pattern="^(player|spectator)$", description="Role must be 'player' or 'spectator'")

    class Config:
        str_strip_whitespace = True


class GameStateResponse(BaseModel):
    """Response model for game state"""

    room_id: str
    players: List[str]
    spectators: List[str]
    host: Optional[str]
    pennies: List[bool]
    turn: int
    created_at: datetime
    last_active_at: datetime
    started_at: Optional[datetime]
    turn_timestamps: List[datetime]
    state: str
    current_player: Optional[str]
    heads_remaining: int


class MoveResponse(BaseModel):
    """Response model for successful move"""

    success: bool
    game_over: bool
    winner: Optional[str]
    current_player: Optional[str]
    heads_remaining: int
    pennies: List[bool]
    turn: int
    state: str


class WebSocketMessage(BaseModel):
    """Base model for websocket messages"""

    type: str

    class Config:
        use_enum_values = True


class ChatMessage(WebSocketMessage):
    """Chat message via websocket"""

    type: str = "chat"
    username: str
    message: str
    timestamp: Optional[datetime] = None


class GameUpdateMessage(WebSocketMessage):
    """Game update message via websocket"""

    type: str = "game_update"
    data: dict


class MoveMessage(WebSocketMessage):
    """Move made message via websocket"""

    type: str = "move_made"
    player: str
    flip_count: int
    pennies: List[bool]
    current_player: Optional[str]
    heads_remaining: int
    turn: int
    game_over: bool
    winner: Optional[str]
    state: str


class ActivityMessage(WebSocketMessage):
    """User activity status message via websocket"""

    type: str = "activity"
    players: List[str]
    spectators: List[str]
    host: Optional[str]
    activity: dict  # username -> bool (online status)


class WelcomeMessage(WebSocketMessage):
    """Welcome message sent to newly connected clients"""

    type: str = "welcome"
    room_id: str
    username: str
    game_state: dict


class ErrorResponse(BaseModel):
    """Error response model"""

    success: bool = False
    error: str
    detail: Optional[str] = None
