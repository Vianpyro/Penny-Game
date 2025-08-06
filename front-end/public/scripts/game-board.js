// Game board logic for Penny Game with cooperative mechanics and timers
import { flipCoin, sendBatch } from './api.js'
import { showNotification } from './utility.js'

const TOTAL_COINS = 15

const FLIP_HOLD_DURATION = 1500
const coinHoldTimers = new Map()
const coinProgressIntervals = new Map()

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

function formatTime(seconds) {
    if (!seconds && seconds !== 0) return '--:--'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
}

function formatPlayerTimer(timer) {
    if (!timer) return { status: 'waiting', time: '--:--', statusText: 'En attente' }

    if (!timer.started_at) {
        return { status: 'waiting', time: '--:--', statusText: 'En attente' }
    }

    if (timer.ended_at && timer.duration_seconds !== null && timer.duration_seconds !== undefined) {
        return {
            status: 'completed',
            time: formatTime(timer.duration_seconds),
            statusText: 'Terminé',
        }
    }

    // Timer is running - calculate current duration from the actual timer data
    if (timer.started_at && !timer.ended_at) {
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
                time: formatTime(currentDuration),
                statusText: 'En cours',
            }
        } catch (error) {
            console.error('Error calculating timer duration:', error)
            return { status: 'waiting', time: '--:--', statusText: 'Erreur' }
        }
    }

    return { status: 'waiting', time: '--:--', statusText: 'En attente' }
}

export function renderGameBoard(gameState) {
    const gameBoard = document.getElementById('gameBoard')
    if (!gameBoard || !gameState) return

    gameBoard.innerHTML = ''

    // Add game status header with game timer
    const gameStatus = document.createElement('div')
    gameStatus.className = 'game-status'

    let gameTimer = '--:--'
    if (gameState.game_duration_seconds !== null && gameState.game_duration_seconds !== undefined) {
        gameTimer = formatTime(gameState.game_duration_seconds)
    } else if (gameState.started_at) {
        // Game is running - calculate current duration
        const startTime = new Date(gameState.started_at)
        const currentTime = new Date()
        if (!isNaN(startTime.getTime())) {
            const currentDuration = (currentTime - startTime) / 1000
            gameTimer = formatTime(currentDuration)
        }
    }

    gameStatus.innerHTML = `
        <div class="status-header">
            <h2>🎲 Partie en cours - Lot de ${gameState.batch_size}</h2>
            <div class="game-timer">
                <span class="timer-label">⏱️ Temps de jeu:</span>
                <span class="timer-value" id="gameTimerDisplay">${gameTimer}</span>
            </div>
            <div class="game-progress">
                <div class="progress-stats">
                    <span class="stat">🪙 Total: ${gameState.total_completed}/${TOTAL_COINS} terminées</span>
                    <span class="stat">⏳ ${gameState.tails_remaining} pièces à traiter</span>
                </div>
            </div>
        </div>
    `
    gameBoard.appendChild(gameStatus)

    // Start real-time timer updates if game is active
    if (gameState.state === 'active' && gameState.started_at && !gameState.ended_at) {
        startRealTimeTimers(gameState)
    }

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
            <div class="completion-count">${gameState.total_completed}/${TOTAL_COINS}</div>
        </div>
    `
    productionLine.appendChild(completionArea)

    gameBoard.appendChild(productionLine)

    // Add player timers summary if any timers exist
    if (gameState.player_timers && Object.keys(gameState.player_timers).length > 0) {
        addTimersSummary(gameState)
    }

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
            <li>🪙 ${TOTAL_COINS} pièces au total à traiter</li>
        </ul>
    `
    gameBoard.appendChild(rulesReminder)
}

function getCoinsProcessedByPlayer(playerName, roundResult) {
    const totalCoins = roundResult.total_completed || TOTAL_COINS
    const playerCount = Object.keys(roundResult.player_timers || {}).length
    return Math.ceil(totalCoins / playerCount)
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

    // Determine if player can interact
    const canInteract = isCurrentPlayer && !isHost && window.userRole === 'player'

    // Format player timer
    const timerInfo = formatPlayerTimer(gameState.player_timers ? gameState.player_timers[player] : null)

    station.innerHTML = `
        <div class="station-header">
            <h3>${isCurrentPlayer ? '⭐' : '👤'} ${player}</h3>
            <div class="player-status">
                ${isCurrentPlayer ? 'Votre station' : 'Station partenaire'}
                ${!canInteract && isCurrentPlayer ? ' (Hôte - observation seulement)' : ''}
            </div>
            <div class="player-timer ${timerInfo.status}">
                <span class="timer-icon">⏱️</span>
                <span class="timer-time" data-player="${player}">${timerInfo.time}</span>
                <span class="timer-status">${timerInfo.statusText}</span>
            </div>
        </div>
        <div class="station-stats">
            <span class="stat">🪙 ${totalCoins} pièces</span>
            <span class="stat">⚫ ${tailsCount} à retourner</span>
            <span class="stat">🟡 ${headsCount} prêtes</span>
        </div>
    `

    // Add coins display with hold-to-flip functionality
    const coinsContainer = document.createElement('div')
    coinsContainer.className = 'coins-container'

    if (totalCoins > 0) {
        playerCoins.forEach((isHeads, index) => {
            const coinWrapper = document.createElement('div')
            coinWrapper.className = 'coin-wrapper'

            const coin = document.createElement('div')
            coin.className = `flip coin ${isHeads ? 'heads' : 'tails'}`
            coin.textContent = '🪙'
            coin.title = isHeads ? 'Face - Prête à envoyer' : 'Maintenez pendant 1.5s pour retourner'
            coin.dataset.coinIndex = index
            coin.dataset.player = player

            // Apply grayscale to tails coins
            if (!isHeads) {
                coin.classList.add('grayscale')
            }

            // Add progress ring for hold indicator
            const progressRing = document.createElement('div')
            progressRing.className = 'coin-progress-ring'
            progressRing.innerHTML = `
                <svg class="progress-ring__svg">
                    <circle class="progress-ring__circle-bg"></circle>
                    <circle class="progress-ring__circle"></circle>
                </svg>
            `

            coinWrapper.appendChild(coin)
            coinWrapper.appendChild(progressRing)

            // Only allow interaction for current player with tails coins
            if (canInteract && !isHeads) {
                coin.classList.add('interactive', 'holdable')
                coin.style.cursor = 'grab'

                // Add hold-to-flip event listeners
                setupCoinHoldEvents(coin, index, progressRing)
            } else if (isCurrentPlayer && isHeads) {
                coin.classList.add('ready')
                coin.title = 'Face - Prête à envoyer'
            } else if (!isCurrentPlayer) {
                coin.classList.add('other-player')
                coin.title = `Pièce de ${player}`
            }

            coinsContainer.appendChild(coinWrapper)
        })
    } else {
        const emptyMessage = document.createElement('div')
        emptyMessage.className = 'empty-station'
        emptyMessage.textContent = totalCoins === 0 ? 'En attente de pièces...' : 'Station vide'
        coinsContainer.appendChild(emptyMessage)
    }

    station.appendChild(coinsContainer)

    // Add action buttons for current player
    if (canInteract && totalCoins > 0) {
        const actionsContainer = document.createElement('div')
        actionsContainer.className = 'station-actions'

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
        const spectatorMessage = document.createElement('div')
        spectatorMessage.className = 'spectator-message'
        spectatorMessage.textContent = 'Vous êtes spectateur - observation seulement'
        station.appendChild(spectatorMessage)
    } else if (isCurrentPlayer && isHost) {
        const hostMessage = document.createElement('div')
        hostMessage.className = 'host-message'
        hostMessage.textContent = 'Vous êtes hôte - observation seulement'
        station.appendChild(hostMessage)
    }

    return station
}

function setupCoinHoldEvents(coinElement, coinIndex, progressRing) {
    let holdTimer = null
    let progressInterval = null
    let startTime = null
    let isHolding = false
    let flipCompleted = false // Flag pour éviter les doubles retournements

    const startHold = (e) => {
        e.preventDefault()
        e.stopPropagation()

        // Prevent if already holding or flip was completed
        if (isHolding || flipCompleted) return

        isHolding = true
        flipCompleted = false
        startTime = Date.now()

        // Visual feedback
        coinElement.classList.add('holding')
        coinElement.style.cursor = 'grabbing'
        progressRing.classList.add('active')

        // Show hold instruction
        showHoldInstruction(coinElement)

        // Start progress animation
        updateProgress(0)
        progressInterval = setInterval(() => {
            const elapsed = Date.now() - startTime
            const progress = Math.min(elapsed / FLIP_HOLD_DURATION, 1)
            updateProgress(progress)

            // Only flip if we reach 100% progress
            if (progress >= 1 && !flipCompleted) {
                flipCompleted = true
                completeFlip()
            }
        }, 16) // 60fps update

        // Store references for cleanup
        coinProgressIntervals.set(coinElement, progressInterval)
    }

    const endHold = (e) => {
        e.preventDefault()
        e.stopPropagation()

        if (!isHolding) return

        const elapsed = startTime ? Date.now() - startTime : 0
        const progress = elapsed / FLIP_HOLD_DURATION

        // Only reset if flip wasn't completed (progress < 100%)
        if (progress < 1 && !flipCompleted) {
            isHolding = false

            // Clear interval
            if (progressInterval) {
                clearInterval(progressInterval)
                progressInterval = null
            }

            // Reset visual feedback
            coinElement.classList.remove('holding')
            coinElement.style.cursor = 'grab'
            progressRing.classList.remove('active')
            updateProgress(0)
            hideHoldInstruction(coinElement)

            // Clean up references
            coinProgressIntervals.delete(coinElement)

            // Show incomplete message briefly
            showIncompleteMessage(coinElement)
        }
    }

    const completeFlip = () => {
        // Clear interval
        if (progressInterval) {
            clearInterval(progressInterval)
            progressInterval = null
        }

        // Success feedback
        coinElement.classList.add('flip-success')
        progressRing.classList.add('complete')

        // Perform the flip ONLY if completed
        performCoinFlip(coinIndex, coinElement)

        // Reset after animation
        setTimeout(() => {
            coinElement.classList.remove('holding', 'flip-success')
            progressRing.classList.remove('active', 'complete')
            updateProgress(0)
            hideHoldInstruction(coinElement)
            isHolding = false
            flipCompleted = false
        }, 500)
    }

    const updateProgress = (progress) => {
        const circle = progressRing.querySelector('.progress-ring__circle')
        if (circle) {
            const radius = 18
            const circumference = 2 * Math.PI * radius
            const offset = circumference - progress * circumference
            circle.style.strokeDasharray = `${circumference} ${circumference}`
            circle.style.strokeDashoffset = offset
        }
    }

    // Mouse events
    coinElement.addEventListener('mousedown', startHold)
    coinElement.addEventListener('mouseup', endHold)
    coinElement.addEventListener('mouseleave', endHold)

    // Touch events for mobile
    coinElement.addEventListener('touchstart', startHold, { passive: false })
    coinElement.addEventListener('touchend', endHold, { passive: false })
    coinElement.addEventListener('touchcancel', endHold, { passive: false })

    // Prevent context menu on long press
    coinElement.addEventListener('contextmenu', (e) => e.preventDefault())

    // Prevent click event from triggering flip
    // coinElement.addEventListener('click', (e) => {
    //     e.preventDefault()
    //     e.stopPropagation()
    // })
}

function showIncompleteMessage(coinElement) {
    let message = coinElement.parentElement.querySelector('.incomplete-message')
    if (!message) {
        message = document.createElement('div')
        message.className = 'incomplete-message'
        message.textContent = 'Maintenez plus longtemps !'
        coinElement.parentElement.appendChild(message)
    }
    message.classList.add('visible')

    setTimeout(() => {
        message.classList.remove('visible')
    }, 1000)
}

function showHoldInstruction(coinElement) {
    let instruction = coinElement.parentElement.querySelector('.hold-instruction')
    if (!instruction) {
        instruction = document.createElement('div')
        instruction.className = 'hold-instruction'
        instruction.textContent = 'Maintenez...'
        coinElement.parentElement.appendChild(instruction)
    }
    instruction.classList.add('visible')
}

function hideHoldInstruction(coinElement) {
    const instruction = coinElement.parentElement.querySelector('.hold-instruction')
    if (instruction) {
        instruction.classList.remove('visible')
    }
}

async function performCoinFlip(coinIndex, coinElement) {
    const gameCode = document.getElementById('game-code')?.textContent?.trim() || ''
    const apiUrl = document.getElementById('joinRoleModal')?.getAttribute('data-api-url') || ''
    const username = window.currentUsername

    if (!apiUrl || !gameCode || !username) {
        console.error('Missing required data for coin flip')
        return
    }

    // Visual feedback - immediate update
    coinElement.classList.add('flipped')
    coinElement.classList.remove('grayscale', 'tails', 'interactive', 'holdable')
    coinElement.classList.add('heads')
    coinElement.style.cursor = 'default'
    coinElement.title = 'Face - Prête à envoyer'

    // Remove all event listeners to prevent further interaction
    const newCoin = coinElement.cloneNode(true)
    newCoin.textContent = '🪙' // Ensure emoji is shown, not timer
    coinElement.parentNode.replaceChild(newCoin, coinElement)

    try {
        await flipCoin(apiUrl, gameCode, username, coinIndex)
        showNotification('🪙 Pièce retournée !', 'success')
    } catch (error) {
        console.error('Error flipping coin:', error)

        // Revert visual change if API call failed
        newCoin.classList.remove('flipped', 'heads')
        newCoin.classList.add('grayscale', 'tails')
        newCoin.style.cursor = 'grab'
        newCoin.title = 'Maintenez pendant 1.5s pour retourner'

        // Re-setup hold events for retry
        const progressRing = newCoin.parentElement.querySelector('.coin-progress-ring')
        if (progressRing) {
            setupCoinHoldEvents(newCoin, coinIndex, progressRing)
        }
    }
}

function addTimersSummary(gameState) {
    const gameBoard = document.getElementById('gameBoard')
    if (!gameBoard) return

    const timersSummary = document.createElement('div')
    timersSummary.className = 'timers-summary'
    timersSummary.innerHTML = '<h3>📊 Temps par Joueur</h3>'

    const timersGrid = document.createElement('div')
    timersGrid.className = 'timers-grid'

    gameState.players.forEach((player) => {
        const timer = gameState.player_timers[player]
        const timerInfo = formatPlayerTimer(timer)

        const timerCard = document.createElement('div')
        timerCard.className = `timer-card ${timerInfo.status}`
        timerCard.innerHTML = `
            <div class="timer-player">${player}</div>
            <div class="timer-value" data-player="${player}">${timerInfo.time}</div>
            <div class="timer-status">${timerInfo.statusText}</div>
        `
        timersGrid.appendChild(timerCard)
    })

    timersSummary.appendChild(timersGrid)
    gameBoard.appendChild(timersSummary)
}

function startRealTimeTimers(gameState) {
    // Clear any existing timer interval
    if (window.pennyGameTimerInterval) {
        clearInterval(window.pennyGameTimerInterval)
    }

    window.pennyGameTimerInterval = setInterval(() => {
        const now = new Date()

        // Update game timer
        if (gameState.started_at && !gameState.ended_at) {
            try {
                const startTime = new Date(gameState.started_at)
                if (!isNaN(startTime.getTime())) {
                    const currentDuration = Math.max(0, (now - startTime) / 1000)
                    const gameTimerDisplay = document.getElementById('gameTimerDisplay')
                    if (gameTimerDisplay) {
                        gameTimerDisplay.textContent = formatTime(currentDuration)
                    }
                }
            } catch (error) {
                console.error('Error updating game timer:', error)
            }
        }

        // Update player timers - only for players who have started but not finished
        if (gameState.player_timers) {
            Object.values(gameState.player_timers).forEach((timer) => {
                if (timer.started_at && !timer.ended_at) {
                    try {
                        const startTime = new Date(timer.started_at)
                        if (!isNaN(startTime.getTime())) {
                            const currentDuration = Math.max(0, (now - startTime) / 1000)
                            const timerElements = document.querySelectorAll(`[data-player="${timer.player}"]`)
                            timerElements.forEach((element) => {
                                element.textContent = formatTime(currentDuration)
                            })
                        }
                    } catch (error) {
                        console.error('Error updating player timer for', timer.player, error)
                    }
                }
            })
        }
    }, 1000) // Update every second
}

function stopRealTimeTimers() {
    if (window.pennyGameTimerInterval) {
        clearInterval(window.pennyGameTimerInterval)
        window.pennyGameTimerInterval = null
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

    // If game ended, stop real-time timers
    if (gameState.state === 'results') {
        stopRealTimeTimers()
    }
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

        // Stop timers when game is reset
        stopRealTimeTimers()
        console.log('Game reset successful')
    } catch (error) {
        console.error('Error resetting game:', error)
        showNotification(`Erreur lors de la réinitialisation: ${error.message}`, 'error')
    }
}

// Export utility functions for use in other modules
export { handleSendBatch, stopRealTimeTimers }
