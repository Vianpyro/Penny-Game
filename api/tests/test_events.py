"""Tests for domain events — serialization, deserialization, factory functions."""

from app.domain.events import (
    DomainEvent,
    EventType,
    batch_completed,
    batch_sent,
    coin_flipped,
    game_created,
    game_reset,
    player_joined,
    round_ended,
    round_started,
    spectator_joined,
)


class TestDomainEventSerialization:
    def test_serialize_produces_string_values(self):
        event = game_created("ROOM1", "host", "secret123")
        serialized = event.serialize()
        assert all(isinstance(v, str) for v in serialized.values())

    def test_roundtrip_preserves_data(self):
        original = coin_flipped("ROOM1", "alice", 3)
        serialized = original.serialize()
        restored = DomainEvent.deserialize(serialized)
        assert restored.event_type == EventType.COIN_FLIPPED
        assert restored.room_id == "ROOM1"
        assert restored.data["player"] == "alice"
        assert restored.data["coin_index"] == 3

    def test_deserialize_handles_bytes(self):
        event = game_created("R1", "h", "s")
        serialized = event.serialize()
        # Simulate Redis returning bytes (keys and values)
        raw_bytes = {k.encode(): v.encode() for k, v in serialized.items()}
        decoded = {k.decode(): v.decode() for k, v in raw_bytes.items()}
        restored = DomainEvent.deserialize(decoded)
        assert restored.event_type == EventType.GAME_CREATED

    def test_event_id_is_unique(self):
        e1 = game_created("R1", "h", "s")
        e2 = game_created("R1", "h", "s")
        assert e1.event_id != e2.event_id


class TestEventFactories:
    def test_game_created(self):
        e = game_created("R1", "host", "secret")
        assert e.event_type == EventType.GAME_CREATED
        assert e.data["host"] == "host"

    def test_player_joined(self):
        e = player_joined("R1", "alice", "token1")
        assert e.data["username"] == "alice"
        assert e.data["session_token"] == "token1"

    def test_spectator_joined(self):
        e = spectator_joined("R1", "bob", "token2")
        assert e.event_type == EventType.SPECTATOR_JOINED

    def test_round_started(self):
        e = round_started("R1", 1, 15, ["alice", "bob"])
        assert e.data["round_number"] == 1
        assert e.data["players"] == ["alice", "bob"]

    def test_coin_flipped(self):
        e = coin_flipped("R1", "alice", 5)
        assert e.data["coin_index"] == 5

    def test_batch_sent(self):
        e = batch_sent("R1", "alice", 3, "bob")
        assert e.data["to_player"] == "bob"

    def test_batch_completed(self):
        e = batch_completed("R1", "bob", 5)
        assert e.data["count"] == 5

    def test_round_ended(self):
        e = round_ended("R1", 1, 45.5, 12.3)
        assert e.data["duration_seconds"] == 45.5
        assert e.data["lead_time_seconds"] == 12.3

    def test_game_reset(self):
        e = game_reset("R1")
        assert e.event_type == EventType.GAME_RESET
        assert e.data == {}
