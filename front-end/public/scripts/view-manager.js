/**
 * View state manager for the Penny Game.
 * Controls which section of the UI is visible.
 */

export class ViewManager {
    static switchToLobbyView() {
        ViewManager._showOnly('gameSetup')
    }

    static switchToGameView() {
        ViewManager._showOnly('gameBoard')
    }

    static switchToRoundCompleteView() {
        ViewManager._showOnly('roundComplete')
    }

    static switchToResultsView() {
        ViewManager._showOnly('results')
    }

    static _showOnly(activeId) {
        const sections = ['gameSetup', 'gameBoard', 'roundComplete', 'results']
        for (const id of sections) {
            const el = document.getElementById(id)
            if (el) el.style.display = id === activeId ? 'block' : 'none'
        }
    }
}
