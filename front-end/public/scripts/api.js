// API-related functions for Penny Game with improved error handling

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

export async function makeMove(apiUrl, roomId, username, flipCount) {
    if (!apiUrl || !roomId || !username || !flipCount) {
        console.error('Missing parameters for makeMove')
        return
    }

    if (![1, 2, 3].includes(flipCount)) {
        throw new Error('Le nombre de pièces doit être entre 1 et 3')
    }

    try {
        const response = await fetch(`${apiUrl}/game/move/${roomId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: username,
                flip: flipCount,
            }),
            credentials: 'include',
        })

        if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.detail || 'Erreur lors du mouvement')
        }

        const data = await response.json()
        console.log('Move made successfully:', data)

        return data
    } catch (error) {
        console.error('Error making move:', error)
        showErrorNotification(`Mouvement impossible: ${error.message}`)
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

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div')
    notification.className = `notification notification-${type}`
    notification.textContent = message

    // Style the notification
    Object.assign(notification.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        padding: '12px 20px',
        borderRadius: '8px',
        color: 'white',
        fontWeight: '600',
        zIndex: '9999',
        transform: 'translateX(100%)',
        transition: 'transform 0.3s ease',
        maxWidth: '300px',
        wordBreak: 'break-word',
        boxShadow: '0 4px 15px rgb(0 0 0 / 20%)',
    })

    // Set background color based on type
    switch (type) {
        case 'success':
            notification.style.background = 'linear-gradient(45deg, #27ae60, #2ecc71)'
            break
        case 'error':
            notification.style.background = 'linear-gradient(45deg, #e74c3c, #c0392b)'
            break
        case 'info':
        default:
            notification.style.background = 'linear-gradient(45deg, #3498db, #2980b9)'
            break
    }

    // Add to DOM
    document.body.appendChild(notification)

    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)'
    }, 100)

    // Auto remove after 4 seconds
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)'
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification)
            }
        }, 300)
    }, 4000)
}

// Export notification functions for use in other modules
export { showSuccessNotification, showErrorNotification, showInfoNotification, showNotification }
