"""
Centralized module for game data validation.
Contains all validation logic for game states, actions, and user permissions.
"""

from typing import Optional, Tuple

from .constants import MAX_PLAYERS, get_valid_batch_sizes
from .models import GameState, PennyGame


class GameValidator:
    """Utility class for validating game states and actions."""

    @staticmethod
    def validate_game_exists(game: Optional[PennyGame]) -> Tuple[bool, Optional[str]]:
        """Validate that a game exists."""
        if not game:
            return False, "Game not found"
        return True, None

    @staticmethod
    def validate_active_game(game: PennyGame, player: str) -> Tuple[bool, Optional[str]]:
        """Validate that a game is active and a player can participate."""
        if game.state != GameState.ACTIVE:
            return False, "Game is not active"

        if not game.players:
            return False, "No players in game"

        if player not in game.players:
            return False, "Player not in game"

        return True, None

    @staticmethod
    def validate_host_action(game: PennyGame, host_secret: str) -> Tuple[bool, Optional[str]]:
        """Validate that a host action is authorized."""
        if not host_secret or host_secret != game.host_secret:
            return False, "Invalid host secret"
        return True, None

    @staticmethod
    def validate_player_count_for_start(game: PennyGame) -> Tuple[bool, Optional[str]]:
        """Validate that there are enough players to start."""
        if len(game.players) < 2:
            return False, "Need at least 2 players to start the game"
        return True, None

    @staticmethod
    def validate_required_player_count(game: PennyGame) -> Tuple[bool, Optional[str]]:
        """Validate that the required number of players is present."""
        current_count = len(game.players)
        required_count = game.required_players

        if current_count < required_count:
            return False, f"Need {required_count} players to start the game. Currently have {current_count}."

        return True, None

    @staticmethod
    def validate_game_not_started(game: PennyGame) -> Tuple[bool, Optional[str]]:
        """Validate that a game has not started yet."""
        if game.started_at is not None:
            return False, "Game already started"
        return True, None

    @staticmethod
    def validate_username_available(game: PennyGame, username: str) -> Tuple[bool, Optional[str]]:
        """Validate that a username is available."""
        if username == game.host or username in game.players or username in game.spectators:
            return False, "Username already taken"
        return True, None

    @staticmethod
    def validate_player_limit(game: PennyGame) -> Tuple[bool, Optional[str]]:
        """Validate that the player limit is not reached."""
        if len(game.players) >= MAX_PLAYERS:
            return False, "Player limit reached"
        return True, None

    @staticmethod
    def validate_batch_size(batch_size: int) -> Tuple[bool, Optional[str]]:
        """Validate a batch size."""
        valid_sizes = get_valid_batch_sizes()
        if batch_size not in valid_sizes:
            return False, f"Invalid batch size. Must be one of: {valid_sizes}"
        return True, None

    @staticmethod
    def validate_lobby_state(game: PennyGame) -> Tuple[bool, Optional[str]]:
        """Validate that a game is in lobby state."""
        if game.state != GameState.LOBBY:
            return False, "Can only change settings in lobby"
        return True, None

    @staticmethod
    def validate_player_not_host(player: str, game: PennyGame) -> Tuple[bool, Optional[str]]:
        """Validate that a player is not the host."""
        if player == game.host:
            return False, "Host does not play"
        return True, None

    @staticmethod
    def validate_role_change(game: PennyGame, username: str, new_role: str) -> Tuple[bool, Optional[str]]:
        """Validate a role change request."""
        if username == game.host:
            return False, "Host role cannot be changed"

        if new_role == "player":
            if username not in game.spectators:
                return False, "User is not a spectator"

            is_valid, error = GameValidator.validate_player_limit(game)
            if not is_valid:
                return False, error

        elif new_role == "spectator":
            if username not in game.players:
                return False, "User is not a player"
        else:
            return False, "Invalid role"

        return True, None

    @staticmethod
    def validate_send_batch_request(game: PennyGame, player: str) -> Tuple[bool, Optional[str]]:
        """Validate a batch send request."""
        # Basic game and player validation
        is_valid, error = GameValidator.validate_active_game(game, player)
        if not is_valid:
            return False, error

        is_valid, error = GameValidator.validate_player_not_host(player, game)
        if not is_valid:
            return False, error

        return True, None

    @staticmethod
    def validate_flip_request(game: PennyGame, player: str) -> Tuple[bool, Optional[str]]:
        """Validate a coin flip request."""
        # Uses the same validation as batch send
        return GameValidator.validate_send_batch_request(game, player)

    @staticmethod
    def validate_round_config(
        round_type: str, selected_batch_size: Optional[int], required_players: int
    ) -> Tuple[bool, Optional[str]]:
        """Validate round configuration parameters."""
        # Validate round type
        valid_round_types = ["single", "two_rounds", "three_rounds"]
        if round_type not in valid_round_types:
            return False, f"Invalid round type. Must be one of: {valid_round_types}"

        # Validate single round has batch size
        if round_type == "single" and not selected_batch_size:
            return False, "Selected batch size required for single round"

        # Validate batch size if provided
        if selected_batch_size is not None:
            is_valid, error = GameValidator.validate_batch_size(selected_batch_size)
            if not is_valid:
                return False, error

        # Validate required players count
        if required_players < 2 or required_players > MAX_PLAYERS:
            return False, f"Required players must be between 2 and {MAX_PLAYERS}"

        return True, None

    @staticmethod
    def validate_multiple(validations: list) -> Tuple[bool, Optional[str]]:
        """
        Run multiple validations and return the first failure.

        Args:
            validations: List of tuples (is_valid, error_message)

        Returns:
            Tuple (is_valid, error_message)
        """
        for is_valid, error in validations:
            if not is_valid:
                return False, error
        return True, None
