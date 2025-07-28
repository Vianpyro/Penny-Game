from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from .constants import MAX_PENNIES


class GameState(Enum):
    LOBBY = "lobby"
    ACTIVE = "active"
    RESULTS = "results"


class PlayerTimer(BaseModel):
    """Timer tracking for individual players"""

    player: str
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None

    def to_dict(self):
        """Convert to dictionary for JSON serialization"""
        return {
            "player": self.player,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
            "duration_seconds": self.duration_seconds,
        }

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat() if v else None}


class PennyGame(BaseModel):
    room_id: str
    players: List[str] = Field(default_factory=list)
    spectators: List[str] = Field(default_factory=list)
    host: Optional[str] = None
    host_secret: Optional[str] = None
    pennies: List[bool] = Field(default_factory=lambda: [False] * MAX_PENNIES)  # False = Tails, True = Heads
    created_at: datetime
    last_active_at: datetime
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None  # New: Game end time
    turn_timestamps: List[datetime] = Field(default_factory=list)
    state: GameState = GameState.LOBBY
    batch_size: int = MAX_PENNIES  # Default batch size
    player_coins: Dict[str, List[bool]] = Field(default_factory=dict)  # Coins each player has
    sent_coins: Dict[str, List[Dict[str, Any]]] = Field(default_factory=dict)  # Tracking sent batches
    player_timers: Dict[str, PlayerTimer] = Field(default_factory=dict)  # New: Player timers
    game_duration_seconds: Optional[float] = None  # New: Total game duration

    class Config:
        use_enum_values = True
        json_encoders = {datetime: lambda v: v.isoformat() if v else None}


class JoinRequest(BaseModel):
    username: str

    class Config:
        str_strip_whitespace = True
        str_min_length = 1
        str_max_length = 20


class FlipRequest(BaseModel):
    username: str
    coin_index: int = Field(ge=0, le=MAX_PENNIES - 1, description="Index of coin to flip (0-based)")

    class Config:
        str_strip_whitespace = True


class SendRequest(BaseModel):
    username: str

    class Config:
        str_strip_whitespace = True


class BatchSizeRequest(BaseModel):
    batch_size: int = Field(description="Batch size (1, 4, or 12)")

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
    created_at: datetime
    last_active_at: datetime
    started_at: Optional[datetime]
    ended_at: Optional[datetime]
    turn_timestamps: List[datetime]
    state: str
    batch_size: int
    player_coins: Dict[str, List[bool]]
    sent_coins: Dict[str, List[Dict[str, Any]]]
    total_completed: int
    tails_remaining: int
    player_timers: Dict[str, PlayerTimer]
    game_duration_seconds: Optional[float]

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat() if v else None}


class ActionResponse(BaseModel):
    """Response model for flip/send actions"""

    success: bool
    game_over: bool
    player_coins: Dict[str, List[bool]]
    sent_coins: Dict[str, List[Dict[str, Any]]]
    total_completed: int
    state: str
    player_timers: Dict[str, PlayerTimer]  # New: Include timer data
    game_duration_seconds: Optional[float]  # New: Include game duration

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat() if v else None}


class WebSocketMessage(BaseModel):
    """Base model for websocket messages"""

    type: str

    class Config:
        use_enum_values = True


class GameUpdateMessage(WebSocketMessage):
    """Game update message via websocket"""

    type: str = "game_update"
    data: dict


class ActionMessage(WebSocketMessage):
    """Action made message via websocket"""

    type: str = "action_made"
    player: str
    action: str  # "flip" or "send"
    coin_index: Optional[int] = None  # For flip actions
    batch_count: Optional[int] = None  # For send actions
    player_coins: Dict[str, List[bool]]
    sent_coins: Dict[str, List[Dict[str, Any]]]
    total_completed: int
    game_over: bool
    state: str
    player_timers: Dict[str, PlayerTimer]  # New: Include timer data
    game_duration_seconds: Optional[float]  # New: Include game duration

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat() if v else None}


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


class BatchSizeUpdateMessage(WebSocketMessage):
    """Batch size update message via websocket"""

    type: str = "batch_size_update"
    batch_size: int


class ErrorResponse(BaseModel):
    """Error response model"""

    success: bool = False
    error: str
    detail: Optional[str] = None
