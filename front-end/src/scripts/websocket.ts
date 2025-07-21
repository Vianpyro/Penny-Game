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
                    break
                case 'results':
                    stateMsg = 'La partie est terminée. Résultats affichés.'
                    break
                default:
                    stateMsg = `Changement d\'état de la partie: ${msg.state}`
            }
            alert(stateMsg)
        }
        if (msg.type === 'activity') {
            renderPlayers(msg.players, msg.host, msg.spectators, msg.activity, addDnDEvents)
            renderSpectators(msg.spectators, msg.host, msg.activity, addDnDEvents)
        } else if (msg.type !== 'game_state') {
            renderPlayers(msg.players, msg.host, msg.spectators, {}, addDnDEvents)
            renderSpectators(msg.spectators, msg.host, {}, addDnDEvents)
        }
    } catch {
        console.log('WS:', data)
    }
}

export function connectWebSocket(apiUrl: string, roomId: string, username: string) {
    if (!apiUrl || !roomId || !username) return
    const wsUrl = apiUrl.replace(/^http/, 'ws') + `/ws/${roomId}/${encodeURIComponent(username)}`
    const ws = new WebSocket(wsUrl)
    ws.onopen = () => console.log('WebSocket connecté:', wsUrl)
    ws.onmessage = (event) => handleWSMessage(event.data)
    ws.onclose = (event: CloseEvent) => {
        console.log('WebSocket déconnecté', event)
        alert('Connexion perdue avec la salle. La page va être rechargée.')
        window.location.reload()
    }
    ws.onerror = (err: Event) => {
        console.error('WebSocket erreur:', err)
        alert('Impossible de se connecter à la salle. Veuillez vérifier le code et réessayer.')
        const joinRoleModal = document.getElementById('joinRoleModal')
        if (joinRoleModal) joinRoleModal.style.display = 'flex'
    }
    ;(window as any).pennyGameWS = ws
}
