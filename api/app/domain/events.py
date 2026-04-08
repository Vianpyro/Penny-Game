"""
Domain events for the Penny Game.

Each event represents an immutable fact about something that happened.
Events are the single source of truth — game state is derived by replaying them.
"""

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field


class EventType(StrEnum):
    """All possible domain events in the Penny Game."""

    GAME_CREATED = "game.created"
    PLAYER_JOINED = "player.joined"
    SPECTATOR_JOINED = "spectator.joined"
    ROLE_CHANGED = "role.changed"
    ROUND_CONFIG_SET = "round_config.set"
    ROUND_STARTED = "round.started"
    COIN_FLIPPED = "coin.flipped"
    BATCH_SENT = "batch.sent"
    BATCH_COMPLETED = "batch.completed"
    ROUND_ENDED = "round.ended"
    GAME_RESET = "game.reset"
    PLAYER_DISCONNECTED = "player.disconnected"
    PLAYER_RECONNECTED = "player.reconnected"


class DomainEvent(BaseModel):
    """Base class for all domain events."""

    event_id: str = Field(default_factory=lambda: uuid4().hex)
    event_type: EventType
    room_id: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    data: dict[str, Any] = Field(default_factory=dict)

    def serialize(self) -> dict[str, str]:
        """Serialize for Redis Stream XADD (all values must be strings)."""
        return {
            "event_id": self.event_id,
            "event_type": self.event_type.value,
            "room_id": self.room_id,
            "timestamp": self.timestamp.isoformat(),
            "data": self.model_dump_json(include={"data"}),
        }

    @classmethod
    def deserialize(cls, raw: dict[str, str]) -> "DomainEvent":
        """Reconstruct from Redis Stream entry."""
        import json

        data_wrapper = json.loads(raw["data"])
        return cls(
            event_id=raw["event_id"],
            event_type=EventType(raw["event_type"]),
            room_id=raw["room_id"],
            timestamp=datetime.fromisoformat(raw["timestamp"]),
            data=data_wrapper.get("data", {}),
        )


# --- Factory functions for creating events ---


def game_created(room_id: str, host: str, host_secret: str) -> DomainEvent:
    return DomainEvent(
        event_type=EventType.GAME_CREATED,
        room_id=room_id,
        data={"host": host, "host_secret": host_secret},
    )


def player_joined(room_id: str, username: str, session_token: str) -> DomainEvent:
    return DomainEvent(
        event_type=EventType.PLAYER_JOINED,
        room_id=room_id,
        data={"username": username, "session_token": session_token},
    )


def spectator_joined(room_id: str, username: str, session_token: str) -> DomainEvent:
    return DomainEvent(
        event_type=EventType.SPECTATOR_JOINED,
        room_id=room_id,
        data={"username": username, "session_token": session_token},
    )


def role_changed(room_id: str, username: str, new_role: str) -> DomainEvent:
    return DomainEvent(
        event_type=EventType.ROLE_CHANGED,
        room_id=room_id,
        data={"username": username, "new_role": new_role},
    )


def round_config_set(
    room_id: str,
    round_type: str,
    required_players: int,
    selected_batch_size: int | None,
) -> DomainEvent:
    return DomainEvent(
        event_type=EventType.ROUND_CONFIG_SET,
        room_id=room_id,
        data={
            "round_type": round_type,
            "required_players": required_players,
            "selected_batch_size": selected_batch_size,
        },
    )


def round_started(
    room_id: str,
    round_number: int,
    batch_size: int,
    players: list[str],
) -> DomainEvent:
    return DomainEvent(
        event_type=EventType.ROUND_STARTED,
        room_id=room_id,
        data={
            "round_number": round_number,
            "batch_size": batch_size,
            "players": players,
        },
    )


def coin_flipped(room_id: str, player: str, coin_index: int) -> DomainEvent:
    return DomainEvent(
        event_type=EventType.COIN_FLIPPED,
        room_id=room_id,
        data={"player": player, "coin_index": coin_index},
    )


def batch_sent(room_id: str, player: str, count: int, to_player: str) -> DomainEvent:
    return DomainEvent(
        event_type=EventType.BATCH_SENT,
        room_id=room_id,
        data={"player": player, "count": count, "to_player": to_player},
    )


def batch_completed(room_id: str, player: str, count: int) -> DomainEvent:
    return DomainEvent(
        event_type=EventType.BATCH_COMPLETED,
        room_id=room_id,
        data={"player": player, "count": count},
    )


def round_ended(
    room_id: str,
    round_number: int,
    duration_seconds: float,
    lead_time_seconds: float | None,
) -> DomainEvent:
    return DomainEvent(
        event_type=EventType.ROUND_ENDED,
        room_id=room_id,
        data={
            "round_number": round_number,
            "duration_seconds": duration_seconds,
            "lead_time_seconds": lead_time_seconds,
        },
    )


def game_reset(room_id: str) -> DomainEvent:
    return DomainEvent(
        event_type=EventType.GAME_RESET,
        room_id=room_id,
    )
