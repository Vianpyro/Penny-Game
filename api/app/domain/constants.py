"""
Game constants and configuration.

All magic numbers live here. Changing TOTAL_COINS automatically
recalculates valid batch sizes.
"""

TOTAL_COINS: int = 15
MAX_PLAYERS: int = 5
MIN_PLAYERS: int = 2

ROOM_TTL_SECONDS: int = 3600  # 1 hour
RATE_LIMIT_WINDOW: int = 60
RATE_LIMIT_MAX: int = 90

DEFAULT_BATCH_SIZES: list[int] = [TOTAL_COINS, 5, 1]

ROUND_TYPE_BATCH_SIZES: dict[str, list[int] | None] = {
    "three_rounds": DEFAULT_BATCH_SIZES,
    "two_rounds": [TOTAL_COINS, 1],
    "single": None,
}


def valid_batch_sizes() -> list[int]:
    """Return all divisors of TOTAL_COINS, sorted ascending."""
    return sorted(i for i in range(1, TOTAL_COINS + 1) if TOTAL_COINS % i == 0)


VALID_BATCH_SIZES: list[int] = valid_batch_sizes()
