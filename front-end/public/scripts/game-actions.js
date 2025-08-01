// Game actions for Penny Game - handling user interactions and game controls

export class GameActions {
    /**
     * Setup standard game action buttons (play again, back to lobby, etc.)
     */
    static setupStandardButtons() {
        console.log('🎮 Setting up standard game buttons')

        // Play Again button
        const playAgainBtn = document.getElementById('playAgainBtn')
        if (playAgainBtn) {
            playAgainBtn.addEventListener('click', GameActions.handlePlayAgain)
        }

        // Back to Lobby button
        const backToLobbyBtn = document.getElementById('backToLobbyBtn')
        if (backToLobbyBtn) {
            backToLobbyBtn.addEventListener('click', GameActions.handleBackToLobby)
        }

        // View Results button
        const viewResultsBtn = document.getElementById('viewResultsBtn')
        if (viewResultsBtn) {
            viewResultsBtn.addEventListener('click', GameActions.handleViewResults)
        }

        // Next Round button
        const nextRoundBtn = document.getElementById('nextRoundBtn')
        if (nextRoundBtn) {
            nextRoundBtn.addEventListener('click', GameActions.handleNextRound)
        }

        // Reset button
        const resetBtn = document.getElementById('resetBtn')
        if (resetBtn) {
            resetBtn.addEventListener('click', GameActions.handleReset)
        }
    }

    /**
     * Handle "Play Again" action
     */
    static async handlePlayAgain() {
        const gameCode = document.getElementById('game-code')?.textContent?.trim() || ''
        const apiUrl = document.getElementById('joinRoleModal')?.getAttribute('data-api-url') || ''

        if (!window.isHost) {
            alert("Seul l'hôte peut redémarrer la partie")
            return
        }

        if (!apiUrl || !gameCode) {
            alert('Informations manquantes pour redémarrer la partie')
            return
        }

        const playAgainBtn = document.getElementById('playAgainBtn')

        try {
            if (playAgainBtn) {
                playAgainBtn.disabled = true
                playAgainBtn.textContent = 'Redémarrage...'
            }

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
            }, 500)

            console.log('✅ Game restarted successfully')
        } catch (error) {
            console.error('❌ Error restarting game:', error)
            alert('Erreur lors du redémarrage de la partie')
        } finally {
            if (playAgainBtn) {
                playAgainBtn.disabled = false
                playAgainBtn.textContent = 'Rejouer'
            }
        }
    }

    /**
     * Handle "Back to Lobby" action
     */
    static async handleBackToLobby() {
        const gameCode = document.getElementById('game-code')?.textContent?.trim() || ''
        const apiUrl = document.getElementById('joinRoleModal')?.getAttribute('data-api-url') || ''

        if (!window.isHost) {
            alert("Seul l'hôte peut retourner au lobby")
            return
        }

        if (!apiUrl || !gameCode) {
            alert('Informations manquantes pour retourner au lobby')
            return
        }

        const backToLobbyBtn = document.getElementById('backToLobbyBtn')

        try {
            if (backToLobbyBtn) {
                backToLobbyBtn.disabled = true
                backToLobbyBtn.textContent = 'Retour...'
            }

            await fetch(`${apiUrl}/game/reset/${gameCode}`, {
                method: 'POST',
                credentials: 'include',
            })

            console.log('✅ Returned to lobby successfully')
        } catch (error) {
            console.error('❌ Error returning to lobby:', error)
            alert('Erreur lors du retour au lobby')
        } finally {
            if (backToLobbyBtn) {
                backToLobbyBtn.disabled = false
                backToLobbyBtn.textContent = 'Retour au lobby'
            }
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
        const gameCode = document.getElementById('game-code')?.textContent?.trim() || ''
        const apiUrl = document.getElementById('joinRoleModal')?.getAttribute('data-api-url') || ''

        if (!window.isHost) {
            alert("Seul l'hôte peut démarrer la manche suivante")
            return
        }

        if (!apiUrl || !gameCode) {
            alert('Informations manquantes pour démarrer la manche suivante')
            return
        }

        const nextRoundBtn = document.getElementById('nextRoundBtn')

        try {
            if (nextRoundBtn) {
                nextRoundBtn.disabled = true
                nextRoundBtn.textContent = 'Démarrage...'
            }

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
            alert(error.message || 'Impossible de démarrer la manche suivante')
        } finally {
            if (nextRoundBtn) {
                nextRoundBtn.disabled = false
                nextRoundBtn.textContent = 'Manche Suivante'
            }
        }
    }

    /**
     * Handle "Reset" action
     */
    static async handleReset() {
        const gameCode = document.getElementById('game-code')?.textContent?.trim() || ''
        const apiUrl = document.getElementById('joinRoleModal')?.getAttribute('data-api-url') || ''

        if (!window.isHost) {
            alert("Seul l'hôte peut réinitialiser la partie")
            return
        }

        if (!apiUrl || !gameCode) {
            alert('Informations manquantes pour réinitialiser la partie')
            return
        }

        if (!confirm('Êtes-vous sûr de vouloir réinitialiser la partie ?')) {
            return
        }

        const resetBtn = document.getElementById('resetBtn')

        try {
            if (resetBtn) {
                resetBtn.disabled = true
                resetBtn.textContent = 'Réinitialisation...'
            }

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
            alert(error.message || 'Impossible de réinitialiser la partie')
        } finally {
            if (resetBtn) {
                resetBtn.disabled = false
                resetBtn.textContent = 'Réinitialiser'
            }
        }
    }

    /**
     * Setup coin flip actions for game board
     */
    static setupCoinActions() {
        console.log('🪙 Setting up coin flip actions')

        document.addEventListener('click', (event) => {
            // Handle coin clicks
            if (event.target.classList.contains('coin') && event.target.classList.contains('tails')) {
                GameActions.handleCoinFlip(event.target)
            }

            // Handle send batch buttons
            if (event.target.classList.contains('send-batch-btn')) {
                GameActions.handleSendBatch(event.target)
            }
        })
    }

    /**
     * Handle coin flip action
     */
    static async handleCoinFlip(coinElement) {
        const coinIndex = parseInt(coinElement.dataset.coinIndex)
        const player = coinElement.dataset.player || window.currentUsername

        if (isNaN(coinIndex) || !player) {
            console.error('Invalid coin flip data')
            return
        }

        const gameCode = document.getElementById('game-code')?.textContent?.trim() || ''
        const apiUrl = document.getElementById('joinRoleModal')?.getAttribute('data-api-url') || ''

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

        const gameCode = document.getElementById('game-code')?.textContent?.trim() || ''
        const apiUrl = document.getElementById('joinRoleModal')?.getAttribute('data-api-url') || ''

        if (!apiUrl || !gameCode) {
            console.error('Missing API configuration')
            return
        }

        try {
            buttonElement.disabled = true
            buttonElement.textContent = 'Envoi...'

            const response = await fetch(`${apiUrl}/game/send/${gameCode}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: player,
                }),
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
            alert(error.message || "Impossible d'envoyer le lot")
        } finally {
            buttonElement.disabled = false
            buttonElement.textContent = 'Envoyer le lot'
        }
    }

    /**
     * Initialize all game actions
     */
    static initialize() {
        console.log('🎯 Initializing game actions')
        GameActions.setupStandardButtons()
        GameActions.setupCoinActions()
    }
}

// Auto-initialize when DOM is loaded
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        GameActions.initialize()
    })
}
