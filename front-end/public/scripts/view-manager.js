// Centralized module for managing game views

export class ViewManager {
    static views = {
        lobby: {
            show: ['.game-setup', '.game-controls'],
            hide: ['#gameBoard', '#results'],
        },
        game: {
            show: ['#gameBoard'],
            hide: ['.game-setup', '.game-controls', '#results'],
        },
        results: {
            show: ['#results'],
            hide: ['.game-setup', '.game-controls', '#gameBoard'],
        },
    }

    /**
     * Displays a specific view by hiding others
     * @param {string} viewName - Name of the view ('lobby', 'game', 'results')
     */
    static showView(viewName) {
        const viewConfig = this.views[viewName]
        if (!viewConfig) {
            console.warn(`Unknown view: ${viewName}`)
            return
        }

        // Hide all elements to be hidden
        viewConfig.hide.forEach((selector) => {
            const element = document.querySelector(selector)
            if (element) element.style.display = 'none'
        })

        // Show all elements to be shown
        viewConfig.show.forEach((selector) => {
            const element = document.querySelector(selector)
            if (element) element.style.display = ''
        })
    }

    /**
     * Switch to the lobby view
     */
    static switchToLobbyView() {
        this.showView('lobby')
    }

    /**
     * Switch to the game view
     */
    static switchToGameView() {
        this.showView('game')
    }

    /**
     * Switch to the results view
     */
    static switchToResultsView() {
        this.showView('results')
    }

    /**
     * Checks if a view is currently active
     * @param {string} viewName - Name of the view to check
     * @returns {boolean} True if the view is active
     */
    static isViewActive(viewName) {
        const viewConfig = this.views[viewName]
        if (!viewConfig) return false

        return viewConfig.show.some((selector) => {
            const element = document.querySelector(selector)
            return element && element.style.display !== 'none'
        })
    }
}
