// WebSocket logic for Penny Game
import { renderPlayers, renderSpectators } from './dom.js'
import { addDnDEvents } from './dnd.js'
import { renderPlayerSections } from './game-board.js'
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
            case 'move_made':
                handleMoveMade(msg)
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
            case 'activity':
                handleActivityUpdate(msg)
                break
            case 'chat':
                handleChatMessage(msg)
                break
            case 'user_connected':
            case 'user_disconnected':
                handleUserStatusChange(msg)
                break
            case 'host_disconnected':
                handleHostDisconnected(msg)
                break
            default:
                console.debug('Unknown message type:', msg)
        }
    } catch (error) {
        console.error('Error parsing WS message:', error, data)
    }
}

function handleWelcomeMessage(msg) {
    console.log('Welcome message received:', msg)
    const gameState = msg.game_state
    if (gameState) {
        // Update user lists
        renderPlayers(gameState.players, gameState.host, gameState.spectators, {}, addDnDEvents)
        renderSpectators(gameState.spectators, gameState.host, {}, addDnDEvents)

        // Update game board if in active state
        if (gameState.state === 'active') {
            switchToGameView()
            renderPlayerSections(gameState.players, gameState.turn, gameState.pennies)
            updateGameControls(gameState)
        }
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

function handleMoveMade(msg) {
    console.log('Move made:', msg)

    // Update game board with new state
    renderPlayerSections(msg.players || [], msg.turn || 0, msg.pennies || [])
    updateGameControls(msg)

    // Show move notification
    showMoveNotification(msg.player, msg.flip_count, msg.heads_remaining)

    // Update turn indicator
    updateTurnIndicator(msg.current_player, msg.heads_remaining)
}

function handleGameStarted(msg) {
    console.log('Game started:', msg)
    switchToGameView()
    renderPlayerSections(msg.players || [], msg.turn || 0, msg.pennies || [])
    updateGameControls(msg)
    showNotification('🎮 La partie a commencé !', 'success')
}

function handleGameOver(msg) {
    console.log('Game over:', msg)
    switchToResultsView()

    const winner = msg.winner
    if (winner) {
        showNotification(`🏆 ${winner} a gagné !`, 'success')
    } else {
        showNotification('🎯 Partie terminée !', 'info')
    }

    // Update results display
    updateResultsDisplay(msg.final_state)
}

function handleGameReset(msg) {
    console.log('Game reset:', msg)
    switchToLobbyView()
    showNotification('🔄 La partie a été réinitialisée', 'info')
}

function handleActivityUpdate(msg) {
    console.log('Activity update:', msg)
    renderPlayers(msg.players, msg.host, msg.spectators, msg.activity, addDnDEvents)
    renderSpectators(msg.spectators, msg.host, msg.activity, addDnDEvents)
}

function handleChatMessage(msg) {
    console.log('Chat message:', msg)
    // You can implement a chat UI here if needed
}

function handleUserStatusChange(msg) {
    console.log('User status change:', msg)
    showNotification(msg.message, 'info')
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

function updateGameControls(gameState) {
    // Update move buttons visibility based on current player
    const currentUsername = window.currentUsername
    const isCurrentPlayerTurn = gameState.current_player === currentUsername

    const moveButtons = document.querySelectorAll('.move-btn')
    moveButtons.forEach((btn) => {
        btn.disabled = !isCurrentPlayerTurn
        btn.style.opacity = isCurrentPlayerTurn ? '1' : '0.5'
    })

    // Update heads count display
    const headsDisplay = document.getElementById('headsRemaining')
    if (headsDisplay) {
        headsDisplay.textContent = gameState.heads_remaining || 0
    }
}

function updateTurnIndicator(currentPlayer, headsRemaining) {
    const turnIndicator = document.getElementById('turnIndicator')
    if (turnIndicator) {
        if (currentPlayer) {
            turnIndicator.textContent = `Tour de ${currentPlayer} (${headsRemaining} pièces restantes)`
            turnIndicator.style.display = ''
        } else {
            turnIndicator.style.display = 'none'
        }
    }
}

function showMoveNotification(player, flipCount, headsRemaining) {
    const message = `${player} a retourné ${flipCount} pièce${flipCount > 1 ? 's' : ''} (${headsRemaining} restantes)`
    showNotification(message, 'info')
}

function updateResultsDisplay(finalState) {
    if (!finalState) return

    const totalTimeEl = document.getElementById('totalTime')
    const statsGridEl = document.getElementById('statsGrid')

    if (totalTimeEl && finalState.turn_timestamps) {
        const startTime = new Date(finalState.started_at)
        const endTime = new Date(finalState.turn_timestamps[finalState.turn_timestamps.length - 1])
        const totalSeconds = Math.round((endTime - startTime) / 1000)
        totalTimeEl.textContent = `Temps total: ${totalSeconds}s`
    }

    if (statsGridEl && finalState.players) {
        statsGridEl.innerHTML = ''
        finalState.players.forEach((player, index) => {
            const statCard = document.createElement('div')
            statCard.className = 'stat-card'
            statCard.innerHTML = `
                <div class="stat-value">${player}</div>
                <div class="stat-label">Joueur ${index + 1}</div>
            `
            statsGridEl.appendChild(statCard)
        })
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
