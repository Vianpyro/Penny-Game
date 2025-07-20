window.addEventListener('DOMContentLoaded', () => {
    const apiUrl = document.getElementById('joinRoleModal')?.getAttribute('data-api-url') || ''

    function updateGameCode(code: string) {
        const gameCodeSpan = document.getElementById('gameCode')
        if (gameCodeSpan) gameCodeSpan.textContent = code
    }

    function joinRoom(roomId: string, username: string) {
        if (!apiUrl || !roomId || !username) return
        fetch(`${apiUrl}/game/join/${roomId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username }),
        })
            .then((response) => {
                if (!response.ok) throw new Error('Erreur lors de la connexion à la salle')
                // After joining, fetch actual state
                fetchGameState(roomId)
            })
            .catch(console.error)
    }

    function renderPlayers(players: string[], host: string, spectators: string[], activity: Record<string, boolean>) {
        const playerList = document.getElementById('playerList')
        if (!playerList) return
        playerList.innerHTML = ''
        // Filter out host and spectators from players
        const filteredPlayers = (players || []).filter((p) => p !== host && !(spectators || []).includes(p))
        if (!filteredPlayers.length) {
            const li = document.createElement('li')
            li.className = 'waiting'
            li.title = 'En attente'
            // Do NOT set draggable for info/status
            li.innerHTML = '<span class="status-indicator">⏳</span> En attente de joueurs'
            playerList.appendChild(li)
            // No drag events for status
            return
        }
        filteredPlayers.forEach((player) => {
            const li = document.createElement('li')
            const isOnline = activity && activity[player]
            li.className = isOnline ? 'online' : 'offline'
            li.title = isOnline ? 'En ligne' : 'Hors ligne'
            li.setAttribute('draggable', 'true')
            const icon = isOnline ? '🟢' : '⚪'
            li.innerHTML = `<span class="status-indicator">${icon}</span> ${player}`
            playerList.appendChild(li)
        })
        // Re-apply drag events after rendering
        addDnDEvents(playerList)
    }

    function renderSpectators(spectators: string[], host: string, activity: Record<string, boolean>) {
        const spectatorList = document.getElementById('spectatorList')
        if (!spectatorList) return
        spectatorList.innerHTML = ''
        // Always show host first with crown icon
        if (host) {
            const li = document.createElement('li')
            const isOnline = activity && activity[host]
            li.className = 'spectator host'
            li.title = 'Host'
            li.innerHTML = `<span class="status-indicator">👑</span> ${host}`
            spectatorList.appendChild(li)
        }
        // Show other spectators (excluding host)
        ;(spectators || [])
            .filter((s) => s !== host)
            .forEach((spectator) => {
                const li = document.createElement('li')
                const isOnline = activity && activity[spectator]
                li.className = 'spectator'
                li.title = isOnline ? 'Spectateur en ligne' : 'Spectateur hors ligne'
                li.setAttribute('draggable', 'true')
                const icon = isOnline ? '👀' : '🙈'
                li.innerHTML = `<span class="status-indicator">${icon}</span> ${spectator}`
                spectatorList.appendChild(li)
            })
        // Re-apply drag events after rendering
        addDnDEvents(spectatorList)
    }

    function fetchGameState(roomId: string) {
        if (!apiUrl || !roomId) return
        fetch(`${apiUrl}/game/state/${roomId}`)
            .then((response) => response.json())
            .then((data) => {
                // Fallback: if no activity info, assume all users online
                const activity: Record<string, boolean> = {}
                if (data.players)
                    data.players.forEach((p: string) => {
                        activity[p] = true
                    })
                if (data.spectators)
                    data.spectators.forEach((s: string) => {
                        activity[s] = true
                    })
                renderPlayers(data.players, data.host, data.spectators, activity)
                renderSpectators(data.spectators, data.host, activity)
            })
            .catch(console.error)
    }

    function handleWSMessage(data: any) {
        try {
            // Detect host leaving
            if (typeof data === 'string' && data.includes('🔴')) {
                if (data.includes('left the room.') && data.includes('Host')) {
                    alert("La salle a été fermée car l'hôte a quitté.")
                    window.location.reload()
                    return
                }
            }
            const msg = JSON.parse(data)
            if (msg.type === 'activity') {
                renderPlayers(msg.players, msg.host, msg.spectators, msg.activity)
                renderSpectators(msg.spectators, msg.host, msg.activity)
            } else {
                renderPlayers(msg.players, msg.host, msg.spectators, {})
                renderSpectators(msg.spectators, msg.host, {})
            }
        } catch {
            // fallback: log text
            console.log('WS:', data)
        }
    }

    function connectWebSocket(roomId: string, username: string) {
        if (!apiUrl || !roomId || !username) return
        const wsUrl = apiUrl.replace(/^http/, 'ws') + `/ws/${roomId}/${encodeURIComponent(username)}`
        const ws = new WebSocket(wsUrl)
        ws.onopen = () => console.log('WebSocket connecté:', wsUrl)
        ws.onmessage = (event) => handleWSMessage(event.data)
        ws.onclose = (event: CloseEvent) => {
            console.log('WebSocket déconnecté', event)
            // If close was due to invalid room (code 4001), show alert and keep modal
            if (event && event.code === 4001) {
                alert('Code de salle invalide ou salle inexistante. Veuillez réessayer.')
                // Show join modal again
                const joinRoleModal = document.getElementById('joinRoleModal')
                if (joinRoleModal) {
                    joinRoleModal.style.display = 'flex'
                }
            }
        }
        ws.onerror = (err: Event) => {
            console.error('WebSocket erreur:', err)
            alert('Impossible de se connecter à la salle. Veuillez vérifier le code et réessayer.')
            // Show join modal again
            const joinRoleModal = document.getElementById('joinRoleModal')
            if (joinRoleModal) joinRoleModal.style.display = 'flex'
        }
        ;(window as any).pennyGameWS = ws
    }

    window.addEventListener('joinrole', (e: Event) => {
        const detail = (e as CustomEvent).detail
        const username = detail?.username
        if (!username) return
        if (detail.roomAction === 'create' && detail.roomId) {
            updateGameCode(detail.roomId)
            joinRoom(detail.roomId, username)
            connectWebSocket(detail.roomId, username)
            fetchGameState(detail.roomId)
        } else if (detail.roomAction === 'join' && detail.roomCode) {
            updateGameCode(detail.roomCode)
            joinRoom(detail.roomCode, username)
            connectWebSocket(detail.roomCode, username)
            fetchGameState(detail.roomCode)
        }
    })

    // Copy code to clipboard
    const copyBtn = document.getElementById('copyCodeBtn')
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const gameCodeSpan = document.getElementById('gameCode')
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
    const playerList = document.getElementById('playerList')
    const spectatorList = document.getElementById('spectatorList')
    let draggedItem: HTMLElement | null = null

    function handleDragStart(e: DragEvent) {
        draggedItem = e.target as HTMLElement
        if (!draggedItem || !e.dataTransfer) return
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', draggedItem.textContent || '')
        setTimeout(() => draggedItem!.classList.add('dragging'), 0)
    }

    function handleDragEnd(e: DragEvent) {
        if (draggedItem) draggedItem.classList.remove('dragging')
        draggedItem = null
    }

    function handleDragOver(e: DragEvent) {
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    }

    function handleDrop(e: DragEvent, targetList: HTMLElement) {
        e.preventDefault()
        if (draggedItem && targetList && draggedItem.parentNode !== targetList) {
            const username = (draggedItem.textContent || '').replace(/^.*?\s/, '').trim()
            let newRole = ''
            if (targetList.id === 'playerList') {
                newRole = 'player'
            } else if (targetList.id === 'spectatorList') {
                newRole = 'spectator'
            }
            // Get current room code from UI
            const roomId = document.getElementById('gameCode')?.textContent?.trim() || ''
            if (apiUrl && roomId && username && newRole) {
                fetch(`${apiUrl}/game/change_role/${roomId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, role: newRole }),
                })
                    .then((response) => {
                        if (!response.ok) throw new Error('Erreur lors du changement de rôle')
                        return response.json()
                    })
                    .then((data) => {
                        fetchGameState(roomId)
                    })
                    .catch((err) => {
                        alert(err.message || 'Impossible de changer le rôle')
                    })
            }
        }
    }

    function addDnDEvents(list: HTMLElement | null) {
        if (!list) return
        list.querySelectorAll('li[draggable="true"]').forEach((li) => {
            const liEl = li as HTMLElement
            liEl.addEventListener('dragstart', handleDragStart)
            liEl.addEventListener('dragend', handleDragEnd)
        })
    }

    // Always re-apply drop zone events after rendering
    function setupDropZones() {
        const playerList = document.getElementById('playerList') as HTMLElement | null
        const spectatorList = document.getElementById('spectatorList') as HTMLElement | null
        if (spectatorList) {
            spectatorList.addEventListener('dragover', (e) => {
                handleDragOver(e as DragEvent)
                spectatorList.classList.add('drag-over')
            })
            spectatorList.addEventListener('dragleave', () => {
                spectatorList.classList.remove('drag-over')
            })
            spectatorList.addEventListener('drop', (e) => {
                handleDrop(e as DragEvent, spectatorList)
                spectatorList.classList.remove('drag-over')
            })
        }
        if (playerList) {
            playerList.addEventListener('dragover', (e) => {
                handleDragOver(e as DragEvent)
                playerList.classList.add('drag-over')
            })
            playerList.addEventListener('dragleave', () => {
                playerList.classList.remove('drag-over')
            })
            playerList.addEventListener('drop', (e) => {
                handleDrop(e as DragEvent, playerList)
                playerList.classList.remove('drag-over')
            })
        }
    }

    // Call setupDropZones after each render
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
    const playerButtons = document.getElementById('playerButtons')
    const roundSelector = document.getElementById('roundSelector')
    const gameBoard = document.getElementById('gameBoard')
    const playersSpan = document.getElementById('selected-players')
    const roundSpan = document.getElementById('selected-round')

    // Get initial selected player count from active button
    let selectedPlayers = 2 // fallback
    if (playerButtons) {
        const activeBtn = playerButtons.querySelector('button.active') as HTMLElement | null
        if (activeBtn && activeBtn.dataset.count) {
            selectedPlayers = parseInt(activeBtn.dataset.count, 10)
        }
    }

    // Get initial selected round from active option
    let selectedRound = 1 // fallback
    if (roundSelector) {
        const activeRound = roundSelector.querySelector('.round-option.active') as HTMLElement | null
        if (activeRound && activeRound.dataset.round) {
            selectedRound = parseInt(activeRound.dataset.round, 10)
        }
    }

    // Player count selection
    if (playerButtons) {
        playerButtons.querySelectorAll('button').forEach((btn) => {
            const btnEl = btn as HTMLElement
            btnEl.addEventListener('click', () => {
                playerButtons.querySelectorAll('button').forEach((b) => (b as HTMLElement).classList.remove('active'))
                btnEl.classList.add('active')
                if (btnEl.dataset.count) {
                    selectedPlayers = parseInt(btnEl.dataset.count, 10)
                    updateConfig()
                    updateBoard()
                }
            })
        })
    }

    // Round selection
    if (roundSelector) {
        roundSelector.querySelectorAll('.round-option').forEach((opt) => {
            const optEl = opt as HTMLElement
            optEl.addEventListener('click', () => {
                roundSelector
                    .querySelectorAll('.round-option')
                    .forEach((o) => (o as HTMLElement).classList.remove('active'))
                optEl.classList.add('active')
                if (optEl.dataset.round) {
                    selectedRound = parseInt(optEl.dataset.round, 10)
                    updateConfig()
                }
            })
        })
    }

    function updateConfig() {
        if (playersSpan) playersSpan.textContent = selectedPlayers.toString()
        if (roundSpan) roundSpan.textContent = selectedRound.toString()
    }

    function updateBoard() {
        if (!gameBoard) return
        gameBoard.className = `game-board players-${selectedPlayers}`
    }

    // Initial config
    updateConfig()
    updateBoard()
})
export {}
