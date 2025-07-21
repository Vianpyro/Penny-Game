// WebSocket logic for Penny Game
import { renderPlayers, renderSpectators } from './dom'
import { addDnDEvents } from './dnd'

export function handleWSMessage(data: any) {
    try {
        if (typeof data === 'string' && data.includes('🔴')) {
            if (data.includes('left the room.') && data.includes('Host')) {
                alert("La salle a été fermée car l'hôte a quitté.")
                window.location.reload()
                return
            }
        }
        const msg = JSON.parse(data)
        if (msg.type === 'game_state') {
            const gameSetup = document.querySelector('.game-setup') as HTMLElement | null
            const gameControls = document.querySelector('.game-controls') as HTMLElement | null
            const gameBoard = document.getElementById('gameBoard') as HTMLElement | null
            const results = document.getElementById('results') as HTMLElement | null
            let stateMsg = ''
            switch (msg.state) {
                case 'lobby': // Default/Switch to lobby view
                    stateMsg = 'The game is waiting in the lobby.'
                    if (gameSetup) gameSetup.style.display = ''
                    if (gameControls) gameControls.style.display = ''
                    if (results) results.style.display = 'none'
                    if (gameBoard) gameBoard.style.display = 'none'
                    break
                case 'active': // Switch to game view
                    stateMsg = 'The game is starting!'
                    if (gameSetup) gameSetup.style.display = 'none'
                    if (gameControls) gameControls.style.display = 'none'
                    if (results) results.style.display = 'none'
                    if (gameBoard) gameBoard.style.display = ''
                    break
                case 'results': // Switch to results view
                    stateMsg = 'The game is over. Results are displayed.'
                    if (gameSetup) gameSetup.style.display = 'none'
                    if (gameControls) gameControls.style.display = 'none'
                    if (results) results.style.display = ''
                    if (gameBoard) gameBoard.style.display = 'none'
                    break
                default: // WTF is this state?
                    stateMsg = `Game state changed: ${msg.state}`
            }
            console.debug(stateMsg)
        }
        if (msg.type === 'activity') {
            renderPlayers(msg.players, msg.host, msg.spectators, msg.activity, addDnDEvents)
            renderSpectators(msg.spectators, msg.host, msg.activity, addDnDEvents)
        } else if (msg.type !== 'game_state') {
            renderPlayers(msg.players, msg.host, msg.spectators, {}, addDnDEvents)
            renderSpectators(msg.spectators, msg.host, {}, addDnDEvents)
        }
    } catch {
        console.debug('WS:', data)
    }
}

export function connectWebSocket(apiUrl: string, roomId: string, username: string) {
    if (!apiUrl || !roomId || !username) return
    const wsUrl = apiUrl.replace(/^http/, 'ws') + `/ws/${roomId}/${encodeURIComponent(username)}`
    const ws = new WebSocket(wsUrl)
    ws.onopen = () => console.debug('WebSocket connected:', wsUrl)
    ws.onmessage = (event) => handleWSMessage(event.data)
    ws.onclose = (event: CloseEvent) => {
        console.debug('WebSocket disconnected', event)
        alert('Connexion perdue avec la salle. La page va être rechargée.')
        window.location.reload()
    }
    ws.onerror = (error: Event) => {
        console.error('WebSocket error:', error)
        alert('Impossible de se connecter à la salle. Veuillez vérifier le code et réessayer.')
        const joinRoleModal = document.getElementById('joinRoleModal')
        if (joinRoleModal) joinRoleModal.style.display = 'flex'
    }
    ;(window as any).pennyGameWS = ws
}
