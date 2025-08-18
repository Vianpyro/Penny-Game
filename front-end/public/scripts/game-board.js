// Game board logic for Penny Game with cooperative mechanics and timers
import { flipCoin } from './api.js'
import { showNotification } from './utility.js'
import { LEAN_TERMS, updateElementWithBilingualTerm } from './bilingual-terms.js';

const TOTAL_COINS = 15
const FLIP_HOLD_DURATION = 1000

// Track active interactions
const activeHolds = new Map() // coinKey -> { timer, interval, startTime, element }
const localFlipsInProgress = new Set() // Track coins being flipped locally

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

    // Timer is running
    if (timer.started_at && !timer.ended_at) {
        try {
            const startTime = new Date(timer.started_at)
            const currentTime = new Date()

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

// Store previous game state for comparison
let previousGameState = null

// Track if a send is in progress to prevent duplicates
let isSendingBatch = false

export function renderGameBoard(gameState) {
    const gameBoard = document.getElementById('gameBoard')
    if (!gameBoard || !gameState) return

    try {
        // Validate gameState has required properties
        if (!gameState.players || !gameState.player_coins) {
            console.error('Invalid game state structure:', gameState)
            return
        }

        // Check if this is an incremental update or full render
        const isIncrementalUpdate = previousGameState !== null

        if (!isIncrementalUpdate) {
            // Full render on first load
            fullRenderGameBoard(gameBoard, gameState)
        } else {
            // Check if we should do incremental or full update
            // Do full update if players changed or if sending is in progress
            const playersChanged = JSON.stringify(previousGameState.players) !== JSON.stringify(gameState.players)

            if (playersChanged || isSendingBatch) {
                // Do full render for major changes or during send
                fullRenderGameBoard(gameBoard, gameState)
            } else {
                // Incremental update to preserve interactions
                incrementalUpdateGameBoard(gameBoard, gameState)
            }
        }

        // Store state for next comparison (deep clone to avoid reference issues)
        previousGameState = JSON.parse(JSON.stringify(gameState))
    } catch (error) {
        console.error('Error rendering game board:', error)
        // Try to recover with a full render
        try {
            fullRenderGameBoard(gameBoard, gameState)
            previousGameState = JSON.parse(JSON.stringify(gameState))
        } catch (fallbackError) {
            console.error('Failed to recover with full render:', fallbackError)
        }
    }
}

function fullRenderGameBoard(gameBoard, gameState) {
    gameBoard.innerHTML = ''

    // Add game status header
    const gameStatus = createGameStatusElement(gameState)
    gameBoard.appendChild(gameStatus)

    // Add reset button for hosts
    if (window.isHost) {
        addResetButton()
    }

    // Add production line
    const productionLine = createProductionLineElement(gameState)
    gameBoard.appendChild(productionLine)

    // Add player timers summary if any exist
    if (gameState.player_timers && Object.keys(gameState.player_timers).length > 0) {
        addTimersSummary(gameState)
    }

    // Add game rules reminder
    const rulesReminder = createRulesReminderElement(gameState)
    gameBoard.appendChild(rulesReminder)

    // Fix coin display
    setTimeout(() => {
        document.querySelectorAll('.coin.flip').forEach((coin) => {
            if (!coin.textContent.includes('🪙')) {
                coin.innerHTML = '🪙'
            }
        })
    }, 0)
}

function incrementalUpdateGameBoard(gameBoard, gameState) {
    try {
        // Update game status
        updateGameStatus(gameState)

        // Update each player station incrementally
        gameState.players.forEach((player, index) => {
            try {
                updatePlayerStation(player, gameState, index)
            } catch (error) {
                console.error(`Error updating station for player ${player}:`, error)
                // If incremental update fails, do a full render for this station
                const station = document.getElementById(`station-${player}`)
                if (station && station.parentNode) {
                    const newStation = createPlayerStation(player, gameState, index)
                    station.parentNode.replaceChild(newStation, station)
                }
            }
        })

        // Update completion area
        updateCompletionArea(gameState)

        // Update timers if needed
        if (gameState.player_timers && Object.keys(gameState.player_timers).length > 0) {
            updateTimersSummary(gameState)
        }
    } catch (error) {
        console.error('Error in incremental update, falling back to full render:', error)
        // Fall back to full render if incremental fails
        fullRenderGameBoard(gameBoard, gameState)
    }
}

function updateGameStatus(gameState) {
    try {
        // Update game timer
        const gameTimerDisplay = document.getElementById('gameTimerDisplay')
        if (gameTimerDisplay) {
            let gameTimer = '--:--'
            if (gameState.game_duration_seconds !== null && gameState.game_duration_seconds !== undefined) {
                gameTimer = formatTime(gameState.game_duration_seconds)
            } else if (gameState.started_at) {
                const startTime = new Date(gameState.started_at)
                const currentTime = new Date()
                if (!isNaN(startTime.getTime())) {
                    const currentDuration = (currentTime - startTime) / 1000
                    gameTimer = formatTime(currentDuration)
                }
            }
            gameTimerDisplay.textContent = gameTimer
        }

        // Update progress stats
        const progressStats = document.querySelector('.progress-stats')
        if (progressStats) {
            // Calculate tails remaining if not provided
            let tailsRemaining = gameState.tails_remaining
            if (tailsRemaining === undefined || tailsRemaining === null) {
                tailsRemaining = 0
                if (gameState.player_coins) {
                    Object.values(gameState.player_coins).forEach((coins) => {
                        if (Array.isArray(coins)) {
                            tailsRemaining += coins.filter((coin) => !coin).length
                        }
                    })
                }
            }

            progressStats.innerHTML = `
                <span class="stat">🪙 Total: ${gameState.total_completed || 0}/${TOTAL_COINS} terminées</span>
                <span class="stat">⏳ ${tailsRemaining} pièces à traiter</span>
            `
        }
    } catch (error) {
        console.error('Error updating game status:', error)
    }
}

function updatePlayerStation(player, gameState, playerIndex) {
    try {
        const stationId = `station-${player}`
        let station = document.getElementById(stationId)

        const currentUsername = window.currentUsername
        const isCurrentPlayer = player === currentUsername
        const playerCoins = gameState.player_coins[player] || []

        // If station doesn't exist, create it
        if (!station) {
            const productionLine = document.querySelector('.production-line')
            if (productionLine) {
                station = createPlayerStation(player, gameState, playerIndex)

                // Find the right position to insert
                const completionArea = productionLine.querySelector('.completion-area')
                const allStations = productionLine.querySelectorAll('.player-station')

                // Insert at correct position
                if (playerIndex === 0 && productionLine.firstChild) {
                    productionLine.insertBefore(station, productionLine.firstChild)
                } else if (playerIndex < allStations.length) {
                    const nextStation = allStations[playerIndex]
                    if (nextStation && nextStation.parentNode === productionLine) {
                        productionLine.insertBefore(station, nextStation)
                    } else if (completionArea) {
                        productionLine.insertBefore(station, completionArea)
                    } else {
                        productionLine.appendChild(station)
                    }
                } else if (completionArea) {
                    productionLine.insertBefore(station, completionArea)
                } else {
                    productionLine.appendChild(station)
                }

                // Add flow arrow if needed
                if (playerIndex < gameState.players.length - 1) {
                    const arrow = document.createElement('div')
                    arrow.className = 'flow-arrow'
                    arrow.innerHTML = '➡️'
                    station.parentNode.insertBefore(arrow, station.nextSibling)
                }
            }
            return
        }

        // Update existing station
        updateStationStats(station, playerCoins)
        updateStationTimer(station, player, gameState.player_timers)
        updateStationCoins(station, player, playerCoins, gameState, isCurrentPlayer)
        updateStationActions(station, player, playerCoins, gameState, isCurrentPlayer, playerIndex)
    } catch (error) {
        console.error(`Error updating player station for ${player}:`, error)
        // Try to recover by creating a new station
        const productionLine = document.querySelector('.production-line')
        if (productionLine) {
            const oldStation = document.getElementById(`station-${player}`)
            const newStation = createPlayerStation(player, gameState, playerIndex)
            if (oldStation && oldStation.parentNode) {
                oldStation.parentNode.replaceChild(newStation, oldStation)
            } else {
                productionLine.appendChild(newStation)
            }
        }
    }
}

function updateStationStats(station, playerCoins) {
    try {
        // Ensure playerCoins is a valid array
        if (!Array.isArray(playerCoins)) {
            playerCoins = []
        }

        const tailsCount = playerCoins.filter((coin) => coin === false).length
        const headsCount = playerCoins.filter((coin) => coin === true).length
        const totalCoins = playerCoins.length

        const statsContainer = station.querySelector('.station-stats')
        if (statsContainer) {
            statsContainer.innerHTML = `
                <span class="stat">🪙 ${totalCoins} pièces</span>
                <span class="stat"><div class="flip">🪙</div> ${tailsCount} à retourner</span>
                <span class="stat">🟡 ${headsCount} prêtes</span>
            `
        }
    } catch (error) {
        console.error('Error updating station stats:', error)
    }
}

function updateStationTimer(station, player, playerTimers) {
    try {
        const timerElement = station.querySelector('.player-timer')
        if (timerElement && playerTimers && playerTimers[player]) {
            const timerInfo = formatPlayerTimer(playerTimers[player])

            timerElement.className = `player-timer ${timerInfo.status}`
            const timerTime = timerElement.querySelector('.timer-time')
            const timerStatus = timerElement.querySelector('.timer-status')

            if (timerTime) timerTime.textContent = timerInfo.time
            if (timerStatus) timerStatus.textContent = timerInfo.statusText
        }
    } catch (error) {
        console.error(`Error updating timer for player ${player}:`, error)
    }
}

function updateStationCoins(station, player, playerCoins, gameState, isCurrentPlayer) {
    try {
        const coinsContainer = station.querySelector('.coins-container')
        if (!coinsContainer) {
            console.warn(`No coins container found for player ${player}`)
            return
        }

        const isHost = window.isHost
        const canInteract = isCurrentPlayer && !isHost && window.userRole === 'player'

        // Ensure playerCoins is an array
        if (!Array.isArray(playerCoins)) {
            console.warn(`Invalid playerCoins for ${player}:`, playerCoins)
            playerCoins = []
        }

        // Get existing coin wrappers as a real array
        const existingWrappers = Array.from(coinsContainer.querySelectorAll('.coin-wrapper'))

        // Handle empty state
        if (playerCoins.length === 0) {
            coinsContainer.innerHTML = ''
            const emptyMessage = document.createElement('div')
            emptyMessage.className = 'empty-station'
            emptyMessage.textContent = 'En attente de pièces...'
            coinsContainer.appendChild(emptyMessage)
            return
        }

        // Remove empty message if it exists
        const emptyMessage = coinsContainer.querySelector('.empty-station')
        if (emptyMessage) {
            emptyMessage.remove()
        }

        // Update or create coins
        playerCoins.forEach((isHeads, index) => {
            const coinKey = `${player}-${index}`

            // Check if this coin is being held locally
            const isBeingHeld = activeHolds.has(coinKey)
            const isLocalFlip = localFlipsInProgress.has(coinKey)

            // Skip update if this is the current player's coin being interacted with
            if (isCurrentPlayer && (isBeingHeld || isLocalFlip)) {
                return
            }

            const existingWrapper = existingWrappers[index]

            if (!existingWrapper) {
                // Create new coin wrapper
                const newWrapper = createCoinElement(player, index, isHeads, canInteract)
                coinsContainer.appendChild(newWrapper)
            } else {
                // Update existing coin
                const coin = existingWrapper.querySelector('.coin')
                if (!coin) {
                    console.warn(`No coin element found in wrapper for ${coinKey}`)
                    return
                }

                const wasHeads = coin.classList.contains('heads')

                if (wasHeads !== isHeads) {
                    // State changed - update the coin
                    updateCoinState(coin, isHeads, canInteract)

                    // Re-setup events if needed
                    if (canInteract && !isHeads) {
                        const progressRing = existingWrapper.querySelector('.coin-progress-ring')
                        // Clone to remove old event listeners
                        const newCoin = coin.cloneNode(true)
                        newCoin.textContent = '🪙'
                        coin.parentNode.replaceChild(newCoin, coin)
                        setupCoinHoldEvents(newCoin, index, progressRing)
                    }
                }
            }
        })

        // Remove extra coin wrappers (from the end)
        for (let i = existingWrappers.length - 1; i >= playerCoins.length; i--) {
            const wrapper = existingWrappers[i]
            if (wrapper && wrapper.parentNode === coinsContainer) {
                // Clean up any active holds for this coin
                const coinKey = `${player}-${i}`
                activeHolds.delete(coinKey)
                localFlipsInProgress.delete(coinKey)

                wrapper.remove()
            }
        }
    } catch (error) {
        console.error(`Error updating coins for player ${player}:`, error)
    }
}

function updateCoinState(coin, isHeads, canInteract) {
    // Clear classes
    coin.classList.remove('heads', 'tails', 'grayscale', 'interactive', 'holdable', 'clickable')

    // Set new state
    if (isHeads) {
        coin.classList.add('heads')
        coin.title = 'Face - Prête à envoyer'
        coin.style.cursor = 'default'
    } else {
        coin.classList.add('tails', 'grayscale')
        if (canInteract) {
            coin.classList.add('interactive', 'holdable')
            coin.style.cursor = 'grab'
            coin.title = 'Maintenez pendant 1.5s pour retourner'
        }
    }

    coin.textContent = '🪙'
}

function updateStationActions(station, player, playerCoins, gameState, isCurrentPlayer, playerIndex) {
    const isHost = window.isHost
    const canInteract = isCurrentPlayer && !isHost && window.userRole === 'player'

    if (!canInteract) {
        // Remove actions if player can't interact
        const existingActions = station.querySelector('.station-actions')
        if (existingActions) {
            existingActions.remove()
        }
        return
    }

    const headsCount = playerCoins.filter((coin) => coin).length
    const totalCoins = playerCoins.length
    const canSend = headsCount >= gameState.batch_size || (headsCount > 0 && headsCount === totalCoins)

    let actionsContainer = station.querySelector('.station-actions')

    // Check if we're currently sending (don't update while sending)
    if (isSendingBatch && actionsContainer) {
        const existingButton = actionsContainer.querySelector('button')
        if (existingButton && existingButton.disabled && existingButton.textContent === 'Envoi en cours...') {
            // Don't update while sending
            return
        }
    }

    if (totalCoins > 0) {
        if (!actionsContainer) {
            actionsContainer = document.createElement('div')
            actionsContainer.className = 'station-actions'
            station.appendChild(actionsContainer)
        }

        // Clear and recreate button to avoid reference issues
        actionsContainer.innerHTML = ''

        const sendButton = document.createElement('button')
        sendButton.className = `btn ${canSend ? 'btn-primary' : 'btn-disabled'}`
        sendButton.textContent =
            playerIndex === gameState.players.length - 1
                ? `Terminer ${headsCount} pièce${headsCount > 1 ? 's' : ''}`
                : `Envoyer lot (${headsCount}/${gameState.batch_size})`
        sendButton.disabled = !canSend

        if (canSend) {
            sendButton.addEventListener('click', async (e) => {
                e.preventDefault()
                e.stopPropagation()

                // Get fresh references at click time
                const btn = e.currentTarget
                if (!btn || btn.disabled) return

                // Disable button immediately
                btn.disabled = true
                const originalText = btn.textContent
                btn.textContent = 'Envoi en cours...'

                try {
                    await handleSendBatch()
                    // Success - the websocket will update the UI
                } catch (error) {
                    console.error('Error in send batch handler:', error)
                    // Re-enable button on error only if it still exists
                    const currentBtn = station.querySelector('.station-actions button')
                    if (currentBtn && currentBtn === btn) {
                        currentBtn.disabled = false
                        currentBtn.textContent = originalText
                    }
                }
            })
        } else {
            sendButton.title = `Retournez ${gameState.batch_size - headsCount} pièce${gameState.batch_size - headsCount > 1 ? 's' : ''} de plus`
        }

        actionsContainer.appendChild(sendButton)
    } else if (actionsContainer) {
        actionsContainer.remove()
    }
}

function updateCompletionArea(gameState) {
    try {
        const completedCoinsContainer = document.querySelector('.completed-coins')
        const completionCount = document.querySelector('.completion-count')

        const totalCompleted = gameState.total_completed || 0

        if (completedCoinsContainer) {
            completedCoinsContainer.innerHTML = Array(totalCompleted).fill('🪙').join('')
        }

        if (completionCount) {
            completionCount.textContent = `${totalCompleted}/${TOTAL_COINS}`
        }
    } catch (error) {
        console.error('Error updating completion area:', error)
    }
}

function updateTimersSummary(gameState) {
    try {
        if (!gameState.players || !Array.isArray(gameState.players)) {
            return
        }

        gameState.players.forEach((player) => {
            const timerElement = document.querySelector(`.timer-value[data-player="${player}"]`)
            if (timerElement && gameState.player_timers && gameState.player_timers[player]) {
                const timerInfo = formatPlayerTimer(gameState.player_timers[player])
                timerElement.textContent = timerInfo.time

                const timerCard = timerElement.closest('.timer-card')
                if (timerCard) {
                    timerCard.className = `timer-card ${timerInfo.status}`
                    const statusElement = timerCard.querySelector('.timer-status')
                    if (statusElement) {
                        statusElement.textContent = timerInfo.statusText
                    }
                }
            }
        })
    } catch (error) {
        console.error('Error updating timers summary:', error)
    }
}

function createGameStatusElement(gameState) {
    const gameStatus = document.createElement('div')
    gameStatus.className = 'game-status'

    let gameTimer = '--:--'
    if (gameState.game_duration_seconds !== null && gameState.game_duration_seconds !== undefined) {
        gameTimer = formatTime(gameState.game_duration_seconds)
    } else if (gameState.started_at) {
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

    return gameStatus
}

function createProductionLineElement(gameState) {
    const productionLine = document.createElement('div')
    productionLine.className = 'production-line'

    gameState.players.forEach((player, index) => {
        const playerStation = createPlayerStation(player, gameState, index)
        productionLine.appendChild(playerStation)

        // Add arrow between players
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

    return productionLine
}

function createRulesReminderElement(gameState) {
    const rulesReminder = document.createElement('div')
    rulesReminder.className = 'rules-reminder'
    rulesReminder.innerHTML = `
        <h4>📋 Rappel des règles (Game Rules):</h4>
        <ul>
            <li>🔄 Retournez les pièces de pile (<div class="flip">🪙</div>) vers face (🪙)</li>
            <li>📦 Envoyez par ${LEAN_TERMS.BATCH_SIZE} de ${gameState.batch_size} pièce${gameState.batch_size > 1 ? 's' : ''}</li>
            <li>⚡ Travaillez en parallèle pour optimiser le ${LEAN_TERMS.FLOW} !</li>
            <li>🎯 Objectif : minimiser le ${LEAN_TERMS.LEAD_TIME} ensemble</li>
            <li>🪙 ${TOTAL_COINS} pièces au total à traiter</li>
            <li>💡 Identifiez les ${LEAN_TERMS.BOTTLENECK} et réduisez le ${LEAN_TERMS.WASTE} !</li>
        </ul>
    `

    return rulesReminder
}

function createPlayerStation(player, gameState, playerIndex) {
    const station = document.createElement('div')
    station.className = 'player-station'
    station.id = `station-${player}`

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
            <span class="stat"><div class="flip">🪙</div> ${tailsCount} à retourner</span>
            <span class="stat">🟡 ${headsCount} prêtes</span>
        </div>
    `

    // Add coins display
    const coinsContainer = document.createElement('div')
    coinsContainer.className = 'coins-container'

    if (totalCoins > 0) {
        playerCoins.forEach((isHeads, index) => {
            const coinWrapper = createCoinElement(player, index, isHeads, canInteract)
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
            sendButton.addEventListener('click', async (e) => {
                e.preventDefault()
                e.stopPropagation()
                try {
                    await handleSendBatch()
                } catch (error) {
                    console.error('Error in send batch handler:', error)
                }
            })
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

function createCoinElement(player, index, isHeads, canInteract) {
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
        setupCoinHoldEvents(coin, index, progressRing)
    } else if (isHeads) {
        coin.classList.add('ready')
        coin.title = 'Face - Prête à envoyer'
    }

    return coinWrapper
}

function setupCoinHoldEvents(coinElement, coinIndex, progressRing) {
    const player = coinElement.dataset.player
    const coinKey = `${player}-${coinIndex}`

    let holdTimer = null
    let progressInterval = null
    let startTime = null
    let isHolding = false
    let flipCompleted = false

    const startHold = (e) => {
        e.preventDefault()
        e.stopPropagation()

        if (isHolding || flipCompleted) return

        isHolding = true
        flipCompleted = false
        startTime = Date.now()

        // Store active hold
        activeHolds.set(coinKey, {
            timer: holdTimer,
            interval: progressInterval,
            startTime: startTime,
            element: coinElement,
        })

        // Visual feedback
        coinElement.classList.add('holding')
        coinElement.style.cursor = 'grabbing'
        progressRing.classList.add('active')

        showHoldInstruction(coinElement)
        updateProgress(0)

        progressInterval = setInterval(() => {
            const elapsed = Date.now() - startTime
            const progress = Math.min(elapsed / FLIP_HOLD_DURATION, 1)
            updateProgress(progress)

            if (progress >= 1 && !flipCompleted) {
                flipCompleted = true
                completeFlip()
            }
        }, 16)

        // Update stored interval
        const holdData = activeHolds.get(coinKey)
        if (holdData) {
            holdData.interval = progressInterval
        }
    }

    const endHold = (e) => {
        e.preventDefault()
        e.stopPropagation()

        if (!isHolding) return

        const elapsed = startTime ? Date.now() - startTime : 0
        const progress = elapsed / FLIP_HOLD_DURATION

        if (progress < 1 && !flipCompleted) {
            isHolding = false

            if (progressInterval) {
                clearInterval(progressInterval)
                progressInterval = null
            }

            // Remove from active holds
            activeHolds.delete(coinKey)

            // Reset visual feedback
            coinElement.classList.remove('holding')
            coinElement.style.cursor = 'grab'
            progressRing.classList.remove('active')
            updateProgress(0)
            hideHoldInstruction(coinElement)

            showIncompleteMessage(coinElement)
        }
    }

    const completeFlip = () => {
        if (progressInterval) {
            clearInterval(progressInterval)
            progressInterval = null
        }

        // Hide instruction immediately before any DOM changes
        hideHoldInstruction(coinElement)

        // Remove from active holds
        activeHolds.delete(coinKey)

        // Add to local flips in progress
        localFlipsInProgress.add(coinKey)

        // Success feedback
        coinElement.classList.add('flip-success')
        progressRing.classList.add('complete')

        performCoinFlip(coinIndex, coinElement)

        setTimeout(() => {
            coinElement.classList.remove('holding', 'flip-success')
            progressRing.classList.remove('active', 'complete')
            updateProgress(0)
            isHolding = false
            flipCompleted = false

            // Remove from local flips after animation
            setTimeout(() => {
                localFlipsInProgress.delete(coinKey)
            }, 500)
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

    // Event listeners
    coinElement.addEventListener('mousedown', startHold)
    coinElement.addEventListener('mouseup', endHold)
    coinElement.addEventListener('mouseleave', endHold)
    coinElement.addEventListener('touchstart', startHold, { passive: false })
    coinElement.addEventListener('touchend', endHold, { passive: false })
    coinElement.addEventListener('touchcancel', endHold, { passive: false })
    coinElement.addEventListener('contextmenu', (e) => e.preventDefault())
}

function showIncompleteMessage(coinElement) {
    const coinWrapper = coinElement.parentElement
    if (!coinWrapper) return

    let message = coinWrapper.querySelector('.incomplete-message')
    if (!message) {
        message = document.createElement('div')
        message.className = 'incomplete-message'
        message.textContent = 'Maintenez plus longtemps !'
        coinWrapper.appendChild(message)
    }

    // Show message
    setTimeout(() => {
        message.classList.add('visible')
    }, 10)

    // Hide and remove after delay
    setTimeout(() => {
        message.classList.remove('visible')
        setTimeout(() => {
            if (message.parentNode) {
                message.remove()
            }
        }, 200)
    }, 1000)
}

function showHoldInstruction(coinElement) {
    const coinWrapper = coinElement.parentElement
    if (!coinWrapper) return

    let instruction = coinWrapper.querySelector('.hold-instruction')
    if (!instruction) {
        instruction = document.createElement('div')
        instruction.className = 'hold-instruction'
        instruction.textContent = 'Maintenez...'
        coinWrapper.appendChild(instruction)
    }
    // Small delay to ensure animation works
    setTimeout(() => {
        instruction.classList.add('visible')
    }, 10)
}

function hideHoldInstruction(coinElement) {
    // Find instruction in the parent wrapper
    const coinWrapper = coinElement.parentElement
    if (coinWrapper) {
        const instruction = coinWrapper.querySelector('.hold-instruction')
        if (instruction) {
            instruction.classList.remove('visible')
            // Also remove the element after animation
            setTimeout(() => {
                if (instruction.parentNode) {
                    instruction.remove()
                }
            }, 200)
        }
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

    // Hide hold instruction before replacing element
    hideHoldInstruction(coinElement)

    // Visual feedback - immediate update
    coinElement.classList.add('flipped')
    coinElement.classList.remove('grayscale', 'tails', 'interactive', 'holdable')
    coinElement.classList.add('heads')
    coinElement.style.cursor = 'default'
    coinElement.title = 'Face - Prête à envoyer'

    // Remove event listeners
    const newCoin = coinElement.cloneNode(true)
    newCoin.textContent = '🪙'
    coinElement.parentNode.replaceChild(newCoin, coinElement)

    try {
        await flipCoin(apiUrl, gameCode, username, coinIndex)
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

    // Check if summary already exists
    let timersSummary = gameBoard.querySelector('.timers-summary')
    if (!timersSummary) {
        timersSummary = document.createElement('div')
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
}

async function handleSendBatch() {
    // Prevent duplicate sends
    if (isSendingBatch) {
        console.log('Send batch already in progress, skipping')
        return
    }

    const gameCode = document.getElementById('game-code')?.textContent?.trim()
    const apiUrl = document.getElementById('joinRoleModal')?.getAttribute('data-api-url')
    const username = window.currentUsername

    if (!apiUrl || !gameCode || !username) {
        console.error('Missing required data for send batch:', {
            apiUrl: !!apiUrl,
            gameCode: !!gameCode,
            username: !!username,
        })
        throw new Error('Missing required data')
    }

    if (window.isHost === true) {
        showNotification('Les hôtes ne peuvent pas jouer', 'error')
        throw new Error('Host cannot play')
    }

    if (window.userRole !== 'player') {
        showNotification('Seuls les joueurs peuvent envoyer des lots', 'error')
        throw new Error('Not a player')
    }

    if (!window.gameState || window.gameState.state !== 'active') {
        showNotification("La partie n'est pas active", 'error')
        throw new Error('Game not active')
    }

    // Set flag to prevent duplicate sends
    isSendingBatch = true
    console.log('Starting batch send for user:', username)

    try {
        const response = await fetch(`${apiUrl}/game/send/${gameCode}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({ username: username }),
            credentials: 'include',
        })

        if (!response.ok) {
            let errorMessage = "Erreur lors de l'envoi du lot"
            try {
                const errorData = await response.json()
                errorMessage = errorData.detail || errorMessage
            } catch (e) {
                console.error('Could not parse error response:', e)
            }
            throw new Error(errorMessage)
        }

        const data = await response.json()
        console.log('Batch sent successfully:', data)
        // Success notification will be shown by websocket update
        return data
    } catch (error) {
        console.error('Error sending batch:', error)

        // Show user-friendly error message
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
            showNotification('Erreur de connexion au serveur', 'error')
        } else if (error.message) {
            showNotification(`Erreur: ${error.message}`, 'error')
        } else {
            showNotification("Erreur lors de l'envoi du lot", 'error')
        }

        // Re-throw to let the button handler know there was an error
        throw error
    } finally {
        // Always reset the flag
        console.log('Resetting isSendingBatch flag')
        isSendingBatch = false
    }
}

export function updateGameUI(gameState) {
    if (!gameState) return

    // Update batch size display if changed
    const batchSizeSelectors = document.querySelectorAll('.batch-size-option')
    batchSizeSelectors.forEach((option) => {
        const size = parseInt(option.dataset.size)
        option.classList.toggle('active', size === gameState.batch_size)
    })
}

export function addResetButton() {
    const gameBoard = document.getElementById('gameBoard')
    if (!gameBoard) return

    // Check if button already exists
    if (gameBoard.querySelector('#resetGameBtn')) return

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

// Clear state on game reset
function clearGameBoardState() {
    previousGameState = null
    activeHolds.clear()
    localFlipsInProgress.clear()
    isSendingBatch = false
}

// Export utility functions
export { clearGameBoardState }
