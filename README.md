# Fuse 2048

A 2048-style puzzle game with power-ups, odd-shaped boards, short levels, an Endless mode and a daily challenge. Web first, mobile-friendly, no accounts.

This is the **prototype** (milestones M0 to M3 of the design plan, without the backend).

## Play it

```bash
npm install
npm run dev          # http://localhost:5173 (add --host to open it from a phone on the same network)
```

Other scripts:

| Script | What it does |
|---|---|
| `npm test` | Engine unit tests, including a bot that proves every level is beatable on its fixed seed |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Production build into `dist/` (relative paths, so it works from any static host) |
| `npm run build:single` | Also writes `dist/fuse-2048.html`, one self-contained file you can open or share |

Controls: swipe on a phone, arrow keys or WASD on a computer, `Z` for Undo, `Esc` to cancel a power-up.

### GitHub Pages

`.github/workflows/pages.yml` builds the game and publishes `dist/` to GitHub Pages on every push to `main` (or on demand from the Actions tab). One-time setup: in the repo's **Settings › Pages**, set **Source** to **GitHub Actions**. The site is then served at `https://theaob.github.io/fuse-2048/`. The build uses relative paths, so it works under that sub-path.

## What's in the prototype

- **Endless**: classic 4x4. Energy from merges pays for Undo (2), Bomb (3), Swap (3) and Upgrade (5). Every new highest tile from 256 up offers a pick of 3 perks or gifts (Calm Spawn, Combo Charger, Thrifty, Second Wind, Wide Board, free charges, full energy). Stones start spawning after 512. When the board locks you can watch a (simulated) rewarded ad once per game for Second Wind. The game saves on every move and resumes.
- **Levels**: 13 levels in two worlds. World 1 introduces board shapes (Tiny 3x3, Tower 4x6, Donut, Cross, Waist), World 2 introduces Stones. Goals are a tile, a score or "crumble every Stone", with a move limit, a fixed loadout and 1 to 3 stars.
- **Daily challenge**: one challenge per UTC day from a date seed, themed by weekday (Sunday is the boss). The first attempt counts for the streak; later runs are unscored practice. Results share as a Wordle-style emoji board.
- Progress, stars, streak and best score are kept in `localStorage`.

Not yet built: the leaderboard backend and server-side score replay, an ads SDK, PWA/offline install, Capacitor apps, sound, quests, calendar view, streak freezes, and the other special tiles and modifiers (Ice, Wildcard, Portals...).

## Code layout

```
src/engine/   pure, deterministic game logic (no DOM)
  board.ts    shapes, sliding and merging with walls and stones
  game.ts     reducer: (state, action) -> state, power-ups, perks, scoring, stars
  rng.ts      seeded RNG (mulberry32); the RNG state lives in the game state
  levels.ts   level data and board shapes
  daily.ts    daily challenge from the UTC date
  bot.ts      look-ahead player used by tests to check levels are beatable
src/ui/       DOM rendering, input, screens, localStorage
```

The engine is a pure reducer with a seeded RNG, so the same seed and moves always give the same board. That makes undo, level retries, daily seeds and (later) server-side score verification straightforward.

### Levels are data

Each level in `src/engine/levels.ts` is a plain object. Shapes are rows where `#` is a cell and `.` is a wall:

```ts
{
  id: '1-6', world: 1, name: 'Donut', intro: 'A wall in the middle splits the centre row and column.',
  shape: ['#####', '#####', '##.##', '#####', '#####'],
  goal: { type: 'tile', value: 128 }, moveLimit: 70,
  tiles: [[0, 0, 32], [4, 4, 16]],      // [row, col, value]
  stones: [],                           // [row, col, hp]
  loadout: { undo: 1 },
}
```

`npm test` fails if a new level can't be beaten by the bot on its seed.
