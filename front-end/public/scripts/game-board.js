// Game board logic for Penny Game with cooperative mechanics and timers
// Adapted for v2 backend: .state -> .phase, no credentials in fetch
import { flipCoin } from './api.js'
import { showNotification } from './utility.js'
import { LEAN_TERMS } from './bilingual-terms.js'
import { supportsEmoji } from './utility.js'

const coinEmoji = supportsEmoji('🪙') ? '🪙' : '💰'

const TOTAL_COINS = 15
const FLIP_HOLD_DURATION = 1000

const activeHolds = new Map()
const localFlipsInProgress = new Set()

export async function fetchBoardGameState(gameCode) {
    const apiUrl = document.getElementById('joinRoleModal')?.getAttribute('data-api-url') || ''
    if (!apiUrl || !gameCode) return null
    try {
        const res = await fetch(`${apiUrl}/game/state/${gameCode}`)
        if (!res.ok) return null
        return await res.json()
    } catch (error) {
        console.error('Error fetching game state:', error)
        return null
    }
}

function formatTime(seconds) {
    if (!seconds && seconds !== 0) return '--:--'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
}

function formatPlayerTimer(timer) {
    if (!timer || !timer.started_at) {
        return { status: 'waiting', time: '--:--', statusText: 'En attente' }
    }
    if (timer.ended_at && timer.duration_seconds != null) {
        return { status: 'completed', time: formatTime(timer.duration_seconds), statusText: 'Terminé' }
    }
    if (timer.started_at && !timer.ended_at) {
        try {
            const elapsed = Math.max(0, (new Date() - new Date(timer.started_at)) / 1000)
            return { status: 'running', time: formatTime(elapsed), statusText: 'En cours' }
        } catch (_) {
            return { status: 'waiting', time: '--:--', statusText: 'Erreur' }
        }
    }
    return { status: 'waiting', time: '--:--', statusText: 'En attente' }
}

let previousGameState = null
let isSendingBatch = false

export function renderGameBoard(gameState) {
    const gameBoard = document.getElementById('gameBoard')
    if (!gameBoard || !gameState || !gameState.players || !gameState.player_coins) return

    try {
        if (!previousGameState) {
            fullRenderGameBoard(gameBoard, gameState)
        } else {
            const playersChanged = JSON.stringify(previousGameState.players) !== JSON.stringify(gameState.players)
            if (playersChanged || isSendingBatch) {
                fullRenderGameBoard(gameBoard, gameState)
            } else {
                incrementalUpdateGameBoard(gameBoard, gameState)
            }
        }
        previousGameState = JSON.parse(JSON.stringify(gameState))
    } catch (error) {
        console.error('Error rendering game board:', error)
        try {
            fullRenderGameBoard(gameBoard, gameState)
            previousGameState = JSON.parse(JSON.stringify(gameState))
        } catch (_) { }
    }
}

function fullRenderGameBoard(gameBoard, gameState) {
    gameBoard.innerHTML = ''
    gameBoard.appendChild(createGameStatusElement(gameState))
    if (window.isHost) addResetButton()
    gameBoard.appendChild(createProductionLineElement(gameState))
    if (gameState.player_timers && Object.keys(gameState.player_timers).length > 0) addTimersSummary(gameState)
    gameBoard.appendChild(createRulesReminderElement(gameState))
    setTimeout(() => {
        document.querySelectorAll('.coin.flip').forEach((coin) => {
            if (!coin.textContent.includes(coinEmoji)) coin.innerHTML = coinEmoji
        })
    }, 0)
}

function incrementalUpdateGameBoard(gameBoard, gameState) {
    try {
        updateGameStatus(gameState)
        gameState.players.forEach((player, index) => updatePlayerStation(player, gameState, index))
        updateCompletionArea(gameState)
        if (gameState.player_timers && Object.keys(gameState.player_timers).length > 0) updateTimersSummary(gameState)
    } catch (_) {
        fullRenderGameBoard(gameBoard, gameState)
    }
}

function updateGameStatus(gameState) {
    const gameTimerDisplay = document.getElementById('gameTimerDisplay')
    if (gameTimerDisplay) {
        let timer = '--:--'
        if (gameState.round_started_at || gameState.started_at) {
            const start = new Date(gameState.round_started_at || gameState.started_at)
            if (!isNaN(start.getTime())) timer = formatTime((new Date() - start) / 1000)
        }
        gameTimerDisplay.textContent = timer
    }

    const progressStats = document.querySelector('.progress-stats')
    if (progressStats) {
        let tails = gameState.tails_remaining
        if (tails === undefined) {
            tails = 0
            Object.values(gameState.player_coins).forEach((coins) => {
                if (Array.isArray(coins)) tails += coins.filter((c) => !c).length
            })
        }
        progressStats.innerHTML = `
            <span class="stat">🪙 Total: ${gameState.total_completed || 0}/${TOTAL_COINS} terminées</span>
            <span class="stat">⏳ ${tails} pièces à traiter</span>
        `
    }
}

function updatePlayerStation(player, gameState, playerIndex) {
    const station = document.getElementById(`station-${player}`)
    const playerCoins = gameState.player_coins[player] || []
    const isCurrentPlayer = player === window.currentUsername
    const canInteract = isCurrentPlayer && !window.isHost && window.userRole === 'player'

    if (!station) {
        const productionLine = document.querySelector('.production-line')
        if (productionLine) {
            const newStation = createPlayerStation(player, gameState, playerIndex)
            const completionArea = productionLine.querySelector('.completion-area')
            if (completionArea) productionLine.insertBefore(newStation, completionArea)
            else productionLine.appendChild(newStation)
        }
        return
    }

    // Update stats
    const statsContainer = station.querySelector('.station-stats')
    if (statsContainer) {
        const tails = playerCoins.filter((c) => c === false).length
        const heads = playerCoins.filter((c) => c === true).length
        statsContainer.innerHTML = `
            <span class="stat">🪙 ${playerCoins.length} pièces</span>
            <span class="stat"><div class="flip grayscale">🪙</div> ${tails} à retourner</span>
            <span class="stat">🪙 ${heads} prêtes</span>
        `
    }

    // Update timer
    const timerElement = station.querySelector('.player-timer')
    if (timerElement && gameState.player_timers?.[player]) {
        const info = formatPlayerTimer(gameState.player_timers[player])
        timerElement.className = `player-timer ${info.status}`
        const timeEl = timerElement.querySelector('.timer-time')
        const statusEl = timerElement.querySelector('.timer-status')
        if (timeEl) timeEl.textContent = info.time
        if (statusEl) statusEl.textContent = info.statusText
    }

    // Update coins
    const coinsContainer = station.querySelector('.coins-container')
    if (coinsContainer) {
        if (playerCoins.length === 0) {
            coinsContainer.innerHTML = '<div class="empty-station">En attente de pièces...</div>'
        } else {
            const emptyMsg = coinsContainer.querySelector('.empty-station')
            if (emptyMsg) emptyMsg.remove()

            const existing = Array.from(coinsContainer.querySelectorAll('.coin-wrapper'))
            playerCoins.forEach((isHeads, index) => {
                const coinKey = `${player}-${index}`
                if (isCurrentPlayer && (activeHolds.has(coinKey) || localFlipsInProgress.has(coinKey))) return

                if (!existing[index]) {
                    coinsContainer.appendChild(createCoinElement(player, index, isHeads, canInteract))
                } else {
                    const coin = existing[index].querySelector('.coin')
                    if (coin && coin.classList.contains('heads') !== isHeads) {
                        updateCoinState(coin, isHeads, canInteract)
                        if (canInteract && !isHeads) {
                            const ring = existing[index].querySelector('.coin-progress-ring')
                            const newCoin = coin.cloneNode(true)
                            newCoin.textContent = coinEmoji
                            coin.parentNode.replaceChild(newCoin, coin)
                            setupCoinHoldEvents(newCoin, index, ring)
                        }
                    }
                }
            })
            for (let i = existing.length - 1; i >= playerCoins.length; i--) {
                activeHolds.delete(`${player}-${i}`)
                localFlipsInProgress.delete(`${player}-${i}`)
                if (existing[i]?.parentNode === coinsContainer) existing[i].remove()
            }
        }
    }

    // Update actions
    updateStationActions(station, player, playerCoins, gameState, canInteract, playerIndex)
}

function updateCoinState(coin, isHeads, canInteract) {
    coin.classList.remove('heads', 'tails', 'grayscale', 'interactive', 'holdable')
    if (isHeads) {
        coin.classList.add('heads')
        coin.title = 'Face - Prête à envoyer'
        coin.style.cursor = 'default'
    } else {
        coin.classList.add('tails', 'grayscale')
        if (canInteract) {
            coin.classList.add('interactive', 'holdable')
            coin.style.cursor = 'grab'
            coin.title = 'Maintenez pour retourner'
        }
    }
    coin.textContent = coinEmoji
}

function updateStationActions(station, player, playerCoins, gameState, canInteract, playerIndex) {
    if (!canInteract) {
        const existing = station.querySelector('.station-actions')
        if (existing) existing.remove()
        return
    }
    const heads = playerCoins.filter((c) => c).length
    const total = playerCoins.length
    const canSend = heads >= gameState.batch_size || (heads > 0 && heads === total)

    if (total === 0) {
        const existing = station.querySelector('.station-actions')
        if (existing) existing.remove()
        return
    }

    let actions = station.querySelector('.station-actions')
    if (isSendingBatch && actions) return

    if (!actions) {
        actions = document.createElement('div')
        actions.className = 'station-actions'
        station.appendChild(actions)
    }
    actions.innerHTML = ''

    const btn = document.createElement('button')
    btn.className = `btn ${canSend ? 'btn-primary' : 'btn-disabled'}`
    btn.textContent = playerIndex === gameState.players.length - 1
        ? `Terminer ${heads} pièce${heads > 1 ? 's' : ''}`
        : `Envoyer lot (${heads}/${gameState.batch_size})`
    btn.disabled = !canSend

    if (canSend) {
        btn.addEventListener('click', async (e) => {
            e.preventDefault()
            e.stopPropagation()
            if (btn.disabled) return
            btn.disabled = true
            const orig = btn.textContent
            btn.textContent = 'Envoi en cours...'
            try {
                await handleSendBatch()
            } catch (_) {
                btn.disabled = false
                btn.textContent = orig
            }
        })
    }
    actions.appendChild(btn)
}

function updateCompletionArea(gameState) {
    const container = document.querySelector('.completed-coins')
    const count = document.querySelector('.completion-count')
    const total = gameState.total_completed || 0
    if (container) container.innerHTML = Array(total).fill(coinEmoji).join('')
    if (count) count.textContent = `${total}/${TOTAL_COINS}`
}

function updateTimersSummary(gameState) {
    if (!gameState.players) return
    gameState.players.forEach((player) => {
        const el = document.querySelector(`.timer-value[data-player="${player}"]`)
        if (el && gameState.player_timers?.[player]) {
            const info = formatPlayerTimer(gameState.player_timers[player])
            el.textContent = info.time
            const card = el.closest('.timer-card')
            if (card) {
                card.className = `timer-card ${info.status}`
                const status = card.querySelector('.timer-status')
                if (status) status.textContent = info.statusText
            }
        }
    })
}

function createGameStatusElement(gameState) {
    const el = document.createElement('div')
    el.className = 'game-status'
    let timer = '--:--'
    if (gameState.round_started_at || gameState.started_at) {
        const start = new Date(gameState.round_started_at || gameState.started_at)
        if (!isNaN(start.getTime())) timer = formatTime((new Date() - start) / 1000)
    }
    el.innerHTML = `
        <div class="status-header">
            <h2>🎲 Partie en cours - Lot de ${gameState.batch_size}</h2>
            <div class="game-timer"><span class="timer-label">⏱️ Temps de jeu:</span><span class="timer-value" id="gameTimerDisplay">${timer}</span></div>
            <div class="game-progress"><div class="progress-stats">
                <span class="stat">🪙 Total: ${gameState.total_completed || 0}/${TOTAL_COINS} terminées</span>
                <span class="stat">⏳ ${gameState.tails_remaining || 0} pièces à traiter</span>
            </div></div>
        </div>
    `
    return el
}

function createProductionLineElement(gameState) {
    const line = document.createElement('div')
    line.className = 'production-line'
    gameState.players.forEach((player, i) => {
        line.appendChild(createPlayerStation(player, gameState, i))
        if (i < gameState.players.length - 1) {
            const arrow = document.createElement('div')
            arrow.className = 'flow-arrow'
            arrow.innerHTML = '➡️'
            line.appendChild(arrow)
        }
    })
    const completion = document.createElement('div')
    completion.className = 'completion-area'
    completion.innerHTML = `
        <div class="completion-station"><h3>✅ Terminé</h3>
            <div class="completed-coins">${Array(gameState.total_completed || 0).fill(coinEmoji).join('')}</div>
            <div class="completion-count">${gameState.total_completed || 0}/${TOTAL_COINS}</div>
        </div>
    `
    line.appendChild(completion)
    return line
}

function createRulesReminderElement(gameState) {
    const el = document.createElement('div')
    el.className = 'rules-reminder'
    el.innerHTML = `
        <h4>📋 Rappel des règles:</h4>
        <ul>
            <li>🔄 Retournez les pièces de pile vers face</li>
            <li>📦 Envoyez par ${LEAN_TERMS.BATCH_SIZE} de ${gameState.batch_size}</li>
            <li>⚡ Travaillez en parallèle pour optimiser le ${LEAN_TERMS.FLOW} !</li>
            <li>🎯 Objectif : minimiser le ${LEAN_TERMS.LEAD_TIME}</li>
            <li>🪙 ${TOTAL_COINS} pièces au total</li>
        </ul>
    `
    return el
}

function createPlayerStation(player, gameState, playerIndex) {
    const station = document.createElement('div')
    station.className = 'player-station'
    station.id = `station-${player}`
    const isCurrentPlayer = player === window.currentUsername
    const isHost = window.isHost
    const playerCoins = gameState.player_coins[player] || []
    const tails = playerCoins.filter((c) => !c).length
    const heads = playerCoins.filter((c) => c).length
    const canInteract = isCurrentPlayer && !isHost && window.userRole === 'player'
    const timerInfo = formatPlayerTimer(gameState.player_timers?.[player])

    station.innerHTML = `
        <div class="station-header">
            <h3>${isCurrentPlayer ? '⭐' : '👤'} ${player}</h3>
            <div class="player-status">${isCurrentPlayer ? 'Votre Station' : 'Station partenaire'}</div>
            <div class="player-timer ${timerInfo.status}">
                <span class="timer-icon">⏱️</span>
                <span class="timer-time" data-player="${player}">${timerInfo.time}</span>
                <span class="timer-status">${timerInfo.statusText}</span>
            </div>
        </div>
        <div class="station-stats">
            <span class="stat">🪙 ${playerCoins.length} pièces</span>
            <span class="stat"><div class="flip grayscale">🪙</div> ${tails} à retourner</span>
            <span class="stat">🪙 ${heads} prêtes</span>
        </div>
    `

    const coinsContainer = document.createElement('div')
    coinsContainer.className = 'coins-container'
    if (playerCoins.length > 0) {
        playerCoins.forEach((isHeads, index) => coinsContainer.appendChild(createCoinElement(player, index, isHeads, canInteract)))
    } else {
        const empty = document.createElement('div')
        empty.className = 'empty-station'
        empty.textContent = 'En attente de pièces...'
        coinsContainer.appendChild(empty)
    }
    station.appendChild(coinsContainer)

    if (canInteract && playerCoins.length > 0) {
        const canSend = heads >= gameState.batch_size || (heads > 0 && heads === playerCoins.length)
        const actions = document.createElement('div')
        actions.className = 'station-actions'
        const btn = document.createElement('button')
        btn.className = `btn ${canSend ? 'btn-primary' : 'btn-disabled'}`
        btn.textContent = playerIndex === gameState.players.length - 1
            ? `Terminer ${heads} pièce${heads > 1 ? 's' : ''}`
            : `Envoyer lot (${heads}/${gameState.batch_size})`
        btn.disabled = !canSend
        if (canSend) {
            btn.addEventListener('click', async (e) => {
                e.preventDefault(); e.stopPropagation()
                try { await handleSendBatch() } catch (_) { }
            })
        }
        actions.appendChild(btn)
        station.appendChild(actions)
    }

    return station
}

function createCoinElement(player, index, isHeads, canInteract) {
    const wrapper = document.createElement('div')
    wrapper.className = 'coin-wrapper'
    const coin = document.createElement('div')
    coin.className = `flip coin ${isHeads ? 'heads' : 'tails'}`
    coin.textContent = coinEmoji
    coin.dataset.coinIndex = index
    coin.dataset.player = player
    if (!isHeads) coin.classList.add('grayscale')

    const ring = document.createElement('div')
    ring.className = 'coin-progress-ring'
    ring.innerHTML = '<svg class="progress-ring__svg"><circle class="progress-ring__circle-bg"></circle><circle class="progress-ring__circle"></circle></svg>'

    wrapper.appendChild(coin)
    wrapper.appendChild(ring)

    if (canInteract && !isHeads) {
        coin.classList.add('interactive', 'holdable')
        coin.style.cursor = 'grab'
        coin.title = 'Maintenez pour retourner'
        setupCoinHoldEvents(coin, index, ring)
    }
    return wrapper
}

function setupCoinHoldEvents(coinElement, coinIndex, progressRing) {
    const player = coinElement.dataset.player
    const coinKey = `${player}-${coinIndex}`
    let holdTimer = null, progressInterval = null, startTime = null, isHolding = false, flipCompleted = false

    const updateProgress = (progress) => {
        const circle = progressRing.querySelector('.progress-ring__circle')
        if (!circle) return
        const r = 18, c = 2 * Math.PI * r
        circle.style.strokeDasharray = `${c} ${c}`
        circle.style.strokeDashoffset = c - progress * c
    }

    const startHold = (e) => {
        e.preventDefault(); e.stopPropagation()
        if (isHolding || flipCompleted) return
        isHolding = true; startTime = Date.now()
        activeHolds.set(coinKey, { startTime, element: coinElement })
        coinElement.classList.add('holding'); coinElement.style.cursor = 'grabbing'
        progressRing.classList.add('active')
        updateProgress(0)

        progressInterval = setInterval(() => {
            const progress = Math.min((Date.now() - startTime) / FLIP_HOLD_DURATION, 1)
            updateProgress(progress)
            if (progress >= 1 && !flipCompleted) { flipCompleted = true; completeFlip() }
        }, 16)
    }

    const endHold = (e) => {
        e.preventDefault(); e.stopPropagation()
        if (!isHolding || flipCompleted) return
        isHolding = false
        if (progressInterval) { clearInterval(progressInterval); progressInterval = null }
        activeHolds.delete(coinKey)
        coinElement.classList.remove('holding'); coinElement.style.cursor = 'grab'
        progressRing.classList.remove('active')
        updateProgress(0)
    }

    const completeFlip = () => {
        if (progressInterval) { clearInterval(progressInterval); progressInterval = null }
        activeHolds.delete(coinKey)
        localFlipsInProgress.add(coinKey)
        coinElement.classList.add('flip-success')
        progressRing.classList.add('complete')
        performCoinFlip(coinIndex, coinElement)
        setTimeout(() => {
            coinElement.classList.remove('holding', 'flip-success')
            progressRing.classList.remove('active', 'complete')
            updateProgress(0)
            isHolding = false; flipCompleted = false
            setTimeout(() => localFlipsInProgress.delete(coinKey), 500)
        }, 500)
    }

    coinElement.addEventListener('mousedown', startHold)
    coinElement.addEventListener('mouseup', endHold)
    coinElement.addEventListener('mouseleave', endHold)
    coinElement.addEventListener('touchstart', startHold, { passive: false })
    coinElement.addEventListener('touchend', endHold, { passive: false })
    coinElement.addEventListener('touchcancel', endHold, { passive: false })
    coinElement.addEventListener('contextmenu', (e) => e.preventDefault())
}

async function performCoinFlip(coinIndex, coinElement) {
    const gameCode = document.getElementById('game-code')?.textContent?.trim() || ''
    const apiUrl = document.getElementById('joinRoleModal')?.getAttribute('data-api-url') || ''
    const username = window.currentUsername
    if (!apiUrl || !gameCode || !username) return

    coinElement.classList.add('flipped')
    coinElement.classList.remove('grayscale', 'tails', 'interactive', 'holdable')
    coinElement.classList.add('heads')
    coinElement.style.cursor = 'default'

    const newCoin = coinElement.cloneNode(true)
    newCoin.textContent = coinEmoji
    coinElement.parentNode.replaceChild(newCoin, coinElement)

    try {
        await flipCoin(apiUrl, gameCode, username, coinIndex)
    } catch (_) {
        newCoin.classList.remove('flipped', 'heads')
        newCoin.classList.add('grayscale', 'tails')
        newCoin.style.cursor = 'grab'
        const ring = newCoin.parentElement?.querySelector('.coin-progress-ring')
        if (ring) setupCoinHoldEvents(newCoin, coinIndex, ring)
    }
}

function addTimersSummary(gameState) {
    const board = document.getElementById('gameBoard')
    if (!board || board.querySelector('.timers-summary')) return
    const summary = document.createElement('div')
    summary.className = 'timers-summary'
    summary.innerHTML = '<h3>📊 Temps par Joueur</h3>'
    const grid = document.createElement('div')
    grid.className = 'timers-grid'
    gameState.players.forEach((player) => {
        const info = formatPlayerTimer(gameState.player_timers?.[player])
        const card = document.createElement('div')
        card.className = `timer-card ${info.status}`
        card.innerHTML = `<div class="timer-player">${player}</div><div class="timer-value" data-player="${player}">${info.time}</div><div class="timer-status">${info.statusText}</div>`
        grid.appendChild(card)
    })
    summary.appendChild(grid)
    board.appendChild(summary)
}

async function handleSendBatch() {
    if (isSendingBatch) return
    const gameCode = document.getElementById('game-code')?.textContent?.trim()
    const apiUrl = document.getElementById('joinRoleModal')?.getAttribute('data-api-url')
    const username = window.currentUsername
    if (!apiUrl || !gameCode || !username) throw new Error('Missing data')
    if (window.isHost) { showNotification('Les hôtes ne peuvent pas jouer', 'error'); throw new Error('Host') }
    if (window.userRole !== 'player') { showNotification('Seuls les joueurs peuvent envoyer', 'error'); throw new Error('Not player') }
    if (!window.gameState || window.gameState.phase !== 'active') { showNotification("Partie non active", 'error'); throw new Error('Not active') }

    isSendingBatch = true
    try {
        const res = await fetch(`${apiUrl}/game/send/${gameCode}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ username }),
        })
        if (!res.ok) throw new Error((await res.json()).detail || "Erreur d'envoi")
        return await res.json()
    } catch (error) {
        showNotification(`Erreur: ${error.message}`, 'error')
        throw error
    } finally {
        isSendingBatch = false
    }
}

export function addResetButton() {
    const board = document.getElementById('gameBoard')
    if (!board || board.querySelector('#resetGameBtn')) return
    const container = document.createElement('div')
    container.className = 'host-controls'
    container.innerHTML = '<button class="btn btn-secondary" id="resetGameBtn">🔄 Réinitialiser la partie</button>'
    board.appendChild(container)
    document.getElementById('resetGameBtn')?.addEventListener('click', async () => {
        if (!confirm('Réinitialiser la partie ?')) return
        const gameCode = document.getElementById('game-code')?.textContent?.trim() || ''
        const apiUrl = document.getElementById('joinRoleModal')?.getAttribute('data-api-url') || ''
        if (!apiUrl || !gameCode) return
        try {
            const { buildHostHeaders } = await import('./api.js')
            await fetch(`${apiUrl}/game/reset/${gameCode}`, { method: 'POST', headers: buildHostHeaders() })
        } catch (error) {
            showNotification(`Erreur: ${error.message}`, 'error')
        }
    })
}

function clearGameBoardState() {
    previousGameState = null
    activeHolds.clear()
    localFlipsInProgress.clear()
    isSendingBatch = false
}

export { clearGameBoardState }
