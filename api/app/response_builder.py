# Centralized module for building standardized API responses

from typing import Any, Dict, Optional

from .models import PennyGame


class GameResponseBuilder:
    """Utility class for building standardized API responses"""

    @staticmethod
    def build_game_state_response(game: PennyGame, include_secret: bool = False) -> Dict[str, Any]:
        """
        Builds a standardized response for the game state

        Args:
            game: Game instance
            include_secret: If True, includes the host's secret in the response

        Returns:
            Dict containing the standardized game state
        """
        from .game_logic import get_tails_count, get_total_completed_coins

        response = {
            "success": True,
            "players": game.players,
            "spectators": game.spectators,
            "host": game.host,
            "batch_size": game.batch_size,
            "state": game.state.value,
            "player_coins": game.player_coins,
            "total_completed": get_total_completed_coins(game),
            "tails_remaining": get_tails_count(game),
            "player_timers": GameResponseBuilder._format_player_timers(game),
            "game_duration_seconds": game.game_duration_seconds,
        }

        if include_secret and game.host_secret:
            response["host_secret"] = game.host_secret

        return response

    @staticmethod
    def build_action_response(result: Dict[str, Any]) -> Dict[str, Any]:
        """
        Builds a standardized response for game actions

        Args:
            result: Result of the game action

        Returns:
            Dict containing the standardized response
        """
        return {
            "success": result.get("success", False),
            "game_over": result.get("game_over", False),
            "player_coins": result.get("player_coins", {}),
            "sent_coins": result.get("sent_coins", {}),
            "total_completed": result.get("total_completed", 0),
            "state": result.get("state", "lobby"),
            "player_timers": result.get("player_timers", {}),
            "game_duration_seconds": result.get("game_duration_seconds"),
        }

    @staticmethod
    def build_join_response(game: PennyGame, note: Optional[str] = None) -> Dict[str, Any]:
        """
        Builds a response for joining a game

        Args:
            game: Game instance
            note: Optional note to include in the response

        Returns:
            Dict containing the join response
        """
        response = GameResponseBuilder.build_game_state_response(game)

        if note:
            response["note"] = note

        return response

    @staticmethod
    def build_error_response(error_message: str, status_code: int = 400) -> Dict[str, Any]:
        """
        Builds a standardized error response

        Args:
            error_message: Error message
            status_code: HTTP status code

        Returns:
            Dict containing the error response
        """
        return {"success": False, "error": error_message, "status_code": status_code}

    @staticmethod
    def build_websocket_action_data(
        player: str, action: str, result: Dict[str, Any], extra_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Builds data for WebSocket action messages

        Args:
            player: Player name
            action: Type of action ("flip" or "send")
            result: Result of the action
            extra_data: Additional data (coin_index, batch_count, etc.)

        Returns:
            Dict containing the WebSocket action data
        """
        action_data = {
            "type": "action_made",
            "player": player,
            "action": action,
            "player_coins": result.get("player_coins", {}),
            "sent_coins": result.get("sent_coins", {}),
            "total_completed": result.get("total_completed", 0),
            "game_over": result.get("game_over", False),
            "state": result.get("state", "active"),
            "player_timers": result.get("player_timers", {}),
            "game_duration_seconds": result.get("game_duration_seconds"),
        }

        # Add extra data specific to the action
        if extra_data:
            action_data.update(extra_data)

        return action_data

    @staticmethod
    def _format_player_timers(game: PennyGame) -> Dict[str, Any]:
        """
        Formats player timers for the response

        Args:
            game: Game instance

        Returns:
            Dict containing the formatted timers
        """
        if not hasattr(game, "player_timers") or not game.player_timers:
            return {}

        return {k: v.to_dict() for k, v in game.player_timers.items()}

    @staticmethod
    def build_batch_size_response(game: PennyGame) -> Dict[str, Any]:
        """
        Builds a response for batch size change

        Args:
            game: Game instance

        Returns:
            Dict containing the batch size change response
        """
        return {
            "success": True,
            "batch_size": game.batch_size,
        }

    @staticmethod
    def build_start_game_response(game: PennyGame) -> Dict[str, Any]:
        """
        Builds a response for starting the game

        Args:
            game: Game instance

        Returns:
            Dict containing the start response
        """
        from .game_logic import get_tails_count, get_total_completed_coins

        return {
            "success": True,
            "state": game.state.value,
            "batch_size": game.batch_size,
            "player_coins": game.player_coins,
            "total_completed": get_total_completed_coins(game),
            "tails_remaining": get_tails_count(game),
            "player_timers": GameResponseBuilder._format_player_timers(game),
            "game_duration_seconds": game.game_duration_seconds,
        }

    @staticmethod
    def build_reset_response(game: PennyGame) -> Dict[str, Any]:
        """
        Builds a response for resetting the game

        Args:
            game: Game instance

        Returns:
            Dict containing the reset response
        """
        from .game_logic import get_tails_count, get_total_completed_coins

        return {
            "success": True,
            "state": game.state.value,
            "batch_size": game.batch_size,
            "player_coins": game.player_coins,
            "total_completed": get_total_completed_coins(game),
            "tails_remaining": get_tails_count(game),
            "player_timers": GameResponseBuilder._format_player_timers(game),
            "game_duration_seconds": game.game_duration_seconds,
        }
