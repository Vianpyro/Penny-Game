/**
 * Utility functions for the Penny Game.
 */

export function showNotification(message, type = 'info') {
    const existing = document.querySelector('.notification')
    if (existing) existing.remove()

    const notification = document.createElement('div')
    notification.className = `notification notification-${type}`
    notification.textContent = message
    notification.style.cssText = `
        position: fixed; top: 20px; right: 20px; z-index: 9999;
        padding: 12px 20px; border-radius: 8px; font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15); max-width: 400px;
        animation: slideIn 0.3s ease;
    `

    const colors = {
        success: { bg: '#d4edda', color: '#155724', border: '#c3e6cb' },
        error: { bg: '#f8d7da', color: '#721c24', border: '#f5c6cb' },
        info: { bg: '#d1ecf1', color: '#0c5460', border: '#bee5eb' },
        warning: { bg: '#fff3cd', color: '#856404', border: '#ffeeba' },
    }
    const c = colors[type] || colors.info
    notification.style.background = c.bg
    notification.style.color = c.color
    notification.style.border = `1px solid ${c.border}`

    document.body.appendChild(notification)
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease'
        setTimeout(() => notification.remove(), 300)
    }, 3000)
}

export function supportsEmoji(emoji) {
    try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) return false
        ctx.fillText(emoji, 0, 0)
        return ctx.getImageData(0, 0, 1, 1).data[3] > 0
    } catch (_) {
        return true
    }
}
