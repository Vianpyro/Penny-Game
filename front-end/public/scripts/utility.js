export function supportsEmoji(emoji) {
    const ctx = document.createElement('canvas').getContext('2d')
    ctx.canvas.width = ctx.canvas.height = 20
    ctx.textBaseline = 'top'
    ctx.font = '16px Arial'

    ctx.clearRect(0, 0, 20, 20)
    ctx.fillText(emoji, 0, 0)

    // Get pixel data to check if something was drawn
    const pixels = ctx.getImageData(0, 0, 20, 20).data
    return [...pixels].some((channel) => channel !== 0)
}

/**
 * Utility functions for the Penny Game
 * Provides common functionality like notifications, element manipulation, and animations
 */

// Configuration constants
const NOTIFICATION_CONFIG = {
    CONTAINER_ID: 'notification-container',
    AUTO_REMOVE_DELAY: 5000,
    ANIMATION_DELAY: 100,
    FADE_OUT_DELAY: 300,
}

const NOTIFICATION_TYPES = {
    SUCCESS: 'success',
    ERROR: 'error',
    INFO: 'info',
}

const NOTIFICATION_STYLES = {
    [NOTIFICATION_TYPES.SUCCESS]: {
        background: 'linear-gradient(45deg, #27ae60, #2ecc71)',
    },
    [NOTIFICATION_TYPES.ERROR]: {
        background: 'linear-gradient(45deg, #e74c3c, #c0392b)',
    },
    [NOTIFICATION_TYPES.INFO]: {
        background: 'linear-gradient(45deg, #3498db, #2980b9)',
    },
}

/**
 * Notification System
 */
export class NotificationManager {
    /**
     * Show a notification with specified type and message
     */
    static show(message, type = NOTIFICATION_TYPES.INFO) {
        const container = NotificationManager.getOrCreateContainer()
        const notification = NotificationManager.createNotification(message, type)

        container.appendChild(notification)
        NotificationManager.animateIn(notification)
        NotificationManager.scheduleRemoval(notification)
    }

    /**
     * Get or create the notification container
     */
    static getOrCreateContainer() {
        let container = document.getElementById(NOTIFICATION_CONFIG.CONTAINER_ID)

        if (!container) {
            container = NotificationManager.createContainer()
            document.body.appendChild(container)
        }

        return container
    }

    /**
     * Create the notification container
     */
    static createContainer() {
        const container = document.createElement('div')
        container.id = NOTIFICATION_CONFIG.CONTAINER_ID

        Object.assign(container.style, {
            position: 'fixed',
            top: '0',
            right: '0',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            zIndex: '9999',
            alignItems: 'flex-end',
            pointerEvents: 'none', // allow clicks through container
        })

        return container
    }

    /**
     * Create a notification element
     */
    static createNotification(message, type) {
        const notification = document.createElement('div')
        notification.className = `notification notification-${type}`
        notification.textContent = message

        // Base styles
        Object.assign(notification.style, {
            padding: '12px 20px',
            borderRadius: '8px',
            color: 'white',
            fontWeight: '600',
            transform: 'translateX(100%)',
            transition: 'transform 0.3s ease',
            maxWidth: '300px',
            wordBreak: 'break-word',
            boxShadow: '0 4px 15px rgb(0 0 0 / 20%)',
            pointerEvents: 'auto', // allow interaction with notification itself
        })

        // Type-specific styles
        const typeStyles = NOTIFICATION_STYLES[type] || NOTIFICATION_STYLES[NOTIFICATION_TYPES.INFO]
        Object.assign(notification.style, typeStyles)

        return notification
    }

    /**
     * Animate notification in
     */
    static animateIn(notification) {
        setTimeout(() => {
            notification.style.transform = 'translateX(0)'
        }, NOTIFICATION_CONFIG.ANIMATION_DELAY)
    }

    /**
     * Schedule notification removal
     */
    static scheduleRemoval(notification) {
        setTimeout(() => {
            NotificationManager.animateOut(notification)
        }, NOTIFICATION_CONFIG.AUTO_REMOVE_DELAY)
    }

    /**
     * Animate notification out and remove
     */
    static animateOut(notification) {
        notification.style.transform = 'translateX(100%)'

        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification)
            }
        }, NOTIFICATION_CONFIG.FADE_OUT_DELAY)
    }
}

/**
 * Animation Utilities
 */
export class AnimationUtils {
    /**
     * Enable flip animation on an element
     */
    static enableFlip(element) {
        if (!element) return

        element.style.cursor = 'pointer'
        element.addEventListener('click', () => {
            AnimationUtils.performFlip(element)
        })
    }

    /**
     * Perform flip animation
     */
    static performFlip(element) {
        element.classList.toggle('flipped')

        setTimeout(() => {
            element.classList.toggle('grayscale')
        }, 200) // Half of the flip animation duration
    }

    /**
     * Add pulse animation to an element
     */
    static addPulse(element, duration = 2000) {
        if (!element) return

        element.style.animation = `pulse ${duration}ms infinite`
    }

    /**
     * Remove all animations from an element
     */
    static removeAnimations(element) {
        if (!element) return

        element.style.animation = ''
        element.classList.remove('flipped', 'grayscale', 'dragging')
    }
}

/**
 * DOM Utilities
 */
export class DOMUtils {
    /**
     * Safely get element by ID
     */
    static getElementById(id) {
        return document.getElementById(id)
    }

    /**
     * Safely query selector
     */
    static querySelector(selector) {
        return document.querySelector(selector)
    }

    /**
     * Safely query selector all
     */
    static querySelectorAll(selector) {
        return document.querySelectorAll(selector)
    }

    /**
     * Add event listener with error handling
     */
    static addEventListener(element, event, handler, options = {}) {
        if (!element || typeof handler !== 'function') {
            console.warn('Invalid element or handler for event listener')
            return
        }

        try {
            element.addEventListener(event, handler, options)
        } catch (error) {
            console.error('Error adding event listener:', error)
        }
    }

    /**
     * Remove event listener with error handling
     */
    static removeEventListener(element, event, handler, options = {}) {
        if (!element || typeof handler !== 'function') {
            console.warn('Invalid element or handler for event listener removal')
            return
        }

        try {
            element.removeEventListener(event, handler, options)
        } catch (error) {
            console.error('Error removing event listener:', error)
        }
    }

    /**
     * Toggle class on element
     */
    static toggleClass(element, className, force = undefined) {
        if (!element || !className) return false

        return element.classList.toggle(className, force)
    }

    /**
     * Set element display style
     */
    static setDisplay(element, display) {
        if (!element) return

        element.style.display = display
    }

    /**
     * Show element
     */
    static show(element) {
        DOMUtils.setDisplay(element, 'block')
    }

    /**
     * Hide element
     */
    static hide(element) {
        DOMUtils.setDisplay(element, 'none')
    }
}

/**
 * Validation Utilities
 */
export class ValidationUtils {
    /**
     * Check if value is not null/undefined and not empty string
     */
    static isValidValue(value) {
        return value !== null && value !== undefined && value !== ''
    }

    /**
     * Validate required parameters
     */
    static validateRequired(params, requiredKeys) {
        const missing = []

        for (const key of requiredKeys) {
            if (!ValidationUtils.isValidValue(params[key])) {
                missing.push(key)
            }
        }

        if (missing.length > 0) {
            throw new Error(`Missing required parameters: ${missing.join(', ')}`)
        }

        return true
    }

    /**
     * Validate string length
     */
    static validateStringLength(str, min = 0, max = Infinity) {
        if (typeof str !== 'string') {
            return false
        }

        return str.length >= min && str.length <= max
    }

    /**
     * Validate number range
     */
    static validateNumberRange(num, min = -Infinity, max = Infinity) {
        if (typeof num !== 'number' || isNaN(num)) {
            return false
        }

        return num >= min && num <= max
    }
}

/**
 * Local Storage Utilities (with error handling)
 */
export class StorageUtils {
    /**
     * Get item from localStorage with error handling
     */
    static getItem(key) {
        try {
            return localStorage.getItem(key)
        } catch (error) {
            console.warn('Error accessing localStorage:', error)
            return null
        }
    }

    /**
     * Set item in localStorage with error handling
     */
    static setItem(key, value) {
        try {
            localStorage.setItem(key, value)
            return true
        } catch (error) {
            console.warn('Error writing to localStorage:', error)
            return false
        }
    }

    /**
     * Remove item from localStorage with error handling
     */
    static removeItem(key) {
        try {
            localStorage.removeItem(key)
            return true
        } catch (error) {
            console.warn('Error removing from localStorage:', error)
            return false
        }
    }
}

// Main notification function (backward compatibility)
export function showNotification(message, type = NOTIFICATION_TYPES.INFO) {
    NotificationManager.show(message, type)
}

// Additional utility function (backward compatibility)
export function enableFlip(element) {
    AnimationUtils.enableFlip(element)
}

// Auto-initialize when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    const coinFlip = DOMUtils.getElementById('coinFlip')
    if (coinFlip) {
        AnimationUtils.enableFlip(coinFlip)
    }
})
