// Game board logic for Penny Game with move controls

export async function fetchBoardGameState(gameCode) {
    const apiUrl = document.getElementById('joinRoleModal')?.getAttribute('data-api-url') || ''
    if (!apiUrl || !gameCode) return null

    try {
        const res = await fetch(`${apiUrl}/game/state/${gameCode}`, {
            credentials: 'include'
        })
        if (!res.ok) return null
        const data = await res.json()
        return data
    } catch (error) {
        console.error('Error fetching game state:', error)
        return null
    }
}

export function renderPlayerSections(players, turn, pennies) {
    const gameBoard = document.getElementById('gameBoard')
    if (!gameBoard) return

    gameBoard.innerHTML = ''

    // Add game status header
    const gameStatus = document.createElement('div')
    gameStatus.className = 'game-status'
    gameStatus.innerHTML = `
        <div class="status-header">
            <h2>🪙 Penny Game en cours</h2>
            <div id="turnIndicator" class="turn-indicator"></div>
            <div class="heads-counter">
                <span>Pièces restantes (pile): </span>
                <span id="headsRemaining" class="heads-count">${Array.isArray(pennies) ? pennies.filter(Boolean).length : 0}</span>
            </div>
        </div>
    `
    gameBoard.appendChild(gameStatus)

    // Add reset button for hosts
    addResetButton()

    // Add move controls for current player
    const currentUsername = window.currentUsername
    const isCurrentPlayerTurn = players[turn] === currentUsername

    if (isCurrentPlayerTurn) {
        const moveControls = document.createElement('div')
        moveControls.className = 'move-controls'
        moveControls.innerHTML = `
            <h3>🎯 C'est votre tour !</h3>
            <p>Combien de pièces voulez-vous retourner ?</p>
            <div class="move-buttons">
                <button class="move-btn btn btn-primary" data-flip="1">
                    Retourner 1 pièce
                </button>
                <button class="move-btn btn btn-primary" data-flip="2">
                    Retourner 2 pièces
                </button>
                <button class="move-btn btn btn-primary" data-flip="3">
                    Retourner 3 pièces
                </button>
            </div>
        `
        gameBoard.appendChild(moveControls)

        // Add event listeners to move buttons
        moveControls.querySelectorAll('.move-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const flipCount = parseInt(btn.dataset.flip)
                makeMove(flipCount)
            })
        })
    }

    // Add players sections
    const playersContainer = document.createElement('div')
    playersContainer.className = 'players-container'

    players.forEach((player, idx) => {
        const section = document.createElement('section')
        section.className = `player-zone ${idx === turn ? 'active' : ''}`

        const isCurrentPlayer = idx === turn
        const statusIcon = isCurrentPlayer ? '⭐' : '⏳'
        const statusText = isCurrentPlayer ? 'Tour actuel' : 'En attente'

        section.innerHTML = `
            <h3>${statusIcon} ${player}</h3>
            <div class="player-status">${statusText}</div>
            <div class="pennies-display">
                ${isCurrentPlayer ? renderPenniesForPlayer(pennies) : '<div class="waiting-display">En attente...</div>'}
            </div>
        `

        playersContainer.appendChild(section)
    })

    gameBoard.appendChild(playersContainer)

    // Update turn indicator
    updateTurnIndicator(players[turn], Array.isArray(pennies) ? pennies.filter(Boolean).length : 0)
}

function renderPenniesForPlayer(pennies) {
    if (!Array.isArray(pennies)) return '<div class="no-pennies">Aucune pièce</div>'

    const headsCount = pennies.filter(Boolean).length
    if (headsCount === 0) {
        return '<div class="no-pennies">Toutes les pièces ont été retournées !</div>'
    }

    return `
        <div class="pennies-container">
            ${pennies.map((isHeads, index) =>
        `<div class="penny ${isHeads ? 'heads' : 'tails'}" title="${isHeads ? 'Pile' : 'Face'}">
                    ${isHeads ? '🪙' : '⚪'}
                </div>`
    ).join('')}
        </div>
        <div class="pennies-summary">
            <strong>${headsCount}</strong> pièce${headsCount > 1 ? 's' : ''} à retourner
        </div>
    `
}

function updateTurnIndicator(currentPlayer, headsRemaining) {
    const turnIndicator = document.getElementById('turnIndicator')
    if (turnIndicator && currentPlayer) {
        turnIndicator.innerHTML = `
            <span class="current-player">Tour de: <strong>${currentPlayer}</strong></span>
            <span class="heads-remaining">${headsRemaining} pièce${headsRemaining > 1 ? 's' : ''} restante${headsRemaining > 1 ? 's' : ''}</span>
        `
    }
}

async function makeMove(flipCount) {
    const gameCode = document.getElementById('game-code')?.textContent?.trim() || ''
    const apiUrl = document.getElementById('joinRoleModal')?.getAttribute('data-api-url') || ''
    const username = window.currentUsername

    if (!apiUrl || !gameCode || !username) {
        console.error('Missing required data for move')
        return
    }

    // Disable move buttons during request
    const moveButtons = document.querySelectorAll('.move-btn')
    moveButtons.forEach(btn => {
        btn.disabled = true
        btn.textContent = 'En cours...'
    })

    try {
        const response = await fetch(`${apiUrl}/game/move/${gameCode}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: username,
                flip: flipCount
            }),
            credentials: 'include'
        })

        if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.detail || `Échec du mouvement: ${response.status}`)
        }

        const result = await response.json()
        console.log('Move successful:', result)

        // The websocket will handle updating the UI

    } catch (error) {
        console.error('Error making move:', error)
        alert(`Erreur lors du mouvement: ${error.message}`)

        // Re-enable buttons on error
        moveButtons.forEach((btn, index) => {
            btn.disabled = false
            btn.textContent = `Retourner ${index + 1} pièce${index > 0 ? 's' : ''}`
        })
    }
}

export function updateGameUI(gameState) {
    if (!gameState) return

    // Update pennies display
    const headsRemaining = document.getElementById('headsRemaining')
    if (headsRemaining) {
        const count = Array.isArray(gameState.pennies) ? gameState.pennies.filter(Boolean).length : 0
        headsRemaining.textContent = count
    }

    // Update turn indicator
    if (gameState.current_player) {
        updateTurnIndicator(gameState.current_player, gameState.heads_remaining || 0)
    }

    // Update move controls visibility
    const currentUsername = window.currentUsername
    const isCurrentPlayerTurn = gameState.current_player === currentUsername

    const moveControls = document.querySelector('.move-controls')
    if (moveControls) {
        moveControls.style.display = isCurrentPlayerTurn ? '' : 'none'
    }

    // Update move buttons based on available heads
    const moveButtons = document.querySelectorAll('.move-btn')
    const headsCount = gameState.heads_remaining || 0

    moveButtons.forEach((btn, index) => {
        const flipCount = index + 1
        const canMakeMove = flipCount <= headsCount && isCurrentPlayerTurn

        btn.disabled = !canMakeMove
        btn.style.opacity = canMakeMove ? '1' : '0.5'

        if (flipCount > headsCount) {
            btn.title = `Impossible: seulement ${headsCount} pièce${headsCount > 1 ? 's' : ''} disponible${headsCount > 1 ? 's' : ''}`
        } else {
            btn.title = ''
        }
    })
}

// Add reset functionality for hosts
export function addResetButton() {
    const gameBoard = document.getElementById('gameBoard')
    if (!gameBoard) return

    // Check if user is host
    const isHost = checkIfHost()
    if (!isHost) return

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
            credentials: 'include'
        })

        if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.detail || 'Échec de la réinitialisation')
        }

        console.log('Game reset successful')

    } catch (error) {
        console.error('Error resetting game:', error)
        alert(`Erreur lors de la réinitialisation: ${error.message}`)
    }
}

function checkIfHost() {
    // This would need to be implemented based on your auth system
    // For now, return false
    return false
}
