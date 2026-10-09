# Cozy Puzzles

Two mobile logic puzzles that run in the browser and install on a phone's home screen:

- **Campsite**: Tents & Trees. The generator checks that every level has exactly one solution.
- **Slide Out**: arrow escape. Every generated board can be cleared.

Plain HTML, CSS and JS, with no build step. Levels come from a seed, so level N is the same board for everyone.

- `index.html`: launcher with both games
- `campsite/`, `slide-out/`: one installable app per game
- `assets/game.js`: generators, solver and game UI
- `sw.js`: offline cache (bump `VERSION` on each release)
