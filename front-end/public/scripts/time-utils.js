// Time utilities for Penny Game - formatting and handling time data

export class TimeUtils {
    /**
     * Format time in seconds to MM:SS format
     * @param {number} seconds - Time in seconds
     * @returns {string} Formatted time string
     */
    static formatTime(seconds) {
        if (seconds === null || seconds === undefined || isNaN(seconds)) {
            return '--:--'
        }

        const totalSeconds = Math.floor(seconds)
        const minutes = Math.floor(totalSeconds / 60)
        const remainingSeconds = totalSeconds % 60

        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
    }

    /**
     * Format time with decimal precision (e.g., "1:23.45")
     * @param {number} seconds - Time in seconds
     * @param {number} precision - Decimal places (default: 2)
     * @returns {string} Formatted time string with decimals
     */
    static formatTimeWithDecimals(seconds, precision = 2) {
        if (seconds === null || seconds === undefined || isNaN(seconds)) {
            return '--:--.--'
        }

        const minutes = Math.floor(seconds / 60)
        const remainingSeconds = seconds % 60

        return `${minutes}:${remainingSeconds.toFixed(precision).padStart(precision + 3, '0')}`
    }

    /**
     * Format duration in a human-readable way
     * @param {number} seconds - Duration in seconds
     * @returns {string} Human-readable duration
     */
    static formatDuration(seconds) {
        if (seconds === null || seconds === undefined || isNaN(seconds)) {
            return 'N/A'
        }

        if (seconds < 60) {
            return `${Math.round(seconds)}s`
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60)
            const remainingSeconds = Math.round(seconds % 60)
            return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`
        } else {
            const hours = Math.floor(seconds / 3600)
            const minutes = Math.floor((seconds % 3600) / 60)
            return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
        }
    }

    /**
     * Parse ISO date string and return time difference from now
     * @param {string} isoString - ISO date string
     * @returns {number} Seconds elapsed since the date
     */
    static getElapsedSeconds(isoString) {
        if (!isoString) return 0

        try {
            const date = new Date(isoString)
            const now = new Date()
            return (now - date) / 1000
        } catch (error) {
            console.error('Error parsing date:', error)
            return 0
        }
    }

    /**
     * Format a player timer object for display
     * @param {Object} timer - Player timer object
     * @returns {Object} Formatted timer info
     */
    static formatPlayerTimer(timer) {
        if (!timer) {
            return {
                time: '--:--',
                status: 'waiting',
                statusText: 'En attente',
            }
        }

        // Timer hasn't started
        if (!timer.started_at) {
            return {
                time: '--:--',
                status: 'waiting',
                statusText: 'En attente',
            }
        }

        // Timer has ended
        if (timer.ended_at && timer.duration_seconds !== null && timer.duration_seconds !== undefined) {
            return {
                time: TimeUtils.formatTime(timer.duration_seconds),
                status: 'completed',
                statusText: 'Terminé',
            }
        }

        // Timer is running - calculate elapsed time
        const elapsed = TimeUtils.getElapsedSeconds(timer.started_at)
        return {
            time: TimeUtils.formatTime(elapsed),
            status: 'running',
            statusText: 'En cours',
        }
    }

    /**
     * Create a real-time timer element that updates automatically
     * @param {Object} timer - Player timer object
     * @param {HTMLElement} element - DOM element to update
     * @returns {number} Interval ID for cleanup
     */
    static createRealTimeTimer(timer, element) {
        if (!timer || !element) return null

        const updateTimer = () => {
            const formattedTimer = TimeUtils.formatPlayerTimer(timer)

            // Update text content
            const timeElement = element.querySelector('.timer-time')
            const statusElement = element.querySelector('.timer-status')

            if (timeElement) timeElement.textContent = formattedTimer.time
            if (statusElement) statusElement.textContent = formattedTimer.statusText

            // Update CSS classes
            element.className = element.className.replace(/\b(waiting|running|completed)\b/g, '')
            element.classList.add(formattedTimer.status)
        }

        // Initial update
        updateTimer()

        // Only create interval for running timers
        if (timer.started_at && !timer.ended_at) {
            return setInterval(updateTimer, 1000) // Update every second
        }

        return null
    }

    /**
     * Convert seconds to milliseconds
     * @param {number} seconds
     * @returns {number} Milliseconds
     */
    static secondsToMs(seconds) {
        return seconds * 1000
    }

    /**
     * Convert milliseconds to seconds
     * @param {number} milliseconds
     * @returns {number} Seconds
     */
    static msToSeconds(milliseconds) {
        return milliseconds / 1000
    }

    /**
     * Get current timestamp in seconds
     * @returns {number} Current timestamp in seconds
     */
    static getCurrentTimestamp() {
        return Date.now() / 1000
    }

    /**
     * Calculate efficiency (coins per minute)
     * @param {number} totalCoins - Total coins processed
     * @param {number} durationSeconds - Duration in seconds
     * @returns {number} Coins per minute
     */
    static calculateEfficiency(totalCoins, durationSeconds) {
        if (!durationSeconds || durationSeconds === 0) return 0
        return Math.round((totalCoins / durationSeconds) * 60 * 100) / 100 // Round to 2 decimal places
    }

    /**
     * Format efficiency for display
     * @param {number} totalCoins - Total coins processed
     * @param {number} durationSeconds - Duration in seconds
     * @returns {string} Formatted efficiency string
     */
    static formatEfficiency(totalCoins, durationSeconds) {
        const efficiency = TimeUtils.calculateEfficiency(totalCoins, durationSeconds)
        return efficiency > 0 ? `${efficiency} pièces/min` : '--'
    }

    /**
     * Compare two times and return the difference
     * @param {string} startTime - ISO start time
     * @param {string} endTime - ISO end time
     * @returns {number} Difference in seconds
     */
    static getTimeDifference(startTime, endTime) {
        if (!startTime || !endTime) return 0

        try {
            const start = new Date(startTime)
            const end = new Date(endTime)
            return (end - start) / 1000
        } catch (error) {
            console.error('Error calculating time difference:', error)
            return 0
        }
    }
}
