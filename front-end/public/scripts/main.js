// Main entry point for Penny Game frontend
import { joinRoom, fetchGameState, changeRole } from './api.js'
import { updateGameCode, renderPlayers, renderSpectators, updateConfig, updateBoard } from './dom.js'
import { handleDragOver, addDnDEvents, draggedItem } from './dnd.js'
import { connectWebSocket } from './websocket.js'
import { fetchBoardGameState, renderPlayerSections } from './game-board.js'

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
        // Fetch full game state from API (optional, for validation)
        const state = await fetchBoardGameState(gameCode)
        if (!state) return
        // Only the host should trigger the game start
        // Call the backend endpoint to trigger the state change
        if (apiUrl && gameCode) {
            fetch(`${apiUrl}/game/start/${gameCode}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
            })
                .then((response) => {
                    if (!response.ok) throw new Error('Erreur lors du démarrage de la partie')
                })
                .catch((err) => {
                    alert(err.message || 'Impossible de démarrer la partie')
                })
        }
        // Do NOT switch to the board view here; wait for the ws message
    })
}

// Listen for ws signal to switch to game screen
if (window.pennyGameWS) {
    window.pennyGameWS.addEventListener('message', (event) => {
        try {
            const msg = JSON.parse(event.data)
            console.debug('WS message received:', msg.type || msg)
            if (msg.type === 'start_game') {
                const gameSetup = document.querySelector('.game-setup')
                const gameControls = document.querySelector('.game-controls')
                const gameBoard = document.getElementById('gameBoard')
                const gameCode = document.getElementById('game-code')?.textContent?.trim() || ''
                fetchBoardGameState(gameCode).then((state) => {
                    if (!state) return
                    if (gameSetup) gameSetup.style.display = 'none'
                    if (gameControls) gameControls.style.display = 'none'
                    if (gameBoard) {
                        gameBoard.style.display = ''
                        renderPlayerSections(state.players || [], state.turn ?? 0, state.pennies || [])
                    }
                })
            }
        } catch {
            console.error('Error parsing WS message:', event.data)
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

    const playerButtons = document.getElementById('playerButtons')
    const roundSelector = document.getElementById('roundSelector')
    const gameBoard = document.getElementById('gameBoard')
    const playersSpan = document.getElementById('selected-players')
    const roundSpan = document.getElementById('selected-round')

    // Get initial selected player count from active button
    let selectedPlayers = 2 // fallback
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
            const btnEl = btn
            btnEl.addEventListener('click', () => {
                playerButtons.querySelectorAll('button').forEach((b) => b.classList.remove('active'))
                btnEl.classList.add('active')
                if (btnEl.dataset.count) {
                    selectedPlayers = parseInt(btnEl.dataset.count, 10)
                    updateConfig(playersSpan, roundSpan, selectedPlayers, selectedRound)
                    updateBoard(gameBoard, selectedPlayers)
                }
            })
        })
    }

    // Round selection
    if (roundSelector) {
        roundSelector.querySelectorAll('.round-option').forEach((opt) => {
            const optEl = opt
            optEl.addEventListener('click', () => {
                roundSelector.querySelectorAll('.round-option').forEach((o) => o.classList.remove('active'))
                optEl.classList.add('active')
                if (optEl.dataset.round) {
                    selectedRound = parseInt(optEl.dataset.round, 10)
                    updateConfig(playersSpan, roundSpan, selectedPlayers, selectedRound)
                }
            })
        })
    }

    // Initial config
    updateConfig(playersSpan, roundSpan, selectedPlayers, selectedRound)
    updateBoard(gameBoard, selectedPlayers)

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

        updateGameCode(gameRoomId)
        joinRoom(apiUrl, gameRoomId, username, (joinedRoomId) =>
            fetchGameState(
                apiUrl,
                joinedRoomId,
                (players, host, spectators, actions) => renderPlayers(players, host, spectators, actions, addDnDEvents),
                (spectators, host, actions) => renderSpectators(spectators, host, actions, addDnDEvents)
            )
        )
        connectWebSocket(apiUrl, gameRoomId, username)
        fetchGameState(
            apiUrl,
            gameRoomId,
            (players, host, spectators, actions) => renderPlayers(players, host, spectators, actions, addDnDEvents),
            (spectators, host, actions) => renderSpectators(spectators, host, actions, addDnDEvents)
        )
    })
})
