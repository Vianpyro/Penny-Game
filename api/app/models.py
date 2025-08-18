"""
Data models for the Penny Game application.
Defines all Pydantic models used for data validation and serialization.
"""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from .constants import DEFAULT_BATCH_SIZE, DEFAULT_REQUIRED_PLAYERS, TOTAL_COINS, get_valid_batch_sizes


class GameState(Enum):
    """Possible states of a game."""

    LOBBY = "lobby"
    ACTIVE = "active"
    ROUND_COMPLETE = "round_complete"
    RESULTS = "results"


class RoundType(Enum):
    """Types of round configurations."""

    SINGLE = "single"  # Host chooses one round
    TWO_ROUNDS = "two_rounds"  # Batch 12 + Batch 1
    THREE_ROUNDS = "three_rounds"  # All three batches


class PlayerTimer(BaseModel):
    """Timer tracking for individual players."""

    player: str
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "player": self.player,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
            "duration_seconds": self.duration_seconds,
        }

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat() if v else None}


class RoundResult(BaseModel):
    """Results for a single round."""

    round_number: int
    batch_size: int
    game_duration_seconds: Optional[float] = None
    lead_time_seconds: Optional[float] = None
    first_flip_at: Optional[datetime] = None
    first_delivery_at: Optional[datetime] = None
    player_timers: Dict[str, PlayerTimer] = Field(default_factory=dict)
    total_completed: int = 0
    total_coins: int = TOTAL_COINS
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat() if v else None}


class PennyGame(BaseModel):
    """Main game model representing a complete Penny Game session."""

    # Basic game info
    room_id: str
    players: List[str] = Field(default_factory=list)
    spectators: List[str] = Field(default_factory=list)
    host: Optional[str] = None
    host_secret: Optional[str] = None

    # Game state
    pennies: List[bool] = Field(
        default_factory=lambda: [False] * TOTAL_COINS
    )  # False = Tails (starting state), True = Heads
    created_at: datetime
    last_active_at: datetime
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    turn_timestamps: List[datetime] = Field(default_factory=list)
    state: GameState = GameState.LOBBY

    # Round system configuration
    round_type: RoundType = RoundType.THREE_ROUNDS
    required_players: int = DEFAULT_REQUIRED_PLAYERS
    current_round: int = 0  # 0 = not started, 1-3 = round number
    round_results: List[RoundResult] = Field(default_factory=list)
    batch_sizes: List[int] = Field(default_factory=lambda: get_valid_batch_sizes())
    selected_batch_size: Optional[int] = None  # For single round mode

    # Current round state
    batch_size: int = DEFAULT_BATCH_SIZE
    player_coins: Dict[str, List[bool]] = Field(default_factory=dict)
    sent_coins: Dict[str, List[Dict[str, Any]]] = Field(default_factory=dict)
    player_timers: Dict[str, PlayerTimer] = Field(default_factory=dict)
    game_duration_seconds: Optional[float] = None
    first_flip_at: Optional[datetime] = None
    first_delivery_at: Optional[datetime] = None
    lead_time_seconds: Optional[float] = None

    class Config:
        use_enum_values = True
        json_encoders = {datetime: lambda v: v.isoformat() if v else None}


# Request Models
class JoinRequest(BaseModel):
    """Request to join a game."""

    username: str = Field(..., min_length=1, max_length=20)

    class Config:
        str_strip_whitespace = True


class FlipRequest(BaseModel):
    """Request to flip a coin."""

    username: str = Field(..., min_length=1)
    coin_index: int = Field(..., ge=0, le=TOTAL_COINS - 1, description=f"Index of coin to flip (0-{TOTAL_COINS-1})")

    class Config:
        str_strip_whitespace = True


class SendRequest(BaseModel):
    """Request to send a batch of coins."""

    username: str = Field(..., min_length=1)

    class Config:
        str_strip_whitespace = True


class RoundConfigRequest(BaseModel):
    """Request to configure round settings."""

    round_type: str = Field(..., pattern=r"^(single|two_rounds|three_rounds)$")
    selected_batch_size: Optional[int] = Field(None, description="Required for single round type")
    required_players: int = Field(..., ge=2, le=5, description="Number of players required (2-5)")

    class Config:
        str_strip_whitespace = True


class ChangeRoleRequest(BaseModel):
    """Request to change a user's role."""

    username: str = Field(..., min_length=1)
    role: str = Field(..., pattern=r"^(player|spectator)$", description="Role must be 'player' or 'spectator'")

    class Config:
        str_strip_whitespace = True


# Response Models
class GameStateResponse(BaseModel):
    """Response model for game state."""

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

    # Round system
    round_type: str
    required_players: int
    current_round: int
    total_rounds: int
    round_results: List[RoundResult]

    # Current round
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
    """Response model for flip/send actions."""

    success: bool
    round_complete: bool
    game_over: bool
    player_coins: Dict[str, List[bool]]
    sent_coins: Dict[str, List[Dict[str, Any]]]
    total_completed: int
    state: str
    player_timers: Dict[str, PlayerTimer]
    game_duration_seconds: Optional[float]

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat() if v else None}


# WebSocket Message Models
class WebSocketMessage(BaseModel):
    """Base model for websocket messages."""

    type: str

    class Config:
        use_enum_values = True


class GameUpdateMessage(WebSocketMessage):
    """Game update message via websocket."""

    type: str = "game_update"
    data: dict


class ActionMessage(WebSocketMessage):
    """Action made message via websocket."""

    type: str = "action_made"
    player: str
    action: str  # "flip" or "send"
    coin_index: Optional[int] = None  # For flip actions
    batch_count: Optional[int] = None  # For send actions
    player_coins: Dict[str, List[bool]]
    sent_coins: Dict[str, List[Dict[str, Any]]]
    total_completed: int
    round_complete: bool
    game_over: bool
    state: str
    player_timers: Dict[str, PlayerTimer]
    game_duration_seconds: Optional[float]

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat() if v else None}


class RoundCompleteMessage(WebSocketMessage):
    """Round completion message."""

    type: str = "round_complete"
    round_number: int
    next_round: Optional[int] = None
    batch_size: Optional[int] = None
    round_result: RoundResult
    game_over: bool


class ActivityMessage(WebSocketMessage):
    """User activity status message via websocket."""

    type: str = "activity"
    players: List[str]
    spectators: List[str]
    host: Optional[str]
    activity: dict  # username -> bool (online status)


class WelcomeMessage(WebSocketMessage):
    """Welcome message sent to newly connected clients."""

    type: str = "welcome"
    room_id: str
    username: str
    game_state: dict


class RoundConfigUpdateMessage(WebSocketMessage):
    """Round configuration update message via websocket."""

    type: str = "round_config_update"
    round_type: str
    required_players: int
    selected_batch_size: Optional[int]
    total_rounds: int


class ErrorResponse(BaseModel):
    """Error response model."""

    success: bool = False
    error: str
    detail: Optional[str] = None
