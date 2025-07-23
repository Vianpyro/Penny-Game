// API-related functions for Penny Game

export function joinRoom(apiUrl, roomId, username, fetchGameState) {
    if (!apiUrl || !roomId || !username) return
    fetch(`${apiUrl}/game/join/${roomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
        credentials: 'include',
    })
        .then((response) => {
            if (!response.ok) throw new Error('Erreur lors de la connexion à la salle')
            // After joining, fetch actual state
            fetchGameState(roomId)
        })
        .catch(console.error)
}

export function fetchGameState(apiUrl, roomId, renderPlayers, renderSpectators) {
    if (!apiUrl || !roomId) return
    fetch(`${apiUrl}/game/state/${roomId}`, { credentials: 'include' })
        .then((response) => response.json())
        .then((data) => {
            // Fallback: if no activity info, assume all users online
            const activity = {}
            if (data.players)
                data.players.forEach((p) => {
                    activity[p] = true
                })
            if (data.spectators)
                data.spectators.forEach((s) => {
                    activity[s] = true
                })
            renderPlayers(data.players, data.host, data.spectators, activity)
            renderSpectators(data.spectators, data.host, activity)
        })
        .catch(console.error)
}

export function changeRole(apiUrl, roomId, username, newRole, fetchGameState) {
    fetch(`${apiUrl}/game/change_role/${roomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, role: newRole }),
        credentials: 'include',
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
