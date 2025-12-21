// API-related functions for Penny Game
import { showNotification } from './utility.js'

const SESSION_TOKEN_KEY = 'penny_session_token'
const HOST_SECRET_KEY = 'penny_host_secret'
const CSRF_TOKEN_KEY = 'penny_csrf_token'

function setSessionToken(token) {
    if (!token) return
    window.sessionToken = token
    try {
        sessionStorage.setItem(SESSION_TOKEN_KEY, token)
    } catch (e) {
        console.warn('Unable to persist session token', e)
    }
}

function getSessionToken() {
    return (
        window.sessionToken ||
        (() => {
            try {
                return sessionStorage.getItem(SESSION_TOKEN_KEY)
            } catch (e) {
                return null
            }
        })()
    )
}

function setHostAuth(hostSecret, csrfToken) {
    if (hostSecret) {
        window.hostSecret = hostSecret
        try {
            sessionStorage.setItem(HOST_SECRET_KEY, hostSecret)
        } catch (e) {
            console.warn('Unable to persist host secret', e)
        }
    }
    if (csrfToken) {
        window.csrfToken = csrfToken
        try {
            sessionStorage.setItem(CSRF_TOKEN_KEY, csrfToken)
        } catch (e) {
            console.warn('Unable to persist CSRF token', e)
        }
    }
}

function getHostSecret() {
    return (
        window.hostSecret ||
        (() => {
            try {
                return sessionStorage.getItem(HOST_SECRET_KEY)
            } catch (e) {
                return null
            }
        })()
    )
}

function getCsrfToken() {
    return (
        window.csrfToken ||
        (() => {
            try {
                return sessionStorage.getItem(CSRF_TOKEN_KEY)
            } catch (e) {
                return null
            }
        })()
    )
}

function buildSessionHeaders(headers = {}) {
    const token = getSessionToken()
    return token ? { ...headers, 'X-Session-Token': token } : headers
}

function buildHostHeaders(headers = {}) {
    const hostSecret = getHostSecret()
    const csrfToken = getCsrfToken()
    return {
        ...headers,
        ...(hostSecret ? { 'X-Host-Secret': hostSecret } : {}),
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    }
}

export async function joinRoom(apiUrl, roomId, username, onSuccess) {
    if (!apiUrl || !roomId || !username) {
        console.error('Missing parameters for joinRoom')
        return
    }

    try {
        const response = await fetch(`${apiUrl}/game/join/${roomId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username }),
            credentials: 'include',
        })

        if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.detail || 'Erreur lors de la connexion à la salle')
        }

        const data = await response.json()

        if (data.session_token) {
            console.log('✅ Session token received from server:', { tokenLength: data.session_token.length })
            setSessionToken(data.session_token)
            console.log('✅ Session token stored - verifying:', {
                storedToken: getSessionToken()?.substring(0, 8) + '...',
            })
        }

        // Store user role and host status
        window.isHost = data.host === username
        window.userRole = data.players.includes(username) ? 'player' : 'spectator'

        if (onSuccess) {
            onSuccess(roomId)
        }

        return data
    } catch (error) {
        console.error('Error joining room:', error)
        showErrorNotification(`Échec de la connexion: ${error.message}`)
        throw error
    }
}

export async function fetchGameState(apiUrl, roomId, renderPlayers, renderSpectators, onSuccess) {
    if (!apiUrl || !roomId) {
        console.error('Missing parameters for fetchGameState')
        return
    }

    try {
        const response = await fetch(`${apiUrl}/game/state/${roomId}`, {
            credentials: 'include',
        })

        if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.detail || "Erreur lors de la récupération de l'état du jeu")
        }

        const data = await response.json()

        // Fallback: if no activity info, assume all users online
        const activity = {}
        if (data.players) {
            data.players.forEach((p) => {
                activity[p] = true
            })
        }
        if (data.spectators) {
            data.spectators.forEach((s) => {
                activity[s] = true
            })
        }

        // Update UI
        if (renderPlayers) {
            renderPlayers(data.players, data.host, data.spectators, activity)
        }
        if (renderSpectators) {
            renderSpectators(data.spectators, data.host, activity)
        }

        // Update global state
        window.isHost = data.host === window.currentUsername
        window.gameState = data

        if (onSuccess) {
            onSuccess(data)
        }

        return data
    } catch (error) {
        console.error('Error fetching game state:', error)
        showErrorNotification(`Erreur de récupération: ${error.message}`)
        throw error
    }
}

export async function changeRole(apiUrl, roomId, username, newRole, onSuccess) {
    if (!apiUrl || !roomId || !username || !newRole) {
        console.error('Missing parameters for changeRole')
        return
    }

    try {
        const isHost = window.isHost === true
        const headers = isHost
            ? buildHostHeaders({ 'Content-Type': 'application/json' })
            : buildSessionHeaders({ 'Content-Type': 'application/json' })

        const response = await fetch(`${apiUrl}/game/change_role/${roomId}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ username, role: newRole }),
            credentials: 'include',
        })

        if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.detail || 'Erreur lors du changement de rôle')
        }

        const data = await response.json()

        // Update global user role
        window.userRole = newRole

        if (onSuccess) {
            onSuccess(roomId)
        }

        showSuccessNotification(`Rôle changé vers: ${newRole === 'player' ? 'Joueur' : 'Spectateur'}`)
        return data
    } catch (error) {
        console.error('Error changing role:', error)
        showErrorNotification(`Impossible de changer le rôle: ${error.message}`)
        throw error
    }
}

export async function setRoundConfig(apiUrl, roomId, config) {
    if (!apiUrl || !roomId || !config) {
        console.error('Missing parameters for setRoundConfig')
        return
    }

    try {
        const response = await fetch(`${apiUrl}/game/round_config/${roomId}`, {
            method: 'POST',
            headers: buildHostHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(config),
            credentials: 'include',
        })

        if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.detail || 'Erreur lors de la configuration des manches')
        }

        const data = await response.json()
        console.log('Round config updated:', data)
        return data
    } catch (error) {
        console.error('Error setting round config:', error)
        showErrorNotification(`Impossible de configurer les manches: ${error.message}`)
        throw error
    }
}

export async function setBatchSize(apiUrl, roomId, batchSize) {
    console.warn('setBatchSize is deprecated. Use setRoundConfig instead.')
    // For backward compatibility, convert to new format
    try {
        return await setRoundConfig(apiUrl, roomId, {
            round_type: 'single',
            required_players: window.gameState?.required_players || 5,
            selected_batch_size: batchSize,
        })
    } catch (error) {
        console.error('Error setting batch size:', error)
        throw error
    }
}

export async function startGame(apiUrl, roomId) {
    if (!apiUrl || !roomId) {
        console.error('Missing parameters for startGame')
        return
    }

    try {
        const response = await fetch(`${apiUrl}/game/start/${roomId}`, {
            method: 'POST',
            headers: buildHostHeaders({ 'Content-Type': 'application/json' }),
            credentials: 'include',
        })

        if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.detail || 'Erreur lors du démarrage de la partie')
        }

        const data = await response.json()
        showSuccessNotification('🎮 Partie démarrée !')
        return data
    } catch (error) {
        console.error('Error starting game:', error)
        showErrorNotification(`Impossible de démarrer: ${error.message}`)
        throw error
    }
}

export async function startNextRound(apiUrl, roomId) {
    if (!apiUrl || !roomId) {
        console.error('Missing parameters for startNextRound')
        return
    }

    try {
        const response = await fetch(`${apiUrl}/game/next_round/${roomId}`, {
            method: 'POST',
            headers: buildHostHeaders({ 'Content-Type': 'application/json' }),
            credentials: 'include',
        })

        if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.detail || 'Erreur lors du démarrage de la manche suivante')
        }

        const data = await response.json()
        showSuccessNotification(`🎮 Manche ${data.current_round} démarrée !`)
        return data
    } catch (error) {
        console.error('Error starting next round:', error)
        showErrorNotification(`Impossible de démarrer la manche suivante: ${error.message}`)
        throw error
    }
}

export async function flipCoin(apiUrl, roomId, username, coinIndex) {
    if (!apiUrl || !roomId || !username || coinIndex === undefined) {
        console.error('Missing parameters for flipCoin')
        return
    }

    try {
        const response = await fetch(`${apiUrl}/game/flip/${roomId}`, {
            method: 'POST',
            headers: buildSessionHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                username: username,
                coin_index: coinIndex,
            }),
            credentials: 'include',
        })

        if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.detail || 'Erreur lors du retournement de pièce')
        }

        const data = await response.json()
        return data
    } catch (error) {
        console.error('Error flipping coin:', error)
        showErrorNotification(`Impossible de retourner la pièce: ${error.message}`)
        throw error
    }
}

export async function sendBatch(apiUrl, roomId, username) {
    if (!apiUrl || !roomId || !username) {
        console.error('Missing parameters for sendBatch')
        return
    }

    try {
        const response = await fetch(`${apiUrl}/game/send/${roomId}`, {
            method: 'POST',
            headers: buildSessionHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                username: username,
            }),
            credentials: 'include',
        })

        if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.detail || "Erreur lors de l'envoi du lot")
        }

        const data = await response.json()
        return data
    } catch (error) {
        console.error('Error sending batch:', error)
        showErrorNotification(`Impossible d'envoyer le lot: ${error.message}`)
        throw error
    }
}

export async function resetGame(apiUrl, roomId) {
    if (!apiUrl || !roomId) {
        console.error('Missing parameters for resetGame')
        return
    }

    try {
        const response = await fetch(`${apiUrl}/game/reset/${roomId}`, {
            method: 'POST',
            headers: buildHostHeaders(),
            credentials: 'include',
        })

        if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.detail || 'Erreur lors de la réinitialisation')
        }

        const data = await response.json()
        showSuccessNotification('🔄 Partie réinitialisée')
        return data
    } catch (error) {
        console.error('Error resetting game:', error)
        showErrorNotification(`Impossible de réinitialiser: ${error.message}`)
        throw error
    }
}

export async function createGame(apiUrl) {
    if (!apiUrl) {
        console.error('Missing API URL for createGame')
        return
    }

    try {
        const response = await fetch(`${apiUrl}/game/create`, {
            method: 'POST',
            credentials: 'include',
        })

        if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.detail || 'Erreur lors de la création de la salle')
        }

        const data = await response.json()
        setHostAuth(data.host_secret, data.csrf_token)
        showSuccessNotification('🎉 Salle créée avec succès !')
        return data
    } catch (error) {
        console.error('Error creating game:', error)
        showErrorNotification(`Impossible de créer la salle: ${error.message}`)
        throw error
    }
}

// Helper function to check if user is host
export function isHostForRoom(roomId) {
    return window.isHost === true
}

// Helper function to get current user role
export function getCurrentUserRole() {
    return window.userRole || 'spectator'
}

// Helper function to get current game state
export function getCurrentGameState() {
    return window.gameState || null
}

// Auth helpers for other modules
export {
    getSessionToken,
    getHostSecret,
    getCsrfToken,
    buildSessionHeaders,
    buildHostHeaders,
    setSessionToken,
    setHostAuth,
}

// Notification helper functions
function showSuccessNotification(message) {
    showNotification(message, 'success')
}

function showErrorNotification(message) {
    showNotification(message, 'error')
}

function showInfoNotification(message) {
    showNotification(message, 'info')
}

// Export notification functions for use in other modules
export { showSuccessNotification, showErrorNotification, showInfoNotification }
