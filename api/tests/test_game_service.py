"""
Tests for GameService — integration tests with in-memory fakes.

Uses a fake EventStore and Broadcaster to test the service layer
without Redis, while still testing the full command flow.
"""

import pytest

from app.application.game_service import GameError, GameService
from app.domain.constants import TOTAL_COINS
from app.domain.events import DomainEvent


class FakeEventStore:
    """In-memory event store for testing."""

    def __init__(self):
        self.streams: dict[str, list[DomainEvent]] = {}

    async def append(self, event: DomainEvent) -> str:
        self.streams.setdefault(event.room_id, []).append(event)
        return f"{len(self.streams[event.room_id])}-0"

    async def append_many(self, events: list[DomainEvent]) -> list[str]:
        ids = []
        for event in events:
            ids.append(await self.append(event))
        return ids

    async def load(self, room_id: str) -> list[DomainEvent]:
        return self.streams.get(room_id, [])

    async def exists(self, room_id: str) -> bool:
        return room_id in self.streams

    async def delete(self, room_id: str) -> None:
        self.streams.pop(room_id, None)


class FakeBroadcaster:
    """In-memory broadcaster for testing."""

    def __init__(self):
        self.messages: list[tuple[str, dict]] = []

    async def publish(self, room_id: str, message: dict) -> None:
        self.messages.append((room_id, message))

    def last_message(self) -> dict | None:
        return self.messages[-1][1] if self.messages else None


def _make_service() -> tuple[GameService, FakeEventStore, FakeBroadcaster]:
    store = FakeEventStore()
    broadcaster = FakeBroadcaster()
    return GameService(store, broadcaster), store, broadcaster


# --- Tests ---


class TestCreateGame:
    @pytest.mark.asyncio
    async def test_returns_room_id_and_secrets(self):
        svc, _, _ = _make_service()
        result = await svc.create_game("host_user")
        assert "room_id" in result
        assert "host_secret" in result
        assert len(result["room_id"]) == 4


class TestJoinGame:
    @pytest.mark.asyncio
    async def test_join_as_player(self):
        svc, store, _ = _make_service()
        created = await svc.create_game("host")
        room = created["room_id"]

        result = await svc.join_game(room, "alice")
        assert "alice" in result["players"]
        assert "session_token" in result

    @pytest.mark.asyncio
    async def test_join_as_spectator(self):
        svc, _, _ = _make_service()
        created = await svc.create_game("host")
        room = created["room_id"]

        result = await svc.join_game(room, "bob", as_spectator=True)
        assert "bob" in result["spectators"]

    @pytest.mark.asyncio
    async def test_duplicate_username_rejected(self):
        svc, _, _ = _make_service()
        created = await svc.create_game("host")
        room = created["room_id"]
        await svc.join_game(room, "alice")

        with pytest.raises(GameError):
            await svc.join_game(room, "alice")

    @pytest.mark.asyncio
    async def test_full_game_falls_back_to_spectator(self):
        svc, _, _ = _make_service()
        created = await svc.create_game("host")
        room = created["room_id"]

        for i in range(5):
            await svc.join_game(room, f"p{i}")

        result = await svc.join_game(room, "extra")
        assert "extra" in result["spectators"]


class TestRoundConfig:
    @pytest.mark.asyncio
    async def test_set_config(self):
        svc, _, _ = _make_service()
        created = await svc.create_game("host")
        room = created["room_id"]

        result = await svc.set_round_config(room, "two_rounds", 3, None)
        assert result["round_type"] == "two_rounds"
        assert result["required_players"] == 3

    @pytest.mark.asyncio
    async def test_invalid_round_type(self):
        svc, _, _ = _make_service()
        created = await svc.create_game("host")
        room = created["room_id"]

        with pytest.raises(GameError, match="Invalid round type"):
            await svc.set_round_config(room, "invalid", 3, None)


class TestStartGame:
    @pytest.mark.asyncio
    async def test_start_with_correct_players(self):
        svc, _, broadcaster = _make_service()
        created = await svc.create_game("host")
        room = created["room_id"]
        await svc.set_round_config(room, "single", 2, TOTAL_COINS)
        await svc.join_game(room, "alice")
        await svc.join_game(room, "bob")

        result = await svc.start_game(room)
        assert result["phase"] == "active"
        assert result["current_round"] == 1

    @pytest.mark.asyncio
    async def test_start_not_enough_players(self):
        svc, _, _ = _make_service()
        created = await svc.create_game("host")
        room = created["room_id"]
        await svc.set_round_config(room, "single", 3, TOTAL_COINS)
        await svc.join_game(room, "alice")
        await svc.join_game(room, "bob")

        with pytest.raises(GameError, match="exactly 3"):
            await svc.start_game(room)


class TestFlipCoin:
    @pytest.mark.asyncio
    async def test_flip_succeeds(self):
        svc, _, _ = _make_service()
        created = await svc.create_game("host")
        room = created["room_id"]
        await svc.set_round_config(room, "single", 2, TOTAL_COINS)
        await svc.join_game(room, "alice")
        result_join = await svc.join_game(room, "bob")
        await svc.start_game(room)

        result = await svc.flip_coin(room, "alice", 0)
        assert result["player_coins"]["alice"][0] is True

    @pytest.mark.asyncio
    async def test_flip_invalid_player(self):
        svc, _, _ = _make_service()
        created = await svc.create_game("host")
        room = created["room_id"]
        await svc.set_round_config(room, "single", 2, TOTAL_COINS)
        await svc.join_game(room, "alice")
        await svc.join_game(room, "bob")
        await svc.start_game(room)

        with pytest.raises(GameError):
            await svc.flip_coin(room, "unknown", 0)


class TestSendBatch:
    @pytest.mark.asyncio
    async def test_send_batch_size_1(self):
        svc, _, _ = _make_service()
        created = await svc.create_game("host")
        room = created["room_id"]
        await svc.set_round_config(room, "single", 2, 1)
        await svc.join_game(room, "alice")
        await svc.join_game(room, "bob")
        await svc.start_game(room)

        await svc.flip_coin(room, "alice", 0)
        result = await svc.send_batch(room, "alice")
        # Alice should have one less coin, bob should have one more
        assert len(result["player_coins"]["alice"]) == TOTAL_COINS - 1
        assert len(result["player_coins"]["bob"]) == 1

    @pytest.mark.asyncio
    async def test_cannot_send_without_flipping(self):
        svc, _, _ = _make_service()
        created = await svc.create_game("host")
        room = created["room_id"]
        await svc.set_round_config(room, "single", 2, 1)
        await svc.join_game(room, "alice")
        await svc.join_game(room, "bob")
        await svc.start_game(room)

        with pytest.raises(GameError):
            await svc.send_batch(room, "alice")


class TestFullRound:
    @pytest.mark.asyncio
    async def test_complete_single_coin_round(self):
        """Play a complete round with batch_size=1, 2 players, simulating one coin through."""
        svc, _, broadcaster = _make_service()
        created = await svc.create_game("host")
        room = created["room_id"]
        await svc.set_round_config(room, "single", 2, 1)
        await svc.join_game(room, "alice")
        await svc.join_game(room, "bob")
        await svc.start_game(room)

        # Process all coins one by one
        for i in range(TOTAL_COINS):
            await svc.flip_coin(room, "alice", 0)  # Always index 0 (first unflipped)
            await svc.send_batch(room, "alice")
            await svc.flip_coin(room, "bob", 0)
            result = await svc.send_batch(room, "bob")

        # Game should be in results (single round mode)
        assert result["phase"] == "results"
        assert result["total_completed"] == TOTAL_COINS


class TestChangeRole:
    @pytest.mark.asyncio
    async def test_player_to_spectator(self):
        svc, _, _ = _make_service()
        created = await svc.create_game("host")
        room = created["room_id"]
        await svc.join_game(room, "alice")

        result = await svc.change_role(room, "alice", "spectator")
        assert "alice" in result["spectators"]
        assert "alice" not in result["players"]


class TestResetGame:
    @pytest.mark.asyncio
    async def test_reset_returns_to_lobby(self):
        svc, _, _ = _make_service()
        created = await svc.create_game("host")
        room = created["room_id"]
        await svc.set_round_config(room, "single", 2, TOTAL_COINS)
        await svc.join_game(room, "alice")
        await svc.join_game(room, "bob")
        await svc.start_game(room)

        result = await svc.reset_game(room)
        assert result["phase"] == "lobby"
        assert result["current_round"] == 0


class TestValidation:
    @pytest.mark.asyncio
    async def test_validate_session_correct(self):
        svc, _, _ = _make_service()
        created = await svc.create_game("host")
        room = created["room_id"]
        join_result = await svc.join_game(room, "alice")
        token = join_result["session_token"]

        assert await svc.validate_session(room, "alice", token) is True

    @pytest.mark.asyncio
    async def test_validate_session_wrong_token(self):
        svc, _, _ = _make_service()
        created = await svc.create_game("host")
        room = created["room_id"]
        await svc.join_game(room, "alice")

        assert await svc.validate_session(room, "alice", "wrong") is False

    @pytest.mark.asyncio
    async def test_validate_host(self):
        svc, _, _ = _make_service()
        created = await svc.create_game("host")
        room = created["room_id"]

        assert await svc.validate_host(room, created["host_secret"]) is True
        assert await svc.validate_host(room, "wrong") is False
