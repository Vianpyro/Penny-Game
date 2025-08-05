# Shared constants for Penny Game
"""
Constants used throughout the Penny Game application.
All game configuration values are centralized here for easy maintenance.
"""

from datetime import timedelta

# Game limits
MAX_PLAYERS = 5
MAX_CONNECTIONS = 50

# Coin configuration
DEFAULT_BATCH_SIZES = [15, 5, 1]
TOTAL_COINS = DEFAULT_BATCH_SIZES[0]

# Inactivity thresholds (in minutes)
ROOM_INACTIVITY_THRESHOLD = timedelta(minutes=60)
PLAYER_INACTIVITY_THRESHOLD = timedelta(minutes=5)


# Valid batch sizes for the game - must be divisors of TOTAL_COINS
def get_valid_batch_sizes():
    """Calculate valid batch sizes based on total coins"""
    valid_sizes = []
    for i in range(1, TOTAL_COINS + 1):
        if TOTAL_COINS % i == 0:
            valid_sizes.append(i)
    return valid_sizes


VALID_BATCH_SIZES = get_valid_batch_sizes()

# Default values
DEFAULT_BATCH_SIZE = TOTAL_COINS
DEFAULT_REQUIRED_PLAYERS = MAX_PLAYERS

# Batch size configurations for different round types
ROUND_TYPE_BATCH_SIZES = {
    "three_rounds": DEFAULT_BATCH_SIZES,
    "two_rounds": [TOTAL_COINS, 1],
    "single": None,  # User selects
}
