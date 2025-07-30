// View Manager for Penny Game - handles switching between different game views

export class ViewManager {
    static currentView = 'lobby'

    /**
     * Switch to lobby view (game setup)
     */
    static switchToLobbyView() {
        console.log('🔄 Switching to lobby view')

        // Hide all views
        ViewManager.hideAllViews()

        // Show lobby elements
        const gameSetup = document.querySelector('.game-setup')
        const gameControls = document.querySelector('.game-controls')

        if (gameSetup) gameSetup.style.display = 'block'
        if (gameControls) gameControls.style.display = 'block'

        ViewManager.currentView = 'lobby'
    }

    /**
     * Switch to active game view (game board)
     */
    static switchToGameView() {
        console.log('🎮 Switching to game view')

        // Hide all views
        ViewManager.hideAllViews()

        // Show game board
        const gameBoard = document.getElementById('gameBoard')
        const gameSetup = document.querySelector('.game-setup')

        if (gameBoard) gameBoard.style.display = 'block'
        if (gameSetup) gameSetup.style.display = 'none'

        ViewManager.currentView = 'game'
    }

    /**
     * Switch to round complete view
     */
    static switchToRoundCompleteView() {
        console.log('🎯 Switching to round complete view')

        // Hide all views
        ViewManager.hideAllViews()

        // Show round complete screen
        const roundComplete = document.getElementById('roundComplete')
        const gameBoard = document.getElementById('gameBoard')

        if (roundComplete) roundComplete.style.display = 'block'
        if (gameBoard) gameBoard.style.display = 'none'

        ViewManager.currentView = 'round_complete'
    }

    /**
     * Switch to results view (final results)
     */
    static switchToResultsView() {
        console.log('🏆 Switching to results view')

        // Hide all views
        ViewManager.hideAllViews()

        // Show results screen
        const results = document.getElementById('results')
        const gameBoard = document.getElementById('gameBoard')
        const roundComplete = document.getElementById('roundComplete')

        if (results) results.style.display = 'block'
        if (gameBoard) gameBoard.style.display = 'none'
        if (roundComplete) roundComplete.style.display = 'none'

        ViewManager.currentView = 'results'
    }

    /**
     * Hide all possible views
     */
    static hideAllViews() {
        const elementsToHide = ['.game-setup', '.game-controls', '#gameBoard', '#roundComplete', '#results']

        elementsToHide.forEach((selector) => {
            const element = document.querySelector(selector)
            if (element) {
                element.style.display = 'none'
            }
        })
    }

    /**
     * Get current view
     */
    static getCurrentView() {
        return ViewManager.currentView
    }

    /**
     * Initialize view manager
     */
    static initialize() {
        console.log('📱 ViewManager initialized')
        ViewManager.switchToLobbyView() // Start with lobby view
    }

    /**
     * Handle view transitions with smooth animations (optional enhancement)
     */
    static switchViewWithTransition(targetView) {
        const currentElement = ViewManager.getCurrentViewElement()
        const targetElement = ViewManager.getViewElement(targetView)

        if (currentElement) {
            currentElement.style.opacity = '0'
            setTimeout(() => {
                currentElement.style.display = 'none'
                if (targetElement) {
                    targetElement.style.display = 'block'
                    targetElement.style.opacity = '1'
                }
            }, 150)
        } else if (targetElement) {
            targetElement.style.display = 'block'
            targetElement.style.opacity = '1'
        }
    }

    /**
     * Get the DOM element for current view
     */
    static getCurrentViewElement() {
        switch (ViewManager.currentView) {
            case 'lobby':
                return document.querySelector('.game-setup')
            case 'game':
                return document.getElementById('gameBoard')
            case 'round_complete':
                return document.getElementById('roundComplete')
            case 'results':
                return document.getElementById('results')
            default:
                return null
        }
    }

    /**
     * Get the DOM element for a specific view
     */
    static getViewElement(viewName) {
        switch (viewName) {
            case 'lobby':
                return document.querySelector('.game-setup')
            case 'game':
                return document.getElementById('gameBoard')
            case 'round_complete':
                return document.getElementById('roundComplete')
            case 'results':
                return document.getElementById('results')
            default:
                return null
        }
    }

    /**
     * Debug method to log current view state
     */
    static debugViewState() {
        console.log('🔍 Current view state:', {
            currentView: ViewManager.currentView,
            gameSetup: document.querySelector('.game-setup')?.style.display,
            gameBoard: document.getElementById('gameBoard')?.style.display,
            roundComplete: document.getElementById('roundComplete')?.style.display,
            results: document.getElementById('results')?.style.display,
        })
    }
}

// Initialize when DOM is loaded
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        ViewManager.initialize()
    })
}
