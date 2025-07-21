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
            let stateMsg = ''
            switch (msg.state) {
                case 'lobby':
                    stateMsg = 'La partie est en attente dans le lobby.'
                    break
                case 'active':
                    stateMsg = 'La partie commence !'
                    // Switch to game view
                    const gameSetup = document.querySelector('.game-setup') as HTMLElement | null
                    const gameControls = document.querySelector('.game-controls') as HTMLElement | null
                    const gameBoard = document.getElementById('gameBoard') as HTMLElement | null
                    const results = document.getElementById('results') as HTMLElement | null
                    if (gameSetup) gameSetup.style.display = 'none'
                    if (gameControls) gameControls.style.display = 'none'
                    if (results) results.style.display = 'none'
                    if (gameBoard) gameBoard.style.display = ''
                    break
                case 'results':
                    stateMsg = 'La partie est terminée. Résultats affichés.'
                    break
                default:
                    stateMsg = `Changement d\'état de la partie: ${msg.state}`
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
    ws.onopen = () => console.debug('WebSocket connecté:', wsUrl)
    ws.onmessage = (event) => handleWSMessage(event.data)
    ws.onclose = (event: CloseEvent) => {
        console.debug('WebSocket déconnecté', event)
        alert('Connexion perdue avec la salle. La page va être rechargée.')
        window.location.reload()
    }
    ws.onerror = (error: Event) => {
        console.error('WebSocket erreur:', error)
        alert('Impossible de se connecter à la salle. Veuillez vérifier le code et réessayer.')
        const joinRoleModal = document.getElementById('joinRoleModal')
        if (joinRoleModal) joinRoleModal.style.display = 'flex'
    }
    ;(window as any).pennyGameWS = ws
}
