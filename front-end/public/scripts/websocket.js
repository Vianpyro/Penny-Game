// front-end/public/scripts/websocket.js
// WebSocket logic for Penny Game with timer support and better host handling

import { renderPlayers, renderSpectators, updateRoundConfiguration, updatePlayerCountDisplay } from './dom.js'
import { addDnDEvents } from './dnd.js'
import { renderGameBoard, stopRealTimeTimers } from './game-board.js'
import { showNotification } from './utility.js'
import { ViewManager } from './view-manager.js'
import { TimeUtils } from './time-utils.js'
import { GameActions } from './game-actions.js'

export function handleWSMessage(data) {
    try {
        // Handle plain text messages (legacy chat format)
        if (typeof data === 'string' && !data.startsWith('{')) {
            if (data.includes('🔴') && data.includes('Host') && data.includes('left the room')) {
                alert("La salle a été fermée car l'hôte a quitté.")
                window.location.reload()
                return
            }
            return
        }

        const msg = JSON.parse(data)

        switch (msg.type) {
            case 'welcome':
                handleWelcomeMessage(msg)
                break
            case 'game_state':
                handleGameStateChange(msg)
                break
            case 'action_made':
                handleActionMade(msg)
                break
            case 'game_started':
                handleGameStarted(msg)
                break
            case 'round_started':
                handleRoundStarted(msg)
                break
            case 'round_complete':
                handleRoundComplete(msg)
                break
            case 'game_over':
                handleGameOver(msg)
                break
            case 'game_reset':
                handleGameReset(msg)
                break
            case 'round_config_update':
                handleRoundConfigUpdate(msg)
                break
            case 'activity':
                handleActivityUpdate(msg)
                break
            case 'user_joined':
                handleUserJoined(msg)
                break
            case 'user_connected':
            case 'user_reconnected':
            case 'user_disconnected':
                handleUserStatusChange(msg)
                break
            case 'host_disconnected':
                handleHostDisconnected(msg)
                break
            default:
                console.debug('Unknown message type:', msg.type, msg)
        }
    } catch (error) {
        console.error('Error parsing WS message:', error, data)
    }
}

function handleWelcomeMessage(msg) {
    const gameState = msg.game_state
    if (gameState) {
        // Update global game state immediately
        window.gameState = gameState

        // CRITICAL: Set user role and host status properly
        const currentUsername = window.currentUsername
        window.isHost = gameState.host === currentUsername
        window.userRole = gameState.players.includes(currentUsername) ? 'player' : 'spectator'

        console.debug('Welcome message - Host status:', {
            currentUsername,
            gameHost: gameState.host,
            isHost: window.isHost,
            userRole: window.userRole,
        })

        // Trigger role update event
        window.dispatchEvent(new CustomEvent('userrolechange'))

        // Trigger game state update event for configuration sync
        window.dispatchEvent(new CustomEvent('gamestateupdate'))

        // Update user lists with empty activity (will be updated by activity message)
        const emptyActivity = {}
        renderPlayers(gameState.players, gameState.host, gameState.spectators, emptyActivity, addDnDEvents)
        renderSpectators(gameState.spectators, gameState.host, emptyActivity, addDnDEvents)

        // Update round configuration display for all players
        if (gameState.round_type && gameState.required_players !== undefined) {
            updateRoundConfiguration(
                gameState.round_type,
                gameState.required_players,
                gameState.selected_batch_size,
                getTotalRounds(gameState.round_type)
            )

            // Show configuration info notification for joining players
            if (!window.isHost) {
                const roundTypeText =
                    {
                        single: '1 manche',
                        two_rounds: '2 manches',
                        three_rounds: '3 manches',
                    }[gameState.round_type] || gameState.round_type

                showNotification(`⚙️ Configuration: ${roundTypeText}, ${gameState.required_players} joueurs`, 'info')
            }
        }

        // Update player count display
        updatePlayerCountDisplay()

        // Update game board if in active state
        if (gameState.state === 'active') {
            ViewManager.switchToGameView()
            renderGameBoard(gameState)
        } else if (gameState.state === 'round_complete') {
            ViewManager.switchToRoundCompleteView()
        } else if (gameState.state === 'results') {
            ViewManager.switchToResultsView()
        }
    }
}

function handleUserJoined(msg) {
    // Update the user lists immediately
    const activity = {}
    if (msg.players) {
        msg.players.forEach((p) => (activity[p] = true))
    }
    if (msg.spectators) {
        msg.spectators.forEach((s) => (activity[s] = true))
    }
    if (msg.host) {
        activity[msg.host] = true
    }

    renderPlayers(msg.players, window.gameState?.host, msg.spectators, activity, addDnDEvents)
    renderSpectators(msg.spectators, window.gameState?.host, activity, addDnDEvents)

    // Update global state
    if (window.gameState) {
        window.gameState.players = msg.players
        window.gameState.spectators = msg.spectators
    }

    // Update player count display
    updatePlayerCountDisplay()

    // Only show notification for new players joining, not for role changes
    if (!msg.note) {
        const roleText = msg.role === 'player' ? 'joueur' : 'spectateur'
        showNotification(`${msg.username} a rejoint en tant que ${roleText}`, 'info')
    }
}

function handleActivityUpdate(msg) {
    renderPlayers(msg.players, msg.host, msg.spectators, msg.activity, addDnDEvents)
    renderSpectators(msg.spectators, msg.host, msg.activity, addDnDEvents)

    // Update global state and host status
    if (window.gameState) {
        window.gameState.players = msg.players
        window.gameState.spectators = msg.spectators
        window.gameState.host = msg.host
    }

    // Update host status if needed
    const wasHost = window.isHost
    window.isHost = msg.host === window.currentUsername

    if (wasHost !== window.isHost) {
        console.debug('Host status changed:', { wasHost, isHost: window.isHost })
        window.dispatchEvent(new CustomEvent('userrolechange'))
    }

    // Update player count display
    updatePlayerCountDisplay()
}

function handleRoundConfigUpdate(msg) {
    console.debug('Round config update received:', msg)

    // Update global game state
    if (window.gameState) {
        window.gameState.round_type = msg.round_type
        window.gameState.required_players = msg.required_players
        window.gameState.selected_batch_size = msg.selected_batch_size
    }

    // Update UI for all players
    updateRoundConfiguration(msg.round_type, msg.required_players, msg.selected_batch_size, msg.total_rounds)

    // Trigger game state update event for configuration sync
    window.dispatchEvent(new CustomEvent('gamestateupdate'))

    // Update player count display
    updatePlayerCountDisplay()

    // Show notification
    const roundTypeText =
        {
            single: '1 manche',
            two_rounds: '2 manches',
            three_rounds: '3 manches',
        }[msg.round_type] || msg.round_type

    showNotification(`⚙️ Configuration: ${roundTypeText}, ${msg.required_players} joueurs`, 'info')
}

function handleGameStateChange(msg) {
    switch (msg.state) {
        case 'lobby':
            ViewManager.switchToLobbyView()
            stopRealTimeTimers() // Stop timers when returning to lobby
            break
        case 'active':
            ViewManager.switchToGameView()
            break
        case 'round_complete':
            ViewManager.switchToRoundCompleteView()
            stopRealTimeTimers() // Stop timers when round ends
            break
        case 'results':
            ViewManager.switchToResultsView()
            stopRealTimeTimers() // Stop timers when game ends
            break
    }
}

function handleActionMade(msg) {
    // Create a mock game state from the message data with timer information
    const gameState = {
        players: window.gameState?.players || [],
        batch_size: window.gameState?.batch_size || 12,
        player_coins: msg.player_coins,
        sent_coins: msg.sent_coins,
        total_completed: msg.total_completed,
        tails_remaining: calculateTailsRemaining(msg.player_coins),
        state: msg.state,
        current_round: msg.current_round,
        player_timers: msg.player_timers || {},
        game_duration_seconds: msg.game_duration_seconds,
        started_at: window.gameState?.started_at,
        ended_at: window.gameState?.ended_at,
    }

    // Update the game board
    renderGameBoard(gameState)

    // Only show notifications for send actions (batch sending), not for individual coin flips
    if (msg.action === 'send') {
        const isCompletion = msg.player === gameState.players[gameState.players.length - 1]
        if (isCompletion) {
            showNotification(
                `${msg.player} a terminé ${msg.batch_count} pièce${msg.batch_count > 1 ? 's' : ''}`,
                'success'
            )
        } else {
            showNotification(
                `${msg.player} a envoyé un lot de ${msg.batch_count} pièce${msg.batch_count > 1 ? 's' : ''}`,
                'info'
            )
        }
    }

    // Update global game state
    window.gameState = { ...window.gameState, ...gameState }
}

function handleGameStarted(msg) {
    ViewManager.switchToGameView()

    const gameState = {
        players: msg.players,
        batch_size: msg.batch_size,
        current_round: msg.current_round,
        total_rounds: msg.total_rounds,
        round_type: msg.round_type,
        player_coins: msg.player_coins,
        sent_coins: msg.sent_coins || {},
        total_completed: msg.total_completed,
        tails_remaining: msg.tails_remaining,
        state: 'active',
        player_timers: msg.player_timers || {},
        game_duration_seconds: null,
        started_at: new Date().toISOString(),
        ended_at: null,
    }

    renderGameBoard(gameState)
    window.gameState = { ...window.gameState, ...gameState }

    const roundText = msg.total_rounds > 1 ? ` (Manche ${msg.current_round}/${msg.total_rounds})` : ''
    showNotification(`🎮 Partie démarrée${roundText} ! Travaillez ensemble !`, 'success')
}

function handleRoundStarted(msg) {
    ViewManager.switchToGameView()

    const gameState = {
        ...window.gameState,
        batch_size: msg.batch_size,
        current_round: msg.current_round,
        total_rounds: msg.total_rounds,
        player_coins: msg.player_coins,
        sent_coins: msg.sent_coins || {},
        total_completed: msg.total_completed,
        tails_remaining: msg.tails_remaining,
        state: 'active',
        player_timers: msg.player_timers || {},
        game_duration_seconds: null,
        started_at: new Date().toISOString(),
        ended_at: null,
    }

    renderGameBoard(gameState)
    window.gameState = gameState
    showNotification(`🚀 Manche ${msg.current_round}/${msg.total_rounds} démarrée !`, 'success')
}

function handleRoundComplete(msg) {
    ViewManager.switchToRoundCompleteView()
    stopRealTimeTimers()

    // Update round complete screen with enhanced timer display
    updateRoundCompleteDisplay(msg)

    const nextText = msg.next_round ? ` Manche ${msg.next_round} disponible !` : ' Toutes les manches terminées !'
    showNotification(`✅ Manche ${msg.round_number} terminée !${nextText}`, 'success')
}

function updateProgressBar(currentRound, totalRounds) {
    const roundProgressBar = document.getElementById('roundProgressBar')
    const currentProgressRound = document.getElementById('currentProgressRound')
    const totalProgressRounds = document.getElementById('totalProgressRounds')

    if (roundProgressBar) {
        roundProgressBar.innerHTML = ''

        // Create progress dots
        for (let i = 1; i <= totalRounds; i++) {
            const dot = document.createElement('div')
            dot.className = 'progress-dot'
            dot.textContent = i

            if (i < currentRound) {
                dot.classList.add('completed')
            } else if (i === currentRound) {
                dot.classList.add('current')
            }

            roundProgressBar.appendChild(dot)

            // Add arrow between dots (except after last dot)
            if (i < totalRounds) {
                const arrow = document.createElement('div')
                arrow.className = 'progress-arrow'
                arrow.textContent = '→'
                roundProgressBar.appendChild(arrow)
            }
        }
    }

    if (currentProgressRound) currentProgressRound.textContent = currentRound
    if (totalProgressRounds) totalProgressRounds.textContent = totalRounds
}

// Enhanced updateRoundCompleteDisplay function (replace the existing one)
function updateRoundCompleteDisplay(msg) {
    const roundCompleteSection = document.getElementById('roundComplete')
    if (!roundCompleteSection) return

    const completedRoundNumber = document.getElementById('completedRoundNumber')
    const completedBatchSize = document.getElementById('completedBatchSize')
    const completedRoundTime = document.getElementById('completedRoundTime')
    const nextRoundSection = document.getElementById('nextRoundSection')
    const gameCompleteSection = document.getElementById('gameCompleteSection')
    const nextRoundNumber = document.getElementById('nextRoundNumber')
    const nextBatchSize = document.getElementById('nextBatchSize')
    const nextBatchSizeDesc = document.getElementById('nextBatchSizeDesc')
    const nextRoundBtn = document.getElementById('nextRoundBtn')

    // Update basic round info
    if (completedRoundNumber) completedRoundNumber.textContent = msg.round_number
    if (completedBatchSize) completedBatchSize.textContent = msg.round_result?.batch_size || 'N/A'
    if (completedRoundTime && msg.round_result?.game_duration_seconds) {
        completedRoundTime.textContent = TimeUtils.formatTime(msg.round_result.game_duration_seconds)
    }

    // Update individual player timers - THIS IS THE KEY NEW FUNCTIONALITY
    updatePlayerTimersDisplay(msg.round_result)

    // Update round statistics
    updateRoundStatistics(msg.round_result)

    // Update progress bar
    updateProgressBar(msg.round_number, getTotalRounds(window.gameState?.round_type || 'three_rounds'))

    // Handle next round or game completion
    if (msg.next_round && msg.batch_size) {
        // Show next round section
        if (nextRoundSection) nextRoundSection.style.display = 'block'
        if (gameCompleteSection) gameCompleteSection.style.display = 'none'

        if (nextRoundNumber) nextRoundNumber.textContent = msg.next_round
        if (nextBatchSize) nextBatchSize.textContent = msg.batch_size
        if (nextBatchSizeDesc) nextBatchSizeDesc.textContent = msg.batch_size
        if (nextRoundBtn) {
            nextRoundBtn.disabled = !window.isHost
            const nextRoundButtonNumber = nextRoundBtn.querySelector('#nextRoundButtonNumber')
            if (nextRoundButtonNumber) nextRoundButtonNumber.textContent = msg.next_round
        }
    } else {
        // Show game complete section
        if (nextRoundSection) nextRoundSection.style.display = 'none'
        if (gameCompleteSection) gameCompleteSection.style.display = 'block'
    }

    // Show round complete screen
    roundCompleteSection.style.display = 'block'
}

function handleGameOver(msg) {
    ViewManager.switchToResultsView()
    stopRealTimeTimers()
    showNotification('🎯 Partie terminée ! Félicitations à tous !', 'success')
    updateResultsDisplay(msg.final_state)
}

function handleGameReset(msg) {
    ViewManager.switchToLobbyView()
    stopRealTimeTimers()

    // Update round configuration if provided
    if (msg.round_type && msg.required_players !== undefined) {
        updateRoundConfiguration(
            msg.round_type,
            msg.required_players,
            msg.selected_batch_size,
            getTotalRounds(msg.round_type)
        )

        // Trigger game state update event for configuration sync
        window.dispatchEvent(new CustomEvent('gamestateupdate'))
    }

    updatePlayerCountDisplay()
    showNotification('🔄 La partie a été réinitialisée', 'info')

    // Clear timer data from global state
    if (window.gameState) {
        window.gameState.player_timers = {}
        window.gameState.game_duration_seconds = null
        window.gameState.started_at = null
        window.gameState.ended_at = null
        window.gameState.current_round = 0
    }
}

function handleUserStatusChange(msg) {
    // Only show notifications for disconnections, not connections to reduce noise
    if (msg.type === 'user_disconnected' && msg.message) {
        showNotification(msg.message, 'info')
    }
}

function handleHostDisconnected(msg) {
    stopRealTimeTimers()
    alert("La salle a été fermée car l'hôte a quitté.")
    window.location.reload()
}

function updatePlayerTimersDisplay(roundResult) {
    const playerTimersGrid = document.getElementById('roundPlayerTimersGrid')
    if (!playerTimersGrid || !roundResult || !roundResult.player_timers) return

    playerTimersGrid.innerHTML = ''

    // Sort players by completion time (completed players first, then by duration)
    const playerTimers = Object.values(roundResult.player_timers)
    const sortedTimers = playerTimers.sort((a, b) => {
        // Completed players first
        const aCompleted = a.ended_at && a.duration_seconds !== null && a.duration_seconds !== undefined
        const bCompleted = b.ended_at && b.duration_seconds !== null && b.duration_seconds !== undefined

        if (aCompleted && !bCompleted) return -1
        if (!aCompleted && bCompleted) return 1

        // Among completed players, sort by duration (fastest first)
        if (aCompleted && bCompleted) {
            return (a.duration_seconds || 0) - (b.duration_seconds || 0)
        }

        // Among non-completed players, maintain original order
        return 0
    })

    sortedTimers.forEach((timer, index) => {
        const timerInfo = TimeUtils.formatPlayerTimer(timer)

        const timerCard = document.createElement('div')
        timerCard.className = `player-timer-result ${timerInfo.status}`

        // Add ranking for completed players
        let rankingBadge = ''
        if (timerInfo.status === 'completed') {
            const rankEmojis = ['🥇', '🥈', '🥉', '🏅', '🏅']
            const emoji = rankEmojis[index] || '🏅'
            rankingBadge = `<div class="ranking-badge">${emoji} #${index + 1}</div>`
        }

        // Calculate efficiency if completed
        let efficiencyText = '--'
        if (timer.duration_seconds && timer.duration_seconds > 0) {
            const coinsProcessed = getCoinsProcessedByPlayer(timer.player, roundResult)
            const efficiency = TimeUtils.calculateEfficiency(coinsProcessed, timer.duration_seconds)
            efficiencyText = `${efficiency} p/min`
        }

        timerCard.innerHTML = `
            ${rankingBadge}
            <div class="player-name">${timer.player}</div>
            <div class="player-time">${timerInfo.time}</div>
            <div class="player-status">${timerInfo.statusText}</div>
            <div class="player-efficiency">${efficiencyText}</div>
        `

        playerTimersGrid.appendChild(timerCard)
    })
}

function updateRoundStatistics(roundResult) {
    if (!roundResult) return

    // Update total coins completed
    const totalCoinsCompleted = document.getElementById('totalCoinsCompleted')
    if (totalCoinsCompleted) {
        totalCoinsCompleted.textContent = roundResult.total_completed || 12
    }

    // Update participant count
    const participantCount = document.getElementById('participantCount')
    if (participantCount && roundResult.player_timers) {
        participantCount.textContent = Object.keys(roundResult.player_timers).length
    }

    // Calculate and update round efficiency (coins per minute for the whole round)
    const roundEfficiency = document.getElementById('roundEfficiency')
    if (roundEfficiency && roundResult.game_duration_seconds) {
        const totalCoins = roundResult.total_completed || 12
        const efficiency = TimeUtils.calculateEfficiency(totalCoins, roundResult.game_duration_seconds)
        roundEfficiency.textContent = `${efficiency}`
    }

    // Calculate and update average player time
    const avgPlayerTime = document.getElementById('avgPlayerTime')
    if (avgPlayerTime && roundResult.player_timers) {
        const completedTimers = Object.values(roundResult.player_timers).filter(
            (timer) => timer.duration_seconds !== null && timer.duration_seconds !== undefined
        )

        if (completedTimers.length > 0) {
            const totalTime = completedTimers.reduce((sum, timer) => sum + (timer.duration_seconds || 0), 0)
            const avgTime = totalTime / completedTimers.length
            avgPlayerTime.textContent = TimeUtils.formatTime(avgTime)
        } else {
            avgPlayerTime.textContent = '--:--'
        }
    }
}

function getCoinsProcessedByPlayer(playerName, roundResult) {
    // This is a simplified calculation - in a real implementation,
    // you might track the actual number of coins each player processed
    // For now, assume each player processed approximately the same amount
    const totalCoins = roundResult.total_completed || 12
    const playerCount = Object.keys(roundResult.player_timers || {}).length
    return Math.ceil(totalCoins / playerCount)
}

// Add this to the TimeUtils class for calculating efficiency
TimeUtils.calculateEfficiency = function (totalCoins, durationSeconds) {
    if (!durationSeconds || durationSeconds === 0) return 0
    return Math.round((totalCoins / durationSeconds) * 60 * 100) / 100 // Round to 2 decimal places
}

function calculateTailsRemaining(playerCoins) {
    let total = 0
    Object.values(playerCoins).forEach((coins) => {
        total += coins.filter((coin) => !coin).length
    })
    return total
}

function getTotalRounds(roundType) {
    switch (roundType) {
        case 'single':
            return 1
        case 'two_rounds':
            return 2
        case 'three_rounds':
            return 3
        default:
            return 1
    }
}

function updateResultsDisplay(finalState) {
    if (!finalState) return

    // Update game timer using TimeUtils
    const gameTimeSection = document.getElementById('gameTimeSection')
    const gameTimeValue = document.getElementById('gameTimeValue')

    if (gameTimeValue && finalState.game_duration_seconds !== null && finalState.game_duration_seconds !== undefined) {
        gameTimeValue.textContent = TimeUtils.formatTime(finalState.game_duration_seconds)
    } else if (gameTimeValue) {
        gameTimeValue.textContent = '--:--'
    }

    // Update player timers using TimeUtils
    const playerTimersGrid = document.getElementById('playerTimersGrid')
    if (playerTimersGrid && finalState.player_timers) {
        playerTimersGrid.innerHTML = ''

        Object.values(finalState.player_timers).forEach((timer) => {
            const timerCard = document.createElement('div')
            const timerInfo = TimeUtils.formatPlayerTimer(timer)

            timerCard.className = `player-timer-result ${timerInfo.status}`
            timerCard.innerHTML = `
                <div class="player-name">${timer.player}</div>
                <div class="player-time">${timerInfo.time}</div>
                <div class="player-status">${timerInfo.statusText}</div>
            `
            playerTimersGrid.appendChild(timerCard)
        })
    }

    // Update statistics and show action buttons for hosts
    const resultsActions = document.getElementById('resultsActions')
    if (resultsActions && window.isHost) {
        resultsActions.style.display = ''
        GameActions.setupStandardButtons()
    }
}

export function connectWebSocket(apiUrl, roomId, username) {
    if (!apiUrl || !roomId || !username) {
        console.error('Missing parameters for WebSocket connection')
        return
    }

    // Store username globally for later use
    window.currentUsername = username

    const wsUrl = apiUrl.replace(/^http/, 'ws') + `/ws/${roomId}/${encodeURIComponent(username)}`

    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
        showNotification('🔗 Connecté à la salle', 'success')
    }

    ws.onmessage = (event) => {
        handleWSMessage(event.data)
    }

    ws.onclose = (event) => {
        if (event.code === 4002) {
            // Host left, room closed
            return // Don't reload, handleHostDisconnected will handle this
        }

        stopRealTimeTimers()
        showNotification('❌ Connexion perdue', 'error')

        // Try to reconnect after a delay
        setTimeout(() => {
            if (confirm('Connexion perdue. Voulez-vous vous reconnecter ?')) {
                window.location.reload()
            }
        }, 1000)
    }

    ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        showNotification('❌ Erreur de connexion', 'error')
    }

    // Store websocket globally for other modules to use
    window.pennyGameWS = ws

    return ws
}
