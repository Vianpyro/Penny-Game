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
