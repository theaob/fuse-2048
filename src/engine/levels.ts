import { squareShape } from './board';
import type { NewGameOptions } from './game';
import { newGame } from './game';
import { hashString } from './rng';
import type { GameMode, GameState, Goal, PowerUpId } from './types';

/**
 * A level is pure data. New levels (and new board shapes) need no code.
 * Shapes are rows of `#` (cell) and `.` (wall).
 */
export interface LevelDef {
  id: string;
  world: number;
  name: string;
  /** One line shown before the level starts. */
  intro: string;
  shape: string[];
  goal: Goal;
  moveLimit: number;
  tiles?: [number, number, number][];
  stones?: [number, number, number][];
  loadout?: Partial<Record<PowerUpId, number>>;
  /** Fixed seed so retries are learnable. Defaults to a hash of the id. */
  seed?: number;
}

export const SHAPES = {
  tiny: squareShape(3),
  classic: squareShape(4),
  big: squareShape(5),
  tower: squareShape(4, 6),
  cross: ['..##..', '.####.', '######', '######', '.####.', '..##..'],
  donut: ['#####', '#####', '##.##', '#####', '#####'],
  waist: ['#####', '#####', '..#..', '#####', '#####'],
} as const satisfies Record<string, readonly string[]>;

const shape = (k: keyof typeof SHAPES) => [...SHAPES[k]];

export const WORLDS = [
  { id: 1, name: 'Shapes', blurb: 'Classic 2048 on boards of every shape' },
  { id: 2, name: 'Stones', blurb: 'Merge next to Stones to crumble them' },
];

export const LEVELS: LevelDef[] = [
  {
    id: '1-1', world: 1, name: 'First Fuse', intro: 'Swipe to slide tiles. Equal tiles fuse.',
    shape: shape('classic'), goal: { type: 'tile', value: 64 }, moveLimit: 70, loadout: { undo: 1 },
  },
  {
    id: '1-2', world: 1, name: 'Tiny Board', intro: 'Only 9 cells. Every move matters.',
    shape: shape('tiny'), goal: { type: 'tile', value: 64 }, moveLimit: 60,
    tiles: [[2, 0, 8], [2, 1, 4]], loadout: { undo: 1 },
  },
  {
    id: '1-3', world: 1, name: 'Score Rush', intro: 'Fuse several tiles in one swipe for a combo bonus.',
    shape: shape('classic'), goal: { type: 'score', value: 500 }, moveLimit: 50,
    tiles: [[0, 0, 8], [0, 1, 8], [1, 0, 4], [1, 1, 4]],
  },
  {
    id: '1-4', world: 1, name: 'Head Start', intro: 'A strong corner is already set up for you.',
    shape: shape('classic'), goal: { type: 'tile', value: 256 }, moveLimit: 95,
    tiles: [[3, 0, 64], [3, 1, 32], [3, 2, 16], [2, 0, 8]], loadout: { undo: 1 },
  },
  {
    id: '1-5', world: 1, name: 'Tower', intro: 'A tall board that fills your phone.',
    shape: shape('tower'), goal: { type: 'tile', value: 128 }, moveLimit: 70,
    tiles: [[5, 0, 32], [5, 1, 16]], loadout: { undo: 1 },
  },
  {
    id: '1-6', world: 1, name: 'Donut', intro: 'A wall in the middle splits the centre row and column.',
    shape: shape('donut'), goal: { type: 'tile', value: 128 }, moveLimit: 70,
    tiles: [[0, 0, 32], [4, 4, 16]], loadout: { undo: 1 },
  },
  {
    id: '1-7', world: 1, name: 'Cross', intro: 'No corners here. Find a new strategy.',
    shape: shape('cross'), goal: { type: 'tile', value: 256 }, moveLimit: 100,
    tiles: [[2, 0, 64], [3, 0, 64], [2, 5, 32]], loadout: { undo: 1, bomb: 1 },
  },
  {
    id: '1-8', world: 1, name: 'The Waist', intro: 'Boss: two halves share one narrow passage.',
    shape: shape('waist'), goal: { type: 'tile', value: 256 }, moveLimit: 110,
    tiles: [[0, 0, 64], [4, 4, 64], [0, 1, 32]], loadout: { undo: 1, swap: 1 },
  },
  {
    id: '2-1', world: 2, name: 'First Stone', intro: 'Stones never move. Fuse tiles next to one to crack it.',
    shape: shape('classic'), goal: { type: 'stones' }, moveLimit: 30,
    stones: [[1, 1, 5]], tiles: [[0, 0, 2], [0, 2, 2], [2, 0, 4]],
  },
  {
    id: '2-2', world: 2, name: 'Twin Stones', intro: 'Two stones block the middle.',
    shape: shape('classic'), goal: { type: 'stones' }, moveLimit: 45,
    stones: [[1, 1, 6], [2, 2, 6]], tiles: [[0, 0, 2], [3, 3, 2]],
  },
  {
    id: '2-3', world: 2, name: 'Tiny Quarry', intro: 'A stone in the centre of a tiny board.',
    shape: shape('tiny'), goal: { type: 'stones' }, moveLimit: 35,
    stones: [[1, 1, 6]], tiles: [[0, 0, 2], [2, 2, 2]], loadout: { undo: 1 },
  },
  {
    id: '2-4', world: 2, name: 'Donut Rocks', intro: 'Three stones around the hole.',
    shape: shape('donut'), goal: { type: 'stones' }, moveLimit: 60,
    stones: [[0, 2, 6], [4, 2, 6], [2, 0, 6]], tiles: [[1, 1, 4], [3, 3, 4]], loadout: { undo: 1 },
  },
  {
    id: '2-5', world: 2, name: 'Big Rock', intro: 'Boss: four tough stones on a big board.',
    shape: shape('big'), goal: { type: 'stones' }, moveLimit: 80,
    stones: [[1, 1, 8], [1, 3, 8], [3, 1, 8], [3, 3, 8]], tiles: [[0, 0, 4], [4, 4, 4]], loadout: { bomb: 1, undo: 1 },
  },
];

export function levelById(id: string): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}

export function startLevel(level: LevelDef, mode: GameMode = 'level'): GameState {
  const opts: NewGameOptions = {
    config: { mode, goal: level.goal, moveLimit: level.moveLimit },
    shape: level.shape,
    seed: level.seed ?? hashString(`level:${level.id}`),
    tiles: level.tiles,
    stones: level.stones,
    charges: level.loadout,
  };
  return newGame(opts);
}

export function goalText(goal: Goal): string {
  if (goal.type === 'tile') return `Make a ${goal.value} tile`;
  if (goal.type === 'score') return `Score ${goal.value} points`;
  return 'Crumble every Stone';
}
