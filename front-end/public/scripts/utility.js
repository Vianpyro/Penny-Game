export function enableFlip(element) {
    if (!element) return
    element.style.cursor = 'pointer'
    element.addEventListener('click', () => {
        element.classList.toggle('flipped')
        setTimeout(() => element.classList.toggle('grayscale'), 200)
    })
}

window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('coinFlip')
})

export function showNotification(message, type = 'info') {
    // Create or get notification container
    let container = document.getElementById('notification-container')
    if (!container) {
        container = document.createElement('div')
        container.id = 'notification-container'
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
        document.body.appendChild(container)
    }

    // Create notification element
    const notification = document.createElement('div')
    notification.className = `notification notification-${type}`
    notification.textContent = message

    // Style the notification
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
        background: '', // will be set below
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

    // Add to notification container
    container.appendChild(notification)

    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)'
    }, 100)

    // Auto remove after 5 seconds
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)'
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification)
            }
        }, 300)
    }, 5000)
}
