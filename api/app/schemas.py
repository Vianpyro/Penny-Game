"""
Pydantic models for API requests and responses.

Validation happens at the edge (here) so domain logic stays clean.
"""

from pydantic import BaseModel, Field

from .domain.constants import MAX_PLAYERS, MIN_PLAYERS, TOTAL_COINS


class JoinRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=20, strip_whitespace=True)


class FlipRequest(BaseModel):
    username: str = Field(..., min_length=1, strip_whitespace=True)
    coin_index: int = Field(..., ge=0, lt=TOTAL_COINS)


class SendRequest(BaseModel):
    username: str = Field(..., min_length=1, strip_whitespace=True)


class RoundConfigRequest(BaseModel):
    round_type: str = Field(..., pattern=r"^(single|two_rounds|three_rounds)$")
    required_players: int = Field(..., ge=MIN_PLAYERS, le=MAX_PLAYERS)
    selected_batch_size: int | None = None


class ChangeRoleRequest(BaseModel):
    username: str = Field(..., min_length=1, strip_whitespace=True)
    role: str = Field(..., pattern=r"^(player|spectator)$")
