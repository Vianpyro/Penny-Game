import { joinRoom, fetchGameState, changeRole } from './api.js'
import { updateGameCode, renderPlayers, renderSpectators, updateConfig, updateBoard } from './dom.js'
import { handleDragOver, addDnDEvents, draggedItem } from './dnd.js'
import { connectWebSocket } from './websocket.js'
import { fetchBoardGameState, renderPlayerSections, updateGameUI } from './game-board.js'

// --- Game Start & Board Logic ---
const startBtn = document.getElementById('startBtn')
const gameSetup = document.querySelector('.game-setup')
const gameControls = document.querySelector('.game-controls')
const gameBoard = document.getElementById('gameBoard')

if (startBtn && gameSetup && gameControls && gameBoard) {
    startBtn.addEventListener('click', async () => {
        // Get game code from UI
        const gameCode = document.getElementById('game-code')?.textContent?.trim() || ''
        const apiUrl = document.getElementById('joinRoleModal')?.getAttribute('data-api-url') || ''

        if (!apiUrl || !gameCode) {
            alert('Informations manquantes pour démarrer la partie')
            return
        }

        // Disable button during request
        startBtn.disabled = true
        startBtn.textContent = 'Démarrage...'

        try {
            const response = await fetch(`${apiUrl}/game/start/${gameCode}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
            })

            if (!response.ok) {
                const errorData = await response.json()
                throw new Error(errorData.detail || 'Erreur lors du démarrage de la partie')
            }

            console.log('Game start request successful')
            // The websocket will handle switching to the game view

        } catch (error) {
            console.error('Error starting game:', error)
            alert(error.message || 'Impossible de démarrer la partie')

            // Re-enable button on error
            startBtn.disabled = false
            startBtn.textContent = 'Démarrer la Partie'
        }
    })
}

window.addEventListener('DOMContentLoaded', () => {
    const apiUrl = document.getElementById('joinRoleModal')?.getAttribute('data-api-url') || ''

    // Copy code to clipboard
    const copyBtn = document.getElementById('copyCodeBtn')
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const gameCodeSpan = document.getElementById('game-code')
            if (gameCodeSpan) {
                const code = gameCodeSpan.textContent || ''
                if (code) {
                    navigator.clipboard
                        .writeText(code)
                        .then(() => {
                            copyBtn.textContent = 'Copié !'
                            setTimeout(() => {
                                copyBtn.textContent = 'Copier le code'
                            }, 1200)
                        })
                        .catch(() => {
                            copyBtn.textContent = 'Erreur...'
                            setTimeout(() => {
                                copyBtn.textContent = 'Copier le code'
                            }, 1200)
                        })
                }
            }
        })
    }

    // Add reset button functionality
    const resetBtn = document.getElementById('resetBtn')
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            const gameCode = document.getElementById('game-code')?.textContent?.trim() || ''

            if (!apiUrl || !gameCode) {
                alert('Informations manquantes pour réinitialiser la partie')
                return
            }

            if (!confirm('Êtes-vous sûr de vouloir réinitialiser la partie ?')) {
                return
            }

            try {
                resetBtn.disabled = true
                resetBtn.textContent = 'Réinitialisation...'

                const response = await fetch(`${apiUrl}/game/reset/${gameCode}`, {
                    method: 'POST',
                    credentials: 'include'
                })

                if (!response.ok) {
                    const errorData = await response.json()
                    throw new Error(errorData.detail || 'Erreur lors de la réinitialisation')
                }

                console.log('Game reset successful')
                // The websocket will handle switching back to lobby view

            } catch (error) {
                console.error('Error resetting game:', error)
                alert(error.message || 'Impossible de réinitialiser la partie')
            } finally {
                resetBtn.disabled = false
                resetBtn.textContent = 'Réinitialiser'
            }
        })
    }

    // Drag & Drop joueurs/spectateurs
    let _draggedItem = draggedItem

    function handleDrop(e, targetList) {
        e.preventDefault()
        if (_draggedItem && targetList && _draggedItem.parentNode !== targetList) {
            const username = (_draggedItem.textContent || '').replace(/^.*?\s/, '').trim()
            let newRole = ''
            if (targetList.id === 'playerList') {
                newRole = 'player'
            } else if (targetList.id === 'spectatorList') {
                newRole = 'spectator'
            }
            const roomId = document.getElementById('game-code')?.textContent?.trim() || ''
            if (apiUrl && roomId && username && newRole) {
                changeRole(apiUrl, roomId, username, newRole, (roomId) =>
                    fetchGameState(
                        apiUrl,
                        roomId,
                        (players, host, spectators, actions) =>
                            renderPlayers(players, host, spectators, actions, addDnDEvents),
                        (spectators, host, actions) => renderSpectators(spectators, host, actions, addDnDEvents)
                    )
                )
            }
        }
    }

    function setupDropZones() {
        const playerList = document.getElementById('playerList')
        const spectatorList = document.getElementById('spectatorList')

        if (spectatorList) {
            spectatorList.addEventListener('dragover', (e) => {
                handleDragOver(e)
                spectatorList.classList.add('drag-over')
            })
            spectatorList.addEventListener('dragleave', () => {
                spectatorList.classList.remove('drag-over')
            })
            spectatorList.addEventListener('drop', (e) => {
                handleDrop(e, spectatorList)
                spectatorList.classList.remove('drag-over')
            })
        }

        if (playerList) {
            playerList.addEventListener('dragover', (e) => {
                handleDragOver(e)
                playerList.classList.add('drag-over')
            })
            playerList.addEventListener('dragleave', () => {
                playerList.classList.remove('drag-over')
            })
            playerList.addEventListener('drop', (e) => {
                handleDrop(e, playerList)
                playerList.classList.remove('drag-over')
            })
        }
    }

    setupDropZones()

    // Flip coin logic
    const coinFlip = document.getElementById('coinFlip')
    if (coinFlip) {
        coinFlip.style.cursor = 'pointer'
        coinFlip.addEventListener('click', () => {
            coinFlip.classList.toggle('flipped')
            setTimeout(() => coinFlip.classList.toggle('grayscale'), 400 / 2)
        })
    }

    // Game setup controls
    const playerButtons = document.getElementById('playerButtons')
    const roundSelector = document.getElementById('roundSelector')
    const playersSpan = document.getElementById('selected-players')
    const roundSpan = document.getElementById('selected-round')

    // Get initial selected player count from active button
    let selectedPlayers = 5 // default to 5 players
    if (playerButtons) {
        const activeBtn = playerButtons.querySelector('button.active')
        if (activeBtn && activeBtn.dataset.count) {
            selectedPlayers = parseInt(activeBtn.dataset.count, 10)
        }
    }

    // Get initial selected round from active option
    let selectedRound = 1 // fallback
    if (roundSelector) {
        const activeRound = roundSelector.querySelector('.round-option.active')
        if (activeRound && activeRound.dataset.round) {
            selectedRound = parseInt(activeRound.dataset.round, 10)
        }
    }

    // Player count selection
    if (playerButtons) {
        playerButtons.querySelectorAll('button').forEach((btn) => {
            btn.addEventListener('click', () => {
                playerButtons.querySelectorAll('button').forEach((b) => b.classList.remove('active'))
                btn.classList.add('active')
                if (btn.dataset.count) {
                    selectedPlayers = parseInt(btn.dataset.count, 10)
                    updateConfig(playersSpan, roundSpan, selectedPlayers, selectedRound)
                    updateBoard(gameBoard, selectedPlayers)

                    // Update start button text
                    const playerCountSpan = document.getElementById('playerCount')
                    if (playerCountSpan) {
                        playerCountSpan.textContent = selectedPlayers
                    }
                }
            })
        })
    }

    // Round selection
    if (roundSelector) {
        roundSelector.querySelectorAll('.round-option').forEach((opt) => {
            opt.addEventListener('click', () => {
                roundSelector.querySelectorAll('.round-option').forEach((o) => o.classList.remove('active'))
                opt.classList.add('active')
                if (opt.dataset.round) {
                    selectedRound = parseInt(opt.dataset.round, 10)
                    updateConfig(playersSpan, roundSpan, selectedPlayers, selectedRound)
                }
            })
        })
    }

    // Initial config
    updateConfig(playersSpan, roundSpan, selectedPlayers, selectedRound)
    updateBoard(gameBoard, selectedPlayers)

    // Update start button text with initial player count
    const playerCountSpan = document.getElementById('playerCount')
    if (playerCountSpan) {
        playerCountSpan.textContent = selectedPlayers
    }

    // WebSocket and API event listeners
    window.addEventListener('joinrole', (e) => {
        const { username, roomAction, roomId, roomCode } = e.detail || {}
        if (!username) return

        // Determine which room identifier to use
        let gameRoomId = null
        if (roomAction === 'create' && roomId) {
            gameRoomId = roomId
        } else if (roomAction === 'join' && roomCode) {
            gameRoomId = roomCode
        }
        if (!gameRoomId) return

        // Store username globally
        window.currentUsername = username

        updateGameCode(gameRoomId)

        // Join the room
        joinRoom(apiUrl, gameRoomId, username, (joinedRoomId) =>
            fetchGameState(
                apiUrl,
                joinedRoomId,
                (players, host, spectators, actions) => renderPlayers(players, host, spectators, actions, addDnDEvents),
                (spectators, host, actions) => renderSpectators(spectators, host, actions, addDnDEvents)
            )
        )

        // Connect websocket for live updates
        connectWebSocket(apiUrl, gameRoomId, username)

        // Fetch initial game state
        fetchGameState(
            apiUrl,
            gameRoomId,
            (players, host, spectators, actions) => renderPlayers(players, host, spectators, actions, addDnDEvents),
            (spectators, host, actions) => renderSpectators(spectators, host, actions, addDnDEvents)
        )
    })

    // Add keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Only handle shortcuts when in game and it's the player's turn
        const gameBoard = document.getElementById('gameBoard')
        const moveButtons = document.querySelectorAll('.move-btn:not(:disabled)')

        if (gameBoard && gameBoard.style.display !== 'none' && moveButtons.length > 0) {
            switch (e.key) {
                case '1':
                    e.preventDefault()
                    moveButtons[0]?.click()
                    break
                case '2':
                    e.preventDefault()
                    moveButtons[1]?.click()
                    break
                case '3':
                    e.preventDefault()
                    moveButtons[2]?.click()
                    break
            }
        }
    })
})
