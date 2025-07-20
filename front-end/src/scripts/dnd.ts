// Drag & Drop logic for Penny Game

export let draggedItem: HTMLElement | null = null

export function handleDragStart(e: DragEvent) {
    draggedItem = e.target as HTMLElement
    if (!draggedItem || !e.dataTransfer) return
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', draggedItem.textContent || '')
    setTimeout(() => draggedItem!.classList.add('dragging'), 0)
}

export function handleDragEnd(e: DragEvent) {
    if (draggedItem) draggedItem.classList.remove('dragging')
    draggedItem = null
}

export function handleDragOver(e: DragEvent) {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

export function addDnDEvents(list: HTMLElement | null) {
    if (!list) return
    list.querySelectorAll('li[draggable="true"]').forEach((li) => {
        const liEl = li as HTMLElement
        liEl.addEventListener('dragstart', handleDragStart)
        liEl.addEventListener('dragend', handleDragEnd)
    })
}
