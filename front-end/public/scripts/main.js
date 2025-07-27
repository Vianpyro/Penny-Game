import { joinRoom, fetchGameState, changeRole, setBatchSize } from './api.js'
import { updateGameCode, renderPlayers, renderSpectators, updateConfig } from './dom.js'
import { handleDragOver, addDnDEvents, draggedItem } from './dnd.js'
import { connectWebSocket } from './websocket.js'
import { fetchBoardGameState, renderGameBoard, updateGameUI } from './game-board.js'

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
                    credentials: 'include',
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

    // Get initial selected batch size from active option
    let selectedBatchSize = 12 // default to batch of 12
    if (roundSelector) {
        const activeRound = roundSelector.querySelector('.round-option.active')
        if (activeRound && activeRound.dataset.round) {
            const roundIndex = parseInt(activeRound.dataset.round, 10) - 1
            selectedBatchSize = [12, 4, 1][roundIndex] || 12
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
                    updateConfig(playersSpan, roundSpan, selectedPlayers, selectedBatchSize)

                    // Update start button text
                    const playerCountSpan = document.getElementById('playerCount')
                    if (playerCountSpan) {
                        playerCountSpan.textContent = selectedPlayers
                    }
                }
            })
        })
    }

    // Batch size selection (formerly round selection)
    if (roundSelector) {
        roundSelector.querySelectorAll('.round-option').forEach((opt) => {
            opt.addEventListener('click', async () => {
                const roundIndex = parseInt(opt.dataset.round, 10) - 1
                const newBatchSize = [12, 4, 1][roundIndex]

                if (!newBatchSize) return

                // Only host can change batch size
                if (!window.isHost) {
                    alert("Seul l'hôte peut changer la taille de lot")
                    return
                }

                const gameCode = document.getElementById('game-code')?.textContent?.trim() || ''
                if (!apiUrl || !gameCode) return

                try {
                    await setBatchSize(apiUrl, gameCode, newBatchSize)

                    // Update UI will be handled by websocket message
                    selectedBatchSize = newBatchSize
                    updateConfig(playersSpan, roundSpan, selectedPlayers, selectedBatchSize)
                } catch (error) {
                    console.error('Error setting batch size:', error)
                    // Error notification is handled in the API function
                }
            })
        })
    }

    // Initial config
    updateConfig(playersSpan, roundSpan, selectedPlayers, selectedBatchSize)

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

    // Handle results view buttons
    const playAgainBtn = document.getElementById('playAgainBtn')
    const backToLobbyBtn = document.getElementById('backToLobbyBtn')

    if (playAgainBtn) {
        playAgainBtn.addEventListener('click', async () => {
            const gameCode = document.getElementById('game-code')?.textContent?.trim() || ''

            if (!window.isHost) {
                alert("Seul l'hôte peut redémarrer la partie")
                return
            }

            if (!apiUrl || !gameCode) return

            try {
                playAgainBtn.disabled = true
                playAgainBtn.textContent = 'Redémarrage...'

                // Reset the game first
                await fetch(`${apiUrl}/game/reset/${gameCode}`, {
                    method: 'POST',
                    credentials: 'include',
                })

                // Small delay to ensure reset is complete
                setTimeout(async () => {
                    // Then start a new game
                    await fetch(`${apiUrl}/game/start/${gameCode}`, {
                        method: 'POST',
                        credentials: 'include',
                    })
                }, 500)
            } catch (error) {
                console.error('Error restarting game:', error)
                alert('Erreur lors du redémarrage de la partie')
            } finally {
                playAgainBtn.disabled = false
                playAgainBtn.textContent = 'Rejouer'
            }
        })
    }

    if (backToLobbyBtn) {
        backToLobbyBtn.addEventListener('click', async () => {
            const gameCode = document.getElementById('game-code')?.textContent?.trim() || ''

            if (!window.isHost) {
                alert("Seul l'hôte peut retourner au lobby")
                return
            }

            if (!apiUrl || !gameCode) return

            try {
                backToLobbyBtn.disabled = true
                backToLobbyBtn.textContent = 'Retour...'

                await fetch(`${apiUrl}/game/reset/${gameCode}`, {
                    method: 'POST',
                    credentials: 'include',
                })
            } catch (error) {
                console.error('Error returning to lobby:', error)
                alert('Erreur lors du retour au lobby')
            } finally {
                backToLobbyBtn.disabled = false
                backToLobbyBtn.textContent = 'Retour au lobby'
            }
        })
    }
})
