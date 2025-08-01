import { joinRoom, fetchGameState, changeRole, setRoundConfig } from './api.js'
import { updateGameCode, renderPlayers, renderSpectators, updateConfig, updatePlayerCountDisplay } from './dom.js'
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
        const gameCode = document.getElementById('game-code')?.textContent?.trim() || ''
        const apiUrl = document.getElementById('joinRoleModal')?.getAttribute('data-api-url') || ''

        if (!apiUrl || !gameCode) {
            alert('Informations manquantes pour démarrer la partie')
            return
        }

        startBtn.disabled = true
        startBtn.textContent = 'Démarrage...'

        try {
            const response = await fetch(`${apiUrl}/game/start/${gameCode}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                credentials: 'include',
            })

            if (!response.ok) {
                const errorText = await response.text()
                let errorData
                try {
                    errorData = JSON.parse(errorText)
                } catch (e) {
                    errorData = { detail: `Server error: ${response.status}` }
                }
                throw new Error(errorData.detail || 'Erreur lors du démarrage de la partie')
            }

            const data = await response.json()
            console.log('Game start successful:', data)
        } catch (error) {
            console.error('Error starting game:', error)

            let errorMessage = error.message || 'Impossible de démarrer la partie'

            if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
                errorMessage = 'Erreur de connexion au serveur. Vérifiez que le serveur est démarré.'
            } else if (error.message.includes('500')) {
                errorMessage = 'Erreur interne du serveur. Vérifiez les logs du serveur.'
            } else if (error.message.includes('CORS')) {
                errorMessage = 'Erreur CORS. Vérifiez la configuration du serveur.'
            }

            alert(errorMessage)
            startBtn.disabled = false
            startBtn.textContent = 'Démarrer la Partie'
        }
    })
}

// --- Next Round Button Logic ---
const nextRoundBtn = document.getElementById('nextRoundBtn')
if (nextRoundBtn) {
    nextRoundBtn.addEventListener('click', async () => {
        const gameCode = document.getElementById('game-code')?.textContent?.trim() || ''
        const apiUrl = document.getElementById('joinRoleModal')?.getAttribute('data-api-url') || ''

        if (!apiUrl || !gameCode) {
            alert('Informations manquantes pour démarrer la manche suivante')
            return
        }

        if (!window.isHost) {
            alert("Seul l'hôte peut démarrer la manche suivante")
            return
        }

        nextRoundBtn.disabled = true
        nextRoundBtn.textContent = 'Démarrage...'

        try {
            const response = await fetch(`${apiUrl}/game/next_round/${gameCode}`, {
                method: 'POST',
                credentials: 'include',
            })

            if (!response.ok) {
                const errorData = await response.json()
                throw new Error(errorData.detail || 'Erreur lors du démarrage de la manche suivante')
            }

            const data = await response.json()
            console.log('Next round started:', data)
        } catch (error) {
            console.error('Error starting next round:', error)
            alert(error.message || 'Impossible de démarrer la manche suivante')
        } finally {
            nextRoundBtn.disabled = false
            nextRoundBtn.textContent = 'Manche Suivante'
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
            } catch (error) {
                console.error('Error resetting game:', error)
                alert(error.message || 'Impossible de réinitialiser la partie')
            } finally {
                resetBtn.disabled = false
                resetBtn.textContent = 'Réinitialiser'
            }
        })
    }

    // Drag & Drop players/spectators
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

    // Round configuration controls
    const roundCountSelector = document.getElementById('roundCountSelector')
    const singleBatchSelector = document.getElementById('singleBatchSelector')
    const playerCountButtons = document.getElementById('playerCountButtons')

    // Initialize default values
    let selectedRoundType = 'three_rounds'
    let selectedBatchSize = 12
    let requiredPlayers = 5

    // Update UI based on user role - FIXED VERSION
    function updateUIForRole() {
        // Add a delay to ensure window.isHost is properly set
        setTimeout(() => {
            const isHost = window.isHost === true
            console.log('🔧 Updating UI for role - isHost:', isHost, 'currentUsername:', window.currentUsername)

            // Enable/disable round type selection
            if (roundCountSelector) {
                const options = roundCountSelector.querySelectorAll('.round-count-option')
                options.forEach((option) => {
                    option.style.pointerEvents = isHost ? 'auto' : 'none'
                    option.style.opacity = isHost ? '1' : '0.7'
                })
            }

            // Enable/disable batch size selection
            if (singleBatchSelector) {
                const options = singleBatchSelector.querySelectorAll('.batch-option')
                options.forEach((option) => {
                    option.style.pointerEvents = isHost ? 'auto' : 'none'
                    option.style.opacity = isHost ? '1' : '0.7'
                })
            }

            // Enable/disable player count buttons
            if (playerCountButtons) {
                const buttons = playerCountButtons.querySelectorAll('.player-count-btn')
                buttons.forEach((btn) => {
                    btn.disabled = !isHost
                    btn.style.opacity = isHost ? '1' : '0.7'
                    btn.style.cursor = isHost ? 'pointer' : 'not-allowed'
                })
            }

            // Show/hide host indicators
            const sections = [roundCountSelector, singleBatchSelector, playerCountButtons?.parentElement]
            sections.forEach((element) => {
                if (!element) return

                // Remove existing indicators
                const existingIndicator = element.querySelector('.host-only-indicator')
                if (existingIndicator) {
                    existingIndicator.remove()
                }

                // Add indicator for non-hosts
                if (!isHost) {
                    const indicator = document.createElement('div')
                    indicator.className = 'host-only-indicator'
                    indicator.textContent = "Seul l'hôte peut modifier ces paramètres"
                    indicator.style.cssText = `
                        background: rgb(241 196 15 / 10%);
                        color: #f39c12;
                        padding: 8px 12px;
                        border-radius: 6px;
                        font-size: 0.85em;
                        font-weight: 600;
                        text-align: center;
                        margin-bottom: 10px;
                        border: 1px solid rgb(241 196 15 / 30%);
                    `
                    element.insertBefore(indicator, element.firstChild)
                }
            })
        }, 100)
    }

    // Round type selection
    if (roundCountSelector) {
        roundCountSelector.querySelectorAll('.round-count-option').forEach((opt) => {
            opt.addEventListener('click', async () => {
                if (!window.isHost) {
                    alert("Seul l'hôte peut changer la configuration des manches")
                    return
                }

                const roundType = opt.dataset.type
                if (!roundType) return

                // Update UI
                roundCountSelector.querySelectorAll('.round-count-option').forEach((o) => o.classList.remove('active'))
                opt.classList.add('active')

                selectedRoundType = roundType

                // Show/hide single batch selector
                if (singleBatchSelector) {
                    singleBatchSelector.style.display = roundType === 'single' ? 'block' : 'none'
                }

                // Send configuration to server
                await updateRoundConfig()
            })
        })
    }

    // Single batch size selection
    if (singleBatchSelector) {
        singleBatchSelector.querySelectorAll('.batch-option').forEach((opt) => {
            opt.addEventListener('click', async () => {
                if (!window.isHost) {
                    alert("Seul l'hôte peut changer la configuration des manches")
                    return
                }

                const batchSize = parseInt(opt.dataset.size, 10)
                if (!batchSize) return

                // Update UI
                singleBatchSelector.querySelectorAll('.batch-option').forEach((o) => o.classList.remove('active'))
                opt.classList.add('active')

                selectedBatchSize = batchSize

                // Send configuration to server
                await updateRoundConfig()
            })
        })
    }

    // Player count selection
    if (playerCountButtons) {
        playerCountButtons.querySelectorAll('.player-count-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                if (!window.isHost) {
                    alert("Seul l'hôte peut changer le nombre de joueurs requis")
                    return
                }

                const count = parseInt(btn.dataset.count, 10)
                if (!count) return

                // Update UI
                playerCountButtons.querySelectorAll('.player-count-btn').forEach((b) => b.classList.remove('active'))
                btn.classList.add('active')

                requiredPlayers = count

                // Update display
                updatePlayerCountDisplay()

                // Send configuration to server
                await updateRoundConfig()
            })
        })
    }

    // Update round configuration on server
    async function updateRoundConfig() {
        const gameCode = document.getElementById('game-code')?.textContent?.trim() || ''
        if (!apiUrl || !gameCode) return

        try {
            await setRoundConfig(apiUrl, gameCode, {
                round_type: selectedRoundType,
                required_players: requiredPlayers,
                selected_batch_size: selectedRoundType === 'single' ? selectedBatchSize : null,
            })
            console.log('✅ Round config updated successfully')
        } catch (error) {
            console.error('❌ Error updating round config:', error)
        }
    }

    // WebSocket and API event listeners
    window.addEventListener('joinrole', (e) => {
        const { username, roomAction, roomId, roomCode } = e.detail || {}
        if (!username) return

        let gameRoomId = null
        if (roomAction === 'create' && roomId) {
            gameRoomId = roomId
        } else if (roomAction === 'join' && roomCode) {
            gameRoomId = roomCode
        }
        if (!gameRoomId) return

        window.currentUsername = username
        console.log('🎮 User joined with username:', username)

        updateGameCode(gameRoomId)

        joinRoom(apiUrl, gameRoomId, username, (joinedRoomId) => {
            // Update UI for role after joining with a delay
            console.log('🔄 Join room success, updating UI...')
            setTimeout(() => {
                updateUIForRole()
                updatePlayerCountDisplay()
            }, 750)

            fetchGameState(
                apiUrl,
                joinedRoomId,
                (players, host, spectators, actions) => renderPlayers(players, host, spectators, actions, addDnDEvents),
                (spectators, host, actions) => renderSpectators(spectators, host, actions, addDnDEvents)
            )
        })

        connectWebSocket(apiUrl, gameRoomId, username)

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

                await fetch(`${apiUrl}/game/reset/${gameCode}`, {
                    method: 'POST',
                    credentials: 'include',
                })

                setTimeout(async () => {
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

    // Listen for role changes from WebSocket
    window.addEventListener('userrolechange', () => {
        console.log('🔄 User role change event received')
        updateUIForRole()
        updatePlayerCountDisplay()
    })

    // Initial UI update with multiple attempts to ensure it works
    updateUIForRole()
    setTimeout(updateUIForRole, 500)
    setTimeout(updateUIForRole, 1500)
    setTimeout(updatePlayerCountDisplay, 100)
})
