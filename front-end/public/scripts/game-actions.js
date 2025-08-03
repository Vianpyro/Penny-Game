/**
 * Game actions for Penny Game - handling user interactions and game controls
 * Manages all user-initiated game actions like coin flipping, batch sending, and game management
 */

// Configuration constants
const GAME_CONFIG = {
    API_TIMEOUT: 5000,
    BUTTON_DISABLE_TIMEOUT: 500,
}

// Button state management
const ButtonStates = {
    NORMAL: 'normal',
    LOADING: 'loading',
    DISABLED: 'disabled',
}

/**
 * Main Game Actions class
 */
export class GameActions {
    /**
     * Initialize all game actions
     */
    static initialize() {
        console.log('🎯 Initializing game actions')
        GameActions.setupStandardButtons()
        GameActions.setupCoinActions()
    }

    /**
     * Setup standard game action buttons (play again, back to lobby, etc.)
     */
    static setupStandardButtons() {
        console.log('🎮 Setting up standard game buttons')

        const buttonConfigs = [
            { id: 'playAgainBtn', handler: GameActions.handlePlayAgain },
            { id: 'backToLobbyBtn', handler: GameActions.handleBackToLobby },
            { id: 'viewResultsBtn', handler: GameActions.handleViewResults },
            { id: 'nextRoundBtn', handler: GameActions.handleNextRound },
            { id: 'resetBtn', handler: GameActions.handleReset },
        ]

        buttonConfigs.forEach(({ id, handler }) => {
            const button = document.getElementById(id)
            if (button) {
                button.addEventListener('click', handler)
            }
        })
    }

    /**
     * Setup coin flip actions for game board
     */
    static setupCoinActions() {
        console.log('🪙 Setting up coin flip actions')

        document.addEventListener('click', (event) => {
            if (event.target.classList.contains('coin') && event.target.classList.contains('tails')) {
                GameActions.handleCoinFlip(event.target)
            }

            if (event.target.classList.contains('send-batch-btn')) {
                GameActions.handleSendBatch(event.target)
            }
        })
    }

    /**
     * Handle "Play Again" action
     */
    static async handlePlayAgain() {
        const gameCode = GameActions.getGameCode()
        const apiUrl = GameActions.getApiUrl()

        if (!GameActions.validateHostAction()) {
            GameActions.showAlert("Seul l'hôte peut redémarrer la partie")
            return
        }

        if (!apiUrl || !gameCode) {
            GameActions.showAlert('Informations manquantes pour redémarrer la partie')
            return
        }

        const playAgainBtn = document.getElementById('playAgainBtn')

        try {
            GameActions.setButtonState(playAgainBtn, ButtonStates.LOADING, 'Redémarrage...')

            // Reset the game first
            await fetch(`${apiUrl}/game/reset/${gameCode}`, {
                method: 'POST',
                credentials: 'include',
            })

            // Wait a bit then start new game
            setTimeout(async () => {
                await fetch(`${apiUrl}/game/start/${gameCode}`, {
                    method: 'POST',
                    credentials: 'include',
                })
            }, GAME_CONFIG.BUTTON_DISABLE_TIMEOUT)

            console.log('✅ Game restarted successfully')
        } catch (error) {
            console.error('❌ Error restarting game:', error)
            GameActions.showAlert('Erreur lors du redémarrage de la partie')
        } finally {
            GameActions.setButtonState(playAgainBtn, ButtonStates.NORMAL, 'Rejouer')
        }
    }

    /**
     * Handle "Back to Lobby" action
     */
    static async handleBackToLobby() {
        const gameCode = GameActions.getGameCode()
        const apiUrl = GameActions.getApiUrl()

        if (!GameActions.validateHostAction()) {
            GameActions.showAlert("Seul l'hôte peut retourner au lobby")
            return
        }

        if (!apiUrl || !gameCode) {
            GameActions.showAlert('Informations manquantes pour retourner au lobby')
            return
        }

        const backToLobbyBtn = document.getElementById('backToLobbyBtn')

        try {
            GameActions.setButtonState(backToLobbyBtn, ButtonStates.LOADING, 'Retour...')

            await fetch(`${apiUrl}/game/reset/${gameCode}`, {
                method: 'POST',
                credentials: 'include',
            })

            console.log('✅ Returned to lobby successfully')
        } catch (error) {
            console.error('❌ Error returning to lobby:', error)
            GameActions.showAlert('Erreur lors du retour au lobby')
        } finally {
            GameActions.setButtonState(backToLobbyBtn, ButtonStates.NORMAL, 'Retour au lobby')
        }
    }

    /**
     * Handle "View Results" action
     */
    static handleViewResults() {
        console.log('📊 Switching to results view')

        // Import ViewManager dynamically to avoid circular dependencies
        import('./view-manager.js')
            .then(({ ViewManager }) => {
                ViewManager.switchToResultsView()
            })
            .catch((error) => {
                console.error('Error loading ViewManager:', error)
                // Fallback: manually show results
                const results = document.getElementById('results')
                if (results) results.style.display = 'block'
            })
    }

    /**
     * Handle "Next Round" action
     */
    static async handleNextRound() {
        const gameCode = GameActions.getGameCode()
        const apiUrl = GameActions.getApiUrl()

        if (!GameActions.validateHostAction()) {
            GameActions.showAlert("Seul l'hôte peut démarrer la manche suivante")
            return
        }

        if (!apiUrl || !gameCode) {
            GameActions.showAlert('Informations manquantes pour démarrer la manche suivante')
            return
        }

        const nextRoundBtn = document.getElementById('nextRoundBtn')

        try {
            GameActions.setButtonState(nextRoundBtn, ButtonStates.LOADING, 'Démarrage...')

            const response = await fetch(`${apiUrl}/game/next_round/${gameCode}`, {
                method: 'POST',
                credentials: 'include',
            })

            if (!response.ok) {
                const errorData = await response.json()
                throw new Error(errorData.detail || 'Erreur lors du démarrage de la manche suivante')
            }

            console.log('✅ Next round started successfully')
        } catch (error) {
            console.error('❌ Error starting next round:', error)
            GameActions.showAlert(error.message || 'Impossible de démarrer la manche suivante')
        } finally {
            GameActions.setButtonState(nextRoundBtn, ButtonStates.NORMAL, 'Manche Suivante')
        }
    }

    /**
     * Handle "Reset" action
     */
    static async handleReset() {
        const gameCode = GameActions.getGameCode()
        const apiUrl = GameActions.getApiUrl()

        if (!GameActions.validateHostAction()) {
            GameActions.showAlert("Seul l'hôte peut réinitialiser la partie")
            return
        }

        if (!apiUrl || !gameCode) {
            GameActions.showAlert('Informations manquantes pour réinitialiser la partie')
            return
        }

        if (!confirm('Êtes-vous sûr de vouloir réinitialiser la partie ?')) {
            return
        }

        const resetBtn = document.getElementById('resetBtn')

        try {
            GameActions.setButtonState(resetBtn, ButtonStates.LOADING, 'Réinitialisation...')

            const response = await fetch(`${apiUrl}/game/reset/${gameCode}`, {
                method: 'POST',
                credentials: 'include',
            })

            if (!response.ok) {
                const errorData = await response.json()
                throw new Error(errorData.detail || 'Erreur lors de la réinitialisation')
            }

            console.log('✅ Game reset successfully')
        } catch (error) {
            console.error('❌ Error resetting game:', error)
            GameActions.showAlert(error.message || 'Impossible de réinitialiser la partie')
        } finally {
            GameActions.setButtonState(resetBtn, ButtonStates.NORMAL, 'Réinitialiser')
        }
    }

    /**
     * Handle coin flip action
     */
    static async handleCoinFlip(coinElement) {
        const coinIndex = parseInt(coinElement.dataset.coinIndex)
        const player = coinElement.dataset.player || window.currentUsername

        if (!GameActions.validateCoinFlip(coinIndex, player)) {
            return
        }

        const gameCode = GameActions.getGameCode()
        const apiUrl = GameActions.getApiUrl()

        if (!apiUrl || !gameCode) {
            console.error('Missing API configuration')
            return
        }

        try {
            const response = await fetch(`${apiUrl}/game/flip/${gameCode}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: player,
                    coin_index: coinIndex,
                }),
                credentials: 'include',
            })

            if (!response.ok) {
                const errorData = await response.json()
                throw new Error(errorData.detail || 'Erreur lors du retournement de pièce')
            }

            console.log('✅ Coin flipped successfully')
        } catch (error) {
            console.error('❌ Error flipping coin:', error)
            // Don't show alert for coin flips to avoid spam
        }
    }

    /**
     * Handle send batch action
     */
    static async handleSendBatch(buttonElement) {
        const player = buttonElement.dataset.player || window.currentUsername

        if (!player) {
            console.error('Invalid send batch data')
            return
        }

        const gameCode = GameActions.getGameCode()
        const apiUrl = GameActions.getApiUrl()

        if (!apiUrl || !gameCode) {
            console.error('Missing API configuration')
            return
        }

        try {
            GameActions.setButtonState(buttonElement, ButtonStates.LOADING, 'Envoi...')

            const response = await fetch(`${apiUrl}/game/send/${gameCode}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: player }),
                credentials: 'include',
            })

            if (!response.ok) {
                const errorData = await response.json()
                throw new Error(errorData.detail || "Erreur lors de l'envoi du lot")
            }

            console.log('✅ Batch sent successfully')
        } catch (error) {
            console.error('❌ Error sending batch:', error)
            // Show error for send actions as they're more deliberate
            GameActions.showAlert(error.message || "Impossible d'envoyer le lot")
        } finally {
            GameActions.setButtonState(buttonElement, ButtonStates.NORMAL, 'Envoyer le lot')
        }
    }

    // Utility Methods

    /**
     * Get the current game code
     */
    static getGameCode() {
        return document.getElementById('game-code')?.textContent?.trim() || ''
    }

    /**
     * Get the API URL
     */
    static getApiUrl() {
        return document.getElementById('joinRoleModal')?.getAttribute('data-api-url') || ''
    }

    /**
     * Validate host action
     */
    static validateHostAction() {
        return window.isHost === true
    }

    /**
     * Validate coin flip parameters
     */
    static validateCoinFlip(coinIndex, player) {
        if (isNaN(coinIndex) || !player) {
            console.error('Invalid coin flip data')
            return false
        }
        return true
    }

    /**
     * Set button state (normal, loading, disabled)
     */
    static setButtonState(button, state, text) {
        if (!button) return

        switch (state) {
            case ButtonStates.LOADING:
                button.disabled = true
                button.textContent = text
                break
            case ButtonStates.DISABLED:
                button.disabled = true
                break
            case ButtonStates.NORMAL:
            default:
                button.disabled = false
                button.textContent = text
                break
        }
    }

    /**
     * Show alert message
     */
    static showAlert(message) {
        alert(message)
    }
}

// Auto-initialize when DOM is loaded
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        GameActions.initialize()
    })
}
