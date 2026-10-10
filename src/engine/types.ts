export type Dir = 'up' | 'down' | 'left' | 'right';

export type Tile =
  | { id: number; kind: 'num'; value: number }
  /** Never moves or merges; loses 1 hp for every merge next to it and crumbles at 0. */
  | { id: number; kind: 'stone'; hp: number };

export interface Board {
  w: number;
  h: number;
  /** false = wall: no tile can enter it and it splits rows and columns. */
  open: boolean[];
  cells: (Tile | null)[];
}

export type PowerUpId = 'undo' | 'bomb' | 'swap' | 'upgrade';
export type PerkId = 'calmSpawn' | 'comboCharger' | 'thrifty' | 'secondWind' | 'wideBoard';

export type Goal =
  | { type: 'tile'; value: number }
  | { type: 'score'; value: number }
  | { type: 'stones' };

export type GameMode = 'endless' | 'level' | 'daily';

export interface GameConfig {
  mode: GameMode;
  goal?: Goal;
  moveLimit?: number;
}

export type PickOption =
  | { kind: 'perk'; perk: PerkId }
  | { kind: 'charge'; powerUp: PowerUpId; count: number }
  | { kind: 'energy'; amount: number };

/** Everything Undo restores. Energy, charges and perks are not rolled back. */
export interface Snapshot {
  board: Board;
  score: number;
  moves: number;
  rng: number;
  nextId: number;
  highest: number;
}

export type Status = 'playing' | 'won' | 'locked' | 'outOfMoves';

export interface MoveEvents {
  /** Tiles that merged into another tile: animate them to `to`, then drop them. */
  removed: { id: number; to: number }[];
  /** Ids of tiles produced by a merge (for a pop animation). */
  merged: number[];
  spawned: number[];
  crumbled: number[];
  destroyed: number[];
  mergeCount: number;
  gained: number;
}

export interface GameState {
  config: GameConfig;
  board: Board;
  rng: number;
  nextId: number;
  score: number;
  moves: number;
  highest: number;
  energy: number;
  /** Free uses (level loadouts and milestone gifts), spent before energy. */
  charges: Partial<Record<PowerUpId, number>>;
  powerUpsUsed: number;
  perks: PerkId[];
  /** Endless: the tile value that triggers the next milestone pick. */
  nextMilestone: number;
  pendingPick: PickOption[] | null;
  secondWindUsed: boolean;
  /** Endless: the rewarded-ad Second Wind, once per game. */
  adSecondWindUsed: boolean;
  scoreMultiplier: number;
  status: Status;
  prev: Snapshot | null;
  lastEvents: MoveEvents | null;
}

export type Action =
  | { type: 'move'; dir: Dir }
  | { type: 'undo' }
  | { type: 'bomb'; index: number }
  | { type: 'swap'; a: number; b: number }
  | { type: 'upgrade'; index: number }
  | { type: 'pick'; option: number }
  | { type: 'adSecondWind' };
