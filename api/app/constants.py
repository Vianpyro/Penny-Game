# Shared constants for Penny Game
"""
Constants used throughout the Penny Game application.
All game configuration values are centralized here for easy maintenance.
"""

# Game limits
MAX_PLAYERS = 5
MAX_CONNECTIONS = 50
MAX_PENNIES = 12

# Inactivity thresholds (in minutes)
ROOM_INACTIVITY_THRESHOLD_MINUTES = 60
PLAYER_INACTIVITY_THRESHOLD_MINUTES = 5

# Valid batch sizes for the game
VALID_BATCH_SIZES = [1, 4, 12]

# Default values
DEFAULT_BATCH_SIZE = MAX_PENNIES
DEFAULT_REQUIRED_PLAYERS = MAX_PLAYERS
