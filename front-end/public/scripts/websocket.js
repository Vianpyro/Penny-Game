// Enhanced websocket.js with comprehensive stats tracking
// Replaces the existing websocket.js file

import { renderPlayers, renderSpectators, updateRoundConfiguration, updatePlayerCountDisplay } from './dom.js'
import { addDnDEvents } from './dnd.js'
import { renderGameBoard } from './game-board.js'
import { showNotification } from './utility.js'
import { ViewManager } from './view-manager.js'
import { TimeUtils } from './time-utils.js'
import { GameActions } from './game-actions.js'

const DEFAULT_BATCH_SIZES = [15, 5, 1]
const TOTAL_COINS = DEFAULT_BATCH_SIZES[0]
const ROUND_TYPE_BATCH_SIZES = {
    three_rounds: DEFAULT_BATCH_SIZES,
    two_rounds: [TOTAL_COINS, 1],
    single: null, // User selects
}

// Global stats tracking
window.gameStatsTracker = {
    roundResults: [],
    gameStartTime: null,
    currentGameState: null,

    // Initialize/reset stats tracking
    reset() {
        this.roundResults = []
        this.gameStartTime = null
        this.currentGameState = null
        console.log('🔄 Stats tracker reset')
    },

    // Add a completed round's stats
    addRoundResult(roundResult) {
        if (!roundResult) return

        // Check if this round was already saved to avoid duplicates
        const existingRound = this.roundResults.find((r) => r.round_number === roundResult.round_number)
        if (existingRound) {
            console.log(`⚠️ Round ${roundResult.round_number} already saved, skipping duplicate`)
            return
        }

        // Fix missing data for the last round
        const fixedResult = this.fixMissingRoundData(roundResult)

        // Enhance round result with additional calculated stats
        const enhancedResult = {
            ...fixedResult,
            efficiency: this.calculateEfficiency(fixedResult),
            playerRankings: this.calculatePlayerRankings(fixedResult),
            avgPlayerTime: this.calculateAveragePlayerTime(fixedResult),
            completionRate: ((fixedResult.total_completed || 0) / 12) * 100,
            timestamp: new Date().toISOString(),
        }

        this.roundResults.push(enhancedResult)
        console.log(`📊 Round ${fixedResult.round_number} stats saved:`, enhancedResult)
    },

    // Fix missing data in round results (especially for last rounds)
    fixMissingRoundData(roundResult) {
        const fixed = { ...roundResult }

        // If game_duration_seconds is null but we have start/end times, calculate it
        if (!fixed.game_duration_seconds && fixed.started_at && fixed.ended_at) {
            try {
                const startTime = new Date(fixed.started_at)
                const endTime = new Date(fixed.ended_at)
                if (!isNaN(startTime.getTime()) && !isNaN(endTime.getTime())) {
                    fixed.game_duration_seconds = (endTime - startTime) / 1000
                    console.log(`🔧 Fixed missing game duration: ${fixed.game_duration_seconds}s`)
                }
            } catch (error) {
                console.error('Error calculating game duration:', error)
            }
        }

        // Fix missing lead time data
        if (!fixed.lead_time_seconds && fixed.first_flip_at && fixed.first_delivery_at) {
            try {
                const firstFlip = new Date(fixed.first_flip_at)
                const firstDelivery = new Date(fixed.first_delivery_at)
                if (!isNaN(firstFlip.getTime()) && !isNaN(firstDelivery.getTime())) {
                    fixed.lead_time_seconds = (firstDelivery - firstFlip) / 1000
                    console.log(`🔧 Fixed missing lead time: ${fixed.lead_time_seconds}s`)
                }
            } catch (error) {
                console.error('Error calculating lead time:', error)
            }
        }

        // If player timers have null values but the game has duration, estimate them
        if (fixed.player_timers && fixed.game_duration_seconds) {
            Object.keys(fixed.player_timers).forEach((playerName) => {
                const timer = fixed.player_timers[playerName]

                // If timer data is completely null, try to get from current game state
                if (timer.started_at === null && timer.ended_at === null && timer.duration_seconds === null) {
                    // Try to get timer data from current game state if available
                    const currentTimers = window.gameState?.player_timers
                    if (currentTimers && currentTimers[playerName]) {
                        const currentTimer = currentTimers[playerName]
                        if (currentTimer.started_at && currentTimer.ended_at && currentTimer.duration_seconds) {
                            fixed.player_timers[playerName] = { ...currentTimer }
                            console.log(`🔧 Fixed player timer for ${playerName} from current state`)
                        } else if (currentTimer.started_at && fixed.ended_at) {
                            // Calculate duration if we have start time and game end time
                            try {
                                const startTime = new Date(currentTimer.started_at)
                                const endTime = new Date(fixed.ended_at)
                                if (!isNaN(startTime.getTime()) && !isNaN(endTime.getTime())) {
                                    const duration = (endTime - startTime) / 1000
                                    fixed.player_timers[playerName] = {
                                        ...timer,
                                        started_at: currentTimer.started_at,
                                        ended_at: fixed.ended_at,
                                        duration_seconds: duration,
                                    }
                                    console.log(`🔧 Calculated missing timer for ${playerName}: ${duration}s`)
                                }
                            } catch (error) {
                                console.error(`Error calculating timer for ${playerName}:`, error)
                            }
                        }
                    }
                }
            })
        }

        return fixed
    },

    // Emergency save method - tries to save from current game state
    emergencySaveCurrentRound() {
        if (!this.currentGameState || !this.currentGameState.current_round) {
            console.log('❌ No current game state for emergency save')
            return false
        }

        const currentRound = this.currentGameState.current_round
        const existingRound = this.roundResults.find((r) => r.round_number === currentRound)

        if (existingRound) {
            console.log(`✅ Round ${currentRound} already saved, no emergency save needed`)
            return false
        }

        // Create emergency round result with best available data
        const emergencyResult = {
            round_number: currentRound,
            batch_size: this.currentGameState.batch_size,
            game_duration_seconds: this.currentGameState.game_duration_seconds,
            player_timers: this.currentGameState.player_timers || {},
            total_completed: this.currentGameState.total_completed || 12,
            started_at: this.currentGameState.started_at,
            ended_at: this.currentGameState.ended_at || new Date().toISOString(),
        }

        // If game_duration_seconds is still null, try to calculate it
        if (!emergencyResult.game_duration_seconds && emergencyResult.started_at) {
            try {
                const startTime = new Date(emergencyResult.started_at)
                const endTime = new Date(emergencyResult.ended_at)
                if (!isNaN(startTime.getTime()) && !isNaN(endTime.getTime())) {
                    emergencyResult.game_duration_seconds = (endTime - startTime) / 1000
                    console.log(`🔧 Emergency calculated game duration: ${emergencyResult.game_duration_seconds}s`)
                }
            } catch (error) {
                console.error('Error in emergency duration calculation:', error)
            }
        }

        console.log('🚨 Emergency saving round stats:', emergencyResult)
        this.addRoundResult(emergencyResult)
        return true
    },

    // Calculate efficiency (coins per minute)
    calculateEfficiency(roundResult) {
        if (!roundResult.game_duration_seconds || roundResult.game_duration_seconds === 0) return 0
        const totalCoins = roundResult.total_completed || 12
        return Math.round((totalCoins / roundResult.game_duration_seconds) * 60 * 100) / 100
    },

    // Calculate player rankings based on completion time
    calculatePlayerRankings(roundResult) {
        if (!roundResult.player_timers) return []

        const completedPlayers = Object.values(roundResult.player_timers)
            .filter(
                (timer) => timer.ended_at && timer.duration_seconds !== null && timer.duration_seconds !== undefined
            )
            .sort((a, b) => (a.duration_seconds || 0) - (b.duration_seconds || 0))

        return completedPlayers.map((timer, index) => ({
            rank: index + 1,
            player: timer.player,
            time: timer.duration_seconds,
            efficiency: this.calculatePlayerEfficiency(timer.duration_seconds),
        }))
    },

    // Calculate average player completion time
    calculateAveragePlayerTime(roundResult) {
        if (!roundResult.player_timers) return null

        const completedTimes = Object.values(roundResult.player_timers)
            .filter((timer) => timer.duration_seconds !== null && timer.duration_seconds !== undefined)
            .map((timer) => timer.duration_seconds)

        if (completedTimes.length === 0) return null

        const avgTime = completedTimes.reduce((sum, time) => sum + time, 0) / completedTimes.length
        return Math.round(avgTime * 100) / 100
    },

    // Calculate individual player efficiency
    calculatePlayerEfficiency(durationSeconds) {
        if (!durationSeconds || durationSeconds === 0) return 0
        // Assume each player processes roughly the same amount of coins
        const coinsPerPlayer = 12 / (window.gameState?.players?.length || 5)
        return Math.round((coinsPerPlayer / durationSeconds) * 60 * 100) / 100
    },

    // Get comprehensive game statistics
    getGameSummary() {
        if (this.roundResults.length === 0) return null

        // Check if we're missing rounds and try to force save them
        this.ensureAllRoundsAreSaved()

        const totalRounds = this.roundResults.length
        const validRounds = this.roundResults.filter((r) => r.game_duration_seconds && r.game_duration_seconds > 0)

        const totalGameTime = this.roundResults.reduce((sum, result) => sum + (result.game_duration_seconds || 0), 0)
        const averageRoundTime =
            validRounds.length > 0
                ? validRounds.reduce((sum, r) => sum + r.game_duration_seconds, 0) / validRounds.length
                : 0
        const bestRoundTime = validRounds.length > 0 ? Math.min(...validRounds.map((r) => r.game_duration_seconds)) : 0
        const worstRoundTime = validRounds.length > 0 ? Math.max(...validRounds.map((r) => r.game_duration_seconds)) : 0

        // Calculate lead time statistics
        const leadTimes = this.roundResults
            .filter((r) => r.lead_time_seconds && r.lead_time_seconds > 0)
            .map((r) => r.lead_time_seconds)

        const avgLeadTime = leadTimes.length > 0 ? leadTimes.reduce((sum, lt) => sum + lt, 0) / leadTimes.length : 0
        const bestLeadTime = leadTimes.length > 0 ? Math.min(...leadTimes) : 0
        const worstLeadTime = leadTimes.length > 0 ? Math.max(...leadTimes) : 0

        // Calculate batch size impact
        const batchSizeImpact = this.calculateBatchSizeImpact()

        // Player performance across all rounds
        const playerSummary = this.calculatePlayerSummary()

        return {
            totalRounds,
            totalGameTime,
            averageRoundTime,
            bestRoundTime,
            worstRoundTime,
            avgLeadTime,
            bestLeadTime,
            worstLeadTime,
            batchSizeImpact,
            playerSummary,
            roundResults: this.roundResults,
            validRounds: validRounds.length,
            incompleteRounds: totalRounds - validRounds.length,
        }
    },

    // Ensure all expected rounds are saved
    ensureAllRoundsAreSaved() {
        if (!window.gameState || !window.gameState.round_type) return

        const expectedRounds = getTotalRounds(window.gameState.round_type)
        const currentlySaved = this.roundResults.length

        console.log(`🔍 Checking rounds: Expected ${expectedRounds}, Saved ${currentlySaved}`)

        if (currentlySaved < expectedRounds) {
            console.log(`🚨 MISSING ROUNDS DETECTED! Attempting to save missing rounds...`)

            // Try emergency save first
            this.emergencySaveCurrentRound()

            // If still missing, create placeholder rounds
            const stillMissing = expectedRounds - this.roundResults.length
            if (stillMissing > 0) {
                console.log(`🔨 Creating ${stillMissing} placeholder round(s)`)

                for (let roundNum = this.roundResults.length + 1; roundNum <= expectedRounds; roundNum++) {
                    const batchSize = getBatchSizeForRound(window.gameState.round_type, roundNum)

                    const placeholderRound = {
                        round_number: roundNum,
                        batch_size: batchSize,
                        game_duration_seconds: null, // Will be marked as incomplete
                        player_timers: {},
                        total_completed: 12,
                        started_at: null,
                        ended_at: null,
                    }

                    // Try to get some data from current game state if it matches
                    if (window.gameState.current_round === roundNum) {
                        placeholderRound.game_duration_seconds = window.gameState.game_duration_seconds
                        placeholderRound.player_timers = window.gameState.player_timers || {}
                        placeholderRound.started_at = window.gameState.started_at
                        placeholderRound.ended_at = window.gameState.ended_at
                    }

                    console.log(`🔨 Adding placeholder for round ${roundNum}:`, placeholderRound)
                    this.addRoundResult(placeholderRound)
                }
            }
        }
    },

    // Calculate how batch size affected performance
    calculateBatchSizeImpact() {
        const batchSizes = {}

        this.roundResults.forEach((result) => {
            const size = result.batch_size
            if (!batchSizes[size]) {
                batchSizes[size] = {
                    rounds: 0,
                    totalTime: 0,
                    totalEfficiency: 0,
                    totalLeadTime: 0,
                    avgTime: 0,
                    avgEfficiency: 0,
                    avgLeadTime: 0,
                    validRounds: 0,
                    leadTimeRounds: 0,
                }
            }

            batchSizes[size].rounds++

            // Only add to totals if we have valid data
            if (result.game_duration_seconds && result.game_duration_seconds > 0) {
                batchSizes[size].totalTime += result.game_duration_seconds
                batchSizes[size].totalEfficiency += result.efficiency || 0
                batchSizes[size].validRounds++
            }

            if (result.lead_time_seconds && result.lead_time_seconds > 0) {
                batchSizes[size].totalLeadTime += result.lead_time_seconds
                batchSizes[size].leadTimeRounds++
            }
        })

        // Calculate averages only from valid data
        Object.keys(batchSizes).forEach((size) => {
            const data = batchSizes[size]
            if (data.validRounds > 0) {
                data.avgTime = data.totalTime / data.validRounds
                data.avgEfficiency = data.totalEfficiency / data.validRounds
            }

            if (data.leadTimeRounds > 0) {
                data.avgLeadTime = data.totalLeadTime / data.leadTimeRounds
            }
        })

        return batchSizes
    },

    // Calculate player performance summary across all rounds
    calculatePlayerSummary() {
        const playerStats = {}

        this.roundResults.forEach((result) => {
            if (!result.player_timers) return

            Object.values(result.player_timers).forEach((timer) => {
                const player = timer.player
                if (!playerStats[player]) {
                    playerStats[player] = {
                        player,
                        roundsCompleted: 0,
                        totalTime: 0,
                        bestTime: Infinity,
                        worstTime: 0,
                        avgTime: 0,
                        totalEfficiency: 0,
                        avgEfficiency: 0,
                    }
                }

                if (timer.duration_seconds !== null && timer.duration_seconds !== undefined) {
                    const stats = playerStats[player]
                    stats.roundsCompleted++
                    stats.totalTime += timer.duration_seconds
                    stats.bestTime = Math.min(stats.bestTime, timer.duration_seconds)
                    stats.worstTime = Math.max(stats.worstTime, timer.duration_seconds)

                    const efficiency = this.calculatePlayerEfficiency(timer.duration_seconds)
                    stats.totalEfficiency += efficiency
                }
            })
        })

        // Calculate averages
        Object.values(playerStats).forEach((stats) => {
            if (stats.roundsCompleted > 0) {
                stats.avgTime = stats.totalTime / stats.roundsCompleted
                stats.avgEfficiency = stats.totalEfficiency / stats.roundsCompleted

                // Fix infinity values
                if (stats.bestTime === Infinity) stats.bestTime = 0
            }
        })

        return playerStats
    },
}

export function handleWSMessage(data) {
    try {
        // Handle plain text messages (legacy chat format)
        if (typeof data === 'string' && !data.startsWith('{')) {
            if (data.includes('🔴') && data.includes('Host') && data.includes('left the room')) {
                alert("La salle a été fermée car l'hôte a quitté.")
                window.location.reload()
                return
            }
            return
        }

        const msg = JSON.parse(data)

        switch (msg.type) {
            case 'welcome':
                handleWelcomeMessage(msg)
                break
            case 'game_state':
                handleGameStateChange(msg)
                break
            case 'action_made':
                handleActionMade(msg)
                break
            case 'game_started':
                handleGameStarted(msg)
                break
            case 'round_started':
                handleRoundStarted(msg)
                break
            case 'round_complete':
                handleRoundComplete(msg)
                break
            case 'game_over':
                handleGameOver(msg)
                break
            case 'game_reset':
                handleGameReset(msg)
                break
            case 'round_config_update':
                handleRoundConfigUpdate(msg)
                break
            case 'activity':
                handleActivityUpdate(msg)
                break
            case 'user_joined':
                handleUserJoined(msg)
                break
            case 'user_connected':
            case 'user_reconnected':
            case 'user_disconnected':
                handleUserStatusChange(msg)
                break
            case 'host_disconnected':
                handleHostDisconnected(msg)
                break
            default:
                console.debug('Unknown message type:', msg.type, msg)
        }
    } catch (error) {
        console.error('Error parsing WS message:', error, data)
    }
}

function handleWelcomeMessage(msg) {
    const gameState = msg.game_state
    if (gameState) {
        // Update global game state immediately
        window.gameState = gameState
        window.gameStatsTracker.currentGameState = gameState

        // Set user role and host status properly
        const currentUsername = window.currentUsername
        window.isHost = gameState.host === currentUsername
        window.userRole = gameState.players.includes(currentUsername) ? 'player' : 'spectator'

        console.debug('Welcome message - Host status:', {
            currentUsername,
            gameHost: gameState.host,
            isHost: window.isHost,
            userRole: window.userRole,
        })

        // Trigger role update event
        window.dispatchEvent(new CustomEvent('userrolechange'))

        // Trigger game state update event for configuration sync
        window.dispatchEvent(new CustomEvent('gamestateupdate'))

        // Update user lists with empty activity (will be updated by activity message)
        const emptyActivity = {}
        renderPlayers(gameState.players, gameState.host, gameState.spectators, emptyActivity, addDnDEvents)
        renderSpectators(gameState.spectators, gameState.host, emptyActivity, addDnDEvents)

        // Update round configuration display for all players
        if (gameState.round_type && gameState.required_players !== undefined) {
            updateRoundConfiguration(
                gameState.round_type,
                gameState.required_players,
                gameState.selected_batch_size,
                getTotalRounds(gameState.round_type)
            )

            // Show configuration info notification for joining players
            if (!window.isHost) {
                const roundTypeText =
                    {
                        single: '1 manche',
                        two_rounds: '2 manches',
                        three_rounds: '3 manches',
                    }[gameState.round_type] || gameState.round_type

                showNotification(`⚙️ Configuration: ${roundTypeText}, ${gameState.required_players} joueurs`, 'info')
            }
        }

        // Update player count display
        updatePlayerCountDisplay()

        // Update game board if in active state
        if (gameState.state === 'active') {
            ViewManager.switchToGameView()
            renderGameBoard(gameState)
        } else if (gameState.state === 'round_complete') {
            ViewManager.switchToRoundCompleteView()
        } else if (gameState.state === 'results') {
            ViewManager.switchToResultsView()
            // Update results with current stats
            updateResultsDisplay()
        }
    }
}

function handleUserJoined(msg) {
    // Update the user lists immediately
    const activity = {}
    if (msg.players) {
        msg.players.forEach((p) => (activity[p] = true))
    }
    if (msg.spectators) {
        msg.spectators.forEach((s) => (activity[s] = true))
    }
    if (msg.host) {
        activity[msg.host] = true
    }

    renderPlayers(msg.players, window.gameState?.host, msg.spectators, activity, addDnDEvents)
    renderSpectators(msg.spectators, window.gameState?.host, activity, addDnDEvents)

    // Update global state
    if (window.gameState) {
        window.gameState.players = msg.players
        window.gameState.spectators = msg.spectators
    }

    // Update player count display
    updatePlayerCountDisplay()

    // Only show notification for new players joining, not for role changes
    if (!msg.note) {
        const roleText = msg.role === 'player' ? 'joueur' : 'spectateur'
        showNotification(`${msg.username} a rejoint en tant que ${roleText}`, 'info')
    }
}

function handleActivityUpdate(msg) {
    renderPlayers(msg.players, msg.host, msg.spectators, msg.activity, addDnDEvents)
    renderSpectators(msg.spectators, msg.host, msg.activity, addDnDEvents)

    // Update global state and host status
    if (window.gameState) {
        window.gameState.players = msg.players
        window.gameState.spectators = msg.spectators
        window.gameState.host = msg.host
    }

    // Update host status if needed
    const wasHost = window.isHost
    window.isHost = msg.host === window.currentUsername

    if (wasHost !== window.isHost) {
        console.debug('Host status changed:', { wasHost, isHost: window.isHost })
        window.dispatchEvent(new CustomEvent('userrolechange'))
    }

    // Update player count display
    updatePlayerCountDisplay()
}

function handleRoundConfigUpdate(msg) {
    console.debug('Round config update received:', msg)

    // Update global game state
    if (window.gameState) {
        window.gameState.round_type = msg.round_type
        window.gameState.required_players = msg.required_players
        window.gameState.selected_batch_size = msg.selected_batch_size
    }

    // Update UI for all players
    updateRoundConfiguration(msg.round_type, msg.required_players, msg.selected_batch_size, msg.total_rounds)

    // Trigger game state update event for configuration sync
    window.dispatchEvent(new CustomEvent('gamestateupdate'))

    // Update player count display
    updatePlayerCountDisplay()

    // Show notification
    const roundTypeText =
        {
            single: '1 manche',
            two_rounds: '2 manches',
            three_rounds: '3 manches',
        }[msg.round_type] || msg.round_type

    showNotification(`⚙️ Configuration: ${roundTypeText}, ${msg.required_players} joueurs`, 'info')
}

function handleGameStateChange(msg) {
    console.log('🔄 Game state change:', msg.state)

    if (window.gameState) {
        window.gameState.state = msg.state
        console.log('📌 Updated window.gameState.state to:', msg.state)
    }

    switch (msg.state) {
        case 'lobby':
            ViewManager.switchToLobbyView()
            break
        case 'active':
            ViewManager.switchToGameView()
            break
        case 'round_complete':
            ViewManager.switchToRoundCompleteView()
            break
        case 'results':
            ViewManager.switchToResultsView()
            break
    }
}

function handleActionMade(msg) {
    // Create a mock game state from the message data with timer information
    const gameState = {
        players: window.gameState?.players || [],
        batch_size: window.gameState?.batch_size || 12,
        player_coins: msg.player_coins,
        sent_coins: msg.sent_coins,
        total_completed: msg.total_completed,
        tails_remaining: calculateTailsRemaining(msg.player_coins),
        state: msg.state,
        current_round: msg.current_round,
        player_timers: msg.player_timers || {},
        game_duration_seconds: msg.game_duration_seconds,
        lead_time_seconds: msg.lead_time_seconds,
        first_flip_at: msg.first_flip_at,
        first_delivery_at: msg.first_delivery_at,
        started_at: window.gameState?.started_at,
        ended_at: window.gameState?.ended_at,
    }

    // Update the game board
    renderGameBoard(gameState)

    // Update current game state including the state field
    window.gameState = { ...window.gameState, ...gameState }
    window.gameStatsTracker.currentGameState = gameState

    console.log('🎯 Action made, current state:', gameState.state)

    // Only show notifications for send actions
    if (msg.action === 'send') {
        const isCompletion = msg.player === gameState.players[gameState.players.length - 1]
        if (isCompletion && msg.batch_count >= 3) {
            showNotification(
                `${msg.player} a terminé ${msg.batch_count} pièce${msg.batch_count > 1 ? 's' : ''}`,
                'success'
            )
        } else if (msg.batch_count >= 3) {
            showNotification(
                `${msg.player} a envoyé un lot de ${msg.batch_count} pièce${msg.batch_count > 1 ? 's' : ''}`,
                'info'
            )
        }
    }

    // Check if this action completed the round
    if (msg.round_complete) {
        console.log('🏁 Round completed via action, new state:', msg.state)

        // Ensure state is properly updated
        if (msg.state === 'round_complete') {
            window.gameState.state = 'round_complete'
            // Handle round completion
            handleRoundComplete({
                round_number: msg.current_round,
                round_result: {
                    round_number: msg.current_round,
                    batch_size: window.gameState?.batch_size || 12,
                    game_duration_seconds: msg.game_duration_seconds,
                    player_timers: msg.player_timers || {},
                    total_completed: msg.total_completed,
                    started_at: window.gameState?.started_at,
                    ended_at: new Date().toISOString(),
                },
                next_round:
                    msg.current_round < (window.gameState?.round_results?.length || 3) ? msg.current_round + 1 : null,
                batch_size: window.gameState?.batch_size || 12,
                game_over: msg.game_over,
            })
        } else if (msg.state === 'results') {
            window.gameState.state = 'results'
            handleGameOver({
                final_state: window.gameState,
            })
        }
    }
}

function handleGameStarted(msg) {
    // Reset stats tracking for new game
    window.gameStatsTracker.reset()
    window.gameStatsTracker.gameStartTime = new Date().toISOString()

    ViewManager.switchToGameView()

    const gameState = {
        players: msg.players,
        batch_size: msg.batch_size,
        current_round: msg.current_round,
        total_rounds: msg.total_rounds,
        round_type: msg.round_type,
        player_coins: msg.player_coins,
        sent_coins: msg.sent_coins || {},
        total_completed: msg.total_completed,
        tails_remaining: msg.tails_remaining,
        state: 'active',
        player_timers: msg.player_timers || {},
        game_duration_seconds: null,
        started_at: new Date().toISOString(),
        ended_at: null,
    }

    renderGameBoard(gameState)
    window.gameState = { ...window.gameState, ...gameState }
    window.gameStatsTracker.currentGameState = gameState

    const roundText = msg.total_rounds > 1 ? ` (Manche ${msg.current_round}/${msg.total_rounds})` : ''
    showNotification(`🎮 Partie démarrée${roundText} ! Travaillez ensemble !`, 'success')
}

function handleRoundStarted(msg) {
    ViewManager.switchToGameView()

    const gameState = {
        ...window.gameState,
        batch_size: msg.batch_size,
        current_round: msg.current_round,
        total_rounds: msg.total_rounds,
        player_coins: msg.player_coins,
        sent_coins: msg.sent_coins || {},
        total_completed: msg.total_completed,
        tails_remaining: msg.tails_remaining,
        state: 'active',
        player_timers: msg.player_timers || {},
        game_duration_seconds: null,
        started_at: new Date().toISOString(),
        ended_at: null,
    }

    renderGameBoard(gameState)
    window.gameState = gameState
    window.gameStatsTracker.currentGameState = gameState

    showNotification(`🚀 Manche ${msg.current_round}/${msg.total_rounds} démarrée !`, 'success')
}

function handleRoundComplete(msg) {
    console.log('🏁 Round complete message received:', msg)

    // Update the global game state FIRST
    if (window.gameState) {
        window.gameState.state = 'round_complete'
        window.gameState.current_round = msg.round_number

        // Update any other relevant state from the message
        if (msg.round_result) {
            window.gameState.game_duration_seconds = msg.round_result.game_duration_seconds
            window.gameState.player_timers = msg.round_result.player_timers || {}
        }

        console.log('📌 Updated game state to round_complete, current round:', window.gameState.current_round)
    }

    // Save round stats with lead time
    if (msg.round_result) {
        // Ensure lead time is included - ADD THIS BLOCK
        if (!msg.round_result.lead_time_seconds && window.gameState?.lead_time_seconds) {
            msg.round_result.lead_time_seconds = window.gameState.lead_time_seconds
            msg.round_result.first_flip_at = window.gameState.first_flip_at
            msg.round_result.first_delivery_at = window.gameState.first_delivery_at
        }

        console.log(`💾 Saving round ${msg.round_number} stats with lead time:`, msg.round_result.lead_time_seconds)
        window.gameStatsTracker.addRoundResult(msg.round_result)
    }

    // Switch view
    ViewManager.switchToRoundCompleteView()

    // Save round stats
    if (msg.round_result) {
        console.log(`💾 Saving round ${msg.round_number} stats:`, msg.round_result)
        window.gameStatsTracker.addRoundResult(msg.round_result)
    }

    // Update round complete screen
    updateRoundCompleteDisplay(msg)

    // Update next round button state
    updateNextRoundButton()

    const nextText = msg.next_round ? ` Manche ${msg.next_round} disponible !` : ' Toutes les manches terminées !'
    showNotification(`✅ Manche ${msg.round_number} terminée !${nextText}`, 'success')
}

function updateNextRoundButton() {
    const nextRoundBtn = document.getElementById('nextRoundBtn')
    if (!nextRoundBtn) return

    // Enable/disable based on host status and game state
    const isHost = window.isHost === true
    const isRoundComplete = window.gameState?.state === 'round_complete'

    nextRoundBtn.disabled = !isHost || !isRoundComplete

    if (!isHost) {
        nextRoundBtn.title = "Seul l'hôte peut démarrer la manche suivante"
    } else if (!isRoundComplete) {
        nextRoundBtn.title = 'En attente de la fin de la manche'
    } else {
        nextRoundBtn.title = 'Cliquez pour démarrer la manche suivante'
    }

    console.log('🔘 Next round button state:', {
        disabled: nextRoundBtn.disabled,
        isHost: isHost,
        gameState: window.gameState?.state,
    })
}

function updateProgressBar(currentRound, totalRounds) {
    const roundProgressBar = document.getElementById('roundProgressBar')
    const currentProgressRound = document.getElementById('currentProgressRound')
    const totalProgressRounds = document.getElementById('totalProgressRounds')

    if (roundProgressBar) {
        roundProgressBar.innerHTML = ''

        // Create progress dots
        for (let i = 1; i <= totalRounds; i++) {
            const dot = document.createElement('div')
            dot.className = 'progress-dot'
            dot.textContent = i

            if (i < currentRound) {
                dot.classList.add('completed')
            } else if (i === currentRound) {
                dot.classList.add('current')
            }

            roundProgressBar.appendChild(dot)

            // Add arrow between dots (except after last dot)
            if (i < totalRounds) {
                const arrow = document.createElement('div')
                arrow.className = 'progress-arrow'
                arrow.textContent = '→'
                roundProgressBar.appendChild(arrow)
            }
        }
    }

    if (currentProgressRound) currentProgressRound.textContent = currentRound
    if (totalProgressRounds) totalProgressRounds.textContent = totalRounds
}

// Enhanced updateRoundCompleteDisplay function (replace the existing one)
function updateRoundCompleteDisplay(msg) {
    const roundCompleteSection = document.getElementById('roundComplete')
    if (!roundCompleteSection) return

    const completedRoundNumber = document.getElementById('completedRoundNumber')
    const completedBatchSize = document.getElementById('completedBatchSize')
    const completedRoundTime = document.getElementById('completedRoundTime')
    const completedLeadTime = document.getElementById('completedLeadTime')
    const nextRoundSection = document.getElementById('nextRoundSection')
    const gameCompleteSection = document.getElementById('gameCompleteSection')
    const nextRoundNumber = document.getElementById('nextRoundNumber')
    const nextBatchSize = document.getElementById('nextBatchSize')
    const nextBatchSizeDesc = document.getElementById('nextBatchSizeDesc')
    const nextRoundBtn = document.getElementById('nextRoundBtn')

    // Update basic round info
    if (completedRoundNumber) completedRoundNumber.textContent = msg.round_number
    if (completedBatchSize) completedBatchSize.textContent = msg.round_result?.batch_size || 'N/A'
    if (completedRoundTime && msg.round_result?.game_duration_seconds) {
        completedRoundTime.textContent = TimeUtils.formatTime(msg.round_result.game_duration_seconds)
    }

    if (completedLeadTime) {
        if (msg.round_result?.lead_time_seconds) {
            completedLeadTime.textContent = TimeUtils.formatTime(msg.round_result.lead_time_seconds)
        } else {
            completedLeadTime.textContent = '--:--'
        }
    }

    // Update individual player timers - THIS IS THE KEY NEW FUNCTIONALITY
    updatePlayerTimersDisplay(msg.round_result)

    // Update round statistics
    updateRoundStatistics(msg.round_result)

    // Update progress bar
    updateProgressBar(msg.round_number, getTotalRounds(window.gameState?.round_type || 'three_rounds'))

    // Handle next round or game completion
    if (msg.next_round && msg.batch_size) {
        // Show next round section
        if (nextRoundSection) nextRoundSection.style.display = 'block'
        if (gameCompleteSection) gameCompleteSection.style.display = 'none'

        if (nextRoundNumber) nextRoundNumber.textContent = msg.next_round
        if (nextBatchSize) nextBatchSize.textContent = msg.batch_size
        if (nextBatchSizeDesc) nextBatchSizeDesc.textContent = msg.batch_size
        if (nextRoundBtn) {
            nextRoundBtn.disabled = !window.isHost
            const nextRoundButtonNumber = nextRoundBtn.querySelector('#nextRoundButtonNumber')
            if (nextRoundButtonNumber) nextRoundButtonNumber.textContent = msg.next_round
        }
    } else {
        // Show game complete section
        if (nextRoundSection) nextRoundSection.style.display = 'none'
        if (gameCompleteSection) gameCompleteSection.style.display = 'block'
    }

    // Show round complete screen
    roundCompleteSection.style.display = 'block'
}

function handleGameOver(msg) {
    ViewManager.switchToResultsView()

    console.log('🏁 Game over message received:', msg)

    // The last round stats are often missing because the game goes directly
    // from active to results without passing through round_complete

    // Strategy 1: Try to get final round data from msg.final_state
    let lastRoundSaved = false
    if (msg.final_state && msg.final_state.current_round) {
        const currentRound = msg.final_state.current_round
        const existingRound = window.gameStatsTracker.roundResults.find((r) => r.round_number === currentRound)

        if (!existingRound) {
            // Create round result from final state
            const finalRoundResult = {
                round_number: currentRound,
                batch_size: msg.final_state.batch_size,
                game_duration_seconds: msg.final_state.game_duration_seconds,
                player_timers: msg.final_state.player_timers || {},
                total_completed: msg.final_state.total_completed || TOTAL_COINS,
                started_at: msg.final_state.started_at,
                ended_at: msg.final_state.ended_at,
            }

            console.log('🔧 Saving final round stats from final_state:', finalRoundResult)
            window.gameStatsTracker.addRoundResult(finalRoundResult)
            lastRoundSaved = true
        }
    }

    // Strategy 2: Try emergency save from current game state if not saved yet
    if (!lastRoundSaved) {
        const emergencySaved = window.gameStatsTracker.emergencySaveCurrentRound()
        if (emergencySaved) {
            console.log('✅ Emergency save completed for final round')
            lastRoundSaved = true
        }
    }

    // Strategy 3: If we still don't have the last round, try to reconstruct it
    if (!lastRoundSaved && window.gameState) {
        const expectedRounds = getTotalRounds(window.gameState.round_type)
        const currentlySaved = window.gameStatsTracker.roundResults.length

        if (currentlySaved < expectedRounds) {
            console.log(`🚨 Missing round detected! Expected: ${expectedRounds}, Have: ${currentlySaved}`)

            // Try to reconstruct the missing round(s)
            for (let roundNum = currentlySaved + 1; roundNum <= expectedRounds; roundNum++) {
                const missingRoundBatchSize = getBatchSizeForRound(window.gameState.round_type, roundNum)

                const reconstructedRound = {
                    round_number: roundNum,
                    batch_size: missingRoundBatchSize,
                    game_duration_seconds: window.gameState.game_duration_seconds || 0,
                    player_timers: window.gameState.player_timers || {},
                    total_completed: 12,
                    started_at: window.gameState.started_at,
                    ended_at: window.gameState.ended_at || new Date().toISOString(),
                }

                console.log(`🔨 Reconstructing missing round ${roundNum}:`, reconstructedRound)
                window.gameStatsTracker.addRoundResult(reconstructedRound)
            }
        }
    }

    // Final debug log before updating results
    console.log('🏁 Final stats before results display:', {
        totalRoundsTracked: window.gameStatsTracker.roundResults.length,
        expectedRounds: getTotalRounds(window.gameState?.round_type),
        rounds: window.gameStatsTracker.roundResults.map((r) => `R${r.round_number}(B${r.batch_size})`),
        fullData: window.gameStatsTracker.roundResults,
    })

    showNotification('🎯 Partie terminée ! Félicitations à tous !', 'success')
    updateResultsDisplay()
}

// Helper function to get batch size for a specific round
function getBatchSizeForRound(roundType, roundNumber) {
    const sizes = ROUND_TYPE_BATCH_SIZES[roundType] || DEFAULT_BATCH_SIZES
    return sizes[roundNumber - 1] || 1
}

function handleGameReset(msg) {
    ViewManager.switchToLobbyView()

    // Reset stats tracking
    window.gameStatsTracker.reset()

    // Update round configuration if provided
    if (msg.round_type && msg.required_players !== undefined) {
        updateRoundConfiguration(
            msg.round_type,
            msg.required_players,
            msg.selected_batch_size,
            getTotalRounds(msg.round_type)
        )

        // Trigger game state update event for configuration sync
        window.dispatchEvent(new CustomEvent('gamestateupdate'))
    }

    updatePlayerCountDisplay()
    showNotification('🔄 La partie a été réinitialisée', 'info')

    // Clear timer data from global state
    if (window.gameState) {
        window.gameState.player_timers = {}
        window.gameState.game_duration_seconds = null
        window.gameState.started_at = null
        window.gameState.ended_at = null
        window.gameState.current_round = 0
    }
}

function handleUserStatusChange(msg) {
    // Only show notifications for disconnections, not connections to reduce noise
    if (msg.type === 'user_disconnected' && msg.message) {
        showNotification(msg.message, 'info')
    }
}

function handleHostDisconnected(msg) {
    alert("La salle a été fermée car l'hôte a quitté.")
    window.location.reload()
}

function updatePlayerTimersDisplay(roundResult) {
    const playerTimersGrid = document.getElementById('roundPlayerTimersGrid')
    if (!playerTimersGrid || !roundResult || !roundResult.player_timers) return

    playerTimersGrid.innerHTML = ''

    // Sort players by completion time (completed players first, then by duration)
    const playerTimers = Object.values(roundResult.player_timers)
    const sortedTimers = playerTimers.sort((a, b) => {
        // Completed players first
        const aCompleted = a.ended_at && a.duration_seconds !== null && a.duration_seconds !== undefined
        const bCompleted = b.ended_at && b.duration_seconds !== null && b.duration_seconds !== undefined

        if (aCompleted && !bCompleted) return -1
        if (!aCompleted && bCompleted) return 1

        // Among completed players, sort by duration (fastest first)
        if (aCompleted && bCompleted) {
            return (a.duration_seconds || 0) - (b.duration_seconds || 0)
        }

        // Among non-completed players, maintain original order
        return 0
    })

    sortedTimers.forEach((timer, index) => {
        const timerInfo = TimeUtils.formatPlayerTimer(timer)

        const timerCard = document.createElement('div')
        timerCard.className = `player-timer-result ${timerInfo.status}`

        // Add ranking for completed players
        let rankingBadge = ''
        if (timerInfo.status === 'completed') {
            const rankEmojis = ['🥇', '🥈', '🥉', '🏅', '🏅']
            const emoji = rankEmojis[index] || '🏅'
            rankingBadge = `<div class="ranking-badge">${emoji} #${index + 1}</div>`
        }

        // Calculate efficiency if completed
        let efficiencyText = '--'
        if (timer.duration_seconds && timer.duration_seconds > 0) {
            const coinsProcessed = getCoinsProcessedByPlayer(timer.player, roundResult)
            const efficiency = TimeUtils.calculateEfficiency(coinsProcessed, timer.duration_seconds)
            efficiencyText = `${efficiency} p/min`
        }

        timerCard.innerHTML = `
            ${rankingBadge}
            <div class="player-name">${timer.player}</div>
            <div class="player-time">${timerInfo.time}</div>
            <div class="player-status">${timerInfo.statusText}</div>
            <div class="player-efficiency">${efficiencyText}</div>
        `

        playerTimersGrid.appendChild(timerCard)
    })
}

function updateRoundStatistics(roundResult) {
    if (!roundResult) return

    // Update total coins completed
    const totalCoinsCompleted = document.getElementById('totalCoinsCompleted')
    if (totalCoinsCompleted) {
        totalCoinsCompleted.textContent = roundResult.total_completed || 12
    }

    // Update participant count
    const participantCount = document.getElementById('participantCount')
    if (participantCount && roundResult.player_timers) {
        participantCount.textContent = Object.keys(roundResult.player_timers).length
    }

    // Calculate and update round efficiency
    const roundEfficiency = document.getElementById('roundEfficiency')
    if (roundEfficiency && roundResult.game_duration_seconds) {
        const totalCoins = roundResult.total_completed || 12
        const efficiency = TimeUtils.calculateEfficiency(totalCoins, roundResult.game_duration_seconds)
        roundEfficiency.textContent = `${efficiency}`
    }

    // Update lead time statistic - ADD THIS BLOCK
    const roundLeadTime = document.getElementById('roundLeadTime')
    if (roundLeadTime) {
        if (roundResult.lead_time_seconds) {
            roundLeadTime.textContent = TimeUtils.formatTime(roundResult.lead_time_seconds)
        } else {
            roundLeadTime.textContent = '--:--'
        }
    }

    // Calculate and update average player time
    const avgPlayerTime = document.getElementById('avgPlayerTime')
    if (avgPlayerTime && roundResult.player_timers) {
        const completedTimers = Object.values(roundResult.player_timers).filter(
            (timer) => timer.duration_seconds !== null && timer.duration_seconds !== undefined
        )

        if (completedTimers.length > 0) {
            const totalTime = completedTimers.reduce((sum, timer) => sum + (timer.duration_seconds || 0), 0)
            const avgTime = totalTime / completedTimers.length
            avgPlayerTime.textContent = TimeUtils.formatTime(avgTime)
        } else {
            avgPlayerTime.textContent = '--:--'
        }
    }
}

function getCoinsProcessedByPlayer(playerName, roundResult) {
    // This is a simplified calculation - in a real implementation,
    // you might track the actual number of coins each player processed
    // For now, assume each player processed approximately the same amount
    const totalCoins = roundResult.total_completed || 12
    const playerCount = Object.keys(roundResult.player_timers || {}).length
    return Math.ceil(totalCoins / playerCount)
}

// Add this to the TimeUtils class for calculating efficiency
TimeUtils.calculateEfficiency = function (totalCoins, durationSeconds) {
    if (!durationSeconds || durationSeconds === 0) return 0
    return Math.round((totalCoins / durationSeconds) * 60 * 100) / 100 // Round to 2 decimal places
}

function calculateTailsRemaining(playerCoins) {
    let total = 0
    Object.values(playerCoins).forEach((coins) => {
        total += coins.filter((coin) => !coin).length
    })
    return total
}

function getTotalRounds(roundType) {
    switch (roundType) {
        case 'single':
            return 1
        case 'two_rounds':
            return 2
        case 'three_rounds':
            return 3
        default:
            return 1
    }
}

function updateResultsDisplay() {
    const gameSummary = window.gameStatsTracker.getGameSummary()

    // Debug logging
    console.log('📊 Stats tracker state for results:', {
        roundResults: window.gameStatsTracker.roundResults,
        gameSummary: gameSummary,
    })

    if (!gameSummary || gameSummary.roundResults.length === 0) {
        console.warn('⚠️ No game summary available for results display')

        // Show empty state message
        const resultsSection = document.getElementById('results')
        if (resultsSection) {
            const emptyMessage = document.createElement('div')
            emptyMessage.className = 'results-empty'
            emptyMessage.innerHTML = `
                <h3>Aucunes données de partie disponibles</h3>
                <p>Les statistiques seront disponibles après avoir terminé au moins une manche.</p>
            `

            // Insert after the main title
            const title = resultsSection.querySelector('h2')
            if (title) {
                title.after(emptyMessage)
            }
        }
        return
    }

    console.log(`📊 Updating results display with ${gameSummary.totalRounds} rounds of data:`, gameSummary)

    // Update main game statistics
    updateMainGameStats(gameSummary)

    // Update lead time display
    updateLeadTimeDisplay(gameSummary)

    // Update round-by-round breakdown
    updateRoundBreakdown(gameSummary.roundResults)

    // Update batch size impact analysis
    updateBatchSizeAnalysis(gameSummary.batchSizeImpact)

    // Update player performance summary
    updatePlayerPerformanceSummary(gameSummary.playerSummary)

    // Update lean insights with actual data
    updateLeanInsights(gameSummary)

    // Show action buttons for hosts
    const resultsActions = document.getElementById('resultsActions')
    if (resultsActions && window.isHost) {
        resultsActions.style.display = 'flex'
        GameActions.setupStandardButtons()
    }
}

function updateMainGameStats(gameSummary) {
    // Update total game time
    const gameTimeValue = document.getElementById('gameTimeValue')
    if (gameTimeValue) {
        gameTimeValue.textContent = TimeUtils.formatTime(gameSummary.totalGameTime)
    }

    // Calculate stats with error handling for missing data
    const validRounds = gameSummary.roundResults.filter((r) => r.game_duration_seconds && r.game_duration_seconds > 0)
    const avgTime =
        validRounds.length > 0
            ? validRounds.reduce((sum, r) => sum + r.game_duration_seconds, 0) / validRounds.length
            : 0

    const bestTime = validRounds.length > 0 ? Math.min(...validRounds.map((r) => r.game_duration_seconds)) : 0

    // Update main stats grid
    const statsGrid = document.getElementById('statsGrid')
    if (statsGrid) {
        statsGrid.innerHTML = `
            <div class="stat-card">
                <div class="stat-value">${gameSummary.totalRounds}</div>
                <div class="stat-label">Manches jouées</div>
            </div>
            <div class="stat-card ${validRounds.length < gameSummary.totalRounds ? 'incomplete' : ''}">
                <div class="stat-value">${validRounds.length > 0 ? TimeUtils.formatTime(avgTime) : 'N/A'}</div>
                <div class="stat-label">Temps moyen/manche</div>
            </div>
            <div class="stat-card ${validRounds.length === 0 ? 'incomplete' : ''}">
                <div class="stat-value">${validRounds.length > 0 ? TimeUtils.formatTime(bestTime) : 'N/A'}</div>
                <div class="stat-label">Meilleur temps</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${Object.keys(gameSummary.playerSummary).length}</div>
                <div class="stat-label">Joueurs</div>
            </div>
            <div class="stat-card highlight">
                <div class="stat-value">${gameSummary.avgLeadTime > 0 ? TimeUtils.formatTime(gameSummary.avgLeadTime) : 'N/A'}</div>
                <div class="stat-label">Lead Time moyen</div>
                <div class="stat-sublabel">1ère pièce flip → livraison</div>
            </div>
        `

        // Add warning if some rounds have missing data
        if (validRounds.length < gameSummary.totalRounds) {
            const warningDiv = document.createElement('div')
            warningDiv.className = 'stats-error'
            warningDiv.innerHTML = `
                <strong>Données incomplètes</strong><br>
                ${gameSummary.totalRounds - validRounds.length} manche${gameSummary.totalRounds - validRounds.length > 1 ? 's' : ''} avec données manquantes
            `
            statsGrid.after(warningDiv)
        }
    }
}

function updateLeadTimeDisplay(gameSummary) {
    const avgLeadTimeValue = document.getElementById('avgLeadTimeValue')
    const bestLeadTimeElement = document.getElementById('bestLeadTime')
    const worstLeadTimeElement = document.getElementById('worstLeadTime')

    if (avgLeadTimeValue && gameSummary.avgLeadTime > 0) {
        avgLeadTimeValue.textContent = TimeUtils.formatTime(gameSummary.avgLeadTime)
    }

    if (bestLeadTimeElement && gameSummary.bestLeadTime > 0) {
        bestLeadTimeElement.textContent = TimeUtils.formatTime(gameSummary.bestLeadTime)
    }

    if (worstLeadTimeElement && gameSummary.worstLeadTime > 0) {
        worstLeadTimeElement.textContent = TimeUtils.formatTime(gameSummary.worstLeadTime)
    }
}

function updateRoundBreakdown(roundResults) {
    const resultsSection = document.getElementById('results')
    if (!resultsSection) return

    // Remove existing round breakdown if it exists
    const existingBreakdown = resultsSection.querySelector('.round-breakdown-section')
    if (existingBreakdown) {
        existingBreakdown.remove()
    }

    // Don't show breakdown if no rounds completed
    if (!roundResults || roundResults.length === 0) {
        console.log('⚠️ No round results to display in breakdown')
        return
    }

    // Create round breakdown section
    const roundBreakdownSection = document.createElement('div')
    roundBreakdownSection.className = 'round-breakdown-section'
    roundBreakdownSection.innerHTML = `
        <h3>📊 Détail par Manche</h3>
        <p class="section-description">Résultats détaillés de chaque manche (${roundResults.length} manche${roundResults.length > 1 ? 's' : ''})</p>
        <div class="round-breakdown-grid" id="roundBreakdownGrid"></div>
    `

    // Insert after player timers section
    const playerTimersSection = resultsSection.querySelector('.player-timers-section')
    if (playerTimersSection) {
        playerTimersSection.after(roundBreakdownSection)
    } else {
        // Insert after game time section if player timers section doesn't exist
        const gameTimeSection = resultsSection.querySelector('.game-time-section')
        if (gameTimeSection) {
            gameTimeSection.after(roundBreakdownSection)
        }
    }

    const roundBreakdownGrid = document.getElementById('roundBreakdownGrid')
    if (roundBreakdownGrid) {
        roundBreakdownGrid.innerHTML = ''

        roundResults.forEach((result, index) => {
            const roundCard = document.createElement('div')
            roundCard.className = 'round-summary-card'

            // Handle missing data gracefully
            const gameTime = result.game_duration_seconds
                ? TimeUtils.formatTime(result.game_duration_seconds)
                : 'Données manquantes'
            const leadTime = result.lead_time_seconds ? TimeUtils.formatTime(result.lead_time_seconds) : '--:--'
            const efficiency = result.efficiency ? result.efficiency.toFixed(1) : '--'

            // Check if we have valid player rankings
            const hasValidRankings = result.playerRankings && result.playerRankings.length > 0

            roundCard.innerHTML = `
                <div class="round-header">
                    <div class="round-number-badge">${result.round_number}</div>
                    <div class="round-batch-info">
                        <div class="batch-size">Lot de ${result.batch_size}</div>
                        <div class="batch-description">${batchSizeText}</div>
                    </div>
                </div>
                <div class="round-stats-mini">
                    <div class="mini-stat">
                        <div class="mini-stat-value">${gameTime}</div>
                        <div class="mini-stat-label">Temps total</div>
                    </div>
                    <div class="mini-stat">
                        <div class="mini-stat-value">${leadTime}</div>
                        <div class="mini-stat-label">Lead Time</div>
                    </div>
                    <div class="mini-stat">
                        <div class="mini-stat-value">${efficiency}</div>
                        <div class="mini-stat-label">Pièces/min</div>
                    </div>
                </div>
                <div class="round-rankings">
                    ${
                        hasValidRankings
                            ? result.playerRankings
                                  .slice(0, 3)
                                  .map(
                                      (ranking, idx) => `
                            <div class="mini-ranking">
                                <span class="ranking-position">${['🥇', '🥈', '🥉'][idx] || '🏅'}</span>
                                <span class="ranking-player">${ranking.player}</span>
                                <span class="ranking-time">${TimeUtils.formatTime(ranking.time)}</span>
                            </div>
                        `
                                  )
                                  .join('')
                            : '<div class="mini-ranking incomplete"><span class="ranking-position">⚠️</span><span class="ranking-player">Données de timers manquantes</span></div>'
                    }
                </div>
            `

            roundBreakdownGrid.appendChild(roundCard)
        })

        console.log(`✅ Round breakdown updated with ${roundResults.length} rounds`)
    }
}

function getBatchSizeDescription(batchSize) {
    switch (batchSize) {
        case 1:
            return 'Une par une'
        case 4:
            return 'Par groupes de 4'
        case 12:
            return 'Toutes ensemble'
        default:
            return `Par groupes de ${batchSize}`
    }
}

function updateBatchSizeAnalysis(batchSizeImpact) {
    const resultsSection = document.getElementById('results')
    if (!resultsSection) return

    // Remove existing batch analysis if it exists
    const existingAnalysis = resultsSection.querySelector('.batch-analysis-section')
    if (existingAnalysis) {
        existingAnalysis.remove()
    }

    if (Object.keys(batchSizeImpact).length <= 1) {
        // Skip if only one batch size was used
        return
    }

    // Create batch analysis section
    const batchAnalysisSection = document.createElement('div')
    batchAnalysisSection.className = 'batch-analysis-section'
    batchAnalysisSection.innerHTML = `
        <h3>📦 Impact de la Taille des Lots</h3>
        <div class="batch-comparison-grid" id="batchComparisonGrid"></div>
        <div class="batch-insights" id="batchInsights"></div>
    `

    // Insert before insights section
    const insightsSection = resultsSection.querySelector('.insights')
    if (insightsSection) {
        insightsSection.before(batchAnalysisSection)
    } else {
        resultsSection.appendChild(batchAnalysisSection)
    }

    const batchComparisonGrid = document.getElementById('batchComparisonGrid')
    if (batchComparisonGrid) {
        batchComparisonGrid.innerHTML = ''

        // Sort batch sizes for consistent display
        const sortedBatchSizes = Object.keys(batchSizeImpact).sort((a, b) => parseInt(b) - parseInt(a))

        sortedBatchSizes.forEach((batchSize) => {
            const data = batchSizeImpact[batchSize]
            const batchCard = document.createElement('div')
            batchCard.className = 'batch-comparison-card'

            batchCard.innerHTML = `
                <div class="batch-size-header">
                    <div class="batch-size-number">${batchSize}</div>
                    <div class="batch-size-label">Lot de ${batchSize}</div>
                </div>
                <div class="batch-metrics">
                    <div class="batch-metric">
                        <div class="metric-value">${TimeUtils.formatTime(data.avgTime)}</div>
                        <div class="metric-label">Temps moyen</div>
                    </div>
                    <div class="batch-metric">
                        <div class="metric-value">${data.avgLeadTime > 0 ? TimeUtils.formatTime(data.avgLeadTime) : '--:--'}</div>
                        <div class="metric-label">Lead Time</div>
                    </div>
                    <div class="batch-metric">
                        <div class="metric-value">${data.avgEfficiency.toFixed(1)}</div>
                        <div class="metric-label">Pièces/min</div>
                    </div>
                    <div class="batch-metric">
                        <div class="metric-value">${data.rounds}</div>
                        <div class="metric-label">Manche${data.rounds > 1 ? 's' : ''}</div>
                    </div>
                </div>
            `

            batchComparisonGrid.appendChild(batchCard)
        })
    }

    // Add batch size insights
    const batchInsights = document.getElementById('batchInsights')
    if (batchInsights) {
        const insights = generateBatchSizeInsights(batchSizeImpact)
        batchInsights.innerHTML = `
            <div class="insights-content">
                <h4>💡 Observations</h4>
                <ul>
                    ${insights.map((insight) => `<li>${insight}</li>`).join('')}
                </ul>
            </div>
        `
    }
}

function generateBatchSizeInsights(batchSizeImpact) {
    const insights = []
    const batchSizes = Object.keys(batchSizeImpact)
        .map(Number)
        .sort((a, b) => a - b)

    if (batchSizes.length >= 2) {
        const smallestBatch = batchSizeImpact[batchSizes[0]]
        const largestBatch = batchSizeImpact[batchSizes[batchSizes.length - 1]]

        if (smallestBatch.avgTime < largestBatch.avgTime) {
            const timeDiff = largestBatch.avgTime - smallestBatch.avgTime
            const percentDiff = ((timeDiff / largestBatch.avgTime) * 100).toFixed(0)
            insights.push(`Les petits lots sont ${percentDiff}% plus rapides que les gros lots`)
        }

        if (smallestBatch.avgEfficiency > largestBatch.avgEfficiency) {
            insights.push("Les petits lots améliorent l'efficacité du flux de production")
        }

        insights.push("Les gros lots créent plus de temps d'attente entre les joueurs")
        insights.push('Les petits lots permettent un travail plus parallèle')
    }

    return insights
}

function updatePlayerPerformanceSummary(playerSummary) {
    const playerTimersGrid = document.getElementById('playerTimersGrid')
    if (!playerTimersGrid) return

    playerTimersGrid.innerHTML = ''

    // Sort players by average time (best performers first)
    const sortedPlayers = Object.values(playerSummary)
        .filter((player) => player.roundsCompleted > 0)
        .sort((a, b) => a.avgTime - b.avgTime)

    sortedPlayers.forEach((playerStats, index) => {
        const timerCard = document.createElement('div')
        timerCard.className = 'player-timer-result completed'

        // Add overall ranking
        let rankingBadge = ''
        if (index < 3) {
            const rankEmojis = ['🥇', '🥈', '🥉']
            rankingBadge = `<div class="ranking-badge">${rankEmojis[index]} #${index + 1}</div>`
        }

        timerCard.innerHTML = `
            ${rankingBadge}
            <div class="player-name">${playerStats.player}</div>
            <div class="player-time">${TimeUtils.formatTime(playerStats.avgTime)}</div>
            <div class="player-status">Moyenne sur ${playerStats.roundsCompleted} manche${playerStats.roundsCompleted > 1 ? 's' : ''}</div>
            <div class="player-details">
                <div class="player-detail">
                    <span class="detail-label">Meilleur:</span>
                    <span class="detail-value">${TimeUtils.formatTime(playerStats.bestTime)}</span>
                </div>
                <div class="player-detail">
                    <span class="detail-label">Efficacité:</span>
                    <span class="detail-value">${playerStats.avgEfficiency.toFixed(1)} p/min</span>
                </div>
            </div>
        `

        playerTimersGrid.appendChild(timerCard)
    })
}

function updateLeanInsights(gameSummary) {
    const insightsList = document.getElementById('insightsList')
    if (!insightsList) return

    // Generate dynamic insights based on actual game data
    const insights = generateDynamicInsights(gameSummary)

    insightsList.innerHTML = insights.map((insight) => `<li>${insight}</li>`).join('')
}

function generateDynamicInsights(gameSummary) {
    const insights = []

    // Batch size insights
    if (Object.keys(gameSummary.batchSizeImpact).length > 1) {
        insights.push(
            '<strong>Batch Size:</strong> Vous avez testé différentes tailles de lots et observé leur impact sur les temps de cycle'
        )
    } else {
        insights.push(
            '<strong>Batch Size:</strong> Essayez différentes tailles de lots pour observer leur impact sur le temps de cycle'
        )
    }

    // Flow insights
    const playerCount = Object.keys(gameSummary.playerSummary).length
    if (playerCount > 2) {
        insights.push(
            '<strong>Flow:</strong> Plus il y a de joueurs dans la chaîne, plus la coordination devient importante'
        )
    } else {
        insights.push(
            "<strong>Flow:</strong> Analysez les goulots d'étranglement et les temps d'attente dans votre processus"
        )
    }

    // Lead time insights
    const avgRoundTime = gameSummary.averageRoundTime
    const avgPlayerTime =
        Object.values(gameSummary.playerSummary).reduce((sum, p) => sum + p.avgTime, 0) /
        Object.keys(gameSummary.playerSummary).length

    if (avgRoundTime > avgPlayerTime * 1.5) {
        insights.push(
            "<strong>Lead Time:</strong> Le temps total est significativement plus long que le temps individuel - signe de temps d'attente"
        )
    } else {
        insights.push(
            '<strong>Lead Time:</strong> Comparez le temps individuel vs. temps total du processus pour identifier les inefficacités'
        )
    }

    // Improvement insights
    if (gameSummary.totalRounds > 1) {
        const firstRound = gameSummary.roundResults[0]
        const lastRound = gameSummary.roundResults[gameSummary.roundResults.length - 1]

        if (lastRound.game_duration_seconds < firstRound.game_duration_seconds) {
            insights.push(
                "<strong>Amélioration Continue:</strong> Votre équipe s'est améliorée au fil des manches - excellent travail d'équipe !"
            )
        } else {
            insights.push(
                '<strong>Amélioration Continue:</strong> Discutez des optimisations possibles pour les prochaines itérations'
            )
        }
    } else {
        insights.push(
            "<strong>Amélioration Continue:</strong> Jouez plusieurs manches pour voir l'évolution de votre performance"
        )
    }

    return insights
}

export function connectWebSocket(apiUrl, roomId, username) {
    if (!apiUrl || !roomId || !username) {
        console.error('Missing parameters for WebSocket connection')
        return
    }

    // Store username globally for later use
    window.currentUsername = username

    const wsUrl = apiUrl.replace(/^http/, 'ws') + `/ws/${roomId}/${encodeURIComponent(username)}`

    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
        showNotification('🔗 Connecté à la salle', 'success')
    }

    ws.onmessage = (event) => {
        handleWSMessage(event.data)
    }

    ws.onclose = (event) => {
        if (event.code === 4002) {
            // Host left, room closed
            return // Don't reload, handleHostDisconnected will handle this
        }

        showNotification('❌ Connexion perdue', 'error')

        // Try to reconnect after a delay
        setTimeout(() => {
            if (confirm('Connexion perdue. Voulez-vous vous reconnecter ?')) {
                window.location.reload()
            }
        }, 1000)
    }

    ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        showNotification('❌ Erreur de connexion', 'error')
    }

    // Store websocket globally for other modules to use
    window.pennyGameWS = ws

    return ws
}
