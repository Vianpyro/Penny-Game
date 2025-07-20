// DOM manipulation helpers for Penny Game

export function updateGameCode(code: string) {
    const gameCodeSpan = document.getElementById('gameCode')
    if (gameCodeSpan) gameCodeSpan.textContent = code
}

export function renderPlayers(
    players: string[],
    host: string,
    spectators: string[],
    activity: Record<string, boolean>,
    addDnDEvents: (list: HTMLElement | null) => void
) {
    const playerList = document.getElementById('playerList')
    if (!playerList) return
    playerList.innerHTML = ''
    // Filter out host and spectators from players
    const filteredPlayers = (players || []).filter((p) => p !== host && !(spectators || []).includes(p))
    if (!filteredPlayers.length) {
        const li = document.createElement('li')
        li.className = 'waiting'
        li.title = 'En attente'
        li.innerHTML = '<span class="status-indicator">⏳</span> En attente de joueurs'
        playerList.appendChild(li)
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
    addDnDEvents(playerList)
}

export function renderSpectators(
    spectators: string[],
    host: string,
    activity: Record<string, boolean>,
    addDnDEvents: (list: HTMLElement | null) => void
) {
    const spectatorList = document.getElementById('spectatorList')
    if (!spectatorList) return
    spectatorList.innerHTML = ''
    if (host) {
        const li = document.createElement('li')
        const isOnline = activity && activity[host]
        li.className = 'spectator host'
        li.title = 'Host'
        li.innerHTML = `<span class="status-indicator">👑</span> ${host}`
        spectatorList.appendChild(li)
    }
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
    addDnDEvents(spectatorList)
}

export function updateConfig(
    playersSpan: HTMLElement | null,
    roundSpan: HTMLElement | null,
    selectedPlayers: number,
    selectedRound: number
) {
    if (playersSpan) playersSpan.textContent = selectedPlayers.toString()
    if (roundSpan) roundSpan.textContent = selectedRound.toString()
}

export function updateBoard(gameBoard: HTMLElement | null, selectedPlayers: number) {
    if (!gameBoard) return
    gameBoard.className = `game-board players-${selectedPlayers}`
}
