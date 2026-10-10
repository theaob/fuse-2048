import { emptyCells } from './board';
import { emptyBoard } from './board';
import type { LevelDef } from './levels';
import { SHAPES } from './levels';
import { hashString, Rng } from './rng';

/** The daily challenge rolls over at 00:00 UTC for every player. */
export function dailyKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function msUntilNextDaily(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return next - now.getTime();
}

interface Theme {
  name: string;
  build: (rng: Rng) => Omit<LevelDef, 'id' | 'world' | 'name' | 'seed'>;
}

// Indexed by UTC weekday, 0 = Sunday. Sunday is the longer "boss" challenge.
const THEMES: Theme[] = [
  {
    name: 'Boss day',
    build: () => ({
      intro: 'The weekly boss: two halves, one passage, a big goal.',
      shape: [...SHAPES.waist], goal: { type: 'tile', value: 512 }, moveLimit: 170,
      tiles: [[0, 0, 128], [4, 4, 128], [0, 1, 64]],
    }),
  },
  {
    name: 'Classic day',
    build: () => ({
      intro: 'Pure 2048 on the classic board.',
      shape: [...SHAPES.classic], goal: { type: 'tile', value: 256 }, moveLimit: 100,
      tiles: [[3, 0, 64], [3, 1, 32], [3, 2, 16], [2, 0, 8]],
    }),
  },
  {
    name: 'Tower day',
    build: () => ({
      intro: 'A tall 4 by 6 board.',
      shape: [...SHAPES.tower], goal: { type: 'tile', value: 256 }, moveLimit: 120,
      tiles: [[5, 0, 64], [5, 1, 32]],
    }),
  },
  {
    name: 'Stone day',
    build: (rng) => {
      const shape = [...SHAPES.classic];
      const board = emptyBoard(shape);
      const stones: [number, number, number][] = [];
      // Keep stones off the edges' corners so every one can be reached.
      const inner = emptyCells(board).filter((i) => i !== 0 && i !== 3 && i !== 12 && i !== 15);
      while (stones.length < 3) {
        const i = inner.splice(rng.int(inner.length), 1)[0];
        stones.push([Math.floor(i / 4), i % 4, 6]);
      }
      return { intro: 'Crack three stones.', shape, goal: { type: 'stones' }, moveLimit: 60, stones };
    },
  },
  {
    name: 'Tiny day',
    build: () => ({
      intro: 'A 3 by 3 sprint.',
      shape: [...SHAPES.tiny], goal: { type: 'tile', value: 128 }, moveLimit: 80,
      tiles: [[2, 0, 16], [2, 1, 8]],
    }),
  },
  {
    name: 'Donut day',
    build: () => ({
      intro: 'A wall sits in the centre of the board.',
      shape: [...SHAPES.donut], goal: { type: 'tile', value: 256 }, moveLimit: 110,
      tiles: [[0, 0, 64], [0, 1, 32]],
    }),
  },
  {
    name: 'Cross day',
    build: () => ({
      intro: 'No corners to hide in.',
      shape: [...SHAPES.cross], goal: { type: 'tile', value: 256 }, moveLimit: 110,
      tiles: [[2, 0, 64], [3, 0, 32]],
    }),
  },
];

/** Same date, same challenge, for every player. */
export function dailyLevel(now: Date): LevelDef & { theme: string; key: string } {
  const key = dailyKey(now);
  const seed = hashString(`daily:${key}`);
  const theme = THEMES[new Date(`${key}T00:00:00Z`).getUTCDay()];
  return { id: `daily-${key}`, key, world: 0, name: theme.name, theme: theme.name, seed, ...theme.build(new Rng(seed)) };
}
