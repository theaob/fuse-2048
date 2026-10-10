import { emptyCells, highestTile, stonesLeft } from './index';
import { reduce } from './game';
import type { Dir, GameState } from './types';

const DIRS: Dir[] = ['left', 'down', 'right', 'up'];

function evaluate(s: GameState): number {
  if (s.status === 'won') return 1e9 - s.moves;
  if (s.status !== 'playing') return -1e9;
  let stoneHp = 0;
  for (const t of s.board.cells) if (t?.kind === 'stone') stoneHp += t.hp;
  return emptyCells(s.board).length * 30 + highestTile(s.board) * 2 + s.score / 4 - stoneHp * 200 - stonesLeft(s.board) * 400;
}

function search(s: GameState, depth: number): number {
  if (depth === 0 || s.status !== 'playing') return evaluate(s);
  let best = -Infinity;
  for (const dir of DIRS) {
    const next = reduce(s, { type: 'move', dir });
    if (next === s) continue;
    best = Math.max(best, search(next, depth - 1));
  }
  return best === -Infinity ? evaluate(s) : best;
}

/**
 * A simple look-ahead player for tests and level tuning. It sees the seeded spawns,
 * so a win shows that a level is beatable on its fixed seed, not that it is easy.
 */
export function botPlay(start: GameState, depth = 3, maxMoves = 2000): GameState {
  let s = start;
  while (s.status === 'playing' && s.moves < maxMoves) {
    if (s.pendingPick) {
      s = reduce(s, { type: 'pick', option: 0 });
      continue;
    }
    let bestDir: Dir | null = null;
    let bestScore = -Infinity;
    for (const dir of DIRS) {
      const next = reduce(s, { type: 'move', dir });
      if (next === s) continue;
      const v = search(next, depth - 1);
      if (v > bestScore) {
        bestScore = v;
        bestDir = dir;
      }
    }
    if (!bestDir) break;
    s = reduce(s, { type: 'move', dir: bestDir });
  }
  return s;
}
