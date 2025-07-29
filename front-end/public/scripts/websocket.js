// front-end/public/scripts/websocket.js
// WebSocket logic for Penny Game with timer support - REFACTORED VERSION

import { renderPlayers, renderSpectators } from './dom.js'
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
            case 'game_over':
                handleGameOver(msg)
                break
            case 'game_reset':
                handleGameReset(msg)
                break
            case 'batch_size_update':
                handleBatchSizeUpdate(msg)
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

        // Set user role and host status
        window.isHost = gameState.host === window.currentUsername
        window.userRole = gameState.players.includes(window.currentUsername) ? 'player' : 'spectator'

        // Update user lists with empty activity (will be updated by activity message)
        const emptyActivity = {}
        renderPlayers(gameState.players, gameState.host, gameState.spectators, emptyActivity, addDnDEvents)
        renderSpectators(gameState.spectators, gameState.host, emptyActivity, addDnDEvents)

        // Update batch size display
        updateBatchSizeDisplay(gameState.batch_size)

        // Update game board if in active state
        if (gameState.state === 'active') {
            ViewManager.switchToGameView()
            renderGameBoard(gameState)
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

    // Only show notification for new players joining, not for role changes
    if (!msg.note) {
        const roleText = msg.role === 'player' ? 'joueur' : 'spectateur'
        showNotification(`${msg.username} a rejoint en tant que ${roleText}`, 'info')
    }
}

function handleActivityUpdate(msg) {
    renderPlayers(msg.players, msg.host, msg.spectators, msg.activity, addDnDEvents)
    renderSpectators(msg.spectators, msg.host, msg.activity, addDnDEvents)

    // Update global state
    if (window.gameState) {
        window.gameState.players = msg.players
        window.gameState.spectators = msg.spectators
        window.gameState.host = msg.host
    }
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
        player_coins: msg.player_coins,
        sent_coins: msg.sent_coins || {},
        total_completed: msg.total_completed,
        tails_remaining: msg.tails_remaining,
        state: 'active',
        player_timers: msg.player_timers || {},
        game_duration_seconds: null,
        started_at: new Date().toISOString(), // Set start time for real-time timer
        ended_at: null,
    }

    renderGameBoard(gameState)
    window.gameState = gameState
    showNotification('🎮 La partie a commencé ! Travaillez ensemble !', 'success')
}

function handleGameOver(msg) {
    ViewManager.switchToResultsView()
    stopRealTimeTimers() // Stop all timers when game ends
    showNotification('🎯 Partie terminée ! Félicitations à tous !', 'success')
    updateResultsDisplay(msg.final_state)
}

function handleGameReset(msg) {
    ViewManager.switchToLobbyView()
    stopRealTimeTimers() // Stop all timers when game resets
    updateBatchSizeDisplay(msg.batch_size)
    showNotification('🔄 La partie a été réinitialisée', 'info')

    // Clear timer data from global state
    if (window.gameState) {
        window.gameState.player_timers = {}
        window.gameState.game_duration_seconds = null
        window.gameState.started_at = null
        window.gameState.ended_at = null
    }
}

function handleBatchSizeUpdate(msg) {
    updateBatchSizeDisplay(msg.batch_size)

    // Update global game state
    if (window.gameState) {
        window.gameState.batch_size = msg.batch_size
    }

    showNotification(`📦 Taille de lot changée: ${msg.batch_size}`, 'info')
}

function handleUserStatusChange(msg) {
    // Only show notifications for disconnections, not connections to reduce noise
    if (msg.type === 'user_disconnected' && msg.message) {
        showNotification(msg.message, 'info')
    }
}

function handleHostDisconnected(msg) {
    stopRealTimeTimers() // Stop timers if host disconnects
    alert("La salle a été fermée car l'hôte a quitté.")
    window.location.reload()
}

function updateBatchSizeDisplay(batchSize) {
    // Update batch size in round selector
    const roundOptions = document.querySelectorAll('.round-option')
    roundOptions.forEach((option, index) => {
        const expectedSize = [12, 4, 1][index]
        option.classList.toggle('active', expectedSize === batchSize)
    })

    // Update any batch size displays
    const batchDisplays = document.querySelectorAll('.batch-size-display')
    batchDisplays.forEach((display) => {
        display.textContent = batchSize
    })
}

function calculateTailsRemaining(playerCoins) {
    let total = 0
    Object.values(playerCoins).forEach((coins) => {
        total += coins.filter((coin) => !coin).length
    })
    return total
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

    // Update statistics
    const statsGrid = document.getElementById('statsGrid')
    if (statsGrid && finalState.players) {
        statsGrid.innerHTML = ''

        // Add batch size info
        const batchCard = document.createElement('div')
        batchCard.className = 'stat-card'
        batchCard.innerHTML = `
            <div class="stat-value">${finalState.batch_size}</div>
            <div class="stat-label">Taille de lot</div>
        `
        statsGrid.appendChild(batchCard)

        // Add total completed
        const completedCard = document.createElement('div')
        completedCard.className = 'stat-card'
        completedCard.innerHTML = `
            <div class="stat-value">${finalState.total_completed || 0}/12</div>
            <div class="stat-label">Pièces terminées</div>
        `
        statsGrid.appendChild(completedCard)

        // Add player count
        const playersCard = document.createElement('div')
        playersCard.className = 'stat-card'
        playersCard.innerHTML = `
            <div class="stat-value">${finalState.players.length}</div>
            <div class="stat-label">Joueurs</div>
        `
        statsGrid.appendChild(playersCard)

        // Add efficiency insight
        if (finalState.game_duration_seconds && finalState.game_duration_seconds > 0) {
            const completedCoins = finalState.total_completed || 0
            const efficiency = Math.round((completedCoins / finalState.game_duration_seconds) * 60) // coins per minute

            const efficiencyCard = document.createElement('div')
            efficiencyCard.className = 'stat-card'
            efficiencyCard.innerHTML = `
                <div class="stat-value">${efficiency}</div>
                <div class="stat-label">Pièces/min</div>
            `
            statsGrid.appendChild(efficiencyCard)
        }

        // Add average player time using TimeUtils
        if (finalState.player_timers) {
            const validTimes = Object.values(finalState.player_timers)
                .filter((timer) => timer.duration_seconds !== null && timer.duration_seconds !== undefined)
                .map((timer) => timer.duration_seconds)

            if (validTimes.length > 0) {
                const avgTime = validTimes.reduce((sum, time) => sum + time, 0) / validTimes.length

                const avgCard = document.createElement('div')
                avgCard.className = 'stat-card'
                avgCard.innerHTML = `
                    <div class="stat-value">${TimeUtils.formatTime(avgTime)}</div>
                    <div class="stat-label">Temps moyen</div>
                `
                statsGrid.appendChild(avgCard)
            }
        }
    }

    // Show action buttons for hosts
    const resultsActions = document.getElementById('resultsActions')
    if (resultsActions && window.isHost) {
        resultsActions.style.display = ''
        // Use GameActions to setup buttons instead of duplicate code
        GameActions.setupStandardButtons()
    }

    // Show debug actions for hosts during development
    const debugActions = document.getElementById('debugActions')
    if (debugActions && window.isHost) {
        debugActions.style.display = ''
        // GameActions.setupStandardButtons() already handles the debug button
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

        stopRealTimeTimers() // Stop timers on connection loss
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
