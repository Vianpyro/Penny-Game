// API-related functions for Penny Game with improved error handling
import { showNotification } from './utility.js'

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
        console.log('Successfully joined room:', data)

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
        console.log('Game state fetched:', data)

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
        const response = await fetch(`${apiUrl}/game/change_role/${roomId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, role: newRole }),
            credentials: 'include',
        })

        if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.detail || 'Erreur lors du changement de rôle')
        }

        const data = await response.json()
        console.log('Role changed successfully:', data)

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

export async function setBatchSize(apiUrl, roomId, batchSize) {
    if (!apiUrl || !roomId || !batchSize) {
        console.error('Missing parameters for setBatchSize')
        return
    }

    try {
        const response = await fetch(`${apiUrl}/game/batch_size/${roomId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ batch_size: batchSize }),
            credentials: 'include',
        })

        if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.detail || 'Erreur lors du changement de taille de lot')
        }

        const data = await response.json()
        console.log('Batch size changed successfully:', data)

        showSuccessNotification(`Taille de lot changée: ${batchSize}`)
        return data
    } catch (error) {
        console.error('Error changing batch size:', error)
        showErrorNotification(`Impossible de changer la taille de lot: ${error.message}`)
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
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
        })

        if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.detail || 'Erreur lors du démarrage de la partie')
        }

        const data = await response.json()
        console.log('Game started successfully:', data)

        showSuccessNotification('🎮 Partie démarrée !')
        return data
    } catch (error) {
        console.error('Error starting game:', error)
        showErrorNotification(`Impossible de démarrer: ${error.message}`)
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
            headers: { 'Content-Type': 'application/json' },
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
        console.log('Coin flipped successfully:', data)

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
        console.log('Sending batch request:', { apiUrl, roomId, username })

        const response = await fetch(`${apiUrl}/game/send/${roomId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: username,
            }),
            credentials: 'include',
        })

        console.log('Send batch response status:', response.status)

        if (!response.ok) {
            const errorData = await response.json()
            console.error('Send batch error data:', errorData)
            throw new Error(errorData.detail || "Erreur lors de l'envoi du lot")
        }

        const data = await response.json()
        console.log('Batch sent successfully:', data)

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
            credentials: 'include',
        })

        if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.detail || 'Erreur lors de la réinitialisation')
        }

        const data = await response.json()
        console.log('Game reset successfully:', data)

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
        console.log('Game created successfully:', data)

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
