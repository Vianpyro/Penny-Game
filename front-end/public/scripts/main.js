/**
 * Main entry point for the Penny Game frontend.
 *
 * Adapted for v2 event-sourced backend:
 *   - No CSRF tokens
 *   - .state -> .phase in game state
 *   - Simplified auth flow (host_secret header, session token header)
 */

import { joinRoom, fetchGameState, changeRole, setRoundConfig, startGame, startNextRound, resetGame } from './api.js'
import { updateGameCode, renderPlayers, renderSpectators, updatePlayerCountDisplay } from './dom.js'
import { connectWebSocket } from './websocket.js'

const TOTAL_COINS = 15
const VALID_BATCH_SIZES = [1, 3, 5, 15]

let currentDraggedItem = null
let currentDraggedUsername = null

// --- Game Start ---

const startBtn = document.getElementById('startBtn')
const gameSetup = document.querySelector('.game-setup')
const gameBoard = document.getElementById('gameBoard')

if (startBtn && gameSetup && gameBoard) {
    startBtn.addEventListener('click', async () => {
        const gameCode = document.getElementById('game-code')?.textContent?.trim() || ''
        const apiUrl = document.getElementById('joinRoleModal')?.getAttribute('data-api-url') || ''
        if (!apiUrl || !gameCode) return alert('Informations manquantes')

        startBtn.disabled = true
        startBtn.textContent = 'Démarrage...'
        try {
            await startGame(apiUrl, gameCode)
        } catch (error) {
            alert(error.message || 'Impossible de démarrer')
            startBtn.disabled = false
            startBtn.textContent = 'Démarrer la Partie'
        }
    })
}

// --- Next Round ---

const nextRoundBtn = document.getElementById('nextRoundBtn')
if (nextRoundBtn) {
    nextRoundBtn.addEventListener('click', async () => {
        const gameCode = document.getElementById('game-code')?.textContent?.trim() || ''
        const apiUrl = document.getElementById('joinRoleModal')?.getAttribute('data-api-url') || ''
        if (!apiUrl || !gameCode || !window.isHost) return

        nextRoundBtn.disabled = true
        nextRoundBtn.textContent = 'Démarrage...'
        try {
            await startNextRound(apiUrl, gameCode)
        } catch (error) {
            alert(error.message || 'Impossible de démarrer la manche suivante')
        } finally {
            nextRoundBtn.disabled = false
            nextRoundBtn.textContent = 'Manche Suivante'
        }
    })
}

window.addEventListener('DOMContentLoaded', () => {
    const apiUrl = document.getElementById('joinRoleModal')?.getAttribute('data-api-url') || ''

    let selectedRoundType = 'three_rounds'
    let selectedBatchSize = TOTAL_COINS
    let requiredPlayers = 5

    // --- Copy code ---
    const copyBtn = document.getElementById('copyCodeBtn')
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const code = document.getElementById('game-code')?.textContent || ''
            if (code) {
                navigator.clipboard.writeText(code).then(() => {
                    copyBtn.textContent = 'Copié !'
                    setTimeout(() => (copyBtn.textContent = 'Copier le code'), 1200)
                })
            }
        })
    }

    // --- Reset ---
    const resetBtn = document.getElementById('resetBtn')
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            const gameCode = document.getElementById('game-code')?.textContent?.trim() || ''
            if (!apiUrl || !gameCode) return
            if (!confirm('Réinitialiser la partie ?')) return
            resetBtn.disabled = true
            resetBtn.textContent = 'Réinitialisation...'
            try {
                await resetGame(apiUrl, gameCode)
            } catch (error) {
                alert(error.message || 'Impossible de réinitialiser')
            } finally {
                resetBtn.disabled = false
                resetBtn.textContent = 'Réinitialiser'
            }
        })
    }

    // --- Drag & Drop ---

    function handleDrop(e, targetList) {
        e.preventDefault()
        e.stopPropagation()
        if (!currentDraggedItem || !targetList || !currentDraggedUsername) { cleanupDragState(); return }
        if (currentDraggedItem.parentNode === targetList) { cleanupDragState(); return }

        let newRole = ''
        if (targetList.id === 'playerList') newRole = 'player'
        else if (targetList.id === 'spectatorList') newRole = 'spectator'
        else { cleanupDragState(); return }

        const roomId = document.getElementById('game-code')?.textContent?.trim() || ''
        if (!canChangeRole(currentDraggedUsername, newRole)) { cleanupDragState(); return }

        if (apiUrl && roomId && currentDraggedUsername && newRole) {
            changeRole(apiUrl, roomId, currentDraggedUsername, newRole, (roomId) => {
                fetchGameState(apiUrl, roomId,
                    (p, h, s, a) => renderPlayers(p, h, s, a, setupDragAndDrop),
                    (s, h, a) => renderSpectators(s, h, a, setupDragAndDrop)
                )
            })
        }
        cleanupDragState()
    }

    function canChangeRole(username, newRole) {
        if (window.isHost) return true
        if (username !== window.currentUsername) return false
        if (newRole === 'player') return false
        if (window.gameState?.phase === 'active') return false
        return true
    }

    function handleDragStart(e) {
        currentDraggedItem = e.target
        if (!currentDraggedItem || !e.dataTransfer) return
        currentDraggedUsername = (currentDraggedItem.textContent || '').replace(/^[🟢⚪👑👀🙈]\s*/, '').trim()
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', currentDraggedUsername)
        setTimeout(() => currentDraggedItem?.classList.add('dragging'), 0)
    }

    function handleDragEnd() {
        if (currentDraggedItem) currentDraggedItem.classList.remove('dragging')
        document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'))
    }

    function handleDragOver(e) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move' }
    function handleDragEnter(e) { e.preventDefault(); e.currentTarget?.classList.add('drag-over') }
    function handleDragLeave(e) {
        const rect = e.currentTarget.getBoundingClientRect()
        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
            e.currentTarget.classList.remove('drag-over')
        }
    }
    function cleanupDragState() { currentDraggedItem = null; currentDraggedUsername = null; document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over')) }

    function setupDragAndDrop() {
        const playerList = document.getElementById('playerList')
        const spectatorList = document.getElementById('spectatorList')
        if (typeof window.isHost === 'undefined') return
        cleanupDragState()

        document.querySelectorAll('[draggable="true"]').forEach((item) => {
            const username = item.textContent.replace(/^[🟢⚪👑👀🙈]\s*/, '').trim()
            if (window.isHost || username === window.currentUsername) {
                item.addEventListener('dragstart', handleDragStart)
                item.addEventListener('dragend', handleDragEnd)
                item.style.cursor = 'grab'
            } else {
                item.setAttribute('draggable', 'false')
                item.style.cursor = 'default'
            }
        })

        for (const list of [playerList, spectatorList]) {
            if (!list) continue
            list.addEventListener('dragover', handleDragOver)
            list.addEventListener('dragenter', handleDragEnter)
            list.addEventListener('dragleave', handleDragLeave)
            list.addEventListener('drop', (e) => handleDrop(e, list))
        }
    }

    // --- Round Configuration ---

    const roundCountSelector = document.getElementById('roundCountSelector')
    const singleBatchSelector = document.getElementById('singleBatchSelector')
    const playerCountButtons = document.getElementById('playerCountButtons')

    function updateUIForRole() {
        setTimeout(() => {
            const isHost = window.isHost === true
            const setupControls = document.querySelector('.setup-controls')
            if (setupControls) setupControls.classList.toggle('non-host-view', !isHost)

            const playerCountSection = document.getElementById('playerCountSection')
            if (playerCountSection) playerCountSection.style.display = isHost ? 'block' : 'none'

            if (roundCountSelector) {
                roundCountSelector.querySelectorAll('.round-count-option').forEach((opt) => {
                    opt.style.pointerEvents = isHost ? 'auto' : 'none'
                    opt.style.opacity = isHost ? '1' : '0.8'
                })
            }
            if (playerCountButtons) {
                playerCountButtons.querySelectorAll('.player-count-btn').forEach((btn) => {
                    btn.disabled = !isHost
                    btn.style.opacity = isHost ? '1' : '0.8'
                })
            }
            setTimeout(setupDragAndDrop, 100)
        }, 100)
    }

    async function updateRoundConfig() {
        const gameCode = document.getElementById('game-code')?.textContent?.trim() || ''
        if (!apiUrl || !gameCode) return
        try {
            await setRoundConfig(apiUrl, gameCode, {
                round_type: selectedRoundType,
                required_players: requiredPlayers,
                selected_batch_size: selectedRoundType === 'single' ? selectedBatchSize : null,
            })
        } catch (_) { }
    }

    if (roundCountSelector) {
        roundCountSelector.querySelectorAll('.round-count-option').forEach((opt) => {
            opt.addEventListener('click', async () => {
                if (!window.isHost) return
                const type = opt.dataset.type
                if (!type) return
                roundCountSelector.querySelectorAll('.round-count-option').forEach((o) => o.classList.remove('active'))
                opt.classList.add('active')
                selectedRoundType = type
                if (singleBatchSelector) singleBatchSelector.style.display = type === 'single' ? 'block' : 'none'
                await updateRoundConfig()
            })
        })
    }

    if (singleBatchSelector) {
        singleBatchSelector.querySelectorAll('.batch-option').forEach((opt) => {
            opt.addEventListener('click', async () => {
                if (!window.isHost) return
                const size = parseInt(opt.dataset.size, 10)
                if (!size || !VALID_BATCH_SIZES.includes(size)) return
                singleBatchSelector.querySelectorAll('.batch-option').forEach((o) => o.classList.remove('active'))
                opt.classList.add('active')
                selectedBatchSize = size
                await updateRoundConfig()
            })
        })
    }

    if (playerCountButtons) {
        playerCountButtons.querySelectorAll('.player-count-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                if (!window.isHost) return
                const count = parseInt(btn.dataset.count, 10)
                if (!count) return
                playerCountButtons.querySelectorAll('.player-count-btn').forEach((b) => b.classList.remove('active'))
                btn.classList.add('active')
                requiredPlayers = count
                updatePlayerCountDisplay()
                await updateRoundConfig()
            })
        })
    }

    // --- Coin Flip ---
    const coinFlip = document.getElementById('coinFlip')
    if (coinFlip) {
        coinFlip.style.cursor = 'pointer'
        coinFlip.addEventListener('click', () => {
            coinFlip.classList.toggle('flipped')
            setTimeout(() => coinFlip.classList.toggle('grayscale'), 200)
        })
    }

    // --- Join Flow ---
    window.addEventListener('joinrole', (e) => {
        const { username, roomAction, roomId, roomCode } = e.detail || {}
        if (!username) return

        let gameRoomId = roomAction === 'create' && roomId ? roomId : roomAction === 'join' && roomCode ? roomCode : null
        if (!gameRoomId) return

        window.currentUsername = username
        updateGameCode(gameRoomId)

        joinRoom(apiUrl, gameRoomId, username, (joinedRoomId) => {
            setTimeout(() => { updateUIForRole(); updatePlayerCountDisplay() }, 750)
            fetchGameState(apiUrl, joinedRoomId,
                (p, h, s, a) => renderPlayers(p, h, s, a, setupDragAndDrop),
                (s, h, a) => renderSpectators(s, h, a, setupDragAndDrop)
            )
            connectWebSocket(apiUrl, gameRoomId, username)
        })

        fetchGameState(apiUrl, gameRoomId,
            (p, h, s, a) => renderPlayers(p, h, s, a, setupDragAndDrop),
            (s, h, a) => renderSpectators(s, h, a, setupDragAndDrop)
        )
    })

    window.addEventListener('userrolechange', () => { updateUIForRole(); updatePlayerCountDisplay() })
    window.addEventListener('gamestateupdate', () => { })

    updateUIForRole()
    setTimeout(updateUIForRole, 500)
    setTimeout(updatePlayerCountDisplay, 100)
    setTimeout(setupDragAndDrop, 200)
})
