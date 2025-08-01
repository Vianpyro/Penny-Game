import { joinRoom, fetchGameState, changeRole, setRoundConfig } from './api.js'
import { updateGameCode, renderPlayers, renderSpectators, updateConfig, updatePlayerCountDisplay } from './dom.js'
import { handleDragOver, addDnDEvents, draggedItem } from './dnd.js'
import { connectWebSocket } from './websocket.js'
import { fetchBoardGameState, renderGameBoard, updateGameUI } from './game-board.js'

// Global reference to track dragged item
let currentDraggedItem = null

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

    // FIXED: Enhanced Drag & Drop with proper event handling
    function handleDrop(e, targetList) {
        e.preventDefault()
        e.stopPropagation()

        if (currentDraggedItem && targetList && currentDraggedItem.parentNode !== targetList) {
            // Extract username from the dragged item
            const fullText = currentDraggedItem.textContent || ''
            const username = fullText.replace(/^.*?\s/, '').trim()

            // Determine target role
            let newRole = ''
            if (targetList.id === 'playerList') {
                newRole = 'player'
            } else if (targetList.id === 'spectatorList') {
                newRole = 'spectator'
            }

            const roomId = document.getElementById('game-code')?.textContent?.trim() || ''

            if (apiUrl && roomId && username && newRole) {
                console.log(`🔄 Moving ${username} to ${newRole}`)

                changeRole(apiUrl, roomId, username, newRole, (roomId) => {
                    // Re-fetch and re-render after successful role change
                    fetchGameState(
                        apiUrl,
                        roomId,
                        (players, host, spectators, actions) =>
                            renderPlayers(players, host, spectators, actions, setupDragAndDrop),
                        (spectators, host, actions) => renderSpectators(spectators, host, actions, setupDragAndDrop)
                    )
                })
            }
        }

        // Clean up drag over styles
        document.querySelectorAll('.drag-over').forEach((element) => {
            element.classList.remove('drag-over')
        })

        currentDraggedItem = null
    }

    function handleDragStart(e) {
        currentDraggedItem = e.target
        if (!currentDraggedItem || !e.dataTransfer) return

        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', currentDraggedItem.textContent || '')

        // Visual feedback
        setTimeout(() => {
            if (currentDraggedItem) {
                currentDraggedItem.classList.add('dragging')
            }
        }, 0)

        console.log('🎯 Started dragging:', currentDraggedItem.textContent)
    }

    function handleDragEnd(e) {
        if (currentDraggedItem) {
            currentDraggedItem.classList.remove('dragging')
        }

        // Clean up all drag-over effects
        document.querySelectorAll('.drag-over').forEach((element) => {
            element.classList.remove('drag-over')
        })

        // Don't reset currentDraggedItem here - let handleDrop do it
        console.log('🏁 Ended dragging')
    }

    function handleDragOver(e) {
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    }

    function handleDragEnter(e) {
        e.preventDefault()
        const targetList = e.currentTarget
        if (targetList && targetList.classList.contains('user-list')) {
            targetList.classList.add('drag-over')
        }
    }

    function handleDragLeave(e) {
        e.preventDefault()
        const targetList = e.currentTarget
        if (targetList && targetList.classList.contains('user-list')) {
            // Only remove if we're actually leaving the list, not entering a child
            const rect = targetList.getBoundingClientRect()
            const x = e.clientX
            const y = e.clientY

            if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
                targetList.classList.remove('drag-over')
            }
        }
    }

    // FIXED: Setup drag and drop with proper event binding
    function setupDragAndDrop() {
        const playerList = document.getElementById('playerList')
        const spectatorList = document.getElementById('spectatorList')

        // Remove existing event listeners to prevent duplicates
        document.querySelectorAll('[draggable="true"]').forEach((item) => {
            // Clone and replace to remove all existing listeners
            const newItem = item.cloneNode(true)
            item.parentNode.replaceChild(newItem, item)
        })

        // Setup drag events on draggable items
        document.querySelectorAll('[draggable="true"]').forEach((item) => {
            item.addEventListener('dragstart', handleDragStart, { passive: false })
            item.addEventListener('dragend', handleDragEnd, { passive: false })
        })

        // Setup drop zones
        if (playerList) {
            // Remove existing listeners
            playerList.removeEventListener('dragover', handleDragOver)
            playerList.removeEventListener('dragenter', handleDragEnter)
            playerList.removeEventListener('dragleave', handleDragLeave)
            playerList.removeEventListener('drop', handleDrop)

            // Add fresh listeners
            playerList.addEventListener('dragover', handleDragOver, { passive: false })
            playerList.addEventListener('dragenter', handleDragEnter, { passive: false })
            playerList.addEventListener('dragleave', handleDragLeave, { passive: false })
            playerList.addEventListener('drop', (e) => handleDrop(e, playerList), { passive: false })
        }

        if (spectatorList) {
            // Remove existing listeners
            spectatorList.removeEventListener('dragover', handleDragOver)
            spectatorList.removeEventListener('dragenter', handleDragEnter)
            spectatorList.removeEventListener('dragleave', handleDragLeave)
            spectatorList.removeEventListener('drop', handleDrop)

            // Add fresh listeners
            spectatorList.addEventListener('dragover', handleDragOver, { passive: false })
            spectatorList.addEventListener('dragenter', handleDragEnter, { passive: false })
            spectatorList.addEventListener('dragleave', handleDragLeave, { passive: false })
            spectatorList.addEventListener('drop', (e) => handleDrop(e, spectatorList), { passive: false })
        }

        console.log('🎯 Drag and drop setup complete')
    }

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
        setTimeout(() => {
            const isHost = window.isHost === true
            console.debug('🔧 Updating UI for role - isHost:', isHost, 'currentUsername:', window.currentUsername)

            // Update layout class
            const setupControls = document.querySelector('.setup-controls')
            if (setupControls) {
                setupControls.classList.toggle('non-host-view', !isHost)
            }

            // Hide player count section for non-hosts
            const playerCountSection = document.getElementById('playerCountSection')
            if (playerCountSection) {
                playerCountSection.style.display = isHost ? 'block' : 'none'
            }

            // Enable/disable round controls for hosts only
            if (roundCountSelector) {
                const options = roundCountSelector.querySelectorAll('.round-count-option')
                options.forEach((option) => {
                    option.style.pointerEvents = isHost ? 'auto' : 'none'
                    option.style.opacity = isHost ? '1' : '0.8'
                })
            }

            if (singleBatchSelector) {
                const options = singleBatchSelector.querySelectorAll('.batch-option')
                options.forEach((option) => {
                    option.style.pointerEvents = isHost ? 'auto' : 'none'
                    option.style.opacity = isHost ? '1' : '0.8'
                })
            }

            if (playerCountButtons) {
                const buttons = playerCountButtons.querySelectorAll('.player-count-btn')
                buttons.forEach((btn) => {
                    btn.disabled = !isHost
                    btn.style.opacity = isHost ? '1' : '0.8'
                })
            }

            // Update configuration display for non-hosts
            updateConfigurationDisplay()

            // Re-setup drag and drop after UI changes
            setTimeout(setupDragAndDrop, 100)
        }, 100)
    }

    // Function to update configuration display in rules section
    function updateConfigurationDisplay() {
        const configDisplay = document.getElementById('currentConfigDisplay')
        const configInfo = document.getElementById('configInfo')

        if (!configDisplay || !configInfo) return

        const gameState = window.gameState
        const isHost = window.isHost === true

        if (!isHost && gameState) {
            // Show configuration for non-hosts
            configDisplay.style.display = 'block'

            const roundTypeText =
                {
                    single: '1 manche',
                    two_rounds: '2 manches',
                    three_rounds: '3 manches',
                }[gameState.round_type] || 'Configuration par défaut'

            let batchInfo = ''
            if (gameState.round_type === 'single' && gameState.selected_batch_size) {
                batchInfo = ` - Lot de ${gameState.selected_batch_size}`
            }

            configInfo.innerHTML = `
                <span class="config-badge">${roundTypeText}${batchInfo}</span>
                <span class="config-badge">${gameState.required_players || 5} joueurs requis</span>
            `
        } else {
            // Hide for hosts
            configDisplay.style.display = 'none'
        }
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
                (players, host, spectators, actions) =>
                    renderPlayers(players, host, spectators, actions, setupDragAndDrop),
                (spectators, host, actions) => renderSpectators(spectators, host, actions, setupDragAndDrop)
            )
        })

        connectWebSocket(apiUrl, gameRoomId, username)

        fetchGameState(
            apiUrl,
            gameRoomId,
            (players, host, spectators, actions) => renderPlayers(players, host, spectators, actions, setupDragAndDrop),
            (spectators, host, actions) => renderSpectators(spectators, host, actions, setupDragAndDrop)
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

    // Listen for game state updates
    window.addEventListener('gamestateupdate', () => {
        console.log('🔄 Game state update event received')
        updateConfigurationDisplay()
    })

    // Initial UI update with multiple attempts to ensure it works
    updateUIForRole()
    setTimeout(updateUIForRole, 500)
    setTimeout(updateUIForRole, 1500)
    setTimeout(updatePlayerCountDisplay, 100)

    // Initial drag and drop setup
    setTimeout(setupDragAndDrop, 200)
})
