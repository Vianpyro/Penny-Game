/**
 * Game actions — user-initiated game controls.
 *
 * Adapted for v2 backend: no CSRF, host_secret header only.
 */

import { buildHostHeaders, buildSessionHeaders } from './api.js'

const DEBOUNCE_MS = 1000
const _inProgress = { nextRound: false, reset: false, playAgain: false }

export class GameActions {
    static initialize() {
        GameActions.setupStandardButtons()
    }

    static setupStandardButtons() {
        const bindings = [
            ['playAgainBtn', GameActions.handlePlayAgain],
            ['backToLobbyBtn', GameActions.handleBackToLobby],
            ['viewResultsBtn', GameActions.handleViewResults],
            ['nextRoundBtn', GameActions.handleNextRound],
            ['resetBtn', GameActions.handleReset],
        ]
        for (const [id, handler] of bindings) {
            const btn = document.getElementById(id)
            if (btn) btn.addEventListener('click', handler)
        }
    }

    static getGameCode() {
        return document.getElementById('game-code')?.textContent?.trim() || ''
    }

    static getApiUrl() {
        return document.getElementById('joinRoleModal')?.getAttribute('data-api-url') || ''
    }

    static async handlePlayAgain() {
        if (_inProgress.playAgain) return
        if (!window.isHost) return alert("Seul l'hôte peut redémarrer")

        const [apiUrl, code] = [GameActions.getApiUrl(), GameActions.getGameCode()]
        if (!apiUrl || !code) return

        _inProgress.playAgain = true
        try {
            await fetch(`${apiUrl}/game/reset/${code}`, { method: 'POST', headers: buildHostHeaders() })
            setTimeout(async () => {
                await fetch(`${apiUrl}/game/start/${code}`, { method: 'POST', headers: buildHostHeaders() })
            }, 500)
        } catch (e) {
            alert('Erreur lors du redémarrage')
        } finally {
            setTimeout(() => (_inProgress.playAgain = false), DEBOUNCE_MS)
        }
    }

    static async handleBackToLobby() {
        if (!window.isHost) return alert("Seul l'hôte peut retourner au lobby")
        const [apiUrl, code] = [GameActions.getApiUrl(), GameActions.getGameCode()]
        if (!apiUrl || !code) return
        try {
            await fetch(`${apiUrl}/game/reset/${code}`, { method: 'POST', headers: buildHostHeaders() })
        } catch (e) {
            alert('Erreur lors du retour au lobby')
        }
    }

    static handleViewResults() {
        import('./view-manager.js').then(({ ViewManager }) => ViewManager.switchToResultsView()).catch(() => {
            const results = document.getElementById('results')
            if (results) results.style.display = 'block'
        })
    }

    static async handleNextRound() {
        if (_inProgress.nextRound) return
        if (!window.isHost) return alert("Seul l'hôte peut démarrer la manche suivante")

        const [apiUrl, code] = [GameActions.getApiUrl(), GameActions.getGameCode()]
        if (!apiUrl || !code) return

        if (window.gameState?.phase !== 'round_complete') {
            return alert('État invalide pour démarrer la manche suivante')
        }

        _inProgress.nextRound = true
        const btn = document.getElementById('nextRoundBtn')
        if (btn) { btn.disabled = true; btn.textContent = 'Démarrage...' }

        try {
            const res = await fetch(`${apiUrl}/game/next_round/${code}`, {
                method: 'POST', headers: buildHostHeaders(),
            })
            if (!res.ok) console.warn((await res.json()).detail)
        } catch (e) {
            alert(e.message || 'Impossible de démarrer la manche suivante')
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Manche Suivante' }
            setTimeout(() => (_inProgress.nextRound = false), DEBOUNCE_MS)
        }
    }

    static async handleReset() {
        if (_inProgress.reset) return
        if (!window.isHost) return alert("Seul l'hôte peut réinitialiser")
        if (!confirm('Réinitialiser la partie ?')) return

        const [apiUrl, code] = [GameActions.getApiUrl(), GameActions.getGameCode()]
        if (!apiUrl || !code) return

        _inProgress.reset = true
        try {
            const res = await fetch(`${apiUrl}/game/reset/${code}`, { method: 'POST', headers: buildHostHeaders() })
            if (!res.ok) throw new Error((await res.json()).detail)
        } catch (e) {
            alert(e.message || 'Impossible de réinitialiser')
        } finally {
            setTimeout(() => (_inProgress.reset = false), DEBOUNCE_MS)
        }
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => GameActions.initialize())
}
