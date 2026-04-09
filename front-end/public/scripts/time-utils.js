/**
 * Time formatting utilities for the Penny Game.
 */

export class TimeUtils {
    static formatTime(seconds) {
        if (!seconds && seconds !== 0) return '--:--'
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    static formatPlayerTimer(timer) {
        if (!timer || !timer.started_at) {
            return { status: 'waiting', time: '--:--', statusText: 'En attente' }
        }
        if (timer.ended_at && timer.duration_seconds != null) {
            return { status: 'completed', time: TimeUtils.formatTime(timer.duration_seconds), statusText: 'Terminé' }
        }
        if (timer.started_at && !timer.ended_at) {
            try {
                const elapsed = Math.max(0, (new Date() - new Date(timer.started_at)) / 1000)
                return { status: 'running', time: TimeUtils.formatTime(elapsed), statusText: 'En cours' }
            } catch (_) {
                return { status: 'waiting', time: '--:--', statusText: 'Erreur' }
            }
        }
        return { status: 'waiting', time: '--:--', statusText: 'En attente' }
    }

    static calculateEfficiency(completed, seconds) {
        if (!seconds || seconds <= 0) return '0.0'
        return (Math.round((completed / seconds) * 60 * 100) / 100).toFixed(1)
    }
}
