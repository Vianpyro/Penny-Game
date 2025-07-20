// Main entry point for Penny Game frontend
import { joinRoom, fetchGameState, changeRole } from './api'
import { updateGameCode, renderPlayers, renderSpectators, updateConfig, updateBoard } from './dom'
import { handleDragStart, handleDragEnd, handleDragOver, addDnDEvents, draggedItem } from './dnd'
import { connectWebSocket, handleWSMessage } from './websocket'

window.addEventListener('DOMContentLoaded', () => {
    const apiUrl = document.getElementById('joinRoleModal')?.getAttribute('data-api-url') || ''

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
    let _draggedItem = draggedItem

    function handleDrop(e: DragEvent, targetList: HTMLElement) {
        e.preventDefault()
        if (_draggedItem && targetList && _draggedItem.parentNode !== targetList) {
            const username = (_draggedItem.textContent || '').replace(/^.*?\s/, '').trim()
            let newRole = ''
            if (targetList.id === 'playerList') {
                newRole = 'player'
            } else if (targetList.id === 'spectatorList') {
                newRole = 'spectator'
            }
            const roomId = document.getElementById('gameCode')?.textContent?.trim() || ''
            if (apiUrl && roomId && username && newRole) {
                changeRole(apiUrl, roomId, username, newRole, (roomId: string) =>
                    fetchGameState(
                        apiUrl,
                        roomId,
                        (p: string[], h: string, s: string[], a: Record<string, boolean>) =>
                            renderPlayers(p, h, s, a, addDnDEvents),
                        (s: string[], h: string, a: Record<string, boolean>) => renderSpectators(s, h, a, addDnDEvents)
                    )
                )
            }
        }
    }

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
                    updateConfig(playersSpan, roundSpan, selectedPlayers, selectedRound)
                    updateBoard(gameBoard, selectedPlayers)
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
                    updateConfig(playersSpan, roundSpan, selectedPlayers, selectedRound)
                }
            })
        })
    }

    // Initial config
    updateConfig(playersSpan, roundSpan, selectedPlayers, selectedRound)
    updateBoard(gameBoard, selectedPlayers)

    // WebSocket and API event listeners
    window.addEventListener('joinrole', (e: Event) => {
        const detail = (e as CustomEvent).detail
        const username = detail?.username
        if (!username) return
        if (detail.roomAction === 'create' && detail.roomId) {
            updateGameCode(detail.roomId)
            joinRoom(apiUrl, detail.roomId, username, (roomId: string) =>
                fetchGameState(
                    apiUrl,
                    roomId,
                    (p: string[], h: string, s: string[], a: Record<string, boolean>) =>
                        renderPlayers(p, h, s, a, addDnDEvents),
                    (s: string[], h: string, a: Record<string, boolean>) => renderSpectators(s, h, a, addDnDEvents)
                )
            )
            connectWebSocket(apiUrl, detail.roomId, username)
            fetchGameState(
                apiUrl,
                detail.roomId,
                (p: string[], h: string, s: string[], a: Record<string, boolean>) =>
                    renderPlayers(p, h, s, a, addDnDEvents),
                (s: string[], h: string, a: Record<string, boolean>) => renderSpectators(s, h, a, addDnDEvents)
            )
        } else if (detail.roomAction === 'join' && detail.roomCode) {
            updateGameCode(detail.roomCode)
            joinRoom(apiUrl, detail.roomCode, username, (roomId: string) =>
                fetchGameState(
                    apiUrl,
                    roomId,
                    (p: string[], h: string, s: string[], a: Record<string, boolean>) =>
                        renderPlayers(p, h, s, a, addDnDEvents),
                    (s: string[], h: string, a: Record<string, boolean>) => renderSpectators(s, h, a, addDnDEvents)
                )
            )
            connectWebSocket(apiUrl, detail.roomCode, username)
            fetchGameState(
                apiUrl,
                detail.roomCode,
                (p: string[], h: string, s: string[], a: Record<string, boolean>) =>
                    renderPlayers(p, h, s, a, addDnDEvents),
                (s: string[], h: string, a: Record<string, boolean>) => renderSpectators(s, h, a, addDnDEvents)
            )
        }
    })
})
export {}
