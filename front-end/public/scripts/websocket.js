/**
 * WebSocket client for the Penny Game.
 *
 * Connects to the v2 event-sourced backend via Redis Pub/Sub relay.
 * Key v2 changes:
 *   - "state" field is now "phase" in all payloads
 *   - Round results come pre-calculated from the backend
 *   - Token auth via query param (no more cookies)
 */

import { renderPlayers, renderSpectators, updateRoundConfiguration, updatePlayerCountDisplay } from './dom.js'
import { addDnDEvents } from './dnd.js'
import { renderGameBoard, clearGameBoardState } from './game-board.js'
import { showNotification } from './utility.js'
import { ViewManager } from './view-manager.js'
import { TimeUtils } from './time-utils.js'
import { GameActions } from './game-actions.js'
import { LEAN_TERMS, generateBilingualInsights } from './bilingual-terms.js'
import { getSessionToken } from './api.js'

const TOTAL_COINS = 15

// --- Stats Tracker ---

window.gameStatsTracker = {
    roundResults: [],

    reset() {
        this.roundResults = []
    },

    addRoundResult(result) {
        if (!result) return
        if (this.roundResults.find((r) => r.round_number === result.round_number)) return
        this.roundResults.push(result)
    },

    getGameSummary() {
        if (this.roundResults.length === 0) return null

        const rounds = this.roundResults
        const valid = rounds.filter((r) => r.duration_seconds && r.duration_seconds > 0)
        const totalTime = valid.reduce((s, r) => s + r.duration_seconds, 0)
        const avgTime = valid.length > 0 ? totalTime / valid.length : 0
        const bestTime = valid.length > 0 ? Math.min(...valid.map((r) => r.duration_seconds)) : 0

        const leadTimes = rounds.filter((r) => r.lead_time_seconds > 0).map((r) => r.lead_time_seconds)

        return {
            totalRounds: rounds.length,
            totalGameTime: totalTime,
            averageRoundTime: avgTime,
            bestRoundTime: bestTime,
            bestLeadTime: leadTimes.length > 0 ? Math.min(...leadTimes) : 0,
            worstLeadTime: leadTimes.length > 0 ? Math.max(...leadTimes) : 0,
            batchSizeImpact: _calcBatchImpact(rounds),
            playerSummary: _calcPlayerSummary(rounds),
            roundResults: rounds,
        }
    },
}

function _calcBatchImpact(rounds) {
    const impact = {}
    for (const r of rounds) {
        if (!impact[r.batch_size]) {
            impact[r.batch_size] = { rounds: 0, totalTime: 0, validRounds: 0, avgTime: 0, totalLeadTime: 0, leadTimeRounds: 0, avgLeadTime: 0, totalEfficiency: 0, avgEfficiency: 0 }
        }
        const b = impact[r.batch_size]
        b.rounds++
        if (r.duration_seconds > 0) {
            b.totalTime += r.duration_seconds
            b.validRounds++
            const eff = Math.round(((r.total_completed || TOTAL_COINS) / r.duration_seconds) * 60 * 100) / 100
            b.totalEfficiency += eff
        }
        if (r.lead_time_seconds > 0) {
            b.totalLeadTime += r.lead_time_seconds
            b.leadTimeRounds++
        }
    }
    for (const b of Object.values(impact)) {
        if (b.validRounds > 0) { b.avgTime = b.totalTime / b.validRounds; b.avgEfficiency = b.totalEfficiency / b.validRounds }
        if (b.leadTimeRounds > 0) b.avgLeadTime = b.totalLeadTime / b.leadTimeRounds
    }
    return impact
}

function _calcPlayerSummary(rounds) {
    const stats = {}
    for (const r of rounds) {
        if (!r.player_timers) continue
        for (const [name, timer] of Object.entries(r.player_timers)) {
            if (!stats[name]) stats[name] = { player: name, roundsCompleted: 0, totalTime: 0, bestTime: Infinity, avgTime: 0, avgEfficiency: 0, totalEfficiency: 0 }
            const ds = timer.duration_seconds
            if (ds != null) {
                stats[name].roundsCompleted++
                stats[name].totalTime += ds
                stats[name].bestTime = Math.min(stats[name].bestTime, ds)
            }
        }
    }
    for (const s of Object.values(stats)) {
        if (s.roundsCompleted > 0) s.avgTime = s.totalTime / s.roundsCompleted
        if (s.bestTime === Infinity) s.bestTime = 0
    }
    return stats
}

// --- Message Dispatcher ---

export function handleWSMessage(raw) {
    try {
        if (typeof raw === 'string' && !raw.startsWith('{')) return
        const msg = JSON.parse(raw)

        const handlers = {
            welcome: handleWelcome,
            game_state: handlePhaseChange,
            action_made: handleActionMade,
            game_started: handleGameStarted,
            round_started: handleRoundStarted,
            round_complete: handleRoundComplete,
            game_over: handleGameOver,
            game_reset: handleGameReset,
            round_config_update: handleRoundConfigUpdate,
            activity: handleActivity,
            user_joined: handleUserJoined,
            user_disconnected: handleUserDisconnected,
            user_connected: () => { },
            user_reconnected: () => { },
            chat: () => { },
        }

        const handler = handlers[msg.type]
        if (handler) handler(msg)
    } catch (error) {
        console.error('WS parse error:', error, raw)
    }
}

// --- Handlers ---

function handleWelcome(msg) {
    const gs = msg.game_state
    if (!gs) return

    window.gameState = gs
    window.isHost = gs.host === window.currentUsername
    window.userRole = gs.players.includes(window.currentUsername) ? 'player' : 'spectator'

    window.dispatchEvent(new CustomEvent('userrolechange'))
    window.dispatchEvent(new CustomEvent('gamestateupdate'))

    const activity = {}
    gs.players.forEach((p) => (activity[p] = true))
    gs.spectators.forEach((s) => (activity[s] = true))
    renderPlayers(gs.players, gs.host, gs.spectators, activity, addDnDEvents)
    renderSpectators(gs.spectators, gs.host, activity, addDnDEvents)

    if (gs.round_type && gs.required_players !== undefined) {
        updateRoundConfiguration(gs.round_type, gs.required_players, gs.selected_batch_size, gs.total_rounds)
    }
    updatePlayerCountDisplay()

    // Restore view based on current phase
    switch (gs.phase) {
        case 'active':
            ViewManager.switchToGameView()
            renderGameBoard(gs)
            break
        case 'round_complete':
            ViewManager.switchToRoundCompleteView()
            break
        case 'results':
            ViewManager.switchToResultsView()
            updateResultsDisplay()
            break
        default:
            // lobby — default view
            break
    }
}

function handlePhaseChange(msg) {
    // v2: msg may have "state" (from game_state type) or "phase"
    const phase = msg.phase || msg.state
    if (window.gameState) window.gameState.phase = phase

    switch (phase) {
        case 'lobby': ViewManager.switchToLobbyView(); break
        case 'active': ViewManager.switchToGameView(); break
        case 'round_complete': ViewManager.switchToRoundCompleteView(); break
        case 'results': ViewManager.switchToResultsView(); break
    }
}

function handleActionMade(msg) {
    // Build a game state snapshot from the action message
    const gs = {
        ...window.gameState,
        player_coins: msg.player_coins,
        sent_coins: msg.sent_coins,
        total_completed: msg.total_completed,
        tails_remaining: msg.tails_remaining,
        phase: msg.phase,
        current_round: msg.current_round,
        player_timers: msg.player_timers || {},
        lead_time_seconds: msg.lead_time_seconds,
        first_flip_at: msg.first_flip_at,
        first_delivery_at: msg.first_delivery_at,
    }

    renderGameBoard(gs)
    window.gameState = gs

    if (msg.action === 'send' && msg.batch_count >= 3) {
        showNotification(`${msg.player} a envoyé ${msg.batch_count} pièces`, 'info')
    }
}

function handleGameStarted(msg) {
    window.gameStatsTracker.reset()
    ViewManager.switchToGameView()

    const gs = {
        ...window.gameState,
        ...msg,
        phase: 'active',
        started_at: new Date().toISOString(),
    }
    renderGameBoard(gs)
    window.gameState = gs

    const roundText = msg.total_rounds > 1 ? ` (Manche ${msg.current_round}/${msg.total_rounds})` : ''
    showNotification(`🎮 Partie démarrée${roundText} !`, 'success')
}

function handleRoundStarted(msg) {
    ViewManager.switchToGameView()

    const gs = {
        ...window.gameState,
        ...msg,
        phase: 'active',
        started_at: new Date().toISOString(),
    }
    renderGameBoard(gs)
    window.gameState = gs

    showNotification(`🚀 Manche ${msg.current_round}/${msg.total_rounds} démarrée !`, 'success')
}

function handleRoundComplete(msg) {
    if (window.gameState) {
        window.gameState.phase = 'round_complete'
        window.gameState.current_round = msg.round_number
    }

    if (msg.round_result) {
        window.gameStatsTracker.addRoundResult(msg.round_result)
    }

    ViewManager.switchToRoundCompleteView()
    updateRoundCompleteDisplay(msg)

    const nextText = msg.next_round ? ` Manche ${msg.next_round} disponible !` : ' Toutes les manches terminées !'
    showNotification(`✅ Manche ${msg.round_number} terminée !${nextText}`, 'success')
}

function handleGameOver(msg) {
    // Save any round results from final state
    if (msg.round_results) {
        for (const r of msg.round_results) {
            window.gameStatsTracker.addRoundResult(r)
        }
    }

    ViewManager.switchToResultsView()
    showNotification('🎯 Partie terminée ! Félicitations !', 'success')
    updateResultsDisplay()
}

function handleGameReset(msg) {
    ViewManager.switchToLobbyView()
    window.gameStatsTracker.reset()
    clearGameBoardState()

    if (msg.round_type && msg.required_players !== undefined) {
        updateRoundConfiguration(msg.round_type, msg.required_players, msg.selected_batch_size, msg.total_rounds)
    }
    if (window.gameState) {
        window.gameState.phase = 'lobby'
        window.gameState.current_round = 0
        window.gameState.player_timers = {}
    }
    updatePlayerCountDisplay()
    showNotification('🔄 La partie a été réinitialisée', 'info')
}

function handleRoundConfigUpdate(msg) {
    if (window.gameState) {
        window.gameState.round_type = msg.round_type
        window.gameState.required_players = msg.required_players
        window.gameState.selected_batch_size = msg.selected_batch_size
    }
    updateRoundConfiguration(msg.round_type, msg.required_players, msg.selected_batch_size, msg.total_rounds)
    window.dispatchEvent(new CustomEvent('gamestateupdate'))
    updatePlayerCountDisplay()
    showNotification(`⚙️ Configuration mise à jour, ${msg.required_players} joueurs`, 'info')
}

function handleActivity(msg) {
    renderPlayers(msg.players, msg.host, msg.spectators, msg.activity || {}, addDnDEvents)
    renderSpectators(msg.spectators, msg.host, msg.activity || {}, addDnDEvents)

    if (window.gameState) {
        window.gameState.players = msg.players
        window.gameState.spectators = msg.spectators
        window.gameState.host = msg.host
    }

    const wasHost = window.isHost
    window.isHost = msg.host === window.currentUsername
    if (wasHost !== window.isHost) window.dispatchEvent(new CustomEvent('userrolechange'))

    updatePlayerCountDisplay()
}

function handleUserJoined(msg) {
    const activity = {}
        ; (msg.players || []).forEach((p) => (activity[p] = true))
        ; (msg.spectators || []).forEach((s) => (activity[s] = true))

    renderPlayers(msg.players, window.gameState?.host, msg.spectators, activity, addDnDEvents)
    renderSpectators(msg.spectators, window.gameState?.host, activity, addDnDEvents)

    if (window.gameState) {
        window.gameState.players = msg.players
        window.gameState.spectators = msg.spectators
    }
    updatePlayerCountDisplay()
}

function handleUserDisconnected(msg) {
    if (msg.message) showNotification(msg.message, 'info')
}

// --- Round Complete Display ---

function updateRoundCompleteDisplay(msg) {
    const section = document.getElementById('roundComplete')
    if (!section) return

    const el = (id) => document.getElementById(id)

    if (el('completedRoundNumber')) el('completedRoundNumber').textContent = msg.round_number
    if (el('completedBatchSize') && msg.round_result) el('completedBatchSize').textContent = msg.round_result.batch_size
    if (el('completedRoundTime') && msg.round_result?.duration_seconds) {
        el('completedRoundTime').textContent = TimeUtils.formatTime(msg.round_result.duration_seconds)
    }
    if (el('completedLeadTime')) {
        el('completedLeadTime').textContent = msg.round_result?.lead_time_seconds
            ? TimeUtils.formatTime(msg.round_result.lead_time_seconds) : '--:--'
    }

    // Player timers
    _renderPlayerTimers(el('roundPlayerTimersGrid'), msg.round_result)

    // Round statistics
    _updateRoundStats(msg.round_result)

    // Progress bar
    const totalRounds = window.gameState?.total_rounds || 3
    _updateProgressBar(msg.round_number, totalRounds)

    // Next round or game complete
    const nextSection = el('nextRoundSection')
    const completeSection = el('gameCompleteSection')

    if (msg.next_round && msg.next_batch_size) {
        if (nextSection) nextSection.style.display = 'block'
        if (completeSection) completeSection.style.display = 'none'
        if (el('nextRoundNumber')) el('nextRoundNumber').textContent = msg.next_round
        if (el('nextBatchSize')) el('nextBatchSize').textContent = msg.next_batch_size
        if (el('nextBatchSizeDesc')) el('nextBatchSizeDesc').textContent = msg.next_batch_size
        const btn = el('nextRoundBtn')
        if (btn) {
            btn.disabled = !window.isHost
            const numSpan = btn.querySelector('#nextRoundButtonNumber')
            if (numSpan) numSpan.textContent = msg.next_round
        }
    } else {
        if (nextSection) nextSection.style.display = 'none'
        if (completeSection) completeSection.style.display = 'block'
    }

    section.style.display = 'block'
}

function _renderPlayerTimers(grid, result) {
    if (!grid || !result?.player_timers) return
    grid.innerHTML = ''

    const timers = Object.entries(result.player_timers)
        .map(([name, t]) => ({ ...t, player: t.player || name }))
        .sort((a, b) => a.player.localeCompare(b.player))

    for (const timer of timers) {
        const info = TimeUtils.formatPlayerTimer(timer)
        const card = document.createElement('div')
        card.className = `player-timer-result ${info.status}`
        card.innerHTML = `
            <div class="player-name">${timer.player}</div>
            <div class="player-time">${info.time}</div>
            <div class="player-status">${info.statusText}</div>
        `
        grid.appendChild(card)
    }
}

function _updateRoundStats(result) {
    if (!result) return
    const el = (id) => document.getElementById(id)
    if (el('totalCoinsCompleted')) el('totalCoinsCompleted').textContent = result.total_completed || TOTAL_COINS
    if (el('participantCount') && result.player_timers) {
        el('participantCount').textContent = Object.keys(result.player_timers).length
    }
    if (el('roundEfficiency') && result.duration_seconds) {
        const eff = TimeUtils.calculateEfficiency(result.total_completed || TOTAL_COINS, result.duration_seconds)
        el('roundEfficiency').textContent = eff
    }
    if (el('roundLeadTime')) {
        el('roundLeadTime').textContent = result.lead_time_seconds ? TimeUtils.formatTime(result.lead_time_seconds) : '--:--'
    }
    if (el('avgPlayerTime') && result.player_timers) {
        const times = Object.values(result.player_timers).filter((t) => t.duration_seconds != null).map((t) => t.duration_seconds)
        if (times.length > 0) {
            el('avgPlayerTime').textContent = TimeUtils.formatTime(times.reduce((a, b) => a + b, 0) / times.length)
        }
    }
}

function _updateProgressBar(currentRound, totalRounds) {
    const bar = document.getElementById('roundProgressBar')
    if (!bar) return
    bar.innerHTML = ''
    for (let i = 1; i <= totalRounds; i++) {
        const dot = document.createElement('div')
        dot.className = 'progress-dot'
        dot.textContent = i
        if (i < currentRound) dot.classList.add('completed')
        else if (i === currentRound) dot.classList.add('current')
        bar.appendChild(dot)
        if (i < totalRounds) {
            const arrow = document.createElement('div')
            arrow.className = 'progress-arrow'
            arrow.textContent = '→'
            bar.appendChild(arrow)
        }
    }
    const cur = document.getElementById('currentProgressRound')
    const tot = document.getElementById('totalProgressRounds')
    if (cur) cur.textContent = currentRound
    if (tot) tot.textContent = totalRounds
}

// --- Results Display ---

export function updateResultsDisplay() {
    const summary = window.gameStatsTracker.getGameSummary()
    if (!summary || summary.roundResults.length === 0) return

    _updateMainStats(summary)
    _updateRoundBreakdown(summary.roundResults)
    _updateBatchAnalysis(summary.batchSizeImpact)
    _updatePlayerSummary(summary.playerSummary)
    _updateInsights(summary)

    const actions = document.getElementById('resultsActions')
    if (actions && window.isHost) {
        actions.style.display = 'flex'
        GameActions.setupStandardButtons()
    }
}

window.updateResultsDisplay = updateResultsDisplay

function _updateMainStats(summary) {
    const el = (id) => document.getElementById(id)
    if (el('gameTimeValue')) el('gameTimeValue').textContent = TimeUtils.formatTime(summary.totalGameTime)

    const grid = el('statsGrid')
    if (!grid) return

    const valid = summary.roundResults.filter((r) => r.duration_seconds > 0)
    grid.innerHTML = `
        <div class="stat-card"><div class="stat-value">${summary.totalRounds}</div><div class="stat-label">Manches jouées</div></div>
        <div class="stat-card"><div class="stat-value">${valid.length > 0 ? TimeUtils.formatTime(summary.averageRoundTime) : 'N/A'}</div><div class="stat-label">${LEAN_TERMS.AVERAGE_TIME}/manche</div></div>
        <div class="stat-card"><div class="stat-value">${valid.length > 0 ? TimeUtils.formatTime(summary.bestRoundTime) : 'N/A'}</div><div class="stat-label">${LEAN_TERMS.BEST_TIME}</div></div>
        <div class="stat-card"><div class="stat-value">${Object.keys(summary.playerSummary).length}</div><div class="stat-label">Joueurs</div></div>
    `
}

function _updateRoundBreakdown(rounds) {
    const results = document.getElementById('results')
    if (!results) return

    const existing = results.querySelector('.round-breakdown-section')
    if (existing) existing.remove()

    const section = document.createElement('div')
    section.className = 'round-breakdown-section'
    section.innerHTML = `<h3>📊 Détail par Manche</h3><div class="round-breakdown-grid" id="roundBreakdownGrid"></div>`

    const timersSection = results.querySelector('.player-timers-section') || results.querySelector('.game-time-section')
    if (timersSection) timersSection.after(section)
    else results.appendChild(section)

    const grid = document.getElementById('roundBreakdownGrid')
    for (const r of rounds) {
        const time = r.duration_seconds ? TimeUtils.formatTime(r.duration_seconds) : 'N/A'
        const eff = r.duration_seconds ? (Math.round(((r.total_completed || TOTAL_COINS) / r.duration_seconds) * 60 * 100) / 100).toFixed(1) : '--'

        const card = document.createElement('div')
        card.className = 'round-summary-card'
        card.innerHTML = `
            <div class="round-header">
                <div class="round-number-badge">${r.round_number}</div>
                <div class="round-batch-info"><div class="batch-size">Lot de ${r.batch_size}</div></div>
            </div>
            <div class="round-stats-mini">
                <div class="mini-stat"><div class="mini-stat-value">${time}</div><div class="mini-stat-label">${LEAN_TERMS.TOTAL_TIME}</div></div>
                <div class="mini-stat"><div class="mini-stat-value">${eff}</div><div class="mini-stat-label">${LEAN_TERMS.THROUGHPUT}</div></div>
            </div>
        `
        grid.appendChild(card)
    }
}

function _updateBatchAnalysis(impact) {
    const results = document.getElementById('results')
    if (!results || Object.keys(impact).length <= 1) return

    const existing = results.querySelector('.batch-analysis-section')
    if (existing) existing.remove()

    const section = document.createElement('div')
    section.className = 'batch-analysis-section'
    section.innerHTML = `<h3>📦 Impact de la ${LEAN_TERMS.BATCH_SIZE}</h3><div class="batch-comparison-grid" id="batchComparisonGrid"></div>`

    const insights = results.querySelector('.insights')
    if (insights) insights.before(section)
    else results.appendChild(section)

    const grid = document.getElementById('batchComparisonGrid')
    for (const size of Object.keys(impact).sort((a, b) => b - a)) {
        const d = impact[size]
        const card = document.createElement('div')
        card.className = 'batch-comparison-card'
        card.innerHTML = `
            <div class="batch-size-header"><div class="batch-size-number">${size}</div><div class="batch-size-label">Lot de ${size}</div></div>
            <div class="batch-metrics">
                <div class="batch-metric"><div class="metric-value">${TimeUtils.formatTime(d.avgTime)}</div><div class="metric-label">${LEAN_TERMS.TOTAL_TIME}</div></div>
                <div class="batch-metric lead-time-metric"><div class="metric-value">${d.avgLeadTime > 0 ? TimeUtils.formatTime(d.avgLeadTime) : '--:--'}</div><div class="metric-label">${LEAN_TERMS.LEAD_TIME}</div></div>
                <div class="batch-metric"><div class="metric-value">${d.avgEfficiency.toFixed(1)}</div><div class="metric-label">${LEAN_TERMS.THROUGHPUT}</div></div>
            </div>
        `
        grid.appendChild(card)
    }
}

function _updatePlayerSummary(playerSummary) {
    const grid = document.getElementById('playerTimersGrid')
    if (!grid) return
    grid.innerHTML = ''

    const sorted = Object.values(playerSummary).filter((p) => p.roundsCompleted > 0).sort((a, b) => a.player.localeCompare(b.player))

    for (const ps of sorted) {
        const card = document.createElement('div')
        card.className = 'player-timer-result completed'
        card.innerHTML = `
            <div class="player-name">${ps.player}</div>
            <div class="player-time">${TimeUtils.formatTime(ps.avgTime)}</div>
            <div class="player-status">Moyenne sur ${ps.roundsCompleted} manche${ps.roundsCompleted > 1 ? 's' : ''}</div>
            <div class="player-details">
                <div class="player-detail"><span class="detail-label">Meilleur:</span><span class="detail-value">${TimeUtils.formatTime(ps.bestTime)}</span></div>
            </div>
        `
        grid.appendChild(card)
    }
}

function _updateInsights(summary) {
    const list = document.getElementById('insightsList')
    if (!list) return

    const insights = generateBilingualInsights({
        batchSizeImpact: summary.batchSizeImpact,
        totalTime: summary.totalGameTime,
        averageTime: summary.averageRoundTime,
        playerCount: Object.keys(summary.playerSummary).length,
    })
    list.innerHTML = insights.map((i) => `<li>${i}</li>`).join('')
}

// --- WebSocket Connection ---

export function connectWebSocket(apiUrl, roomId, username) {
    if (!apiUrl || !roomId || !username) return

    window.currentUsername = username

    const token = getSessionToken()
    if (!token) {
        showNotification('Session invalide: reconnectez-vous', 'error')
        return
    }

    const wsUrl = apiUrl.replace(/^http/, 'ws') + `/ws/${roomId}/${encodeURIComponent(username)}?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => showNotification('🔗 Connecté à la salle', 'success')
    ws.onmessage = (event) => handleWSMessage(event.data)

    ws.onclose = (event) => {
        if (event.code === 4002) return
        showNotification('❌ Connexion perdue', 'error')
        setTimeout(() => {
            if (confirm('Connexion perdue. Reconnecter ?')) window.location.reload()
        }, 1000)
    }

    ws.onerror = () => showNotification('❌ Erreur de connexion', 'error')

    window.pennyGameWS = ws
    return ws
}
