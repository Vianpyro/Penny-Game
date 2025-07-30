// Centralized module for game actions (reset, restart, etc.)

export class GameActions {
    /**
     * Resets a game
     * @param {string} apiUrl - API URL
     * @param {string} gameCode - Game code
     * @returns {Promise<Object>} API response
     */
    static async resetGame(apiUrl, gameCode) {
        const response = await fetch(`${apiUrl}/game/reset/${gameCode}`, {
            method: 'POST',
            credentials: 'include',
        })

        if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.detail || 'Échec de la réinitialisation')
        }

        return response.json()
    }

    /**
     * Starts a new game
     * @param {string} apiUrl - API URL
     * @param {string} gameCode - Game code
     * @returns {Promise<Object>} API response
     */
    static async startGame(apiUrl, gameCode) {
        const response = await fetch(`${apiUrl}/game/start/${gameCode}`, {
            method: 'POST',
            credentials: 'include',
        })

        if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.detail || 'Erreur lors du démarrage')
        }

        return response.json()
    }

    /**
     * Restarts a game (reset + start)
     * @param {string} apiUrl - API URL
     * @param {string} gameCode - Game code
     * @returns {Promise<Object>} Start response
     */
    static async restartGame(apiUrl, gameCode) {
        // Reset first
        await this.resetGame(apiUrl, gameCode)

        // Delay to ensure reset is complete
        await new Promise((resolve) => setTimeout(resolve, 500))

        // Then start a new game
        return this.startGame(apiUrl, gameCode)
    }

    /**
     * Sets up an action button with error and loading handling
     * @param {string} buttonId - Button ID
     * @param {Function} action - Action function to execute
     * @param {Object} options - Configuration options
     */
    static setupActionButton(buttonId, action, options = {}) {
        const button = document.getElementById(buttonId)
        if (!button) return

        // Default options
        const config = {
            hostOnly: false,
            hostOnlyMessage: "Seul l'hôte peut effectuer cette action",
            loadingText: 'Chargement...',
            errorMessage: 'Une erreur est survenue',
            originalText: button.textContent,
            requiresConfirmation: false,
            confirmationMessage: 'Êtes-vous sûr ?',
            ...options,
        }

        button.addEventListener('click', async () => {
            // Host permission check
            if (config.hostOnly && !window.isHost) {
                alert(config.hostOnlyMessage)
                return
            }

            // Confirmation if required
            if (config.requiresConfirmation && !confirm(config.confirmationMessage)) {
                return
            }

            // Retrieve game data
            const gameCode = document.getElementById('game-code')?.textContent?.trim() || ''
            const apiUrl = document.getElementById('joinRoleModal')?.getAttribute('data-api-url') || ''

            if (!apiUrl || !gameCode) {
                alert('Informations de jeu manquantes')
                return
            }

            try {
                // Loading state
                button.disabled = true
                button.textContent = config.loadingText

                // Execute the action
                await action(apiUrl, gameCode)

                // Success notification if provided
                if (config.successMessage) {
                    alert(config.successMessage)
                }
            } catch (error) {
                console.error(`Error in ${buttonId}:`, error)
                alert(config.errorMessage + ': ' + error.message)
            } finally {
                // Restore button state
                button.disabled = false
                button.textContent = config.originalText
            }
        })
    }

    /**
     * Sets up all standard action buttons
     */
    static setupStandardButtons() {
        // "Play Again" button
        this.setupActionButton('playAgainBtn', this.restartGame, {
            hostOnly: true,
            hostOnlyMessage: "Seul l'hôte peut redémarrer la partie",
            loadingText: 'Redémarrage...',
            errorMessage: 'Erreur lors du redémarrage de la partie',
            originalText: 'Rejouer',
        })

        // "Back to Lobby" button
        this.setupActionButton('backToLobbyBtn', this.resetGame, {
            hostOnly: true,
            hostOnlyMessage: "Seul l'hôte peut retourner au lobby",
            loadingText: 'Retour...',
            errorMessage: 'Erreur lors du retour au lobby',
            originalText: 'Retour au lobby',
        })

        // Reset button
        this.setupActionButton('resetBtn', this.resetGame, {
            hostOnly: true,
            hostOnlyMessage: "Seul l'hôte peut réinitialiser la partie",
            loadingText: 'Réinitialisation...',
            errorMessage: 'Erreur lors de la réinitialisation',
            originalText: 'Réinitialiser',
            requiresConfirmation: true,
            confirmationMessage: 'Êtes-vous sûr de vouloir réinitialiser la partie ?',
        })

        // Game reset button
        this.setupActionButton('resetGameBtn', this.resetGame, {
            hostOnly: true,
            loadingText: 'Réinitialisation...',
            errorMessage: 'Erreur lors de la réinitialisation',
            originalText: '🔄 Réinitialiser la partie',
            requiresConfirmation: true,
            confirmationMessage: 'Êtes-vous sûr de vouloir réinitialiser la partie ?',
        })

        // End game button (debug)
        this.setupActionButton(
            'endGameBtn',
            async (apiUrl, gameCode) => {
                const response = await fetch(`${apiUrl}/game/end/${gameCode}`, {
                    method: 'POST',
                    credentials: 'include',
                })

                if (!response.ok) {
                    const errorData = await response.json()
                    throw new Error(errorData.detail || "Erreur lors de l'arrêt")
                }

                return response.json()
            },
            {
                hostOnly: true,
                hostOnlyMessage: "Seul l'hôte peut terminer la partie",
                loadingText: 'Arrêt...',
                errorMessage: "Erreur lors de l'arrêt de la partie",
                originalText: '⏹️ Terminer la partie (Test)',
            }
        )
    }

    /**
     * Gets standard game data for actions
     * @returns {Object} Object containing gameCode and apiUrl
     */
    static getGameData() {
        return {
            gameCode: document.getElementById('game-code')?.textContent?.trim() || '',
            apiUrl: document.getElementById('joinRoleModal')?.getAttribute('data-api-url') || '',
        }
    }

    /**
     * Validates that game data is available
     * @returns {boolean} True if data is valid
     */
    static validateGameData() {
        const { gameCode, apiUrl } = this.getGameData()
        return !!(gameCode && apiUrl)
    }
}
