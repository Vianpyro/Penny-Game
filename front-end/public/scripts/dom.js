/**
 * DOM rendering utilities for the Penny Game.
 */

export function updateGameCode(code) {
    const el = document.getElementById('game-code')
    if (el) el.textContent = code
    const joinInfo = document.getElementById('joinInfo')
    if (joinInfo) joinInfo.style.display = 'block'
}

export function renderPlayers(players, host, spectators, activity, callback) {
    const list = document.getElementById('playerList')
    if (!list) return
    list.innerHTML = ''
    if (!players || players.length === 0) {
        list.innerHTML = '<li class="empty-message">Aucun joueur pour le moment</li>'
        return
    }
    for (const player of players) {
        const li = document.createElement('li')
        li.draggable = true
        const isActive = activity?.[player]
        const icon = player === host ? '👑' : isActive ? '🟢' : '⚪'
        li.textContent = `${icon} ${player}`
        li.dataset.username = player
        list.appendChild(li)
    }
    if (callback) callback()
}

export function renderSpectators(spectators, host, activity, callback) {
    const list = document.getElementById('spectatorList')
    if (!list) return
    list.innerHTML = ''
    if (!spectators || spectators.length === 0) {
        list.innerHTML = '<li class="empty-message">Aucun spectateur</li>'
        return
    }
    for (const spectator of spectators) {
        const li = document.createElement('li')
        li.draggable = true
        const isActive = activity?.[spectator]
        const icon = isActive ? '👀' : '🙈'
        li.textContent = `${icon} ${spectator}`
        li.dataset.username = spectator
        list.appendChild(li)
    }
    if (callback) callback()
}

export function updateRoundConfiguration(roundType, requiredPlayers, selectedBatchSize, totalRounds) {
    const roundCountSelector = document.getElementById('roundCountSelector')
    const singleBatchSelector = document.getElementById('singleBatchSelector')

    if (roundCountSelector) {
        roundCountSelector.querySelectorAll('.round-count-option').forEach((opt) => {
            opt.classList.toggle('active', opt.dataset.type === roundType)
        })
    }
    if (singleBatchSelector) {
        singleBatchSelector.style.display = roundType === 'single' ? 'block' : 'none'
        if (selectedBatchSize) {
            singleBatchSelector.querySelectorAll('.batch-option').forEach((opt) => {
                opt.classList.toggle('active', parseInt(opt.dataset.size) === selectedBatchSize)
            })
        }
    }

    const playerCountButtons = document.getElementById('playerCountButtons')
    if (playerCountButtons && requiredPlayers) {
        playerCountButtons.querySelectorAll('.player-count-btn').forEach((btn) => {
            btn.classList.toggle('active', parseInt(btn.dataset.count) === requiredPlayers)
        })
    }
}

export function updatePlayerCountDisplay() {
    const playerList = document.getElementById('playerList')
    const countEl = document.getElementById('currentPlayerCount')
    const requiredEl = document.getElementById('requiredPlayerCount')
    const startBtn = document.getElementById('startBtn')

    if (!playerList) return
    const count = playerList.querySelectorAll('li:not(.empty-message)').length
    if (countEl) countEl.textContent = count

    const required = window.gameState?.required_players || 5
    if (requiredEl) requiredEl.textContent = required

    if (startBtn && window.isHost) {
        startBtn.disabled = count < 2
        startBtn.style.display = 'block'
    }
}
