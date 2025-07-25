# Penny Game App

Penny Game is a web-based multiplayer game where players compete in a strategic penny-flipping challenge.
This repository contains both the backend API and the front-end client for the game.

## Project Structure

- **Backend (API)**: Built with FastAPI, located in the `api/` directory. Handles game logic, player management, and real-time communication via WebSockets.
- **Front-End**: Built with Astro, located in the `front-end/` directory. Provides an interactive user interface for joining games, playing, and viewing results. Hosted on GitHub Pages for easy access.

## Features

- Real-time multiplayer gameplay
- Secure API endpoints for game actions
- WebSocket support for live updates
- Responsive and modern UI

## Getting Started

### Prerequisites

- [Python 3.12+](https://www.python.org/) (for backend)
- [Node.js 18+](https://nodejs.org/) and [npm](https://www.npmjs.com/) (for front-end)

### Backend Setup (API)

1. Install dependencies:
   ```bash
   cd api
   pip install -r requirements.txt
   ```
2. Start the FastAPI server:
   ```bash
   uvicorn app.main:app --host 0.0.0.0
   ```
3. The API will be available at `http://<your-server-ip>:8000`.

### Front-End Setup

1. Install dependencies:
   ```bash
   cd front-end
   npm install
   ```
2. Build the static site:
   ```bash
   npm run build
   ```
3. Preview locally:
   ```bash
   npm run preview
   ```
4. Deploy to GitHub Pages (see your repository settings for details).

## Usage

1. Open the front-end site (hosted on GitHub Pages).
2. Join a game or create a new one.
3. Play the Penny Game with other online players in real time.

## Development

- Backend code is in `api/app/` (see `main.py`, `game_logic.py`, etc.).
- Front-end code is in `front-end/src/` and `front-end/public/scripts/`.

## License

This project is licensed under the GNU Affero General Public License v3. See the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please open issues or submit pull requests for improvements, bug fixes, or new features.

## Contact

For questions or support, please open an issue in this repository.
