// Game start logic for Penny Game (migrated from inline script in index.astro)

// Helper to fetch player names from API for board rendering
export async function fetchBoardGameState(gameCode: string): Promise<any> {
    const apiUrl = (document.getElementById('joinRoleModal') as HTMLElement | null)?.getAttribute('data-api-url') || ''
    if (!apiUrl || !gameCode) return null
    try {
        const res = await fetch(`${apiUrl}/game/state/${gameCode}`)
        if (!res.ok) return null
        const data = await res.json()
        return data
    } catch {
        return null
    }
}

export function renderPlayerSections(players: string[], turn: number, pennies: any[]): void {
    const gameBoard = document.getElementById('gameBoard') as HTMLElement | null
    if (!gameBoard) return
    gameBoard.innerHTML = ''
    players.forEach((player: string, idx: number) => {
        const section = document.createElement('section')
        section.className = 'player-zone'
        section.innerHTML = `<h3>Joueur ${idx + 1}: ${player}</h3>`
        // Only the current turn player gets pennies
        if (idx === turn) {
            const pennyCount = Array.isArray(pennies) ? pennies.filter(Boolean).length : 0
            section.innerHTML += `<div class="pennies">${'🪙 '.repeat(pennyCount)}</div>`
        } else {
            section.innerHTML += `<div class="pennies"></div>`
        }
        gameBoard.appendChild(section)
    })
}
