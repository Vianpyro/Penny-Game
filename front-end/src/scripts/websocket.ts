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
        if (msg.type === 'activity') {
            renderPlayers(msg.players, msg.host, msg.spectators, msg.activity, addDnDEvents)
            renderSpectators(msg.spectators, msg.host, msg.activity, addDnDEvents)
        } else {
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
        if (event && event.code === 4001) {
            alert('Code de salle invalide ou salle inexistante. Veuillez réessayer.')
            const joinRoleModal = document.getElementById('joinRoleModal')
            if (joinRoleModal) joinRoleModal.style.display = 'flex'
        }
    }
    ws.onerror = (err: Event) => {
        console.error('WebSocket erreur:', err)
        alert('Impossible de se connecter à la salle. Veuillez vérifier le code et réessayer.')
        const joinRoleModal = document.getElementById('joinRoleModal')
        if (joinRoleModal) joinRoleModal.style.display = 'flex'
    }
    ;(window as any).pennyGameWS = ws
}
