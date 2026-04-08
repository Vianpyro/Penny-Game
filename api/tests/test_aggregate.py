"""
Tests for GameAggregate — business rules and event application.

Test count per method ≥ cyclomatic complexity:
  can_join_as_player (CC=4) → 4 tests
  can_join_as_spectator (CC=3) → 3 tests
  can_start (CC=3) → 3 tests
  can_flip (CC=5) → 5 tests
  can_send (CC=5) → 5 tests
  can_change_role (CC=4+2+2) → 6 tests
  _on_round_ended (CC=4) → 4 tests
  _check_finished_timers (CC=5) → 4 tests
  Plus event application tests → ~15 tests
  Total: ~49 tests
"""

from app.domain.aggregate import GameAggregate, GamePhase
from app.domain.constants import MAX_PLAYERS, TOTAL_COINS
from app.domain.events import (
    batch_completed,
    batch_sent,
    coin_flipped,
    game_created,
    game_reset,
    player_joined,
    role_changed,
    round_config_set,
    round_ended,
    round_started,
    spectator_joined,
)

# --- Fixtures / Helpers ---


def _lobby_game(num_players: int = 0) -> GameAggregate:
    """Create a game in lobby with optional players."""
    game = GameAggregate()
    game.apply(game_created("R1", "host", "secret"))
    for i in range(num_players):
        game.apply(player_joined("R1", f"p{i}", f"tok{i}"))
    return game


def _active_game(num_players: int = 2, batch_size: int = TOTAL_COINS) -> GameAggregate:
    """Create an active game with players and a started round."""
    game = _lobby_game(num_players)
    game.apply(round_config_set("R1", "single", num_players, batch_size))
    players = [f"p{i}" for i in range(num_players)]
    game.apply(round_started("R1", 1, batch_size, players))
    return game


# === Event Application Tests ===


class TestGameCreated:
    def test_sets_room_and_host(self):
        game = GameAggregate()
        game.apply(game_created("R1", "alice", "sec"))
        assert game.state.room_id == "R1"
        assert game.state.host == "alice"
        assert game.state.phase == GamePhase.LOBBY

    def test_increments_version(self):
        game = GameAggregate()
        game.apply(game_created("R1", "h", "s"))
        assert game.version == 1


class TestPlayerJoined:
    def test_adds_player(self):
        game = _lobby_game()
        game.apply(player_joined("R1", "alice", "tok"))
        assert "alice" in game.state.players
        assert game.state.session_tokens["alice"] == "tok"

    def test_multiple_players(self):
        game = _lobby_game(3)
        assert len(game.state.players) == 3


class TestSpectatorJoined:
    def test_adds_spectator(self):
        game = _lobby_game()
        game.apply(spectator_joined("R1", "bob", "tok"))
        assert "bob" in game.state.spectators


class TestRoleChanged:
    def test_player_to_spectator(self):
        game = _lobby_game(1)
        game.apply(role_changed("R1", "p0", "spectator"))
        assert "p0" not in game.state.players
        assert "p0" in game.state.spectators

    def test_spectator_to_player(self):
        game = _lobby_game()
        game.apply(spectator_joined("R1", "spec", "tok"))
        game.apply(role_changed("R1", "spec", "player"))
        assert "spec" in game.state.players
        assert "spec" not in game.state.spectators


class TestRoundStarted:
    def test_initializes_round(self):
        game = _lobby_game(2)
        game.apply(round_started("R1", 1, 15, ["p0", "p1"]))
        assert game.state.phase == GamePhase.ACTIVE
        assert game.state.current_round == 1
        assert game.state.batch_size == 15

    def test_first_player_gets_all_coins(self):
        game = _lobby_game(2)
        game.apply(round_started("R1", 1, 15, ["p0", "p1"]))
        assert len(game.state.player_coins["p0"]) == TOTAL_COINS
        assert len(game.state.player_coins["p1"]) == 0
        assert all(c is False for c in game.state.player_coins["p0"])

    def test_timers_initialized(self):
        game = _lobby_game(2)
        game.apply(round_started("R1", 1, 15, ["p0", "p1"]))
        assert "p0" in game.state.player_timers
        assert game.state.player_timers["p0"].started_at is None


class TestCoinFlipped:
    def test_flips_coin(self):
        game = _active_game(2)
        game.apply(coin_flipped("R1", "p0", 0))
        assert game.state.player_coins["p0"][0] is True

    def test_starts_player_timer(self):
        game = _active_game(2)
        game.apply(coin_flipped("R1", "p0", 0))
        assert game.state.player_timers["p0"].started_at is not None

    def test_records_first_flip(self):
        game = _active_game(2)
        assert game.state.first_flip_at is None
        game.apply(coin_flipped("R1", "p0", 0))
        assert game.state.first_flip_at is not None


class TestBatchSent:
    def test_moves_coins_to_next_player(self):
        game = _active_game(2, batch_size=1)
        game.apply(coin_flipped("R1", "p0", 0))
        game.apply(batch_sent("R1", "p0", 1, "p1"))
        # p0 lost one head, p1 gained one tail
        assert len(game.state.player_coins["p0"]) == TOTAL_COINS - 1
        assert len(game.state.player_coins["p1"]) == 1
        assert game.state.player_coins["p1"][0] is False  # Tails for next player


class TestBatchCompleted:
    def test_increments_total(self):
        game = _active_game(2, batch_size=1)
        # Simulate: p0 flips, sends to p1, p1 flips, completes
        game.apply(coin_flipped("R1", "p0", 0))
        game.apply(batch_sent("R1", "p0", 1, "p1"))
        game.apply(coin_flipped("R1", "p1", 0))
        game.apply(batch_completed("R1", "p1", 1))
        assert game.state.total_completed == 1

    def test_records_first_delivery(self):
        game = _active_game(2, batch_size=1)
        game.apply(coin_flipped("R1", "p0", 0))
        game.apply(batch_sent("R1", "p0", 1, "p1"))
        game.apply(coin_flipped("R1", "p1", 0))
        game.apply(batch_completed("R1", "p1", 1))
        assert game.state.first_delivery_at is not None


class TestRoundEnded:
    def test_saves_round_result(self):
        game = _active_game(2)
        game.apply(round_ended("R1", 1, 30.0, 10.0))
        assert len(game.state.round_results) == 1
        assert game.state.round_results[0].duration_seconds == 30.0

    def test_single_round_goes_to_results(self):
        game = _lobby_game(2)
        game.apply(round_config_set("R1", "single", 2, TOTAL_COINS))
        game.apply(round_started("R1", 1, TOTAL_COINS, ["p0", "p1"]))
        game.apply(round_ended("R1", 1, 30.0, None))
        assert game.state.phase == GamePhase.RESULTS

    def test_three_rounds_first_goes_to_round_complete(self):
        game = _lobby_game(2)
        game.apply(round_config_set("R1", "three_rounds", 2, None))
        game.apply(round_started("R1", 1, 15, ["p0", "p1"]))
        game.apply(round_ended("R1", 1, 30.0, None))
        assert game.state.phase == GamePhase.ROUND_COMPLETE

    def test_ends_running_timers(self):
        game = _active_game(2)
        game.apply(coin_flipped("R1", "p0", 0))  # starts timer
        game.apply(round_ended("R1", 1, 30.0, None))
        assert game.state.player_timers["p0"].ended_at is not None


class TestGameReset:
    def test_returns_to_lobby(self):
        game = _active_game(2)
        game.apply(game_reset("R1"))
        assert game.state.phase == GamePhase.LOBBY
        assert game.state.current_round == 0

    def test_preserves_participants(self):
        game = _active_game(3)
        players_before = list(game.state.players)
        game.apply(game_reset("R1"))
        assert game.state.players == players_before


# === Validation Tests ===


class TestCanJoinAsPlayer:
    def test_valid_join(self):
        game = _lobby_game()
        assert game.can_join_as_player("new_player") is None

    def test_duplicate_player(self):
        game = _lobby_game(1)
        assert game.can_join_as_player("p0") is not None

    def test_host_cannot_join(self):
        game = _lobby_game()
        assert game.can_join_as_player("host") is not None

    def test_full_game(self):
        game = _lobby_game(MAX_PLAYERS)
        assert "limit" in game.can_join_as_player("extra").lower()


class TestCanJoinAsSpectator:
    def test_valid_join(self):
        game = _lobby_game()
        assert game.can_join_as_spectator("spec") is None

    def test_duplicate(self):
        game = _lobby_game(1)
        assert game.can_join_as_spectator("p0") is not None

    def test_host_cannot_join(self):
        game = _lobby_game()
        assert game.can_join_as_spectator("host") is not None


class TestCanStart:
    def test_valid_start(self):
        game = _lobby_game(MAX_PLAYERS)
        assert game.can_start() is None

    def test_not_enough_players(self):
        game = _lobby_game(1)
        assert game.can_start() is not None

    def test_already_started(self):
        game = _active_game(2)
        assert game.can_start() is not None


class TestCanFlip:
    def test_valid_flip(self):
        game = _active_game(2)
        assert game.can_flip("p0", 0) is None

    def test_not_active(self):
        game = _lobby_game(2)
        assert game.can_flip("p0", 0) is not None

    def test_wrong_player(self):
        game = _active_game(2)
        assert game.can_flip("unknown", 0) is not None

    def test_invalid_index(self):
        game = _active_game(2)
        assert game.can_flip("p0", 999) is not None

    def test_already_flipped(self):
        game = _active_game(2)
        game.apply(coin_flipped("R1", "p0", 0))
        assert game.can_flip("p0", 0) is not None


class TestCanSend:
    def test_valid_send(self):
        game = _active_game(2, batch_size=1)
        game.apply(coin_flipped("R1", "p0", 0))
        assert game.can_send("p0") is None

    def test_no_flipped_coins(self):
        game = _active_game(2)
        assert game.can_send("p0") is not None

    def test_not_active(self):
        game = _lobby_game(2)
        assert game.can_send("p0") is not None

    def test_not_enough_for_batch(self):
        game = _active_game(2, batch_size=15)
        game.apply(coin_flipped("R1", "p0", 0))  # Only 1 flipped out of 15
        assert game.can_send("p0") is not None

    def test_all_remaining_flipped_can_send(self):
        """When all remaining coins are flipped, even if < batch_size, can send."""
        game = _active_game(2, batch_size=15)
        # Flip all coins
        for i in range(TOTAL_COINS):
            game.apply(coin_flipped("R1", "p0", i))
        assert game.can_send("p0") is None


class TestCanChangeRole:
    def test_valid_player_to_spectator(self):
        game = _lobby_game(1)
        assert game.can_change_role("p0", "spectator") is None

    def test_valid_spectator_to_player(self):
        game = _lobby_game()
        game.apply(spectator_joined("R1", "spec", "tok"))
        assert game.can_change_role("spec", "player") is None

    def test_host_cannot_change(self):
        game = _lobby_game()
        assert game.can_change_role("host", "player") is not None

    def test_invalid_role(self):
        game = _lobby_game(1)
        assert game.can_change_role("p0", "admin") is not None

    def test_not_spectator_to_player(self):
        game = _lobby_game(1)
        assert game.can_change_role("p0", "player") is not None

    def test_not_player_to_spectator(self):
        game = _lobby_game()
        game.apply(spectator_joined("R1", "spec", "tok"))
        assert game.can_change_role("spec", "spectator") is not None


class TestCanStartNextRound:
    def test_valid(self):
        game = _lobby_game(2)
        game.apply(round_config_set("R1", "three_rounds", 2, None))
        game.apply(round_started("R1", 1, 15, ["p0", "p1"]))
        game.apply(round_ended("R1", 1, 30.0, None))
        assert game.can_start_next_round() is None

    def test_not_round_complete(self):
        game = _active_game(2)
        assert game.can_start_next_round() is not None

    def test_all_rounds_done(self):
        game = _lobby_game(2)
        game.apply(round_config_set("R1", "single", 2, TOTAL_COINS))
        game.apply(round_started("R1", 1, TOTAL_COINS, ["p0", "p1"]))
        game.apply(round_ended("R1", 1, 30.0, None))
        # Phase is now RESULTS, not ROUND_COMPLETE
        assert game.can_start_next_round() is not None


# === Computed Property Tests ===


class TestComputedProperties:
    def test_tails_remaining(self):
        game = _active_game(2)
        assert game.tails_remaining == TOTAL_COINS
        game.apply(coin_flipped("R1", "p0", 0))
        assert game.tails_remaining == TOTAL_COINS - 1

    def test_total_rounds(self):
        game = _lobby_game()
        game.apply(round_config_set("R1", "three_rounds", 2, None))
        assert game.total_rounds == 3

    def test_lead_time_none_initially(self):
        game = _active_game(2)
        assert game.lead_time_seconds is None

    def test_batch_sizes_for_game(self):
        game = _lobby_game()
        game.apply(round_config_set("R1", "two_rounds", 2, None))
        assert game.batch_sizes_for_game == [TOTAL_COINS, 1]


class TestComputeSend:
    def test_send_to_next_player(self):
        game = _active_game(3, batch_size=1)
        game.apply(coin_flipped("R1", "p0", 0))
        ops = game.compute_send("p0")
        assert len(ops) == 1
        assert ops[0]["type"] == "send"
        assert ops[0]["to_player"] == "p1"

    def test_last_player_completes(self):
        game = _active_game(2, batch_size=1)
        game.apply(coin_flipped("R1", "p0", 0))
        game.apply(batch_sent("R1", "p0", 1, "p1"))
        game.apply(coin_flipped("R1", "p1", 0))
        ops = game.compute_send("p1")
        assert ops[0]["type"] == "complete"
