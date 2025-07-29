# Centralized module for game data validation

from typing import Optional, Tuple

from .constants import MAX_PLAYERS
from .models import GameState, PennyGame


class GameValidator:
    """Utility class for validating game states and actions"""

    @staticmethod
    def validate_active_game(game: PennyGame, player: str) -> Tuple[bool, Optional[str]]:
        """
        Validates that a game is active and a player can participate

        Args:
            game: Game instance
            player: Player name

        Returns:
            Tuple (is_valid, error_message)
        """
        if game.state != GameState.ACTIVE:
            return False, "Game is not active"

        if not game.players:
            return False, "No players in game"

        if player not in game.players:
            return False, "Player not in game"

        return True, None

    @staticmethod
    def validate_host_action(game: PennyGame, host_secret: str) -> Tuple[bool, Optional[str]]:
        """
        Validates that a host action is authorized

        Args:
            game: Game instance
            host_secret: Provided host secret

        Returns:
            Tuple (is_valid, error_message)
        """
        if not host_secret or host_secret != game.host_secret:
            return False, "Invalid host secret"

        return True, None

    @staticmethod
    def validate_game_exists(game: Optional[PennyGame]) -> Tuple[bool, Optional[str]]:
        """
        Validates that a game exists

        Args:
            game: Game instance or None

        Returns:
            Tuple (is_valid, error_message)
        """
        if not game:
            return False, "Game not found"

        return True, None

    @staticmethod
    def validate_player_count_for_start(game: PennyGame) -> Tuple[bool, Optional[str]]:
        """
        Validates that there are enough players to start

        Args:
            game: Game instance

        Returns:
            Tuple (is_valid, error_message)
        """
        if len(game.players) < 2:
            return False, "Need at least 2 players to start the game"

        return True, None

    @staticmethod
    def validate_game_not_started(game: PennyGame) -> Tuple[bool, Optional[str]]:
        """
        Validates that a game has not started yet

        Args:
            game: Game instance

        Returns:
            Tuple (is_valid, error_message)
        """
        if game.started_at is not None:
            return False, "Game already started"

        return True, None

    @staticmethod
    def validate_username_available(game: PennyGame, username: str) -> Tuple[bool, Optional[str]]:
        """
        Validates that a username is available

        Args:
            game: Game instance
            username: Username to check

        Returns:
            Tuple (is_valid, error_message)
        """
        if username == game.host or username in game.players or username in game.spectators:
            return False, "Username already taken"

        return True, None

    @staticmethod
    def validate_player_limit(game: PennyGame) -> Tuple[bool, Optional[str]]:
        """
        Validates that the player limit is not reached

        Args:
            game: Game instance

        Returns:
            Tuple (is_valid, error_message)
        """
        if len(game.players) >= MAX_PLAYERS:
            return False, "Player limit reached"

        return True, None

    @staticmethod
    def validate_batch_size(batch_size: int) -> Tuple[bool, Optional[str]]:
        """
        Validates a batch size

        Args:
            batch_size: Batch size to validate

        Returns:
            Tuple (is_valid, error_message)
        """
        valid_batch_sizes = [1, 4, 12]
        if batch_size not in valid_batch_sizes:
            return False, f"Invalid batch size. Must be one of: {valid_batch_sizes}"

        return True, None

    @staticmethod
    def validate_lobby_state(game: PennyGame) -> Tuple[bool, Optional[str]]:
        """
        Validates that a game is in lobby state

        Args:
            game: Game instance

        Returns:
            Tuple (is_valid, error_message)
        """
        if game.state != GameState.LOBBY:
            return False, "Can only change settings in lobby"

        return True, None

    @staticmethod
    def validate_player_not_host(player: str, game: PennyGame) -> Tuple[bool, Optional[str]]:
        """
        Validates that a player is not the host

        Args:
            player: Player name
            game: Game instance

        Returns:
            Tuple (is_valid, error_message)
        """
        if player == game.host:
            return False, "Host does not play"

        return True, None

    @staticmethod
    def validate_role_change(game: PennyGame, username: str, new_role: str) -> Tuple[bool, Optional[str]]:
        """
        Validates a role change

        Args:
            game: Game instance
            username: Username
            new_role: New role ("player" or "spectator")

        Returns:
            Tuple (is_valid, error_message)
        """
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
        """
        Validates a batch send request

        Args:
            game: Game instance
            player: Player name

        Returns:
            Tuple (is_valid, error_message)
        """
        # Basic checks
        is_valid, error = GameValidator.validate_active_game(game, player)
        if not is_valid:
            return False, error

        is_valid, error = GameValidator.validate_player_not_host(player, game)
        if not is_valid:
            return False, error

        return True, None

    @staticmethod
    def validate_flip_request(game: PennyGame, player: str) -> Tuple[bool, Optional[str]]:
        """
        Validates a coin flip request

        Args:
            game: Game instance
            player: Player name

        Returns:
            Tuple (is_valid, error_message)
        """
        # Uses the same validation as for batch send
        return GameValidator.validate_send_batch_request(game, player)

    @staticmethod
    def validate_multiple(validations: list) -> Tuple[bool, Optional[str]]:
        """
        Runs multiple validations and returns the first failure

        Args:
            validations: List of tuples (is_valid, error_message)

        Returns:
            Tuple (is_valid, error_message)
        """
        for is_valid, error in validations:
            if not is_valid:
                return False, error

        return True, None
