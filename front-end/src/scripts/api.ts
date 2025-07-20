// API-related functions for Penny Game

export function joinRoom(apiUrl: string, roomId: string, username: string, fetchGameState: (roomId: string) => void) {
    if (!apiUrl || !roomId || !username) return
    fetch(`${apiUrl}/game/join/${roomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
    })
        .then((response) => {
            if (!response.ok) throw new Error('Erreur lors de la connexion à la salle')
            // After joining, fetch actual state
            fetchGameState(roomId)
        })
        .catch(console.error)
}

export function fetchGameState(apiUrl: string, roomId: string, renderPlayers: any, renderSpectators: any) {
    if (!apiUrl || !roomId) return
    fetch(`${apiUrl}/game/state/${roomId}`)
        .then((response) => response.json())
        .then((data) => {
            // Fallback: if no activity info, assume all users online
            const activity: Record<string, boolean> = {}
            if (data.players)
                data.players.forEach((p: string) => {
                    activity[p] = true
                })
            if (data.spectators)
                data.spectators.forEach((s: string) => {
                    activity[s] = true
                })
            renderPlayers(data.players, data.host, data.spectators, activity)
            renderSpectators(data.spectators, data.host, activity)
        })
        .catch(console.error)
}

export function changeRole(
    apiUrl: string,
    roomId: string,
    username: string,
    newRole: string,
    fetchGameState: (roomId: string) => void
) {
    fetch(`${apiUrl}/game/change_role/${roomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, role: newRole }),
    })
        .then((response) => {
            if (!response.ok) throw new Error('Erreur lors du changement de rôle')
            return response.json()
        })
        .then(() => {
            fetchGameState(roomId)
        })
        .catch((err) => {
            alert(err.message || 'Impossible de changer le rôle')
        })
}
