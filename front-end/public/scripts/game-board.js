// Game board logic for Penny Game with cooperative mechanics
import { flipCoin, sendBatch } from './api.js'
import { showNotification } from './utility.js'

export async function fetchBoardGameState(gameCode) {
    const apiUrl = document.getElementById('joinRoleModal')?.getAttribute('data-api-url') || ''
    if (!apiUrl || !gameCode) return null

    try {
        const res = await fetch(`${apiUrl}/game/state/${gameCode}`, {
            credentials: 'include',
        })
        if (!res.ok) return null
        const data = await res.json()
        return data
    } catch (error) {
        console.error('Error fetching game state:', error)
        return null
    }
}

export function renderGameBoard(gameState) {
    const gameBoard = document.getElementById('gameBoard')
    if (!gameBoard || !gameState) return

    gameBoard.innerHTML = ''

    // Add game status header
    const gameStatus = document.createElement('div')
    gameStatus.className = 'game-status'
    gameStatus.innerHTML = `
        <div class="status-header">
            <h2>🎲 Partie en cours - Lot de ${gameState.batch_size}</h2>
            <div class="game-progress">
                <div class="progress-stats">
                    <span class="stat">🪙 Total: ${gameState.total_completed}/12 terminées</span>
                    <span class="stat">⏳ ${gameState.tails_remaining} pièces à traiter</span>
                </div>
            </div>
        </div>
    `
    gameBoard.appendChild(gameStatus)

    // Add reset button for hosts
    if (window.isHost) {
        addResetButton()
    }

    // Add production line visualization
    const productionLine = document.createElement('div')
    productionLine.className = 'production-line'

    gameState.players.forEach((player, index) => {
        const playerStation = createPlayerStation(player, gameState, index)
        productionLine.appendChild(playerStation)

        // Add arrow between players (except after last player)
        if (index < gameState.players.length - 1) {
            const arrow = document.createElement('div')
            arrow.className = 'flow-arrow'
            arrow.innerHTML = '➡️'
            productionLine.appendChild(arrow)
        }
    })

    // Add completion area
    const completionArea = document.createElement('div')
    completionArea.className = 'completion-area'
    completionArea.innerHTML = `
        <div class="completion-station">
            <h3>✅ Terminé</h3>
            <div class="completed-coins">
                ${Array(gameState.total_completed).fill('🪙').join('')}
            </div>
            <div class="completion-count">${gameState.total_completed}/12</div>
        </div>
    `
    productionLine.appendChild(completionArea)

    gameBoard.appendChild(productionLine)

    // Add game rules reminder
    const rulesReminder = document.createElement('div')
    rulesReminder.className = 'rules-reminder'
    rulesReminder.innerHTML = `
        <h4>📋 Rappel des règles :</h4>
        <ul>
            <li>🔄 Retournez les pièces de pile (⚫) vers face (🪙)</li>
            <li>📦 Envoyez par lots de ${gameState.batch_size} pièce${gameState.batch_size > 1 ? 's' : ''}</li>
            <li>⚡ Travaillez en parallèle - pas de tour de rôle !</li>
            <li>🎯 Objectif : terminer le plus vite possible ensemble</li>
        </ul>
    `
    gameBoard.appendChild(rulesReminder)
}

function createPlayerStation(player, gameState, playerIndex) {
    const station = document.createElement('div')
    station.className = 'player-station'

    const currentUsername = window.currentUsername
    const isCurrentPlayer = player === currentUsername
    const isHost = window.isHost
    const playerCoins = gameState.player_coins[player] || []

    // Count coins by state
    const tailsCount = playerCoins.filter((coin) => !coin).length
    const headsCount = playerCoins.filter((coin) => coin).length
    const totalCoins = playerCoins.length

    // Determine if player can send batch
    const canSend = headsCount >= gameState.batch_size || (headsCount > 0 && headsCount === totalCoins)

    // Determine if player can interact (only current player, not host, and not spectator)
    const canInteract = isCurrentPlayer && !isHost && window.userRole === 'player'

    station.innerHTML = `
        <div class="station-header">
            <h3>${isCurrentPlayer ? '⭐' : '👤'} ${player}</h3>
            <div class="player-status">
                ${isCurrentPlayer ? 'Votre station' : 'Station partenaire'}
                ${!canInteract && isCurrentPlayer ? ' (Hôte - observation seulement)' : ''}
            </div>
        </div>
        <div class="station-stats">
            <span class="stat">🪙 ${totalCoins} pièces</span>
            <span class="stat">⚫ ${tailsCount} à retourner</span>
            <span class="stat">🟡 ${headsCount} prêtes</span>
        </div>
    `

    // Add coins display
    const coinsContainer = document.createElement('div')
    coinsContainer.className = 'coins-container'

    if (totalCoins > 0) {
        playerCoins.forEach((isHeads, index) => {
            const coin = document.createElement('div')
            // Use the same classes as the main flip animation
            coin.className = `flip coin ${isHeads ? 'heads' : 'tails'}`
            coin.textContent = '🪙'
            coin.title = isHeads ? 'Face - Prête à envoyer' : 'Pile - Cliquez pour retourner'

            // Apply grayscale to tails coins (pile state)
            if (!isHeads) {
                coin.classList.add('grayscale')
            }

            // CRITICAL: Only allow interaction for current player who can interact with tails coins
            if (canInteract && !isHeads) {
                coin.classList.add('interactive', 'clickable')
                coin.style.cursor = 'pointer'
                coin.addEventListener('click', () => handleCoinFlip(index, coin))
            } else if (isCurrentPlayer && isHeads) {
                coin.classList.add('ready') // Visual indicator for ready coins
                coin.title = 'Face - Prête à envoyer'
            } else if (!isCurrentPlayer) {
                coin.classList.add('other-player') // Visual indicator for other player's coins
                coin.title = `Pièce de ${player}`
            }

            coinsContainer.appendChild(coin)
        })
    } else {
        const emptyMessage = document.createElement('div')
        emptyMessage.className = 'empty-station'
        emptyMessage.textContent = totalCoins === 0 ? 'En attente de pièces...' : 'Station vide'
        coinsContainer.appendChild(emptyMessage)
    }

    station.appendChild(coinsContainer)

    // Add action buttons ONLY for current player who can interact
    if (canInteract && totalCoins > 0) {
        const actionsContainer = document.createElement('div')
        actionsContainer.className = 'station-actions'

        // Send batch button
        const sendButton = document.createElement('button')
        sendButton.className = `btn ${canSend ? 'btn-primary' : 'btn-disabled'}`
        sendButton.textContent =
            playerIndex === gameState.players.length - 1
                ? `Terminer ${headsCount} pièce${headsCount > 1 ? 's' : ''}`
                : `Envoyer lot (${headsCount}/${gameState.batch_size})`
        sendButton.disabled = !canSend

        if (canSend) {
            sendButton.addEventListener('click', () => handleSendBatch())
        } else {
            sendButton.title = `Retournez ${gameState.batch_size - headsCount} pièce${gameState.batch_size - headsCount > 1 ? 's' : ''} de plus`
        }

        actionsContainer.appendChild(sendButton)
        station.appendChild(actionsContainer)
    } else if (isCurrentPlayer && window.userRole === 'spectator') {
        // Show message for spectators
        const spectatorMessage = document.createElement('div')
        spectatorMessage.className = 'spectator-message'
        spectatorMessage.textContent = 'Vous êtes spectateur - observation seulement'
        station.appendChild(spectatorMessage)
    } else if (isCurrentPlayer && isHost) {
        // Show message for host
        const hostMessage = document.createElement('div')
        hostMessage.className = 'host-message'
        hostMessage.textContent = 'Vous êtes hôte - observation seulement'
        station.appendChild(hostMessage)
    }

    return station
}

async function handleCoinFlip(coinIndex, coinElement) {
    const gameCode = document.getElementById('game-code')?.textContent?.trim() || ''
    const apiUrl = document.getElementById('joinRoleModal')?.getAttribute('data-api-url') || ''
    const username = window.currentUsername

    if (!apiUrl || !gameCode || !username) {
        console.error('Missing required data for coin flip')
        return
    }

    // Double-check permissions
    if (window.isHost) {
        showNotification('Les hôtes ne peuvent pas jouer', 'error')
        return
    }

    if (window.userRole !== 'player') {
        showNotification('Seuls les joueurs peuvent retourner les pièces', 'error')
        return
    }

    // Immediate visual feedback using existing flip animation
    coinElement.classList.toggle('flipped')
    setTimeout(() => {
        coinElement.classList.toggle('grayscale')
        coinElement.textContent = '🪙' // Update to heads emoji
        coinElement.classList.remove('tails')
        coinElement.classList.add('heads')
        coinElement.style.cursor = 'default'
        coinElement.title = 'Face - Prête à envoyer'
    }, 200)

    try {
        await flipCoin(apiUrl, gameCode, username, coinIndex)
        // The websocket will handle updating the full UI state
    } catch (error) {
        console.error('Error flipping coin:', error)

        // Revert the visual change if the API call failed
        coinElement.classList.toggle('flipped')
        setTimeout(() => {
            coinElement.classList.toggle('grayscale')
            coinElement.textContent = '🪙'
            coinElement.classList.remove('heads')
            coinElement.classList.add('tails')
            coinElement.style.cursor = 'pointer'
            coinElement.title = 'Pile - Cliquez pour retourner'
        }, 200)
    }
}

async function handleSendBatch() {
    const gameCode = document.getElementById('game-code')?.textContent?.trim() || ''
    const apiUrl = document.getElementById('joinRoleModal')?.getAttribute('data-api-url') || ''
    const username = window.currentUsername

    if (!apiUrl || !gameCode || !username) {
        console.error('Missing required data for send batch')
        return
    }

    // Double-check permissions
    if (window.isHost) {
        showNotification('Les hôtes ne peuvent pas jouer', 'error')
        return
    }

    if (window.userRole !== 'player') {
        showNotification('Seuls les joueurs peuvent envoyer des lots', 'error')
        return
    }

    // Check game state
    if (!window.gameState || window.gameState.state !== 'active') {
        showNotification("La partie n'est pas active", 'error')
        return
    }

    try {
        await sendBatch(apiUrl, gameCode, username)
        // The websocket will handle updating the UI
        // Removed excessive notification - only show on send batch success
    } catch (error) {
        console.error('Error sending batch:', error)

        // Provide more specific error messages
        if (error.message.includes('Failed to fetch')) {
            showNotification('Erreur de connexion au serveur', 'error')
        } else {
            showNotification(`Erreur: ${error.message}`, 'error')
        }
    }
}

export function updateGameUI(gameState) {
    if (!gameState) return

    // Re-render the entire board to reflect new state
    renderGameBoard(gameState)

    // Update batch size display if changed
    const batchSizeSelectors = document.querySelectorAll('.batch-size-option')
    batchSizeSelectors.forEach((option) => {
        const size = parseInt(option.dataset.size)
        option.classList.toggle('active', size === gameState.batch_size)
    })
}

// Add reset functionality for hosts
export function addResetButton() {
    const gameBoard = document.getElementById('gameBoard')
    if (!gameBoard) return

    const resetContainer = document.createElement('div')
    resetContainer.className = 'host-controls'
    resetContainer.innerHTML = `
        <button class="btn btn-secondary" id="resetGameBtn">
            🔄 Réinitialiser la partie
        </button>
    `

    gameBoard.appendChild(resetContainer)

    document.getElementById('resetGameBtn')?.addEventListener('click', async () => {
        if (confirm('Êtes-vous sûr de vouloir réinitialiser la partie ?')) {
            await resetGame()
        }
    })
}

async function resetGame() {
    const gameCode = document.getElementById('game-code')?.textContent?.trim() || ''
    const apiUrl = document.getElementById('joinRoleModal')?.getAttribute('data-api-url') || ''

    if (!apiUrl || !gameCode) return

    try {
        const response = await fetch(`${apiUrl}/game/reset/${gameCode}`, {
            method: 'POST',
            credentials: 'include',
        })

        if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.detail || 'Échec de la réinitialisation')
        }

        console.log('Game reset successful')
    } catch (error) {
        console.error('Error resetting game:', error)
        showNotification(`Erreur lors de la réinitialisation: ${error.message}`, 'error')
    }
}

// Export utility functions for use in other modules
export { handleCoinFlip, handleSendBatch }
