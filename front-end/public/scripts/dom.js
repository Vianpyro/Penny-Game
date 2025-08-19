import { ENHANCED_FRENCH_LOCALE } from "../scripts/bilingual-terms.js";

export function updateGameCode(code) {
    const gameCodeSpan = document.getElementById('game-code')
    if (gameCodeSpan) gameCodeSpan.textContent = code
}

export function renderPlayers(players, host, spectators, activity, addDnDEvents) {
    const playerList = document.getElementById('playerList')
    if (!playerList) return

    playerList.innerHTML = ''

    // Filter out host and spectators from players
    const filteredPlayers = (players || []).filter((p) => p !== host && !(spectators || []).includes(p))

    if (!filteredPlayers.length) {
        const li = document.createElement('li')
        li.className = 'waiting'
        li.title = 'En attente'
        li.innerHTML = `<span class="status-indicator">⏳</span> En attente de ${ENHANCED_FRENCH_LOCALE.players}`
        playerList.appendChild(li)

        // Update player count display
        updatePlayerCountDisplay(0)
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

    if (addDnDEvents) {
        addDnDEvents(playerList)
    }

    // Update player count display
    updatePlayerCountDisplay(filteredPlayers.length)
}

export function renderSpectators(spectators, host, activity, addDnDEvents) {
    const spectatorList = document.getElementById('spectatorList')
    if (!spectatorList) return

    spectatorList.innerHTML = ''

    if (host) {
        const li = document.createElement('li')
        li.className = 'spectator host'
        li.title = 'Hôte de la partie'
        li.innerHTML = `<span class="status-indicator">👑</span> ${host}`
        spectatorList.appendChild(li)
    }

    ; (spectators || [])
        .filter((spectator) => spectator !== host)
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

    if (addDnDEvents) {
        addDnDEvents(spectatorList)
    }
}

export function updatePlayerCountDisplay(currentCount = null) {
    const currentCountSpan = document.getElementById('currentPlayerCount')
    const requiredCountSpan = document.getElementById('requiredPlayerCount')
    const countStatus = document.getElementById('countStatus')
    const startBtn = document.getElementById('startBtn')

    // Get current count from game state if not provided
    if (currentCount === null) {
        currentCount = window.gameState?.players?.length || 0
    }

    const requiredPlayers = window.gameState?.required_players || 5

    if (currentCountSpan) {
        currentCountSpan.textContent = currentCount
    }

    if (requiredCountSpan) {
        requiredCountSpan.textContent = requiredPlayers
    }

    // Update status
    if (countStatus) {
        countStatus.classList.remove('ready', 'waiting', 'insufficient')

        const statusText = countStatus.querySelector('.status-text')
        if (statusText) {
            if (currentCount === requiredPlayers) {
                countStatus.classList.add('ready')
                statusText.textContent = 'Prêt à commencer !'
            } else if (currentCount < requiredPlayers) {
                if (currentCount === 0) {
                    countStatus.classList.add('waiting')
                    statusText.textContent = 'En attente de joueurs...'
                } else {
                    countStatus.classList.add('insufficient')
                    const needed = requiredPlayers - currentCount
                    statusText.textContent = `${needed} joueur${needed > 1 ? 's' : ''} manquant${needed > 1 ? 's' : ''}`
                }
            } else {
                countStatus.classList.add('insufficient')
                const excess = currentCount - requiredPlayers
                statusText.textContent = `${excess} joueur${excess > 1 ? 's' : ''} en trop`
            }
        }
    }

    // Update start button
    if (startBtn) {
        const hasCorrectPlayerCount = currentCount === requiredPlayers
        const isHost = window.isHost

        startBtn.disabled = !hasCorrectPlayerCount || !isHost

        if (!isHost) {
            startBtn.textContent = "Seul l'hôte peut démarrer"
        } else if (!hasCorrectPlayerCount) {
            if (currentCount < requiredPlayers) {
                const needed = requiredPlayers - currentCount
                startBtn.textContent = `${needed} joueur${needed > 1 ? 's' : ''} manquant${needed > 1 ? 's' : ''}`
            } else {
                const excess = currentCount - requiredPlayers
                startBtn.textContent = `${excess} joueur${excess > 1 ? 's' : ''} en trop`
            }
        } else {
            startBtn.textContent = 'Démarrer la Partie'
        }
    }
}

export function updateRoundConfiguration(roundType, requiredPlayers, selectedBatchSize, totalRounds) {
    console.debug('Updating round configuration UI:', { roundType, requiredPlayers, selectedBatchSize })

    // Update round type selection
    const roundCountOptions = document.querySelectorAll('.round-count-option')
    roundCountOptions.forEach((option) => {
        const type = option.dataset.type
        option.classList.toggle('active', type === roundType)
    })

    // Show/hide single batch selector
    const singleBatchSelector = document.getElementById('singleBatchSelector')
    if (singleBatchSelector) {
        singleBatchSelector.style.display = roundType === 'single' ? 'block' : 'none'

        if (roundType === 'single' && selectedBatchSize) {
            const batchOptions = singleBatchSelector.querySelectorAll('.batch-option')
            batchOptions.forEach((option) => {
                const size = parseInt(option.dataset.size, 10)
                option.classList.toggle('active', size === selectedBatchSize)
            })
        }
    }

    // Update player count buttons
    const playerCountButtons = document.querySelectorAll('.player-count-btn')
    playerCountButtons.forEach((btn) => {
        const count = parseInt(btn.dataset.count, 10)
        btn.classList.toggle('active', count === requiredPlayers)
    })

    // Update global state
    if (window.gameState) {
        window.gameState.round_type = roundType
        window.gameState.required_players = requiredPlayers
        window.gameState.selected_batch_size = selectedBatchSize
    }

    // Update displays
    updatePlayerCountDisplay()
    updateConfigurationDisplayForNonHosts(roundType, requiredPlayers, selectedBatchSize)

    // Update any round info displays
    const roundInfoElements = document.querySelectorAll('.round-info')
    roundInfoElements.forEach((element) => {
        let infoText = ''
        switch (roundType) {
            case 'single':
                infoText = `1 manche - Lot de ${selectedBatchSize}`
                break
            case 'two_rounds':
                infoText = '2 manches - Lots de 15 puis 1'
                break
            case 'three_rounds':
                infoText = '3 manches - Lots de 15, 5, puis 1'
                break
        }
        element.textContent = infoText
    })
}

export function updateConfigurationDisplayForNonHosts(roundType, requiredPlayers, selectedBatchSize) {
    // Only update for non-hosts
    if (window.isHost) return

    const nonHostRules = document.getElementById('nonHostRules')
    if (!nonHostRules) return

    // Remove existing config display
    const existingConfig = nonHostRules.querySelector('.current-config-display')
    if (existingConfig) existingConfig.remove()

    // Create new config display
    const configDisplay = document.createElement('div')
    configDisplay.className = 'current-config-display'

    const roundTypeText =
        {
            single: '1 ${LEAN_TERMS.ROUND}',
            two_rounds: '2 ${LEAN_TERMS.ROUNDS}',
            three_rounds: '3 ${LEAN_TERMS.ROUNDS}',
        }[roundType] || 'Configuration par défaut'

    let batchInfo = ''
    if (roundType === 'single' && selectedBatchSize) {
        batchInfo = ` - Lot de ${selectedBatchSize}`
    }

    configDisplay.innerHTML = `
        <h4>⚙️ Configuration Actuelle</h4>
        <div class="config-info">
            <span class="config-badge">${roundTypeText}${batchInfo}</span>
            <span class="config-badge">${requiredPlayers || 5} joueurs requis</span>
        </div>
        <p style="margin: 10px 0 0; font-size: 0.85em; color: #7f8c8d; font-style: italic;">
            Configuration définie par l'hôte
        </p>
    `

    // Insert at the beginning of the rules container
    const rulesContainer = nonHostRules.querySelector('.rules')
    if (rulesContainer) {
        rulesContainer.insertBefore(configDisplay, rulesContainer.firstChild)
    }
}

export function updateCurrentRoundDisplay(currentRound, totalRounds, batchSize) {
    // Update any current round displays
    const currentRoundElements = document.querySelectorAll('.current-round-display')
    currentRoundElements.forEach((element) => {
        element.textContent = `Manche ${currentRound}/${totalRounds} - Lot de ${batchSize}`
    })

    // Update progress indicators
    const roundProgressElements = document.querySelectorAll('.round-progress')
    roundProgressElements.forEach((element) => {
        // Clear existing progress
        element.innerHTML = ''

        // Add progress dots
        for (let i = 1; i <= totalRounds; i++) {
            const dot = document.createElement('div')
            dot.className = 'progress-dot'
            if (i < currentRound) {
                dot.classList.add('completed')
            } else if (i === currentRound) {
                dot.classList.add('current')
            }
            dot.textContent = i
            element.appendChild(dot)
        }
    })
}

export function showNextRoundButton(nextRound, nextBatchSize) {
    const nextRoundBtn = document.getElementById('nextRoundBtn')
    if (nextRoundBtn) {
        nextRoundBtn.style.display = 'inline-block'
        nextRoundBtn.textContent = `Manche ${nextRound} (Lot de ${nextBatchSize})`
        nextRoundBtn.disabled = !window.isHost

        if (!window.isHost) {
            nextRoundBtn.title = "Seul l'hôte peut démarrer la manche suivante"
        }
    }
}

export function hideNextRoundButton() {
    const nextRoundBtn = document.getElementById('nextRoundBtn')
    if (nextRoundBtn) {
        nextRoundBtn.style.display = 'none'
    }
}

export function updateConfig(playersSpan, roundSpan, selectedPlayers, selectedRound) {
    // Legacy function for backward compatibility
    if (playersSpan) playersSpan.textContent = selectedPlayers.toString()
    if (roundSpan) roundSpan.textContent = selectedRound.toString()
}
