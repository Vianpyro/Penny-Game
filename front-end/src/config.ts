// Game configuration
export const MAX_PLAYERS = 5
export const DEFAULT_BATCH_SIZES = [15, 5, 1]
export const TOTAL_COINS = DEFAULT_BATCH_SIZES[0]

// Calculate valid batch sizes dynamically
export function getValidBatchSizes() {
    const validSizes = []
    for (let i = 1; i <= TOTAL_COINS; i++) {
        if (TOTAL_COINS % i === 0) {
            validSizes.push(i)
        }
    }
    return validSizes
}

export const VALID_BATCH_SIZES = getValidBatchSizes()

// Batch configurations for different round types
export const ROUND_TYPE_BATCH_SIZES = {
    three_rounds: DEFAULT_BATCH_SIZES,
    two_rounds: [TOTAL_COINS, 1],
    single: null  // User selects
}

// Export for backward compatibility
export const SITE_NAME = 'Penny Game'
