# Liar’s Dice (React + Vite)

A single-page, local-pass-and-play party game for 3–6 players. Bluff, bid, and call opponents on one device with animated cup shaking, secret dice reveals, and a bold tabletop UI.

## Quick Start

```bash
npm install
npm run dev
# then open the printed localhost URL (default http://localhost:5173)
```

Build for production:

```bash
npm run build
```

## How to Play (App Flow)

- **Lobby:** Choose 3–6 players, edit names, then start. Each player begins with 5 dice and a cup color.
- **Shake & Slam:** Tap “Shake Cups” to roll everyone at once. Cups shake and slam onto the table.
- **Private Reveal:** Pass the device. Each player peeks at their dice with a “No peeking” overlay between turns.
- **Bidding:** On your turn, raise the bid (quantity + pip) or call `LIAR` / `SPOT ON`. Ones are wild:
  - Bidding ones halves the quantity (round up).
  - Leaving ones requires doubling the quantity.
- **Resolution:** Dice lift and spill out with highlights. `LIAR` punishes bluffers or callers; `SPOT ON` makes everyone else lose a die when exact.
- **Round & Game End:** Dice counts update, eliminated players gray out. Play rounds until one player remains, then rematch or return to the lobby.

## Tech Notes

- Vite + React functional components, JSX, and CSS animations (no backend, no networking).
- Custom CSS dice and cups, wild-one bid validation, turn tracking, and animated reveal overlays.
