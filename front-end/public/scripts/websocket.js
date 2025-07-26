// WebSocket logic for Penny Game
import { renderPlayers, renderSpectators } from './dom.js'
import { addDnDEvents } from './dnd.js'
import { renderGameBoard, updateGameUI } from './game-board.js'
import { showNotification } from './utility.js'

export function handleWSMessage(data) {
    try {
        // Handle plain text messages (legacy chat format)
        if (typeof data === 'string' && !data.startsWith('{')) {
            if (data.includes('🔴') && data.includes('Host') && data.includes('left the room')) {
                alert("La salle a été fermée car l'hôte a quitté.")
                window.location.reload()
                return
            }
            // Handle as chat message
            console.debug('Chat:', data)
            return
        }

        const msg = JSON.parse(data)
        console.debug('WS message received:', msg.type, msg)

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
            case 'chat':
                handleChatMessage(msg)
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
    console.log('Welcome message received:', msg)
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
            switchToGameView()
            renderGameBoard(gameState)
        }
    }
}

function handleUserJoined(msg) {
    console.log('User joined:', msg)

    // Update the user lists immediately
    const activity = {}
    if (msg.players) {
        msg.players.forEach(p => activity[p] = true)
    }
    if (msg.spectators) {
        msg.spectators.forEach(s => activity[s] = true)
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

    // Show notification
    const roleText = msg.role === 'player' ? 'Joueur' : 'Spectateur'
    showNotification(`${msg.username} a rejoint en tant que ${roleText}`, 'info')
}

function handleActivityUpdate(msg) {
    console.log('Activity update:', msg)
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
    console.log('Game state changed to:', msg.state)

    switch (msg.state) {
        case 'lobby':
            switchToLobbyView()
            break
        case 'active':
            switchToGameView()
            break
        case 'results':
            switchToResultsView()
            break
    }
}

function handleActionMade(msg) {
    console.log('Action made:', msg)

    // Create a mock game state from the message data
    const gameState = {
        players: window.gameState?.players || [],
        batch_size: window.gameState?.batch_size || 12,
        player_coins: msg.player_coins,
        sent_coins: msg.sent_coins,
        total_completed: msg.total_completed,
        tails_remaining: calculateTailsRemaining(msg.player_coins),
        state: msg.state,
    }

    // Update the game board
    renderGameBoard(gameState)

    // Show action notification
    if (msg.action === 'flip') {
        showActionNotification(msg.player, 'a retourné une pièce', 'info')
    } else if (msg.action === 'send') {
        const isCompletion = msg.player === gameState.players[gameState.players.length - 1]
        if (isCompletion) {
            showActionNotification(
                msg.player,
                `a terminé ${msg.batch_count} pièce${msg.batch_count > 1 ? 's' : ''}`,
                'success'
            )
        } else {
            showActionNotification(
                msg.player,
                `a envoyé un lot de ${msg.batch_count} pièce${msg.batch_count > 1 ? 's' : ''}`,
                'info'
            )
        }
    }

    // Update global game state
    window.gameState = { ...window.gameState, ...gameState }
}

function handleGameStarted(msg) {
    console.log('Game started:', msg)
    switchToGameView()

    const gameState = {
        players: msg.players,
        batch_size: msg.batch_size,
        player_coins: msg.player_coins,
        sent_coins: msg.sent_coins || {},
        total_completed: msg.total_completed,
        tails_remaining: msg.tails_remaining,
        state: 'active',
    }

    renderGameBoard(gameState)
    window.gameState = gameState
    showNotification('🎮 La partie a commencé ! Travaillez ensemble !', 'success')
}

function handleGameOver(msg) {
    console.log('Game over:', msg)
    switchToResultsView()

    showNotification('🎯 Partie terminée ! Félicitations à tous !', 'success')

    // Update results display
    updateResultsDisplay(msg.final_state)
}

function handleGameReset(msg) {
    console.log('Game reset:', msg)
    switchToLobbyView()

    // Update batch size display
    updateBatchSizeDisplay(msg.batch_size)

    showNotification('🔄 La partie a été réinitialisée', 'info')
}

function handleBatchSizeUpdate(msg) {
    console.log('Batch size updated:', msg)
    updateBatchSizeDisplay(msg.batch_size)

    // Update global game state
    if (window.gameState) {
        window.gameState.batch_size = msg.batch_size
    }

    showNotification(`📦 Taille de lot changée: ${msg.batch_size}`, 'info')
}

function handleChatMessage(msg) {
    console.log('Chat message:', msg)
    // You can implement a chat UI here if needed
}

function handleUserStatusChange(msg) {
    console.log('User status change:', msg)
    if (msg.message) {
        showNotification(msg.message, 'info')
    }
}

function handleHostDisconnected(msg) {
    console.log('Host disconnected:', msg)
    alert("La salle a été fermée car l'hôte a quitté.")
    window.location.reload()
}

// UI State Management Functions
function switchToLobbyView() {
    const gameSetup = document.querySelector('.game-setup')
    const gameControls = document.querySelector('.game-controls')
    const gameBoard = document.getElementById('gameBoard')
    const results = document.getElementById('results')

    if (gameSetup) gameSetup.style.display = ''
    if (gameControls) gameControls.style.display = ''
    if (gameBoard) gameBoard.style.display = 'none'
    if (results) results.style.display = 'none'
}

function switchToGameView() {
    const gameSetup = document.querySelector('.game-setup')
    const gameControls = document.querySelector('.game-controls')
    const gameBoard = document.getElementById('gameBoard')
    const results = document.getElementById('results')

    if (gameSetup) gameSetup.style.display = 'none'
    if (gameControls) gameControls.style.display = 'none'
    if (gameBoard) gameBoard.style.display = ''
    if (results) results.style.display = 'none'
}

function switchToResultsView() {
    const gameSetup = document.querySelector('.game-setup')
    const gameControls = document.querySelector('.game-controls')
    const gameBoard = document.getElementById('gameBoard')
    const results = document.getElementById('results')

    if (gameSetup) gameSetup.style.display = 'none'
    if (gameControls) gameControls.style.display = 'none'
    if (gameBoard) gameBoard.style.display = 'none'
    if (results) results.style.display = ''
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

function showActionNotification(player, action, type) {
    const message = `${player} ${action}`
    showNotification(message, type)
}

function updateResultsDisplay(finalState) {
    if (!finalState) return

    const totalTimeEl = document.getElementById('totalTime')
    const statsGridEl = document.getElementById('statsGrid')

    if (totalTimeEl && finalState.turn_timestamps && finalState.started_at) {
        const startTime = new Date(finalState.started_at)
        const endTime = new Date(finalState.turn_timestamps[finalState.turn_timestamps.length - 1])
        const totalSeconds = Math.round((endTime - startTime) / 1000)
        totalTimeEl.textContent = `Temps total: ${totalSeconds}s`
    }

    if (statsGridEl && finalState.players) {
        statsGridEl.innerHTML = ''

        // Add batch size info
        const batchCard = document.createElement('div')
        batchCard.className = 'stat-card'
        batchCard.innerHTML = `
            <div class="stat-value">${finalState.batch_size}</div>
            <div class="stat-label">Taille de lot</div>
        `
        statsGridEl.appendChild(batchCard)

        // Add total completed
        const completedCard = document.createElement('div')
        completedCard.className = 'stat-card'
        completedCard.innerHTML = `
            <div class="stat-value">${finalState.total_completed}/12</div>
            <div class="stat-label">Pièces terminées</div>
        `
        statsGridEl.appendChild(completedCard)

        // Add player count
        const playersCard = document.createElement('div')
        playersCard.className = 'stat-card'
        playersCard.innerHTML = `
            <div class="stat-value">${finalState.players.length}</div>
            <div class="stat-label">Joueurs</div>
        `
        statsGridEl.appendChild(playersCard)

        // Add efficiency insight
        if (finalState.turn_timestamps && finalState.started_at) {
            const startTime = new Date(finalState.started_at)
            const endTime = new Date(finalState.turn_timestamps[finalState.turn_timestamps.length - 1])
            const totalSeconds = Math.round((endTime - startTime) / 1000)
            const efficiency = Math.round((finalState.total_completed / totalSeconds) * 60) // coins per minute

            const efficiencyCard = document.createElement('div')
            efficiencyCard.className = 'stat-card'
            efficiencyCard.innerHTML = `
                <div class="stat-value">${efficiency}</div>
                <div class="stat-label">Pièces/min</div>
            `
            statsGridEl.appendChild(efficiencyCard)
        }
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
    console.log('Connecting to WebSocket:', wsUrl)

    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
        console.log('WebSocket connected:', wsUrl)
        showNotification('🔗 Connecté à la salle', 'success')
    }

    ws.onmessage = (event) => {
        handleWSMessage(event.data)
    }

    ws.onclose = (event) => {
        console.log('WebSocket disconnected', event.code, event.reason)

        if (event.code === 4002) {
            // Host left, room closed
            return // Don't reload, handleHostDisconnected will handle this
        }

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
