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

## Rules

The Penny Game is a Lean simulation used to visualize flow efficiency and measure lead time in a production process. It is a **cooperative, non-competitive game** focused on how batch size impacts performance.

### 🎯 Objective

Players work together to move and flip coins (🪙) through a production line as quickly as possible. The goal is to complete the entire process—from the first flip to the last delivery—as efficiently as possible, depending on the configured **batch size**.

### 👥 Players

- 2 to 5 players per game.
- The first player to join becomes the **first in the chain**.
- A separate **host** starts the game but does not participate as a player.

### 🧩 Game Mechanics

- The total number of coins is fixed (usually 12).
- Each coin starts as **tails** and must be **flipped to heads** before being passed on.
- Players only control the coins assigned to them, based on the **batch size rule**.
- Players can only send coins that are **flipped to heads**.
- Once all their coins in a batch are flipped, players **send** them to the next player in line.
- The game ends when the **last player sends the final coin**.

### 📦 Batch Sizes

The core mechanic of the game is the batch size:

| Batch Size | Description                                                              |
| ---------- | ------------------------------------------------------------------------ |
| 12/12      | One player flips all 12 coins, then sends them all at once.              |
| 4/12       | Coins are flipped and sent in groups of 4 (3 batches total).             |
| 1/12       | Coins are flipped and sent **one by one**, allowing for continuous flow. |

Batch size influences how simultaneously players can act:

- Large batches lead to **idle time** for other players.
- Small batches enable **parallel actions** and smoother flow.

### 🔄 Turn Logic

- The game is **not turn-based**.
- Depending on the batch size, players may act **simultaneously**.
- Players flip and send coins **as soon as allowed**, making it a cooperative **speed-run** experience.

### 🚫 Errors & Edge Cases

- Coins must be flipped (heads up) before they can be sent.
- There is **no penalty** for invalid actions—unflipped coins simply remain in place.
- If a player disconnects, their turn is **skipped**.
- Disconnected players may **rejoin** and continue playing.

### ⚙️ Customization

Currently configurable options include:

- Number of players (2–5)
- Batch size: 12/12, 4/12, or 1/12

### 🧑‍🏫 Learning the Game

- Game rules are shown to all players before the game starts.
- No prior experience is required—just read, flip, and flow!

## Development

- Backend code is in `api/app/` (see `main.py`, `game_logic.py`, etc.).
- Front-end code is in `front-end/src/` and `front-end/public/scripts/`.

## License

This project is licensed under the GNU Affero General Public License v3. See the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please open issues or submit pull requests for improvements, bug fixes, or new features.

## Contact

For questions or support, please open an issue in this repository.
