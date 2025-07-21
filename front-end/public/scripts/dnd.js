// Drag & Drop logic for Penny Game

export let draggedItem = null

export function handleDragStart(e) {
    draggedItem = e.target
    if (!draggedItem || !e.dataTransfer) return
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', draggedItem.textContent || '')
    setTimeout(() => draggedItem.classList.add('dragging'), 0)
}

export function handleDragEnd(e) {
    if (draggedItem) draggedItem.classList.remove('dragging')
    draggedItem = null
}

export function handleDragOver(e) {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

export function addDnDEvents(list) {
    if (!list) return
    list.querySelectorAll('li[draggable="true"]').forEach((li) => {
        li.addEventListener('dragstart', handleDragStart)
        li.addEventListener('dragend', handleDragEnd)
    })
}
