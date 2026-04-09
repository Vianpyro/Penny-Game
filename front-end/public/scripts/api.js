/**
 * API client for the Penny Game.
 *
 * Adapted for the v2 event-sourced backend:
 *   - No more CSRF tokens (host_secret only)
 *   - "state" field renamed to "phase"
 *   - create returns session_token for host
 */

import { showNotification } from './utility.js'

const SESSION_TOKEN_KEY = 'penny_session_token'
const HOST_SECRET_KEY = 'penny_host_secret'

// --- Token Storage ---

function setSessionToken(token) {
    if (!token) return
    window.sessionToken = token
    try {
        sessionStorage.setItem(SESSION_TOKEN_KEY, token)
    } catch (_) { }
}

function getSessionToken() {
    return window.sessionToken || (() => {
        try { return sessionStorage.getItem(SESSION_TOKEN_KEY) } catch (_) { return null }
    })()
}

function setHostSecret(secret) {
    if (!secret) return
    window.hostSecret = secret
    try {
        sessionStorage.setItem(HOST_SECRET_KEY, secret)
    } catch (_) { }
}

function getHostSecret() {
    return window.hostSecret || (() => {
        try { return sessionStorage.getItem(HOST_SECRET_KEY) } catch (_) { return null }
    })()
}

// --- Header Builders ---

function buildSessionHeaders(headers = {}) {
    const token = getSessionToken()
    return token ? { ...headers, 'X-Session-Token': token } : headers
}

function buildHostHeaders(headers = {}) {
    const secret = getHostSecret()
    return secret ? { ...headers, 'X-Host-Secret': secret } : headers
}

// --- API Calls ---

export async function createGame(apiUrl) {
    if (!apiUrl) return
    try {
        const res = await fetch(`${apiUrl}/game/create`, { method: 'POST' })
        if (!res.ok) throw new Error((await res.json()).detail || 'Failed to create game')
        const data = await res.json()
        setHostSecret(data.host_secret)
        if (data.session_token) setSessionToken(data.session_token)
        showNotification('🎉 Salle créée avec succès !', 'success')
        return data
    } catch (error) {
        showNotification(`Impossible de créer la salle: ${error.message}`, 'error')
        throw error
    }
}

export async function joinRoom(apiUrl, roomId, username, onSuccess) {
    if (!apiUrl || !roomId || !username) return
    try {
        const res = await fetch(`${apiUrl}/game/join/${roomId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username }),
        })
        if (!res.ok) throw new Error((await res.json()).detail || 'Erreur lors de la connexion')
        const data = await res.json()

        if (data.session_token) setSessionToken(data.session_token)
        window.isHost = data.host === username
        window.userRole = data.players.includes(username) ? 'player' : 'spectator'

        if (onSuccess) onSuccess(roomId)
        return data
    } catch (error) {
        showNotification(`Échec de la connexion: ${error.message}`, 'error')
        throw error
    }
}

export async function fetchGameState(apiUrl, roomId, renderPlayers, renderSpectators, onSuccess) {
    if (!apiUrl || !roomId) return
    try {
        const res = await fetch(`${apiUrl}/game/state/${roomId}`)
        if (!res.ok) throw new Error((await res.json()).detail || 'Erreur de récupération')
        const data = await res.json()

        const activity = {}
            ; (data.players || []).forEach((p) => (activity[p] = true))
            ; (data.spectators || []).forEach((s) => (activity[s] = true))

        if (renderPlayers) renderPlayers(data.players, data.host, data.spectators, activity)
        if (renderSpectators) renderSpectators(data.spectators, data.host, activity)

        window.isHost = data.host === window.currentUsername
        window.gameState = data

        if (onSuccess) onSuccess(data)
        return data
    } catch (error) {
        showNotification(`Erreur de récupération: ${error.message}`, 'error')
        throw error
    }
}

export async function changeRole(apiUrl, roomId, username, newRole, onSuccess) {
    if (!apiUrl || !roomId || !username || !newRole) return
    try {
        const isHost = window.isHost === true
        const headers = isHost
            ? buildHostHeaders({ 'Content-Type': 'application/json' })
            : buildSessionHeaders({ 'Content-Type': 'application/json' })

        const res = await fetch(`${apiUrl}/game/change_role/${roomId}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ username, role: newRole }),
        })
        if (!res.ok) throw new Error((await res.json()).detail || 'Erreur de changement de rôle')
        const data = await res.json()
        window.userRole = newRole
        if (onSuccess) onSuccess(roomId)
        showNotification(`Rôle changé vers: ${newRole === 'player' ? 'Joueur' : 'Spectateur'}`, 'success')
        return data
    } catch (error) {
        showNotification(`Impossible de changer le rôle: ${error.message}`, 'error')
        throw error
    }
}

export async function setRoundConfig(apiUrl, roomId, config) {
    if (!apiUrl || !roomId || !config) return
    try {
        const res = await fetch(`${apiUrl}/game/round_config/${roomId}`, {
            method: 'POST',
            headers: buildHostHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(config),
        })
        if (!res.ok) throw new Error((await res.json()).detail || 'Erreur de configuration')
        return await res.json()
    } catch (error) {
        showNotification(`Impossible de configurer: ${error.message}`, 'error')
        throw error
    }
}

export async function startGame(apiUrl, roomId) {
    if (!apiUrl || !roomId) return
    try {
        const res = await fetch(`${apiUrl}/game/start/${roomId}`, {
            method: 'POST',
            headers: buildHostHeaders({ 'Content-Type': 'application/json' }),
        })
        if (!res.ok) throw new Error((await res.json()).detail || 'Erreur de démarrage')
        const data = await res.json()
        showNotification('🎮 Partie démarrée !', 'success')
        return data
    } catch (error) {
        showNotification(`Impossible de démarrer: ${error.message}`, 'error')
        throw error
    }
}

export async function startNextRound(apiUrl, roomId) {
    if (!apiUrl || !roomId) return
    try {
        const res = await fetch(`${apiUrl}/game/next_round/${roomId}`, {
            method: 'POST',
            headers: buildHostHeaders({ 'Content-Type': 'application/json' }),
        })
        if (!res.ok) throw new Error((await res.json()).detail || 'Erreur manche suivante')
        const data = await res.json()
        showNotification(`🎮 Manche ${data.current_round} démarrée !`, 'success')
        return data
    } catch (error) {
        showNotification(`Impossible de démarrer la manche suivante: ${error.message}`, 'error')
        throw error
    }
}

export async function flipCoin(apiUrl, roomId, username, coinIndex) {
    if (!apiUrl || !roomId || !username || coinIndex === undefined) return
    try {
        const res = await fetch(`${apiUrl}/game/flip/${roomId}`, {
            method: 'POST',
            headers: buildSessionHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ username, coin_index: coinIndex }),
        })
        if (!res.ok) throw new Error((await res.json()).detail || 'Erreur de flip')
        return await res.json()
    } catch (error) {
        showNotification(`Impossible de retourner la pièce: ${error.message}`, 'error')
        throw error
    }
}

export async function sendBatch(apiUrl, roomId, username) {
    if (!apiUrl || !roomId || !username) return
    try {
        const res = await fetch(`${apiUrl}/game/send/${roomId}`, {
            method: 'POST',
            headers: buildSessionHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ username }),
        })
        if (!res.ok) throw new Error((await res.json()).detail || "Erreur d'envoi")
        return await res.json()
    } catch (error) {
        showNotification(`Impossible d'envoyer le lot: ${error.message}`, 'error')
        throw error
    }
}

export async function resetGame(apiUrl, roomId) {
    if (!apiUrl || !roomId) return
    try {
        const res = await fetch(`${apiUrl}/game/reset/${roomId}`, {
            method: 'POST',
            headers: buildHostHeaders(),
        })
        if (!res.ok) throw new Error((await res.json()).detail || 'Erreur de réinitialisation')
        const data = await res.json()
        showNotification('🔄 Partie réinitialisée', 'success')
        return data
    } catch (error) {
        showNotification(`Impossible de réinitialiser: ${error.message}`, 'error')
        throw error
    }
}

export {
    getSessionToken,
    getHostSecret,
    setSessionToken,
    setHostSecret,
    buildSessionHeaders,
    buildHostHeaders,
}
