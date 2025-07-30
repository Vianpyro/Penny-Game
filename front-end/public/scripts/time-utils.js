// Centralized module for time management and formatting

export class TimeUtils {
    /**
     * Formats a duration in seconds to MM:SS format
     * @param {number} seconds - Duration in seconds
     * @returns {string} Formatted time (ex: "2:05" or "--:--")
     */
    static formatTime(seconds) {
        if (!seconds && seconds !== 0) return '--:--'
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    /**
     * Formats a player's timer information
     * @param {Object} timer - Player's timer object
     * @returns {Object} Formatted timer information
     */
    static formatPlayerTimer(timer) {
        if (!timer) {
            return { status: 'waiting', time: '--:--', statusText: 'En attente' }
        }

        if (!timer.started_at) {
            return { status: 'waiting', time: '--:--', statusText: 'En attente' }
        }

        if (timer.ended_at && timer.duration_seconds !== null && timer.duration_seconds !== undefined) {
            return {
                status: 'completed',
                time: this.formatTime(timer.duration_seconds),
                statusText: 'Terminé',
            }
        }

        // Timer running - calculate current duration
        try {
            const startTime = new Date(timer.started_at)
            const currentTime = new Date()

            // Check if the date is valid
            if (isNaN(startTime.getTime())) {
                console.warn('Invalid start time:', timer.started_at)
                return { status: 'waiting', time: '--:--', statusText: 'Erreur' }
            }

            const currentDuration = Math.max(0, (currentTime - startTime) / 1000)

            return {
                status: 'running',
                time: this.formatTime(currentDuration),
                statusText: 'En cours',
            }
        } catch (error) {
            console.error('Error calculating timer duration:', error)
            return { status: 'waiting', time: '--:--', statusText: 'Erreur' }
        }
    }

    /**
     * Starts a real-time timer for a DOM element
     * @param {string} elementId - ID of the element to update
     * @param {Date|string} startTime - Start time
     * @returns {number} Interval ID to be able to stop it
     */
    static startRealTimeTimer(elementId, startTime) {
        const element = document.getElementById(elementId)
        if (!element) return null

        const start = new Date(startTime)
        if (isNaN(start.getTime())) return null

        return setInterval(() => {
            const now = new Date()
            const duration = Math.max(0, (now - start) / 1000)
            element.textContent = this.formatTime(duration)
        }, 1000)
    }

    /**
     * Stops a real-time timer
     * @param {number} intervalId - Interval ID to stop
     */
    static stopRealTimeTimer(intervalId) {
        if (intervalId) {
            clearInterval(intervalId)
        }
    }

    /**
     * Updates all player timers with their current data
     * @param {Object} playerTimers - Object containing player timers
     */
    static updatePlayerTimers(playerTimers) {
        if (!playerTimers) return

        Object.values(playerTimers).forEach((timer) => {
            if (timer.started_at && !timer.ended_at) {
                try {
                    const startTime = new Date(timer.started_at)
                    if (!isNaN(startTime.getTime())) {
                        const now = new Date()
                        const currentDuration = Math.max(0, (now - startTime) / 1000)
                        const timerElements = document.querySelectorAll(`[data-player="${timer.player}"]`)
                        timerElements.forEach((element) => {
                            element.textContent = this.formatTime(currentDuration)
                        })
                    }
                } catch (error) {
                    console.error('Error updating player timer for', timer.player, error)
                }
            }
        })
    }

    /**
     * Calculates the elapsed duration since a timestamp
     * @param {Date|string} timestamp - Start timestamp
     * @returns {number} Duration in seconds
     */
    static getDurationSince(timestamp) {
        try {
            const start = new Date(timestamp)
            if (isNaN(start.getTime())) return 0

            const now = new Date()
            return Math.max(0, (now - start) / 1000)
        } catch (error) {
            console.error('Error calculating duration:', error)
            return 0
        }
    }
}
