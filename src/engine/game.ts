import {
  areAdjacent,
  canMove,
  cloneBoard,
  emptyBoard,
  emptyCells,
  highestTile,
  neighbors,
  numValue,
  slide,
} from './board';
import { Rng } from './rng';
import type {
  Action,
  Board,
  Dir,
  GameConfig,
  GameState,
  MoveEvents,
  PerkId,
  PickOption,
  PowerUpId,
  Snapshot,
  Tile,
} from './types';

export const MAX_ENERGY = 10;
export const POWER_UP_COST: Record<PowerUpId, number> = { undo: 2, bomb: 3, swap: 3, upgrade: 5 };
export const FIRST_MILESTONE = 256;
const ENDLESS_STONE_FROM = 512;
const SECOND_WIND_CLEARS = 4;
const WIDE_BOARD_MULTIPLIER = 0.8;

export interface NewGameOptions {
  config: GameConfig;
  /** Rows of `#` (cell) and `.` (wall). */
  shape: readonly string[];
  seed: number;
  /** Starting tiles as [row, col, value]. When omitted, two random tiles spawn. */
  tiles?: readonly (readonly [number, number, number])[];
  /** Stones as [row, col, hp]. */
  stones?: readonly (readonly [number, number, number])[];
  charges?: Partial<Record<PowerUpId, number>>;
}

export function newGame(opts: NewGameOptions): GameState {
  const board = emptyBoard(opts.shape);
  let nextId = 1;
  const place = (r: number, c: number, tile: Tile) => {
    const i = r * board.w + c;
    if (!board.open[i] || board.cells[i]) throw new Error(`Cannot place a tile at ${r},${c}`);
    board.cells[i] = tile;
  };
  for (const [r, c, value] of opts.tiles ?? []) place(r, c, { id: nextId++, kind: 'num', value });
  for (const [r, c, hp] of opts.stones ?? []) place(r, c, { id: nextId++, kind: 'stone', hp });

  const rng = new Rng(opts.seed >>> 0);
  const spawned: number[] = [];
  if (!opts.tiles?.length) {
    for (let k = 0; k < 2; k++) {
      const t = spawnTile(board, rng, nextId, [], 0);
      if (t) {
        spawned.push(t.id);
        nextId++;
      }
    }
  }

  return {
    config: opts.config,
    board,
    rng: rng.state,
    nextId,
    score: 0,
    moves: 0,
    highest: highestTile(board),
    energy: 0,
    charges: { ...(opts.charges ?? {}) },
    powerUpsUsed: 0,
    perks: [],
    nextMilestone: Math.max(FIRST_MILESTONE, highestTile(board) * 2),
    pendingPick: null,
    secondWindUsed: false,
    adSecondWindUsed: false,
    scoreMultiplier: 1,
    status: 'playing',
    prev: null,
    lastEvents: { ...noEvents(), spawned },
  };
}

function noEvents(): MoveEvents {
  return { removed: [], merged: [], spawned: [], crumbled: [], destroyed: [], mergeCount: 0, gained: 0 };
}

function snapshot(s: GameState): Snapshot {
  return { board: s.board, score: s.score, moves: s.moves, rng: s.rng, nextId: s.nextId, highest: s.highest };
}

/** Places a new tile in a random empty cell (mutates `board`). Returns the tile, or null if the board is full. */
function spawnTile(board: Board, rng: Rng, id: number, perks: PerkId[], highest: number, endless = false): Tile | null {
  const empty = emptyCells(board);
  if (!empty.length) return null;
  const cell = rng.pick(empty);
  let tile: Tile;
  if (endless && highest >= ENDLESS_STONE_FROM && empty.length >= 4 && rng.next() < 0.05) {
    tile = { id, kind: 'stone', hp: 3 };
  } else {
    const chanceOf4 = perks.includes('calmSpawn') ? 0.03 : 0.1;
    tile = { id, kind: 'num', value: rng.next() < chanceOf4 ? 4 : 2 };
  }
  board.cells[cell] = tile;
  return tile;
}

/** Merging into 8 gives 1 energy, into 64 gives 3. Merges into 4 give none. */
export function energyForMerge(value: number): number {
  return value < 8 ? 0 : Math.floor(Math.log2(value) / 2);
}

export function powerUpCost(s: GameState, id: PowerUpId): number {
  return Math.max(1, POWER_UP_COST[id] - (s.perks.includes('thrifty') ? 1 : 0));
}

/** True if the player can pay for this power-up right now (with a free charge or energy). */
export function canAfford(s: GameState, id: PowerUpId): boolean {
  return (s.charges[id] ?? 0) > 0 || s.energy >= powerUpCost(s, id);
}

export function stonesLeft(b: Board): number {
  return b.cells.filter((t) => t?.kind === 'stone').length;
}

export function movesLeft(s: GameState): number | null {
  return s.config.moveLimit ? Math.max(0, s.config.moveLimit - s.moves) : null;
}

function goalMet(s: GameState): boolean {
  const g = s.config.goal;
  if (!g) return false;
  if (g.type === 'tile') return s.highest >= g.value;
  if (g.type === 'score') return s.score >= g.value;
  return stonesLeft(s.board) === 0;
}

/** Removes the `n` lowest number tiles (mutates `board`) and returns their ids. */
function clearLowest(board: Board, n: number): number[] {
  const tiles = board.cells
    .map((t, i) => ({ t, i }))
    .filter((x) => x.t?.kind === 'num')
    .sort((a, b) => numValue(a.t) - numValue(b.t))
    .slice(0, n);
  for (const x of tiles) board.cells[x.i] = null;
  return tiles.map((x) => x.t!.id);
}

/** Decides the status after anything changes the board. May fire the Second Wind perk. */
function settle(s: GameState): GameState {
  if (goalMet(s)) return { ...s, status: 'won' };
  if (s.config.moveLimit && s.moves >= s.config.moveLimit) return { ...s, status: 'outOfMoves' };
  if (canMove(s.board)) return { ...s, status: 'playing' };
  if (s.config.mode === 'endless' && s.perks.includes('secondWind') && !s.secondWindUsed) {
    const board = cloneBoard(s.board);
    const destroyed = clearLowest(board, SECOND_WIND_CLEARS);
    const events = s.lastEvents ?? noEvents();
    return {
      ...s,
      board,
      secondWindUsed: true,
      status: 'playing',
      lastEvents: { ...events, destroyed: [...events.destroyed, ...destroyed] },
    };
  }
  return { ...s, status: 'locked' };
}

const PERK_POOL: PerkId[] = ['calmSpawn', 'comboCharger', 'thrifty', 'secondWind', 'wideBoard'];

function milestoneOptions(s: GameState, rng: Rng): PickOption[] {
  const isPlain4x4 = s.board.w === 4 && s.board.h === 4 && s.board.open.every(Boolean);
  const pool: PickOption[] = [
    ...PERK_POOL.filter((p) => !s.perks.includes(p) && (p !== 'wideBoard' || isPlain4x4)).map(
      (perk): PickOption => ({ kind: 'perk', perk }),
    ),
    { kind: 'charge', powerUp: 'bomb', count: 2 },
    { kind: 'charge', powerUp: 'undo', count: 2 },
    { kind: 'charge', powerUp: 'swap', count: 2 },
    { kind: 'charge', powerUp: 'upgrade', count: 1 },
    { kind: 'energy', amount: MAX_ENERGY },
  ];
  const out: PickOption[] = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(rng.int(pool.length), 1)[0]);
  return out;
}

function widen(b: Board): Board {
  const w = b.w + 1;
  const h = b.h + 1;
  const cells: (Tile | null)[] = new Array(w * h).fill(null);
  for (let i = 0; i < b.cells.length; i++) cells[Math.floor(i / b.w) * w + (i % b.w)] = b.cells[i];
  return { w, h, open: new Array(w * h).fill(true), cells };
}

function move(s: GameState, dir: Dir): GameState {
  if (s.status !== 'playing' || s.pendingPick) return s;
  const res = slide(s.board, dir);
  if (!res.moved) return s;

  const board = res.board;
  const events = noEvents();
  events.removed = res.removed;
  events.merged = res.merges.map((m) => m.id);
  events.mergeCount = res.merges.length;

  // Stones next to a merge lose 1 hp per merge.
  for (const m of res.merges) {
    for (const n of neighbors(board, m.index)) {
      const t = board.cells[n];
      if (t?.kind !== 'stone') continue;
      if (t.hp <= 1) {
        board.cells[n] = null;
        events.crumbled.push(t.id);
      } else board.cells[n] = { ...t, hp: t.hp - 1 };
    }
  }

  const base = res.merges.reduce((sum, m) => sum + m.value, 0);
  const comboBonus = 1 + 0.25 * Math.max(0, res.merges.length - 1);
  const gained = Math.round(base * comboBonus * s.scoreMultiplier);
  events.gained = gained;

  let energy = res.merges.reduce((sum, m) => sum + energyForMerge(m.value), 0);
  if (res.merges.length >= 2) energy = Math.round(energy * (s.perks.includes('comboCharger') ? 2 : 1.5));

  const rng = new Rng(s.rng);
  const highestBefore = Math.max(s.highest, highestTile(board));
  const spawned = spawnTile(board, rng, s.nextId, s.perks, highestBefore, s.config.mode === 'endless');
  if (spawned) events.spawned.push(spawned.id);

  let next: GameState = {
    ...s,
    board,
    rng: rng.state,
    nextId: s.nextId + 1,
    score: s.score + gained,
    moves: s.moves + 1,
    highest: Math.max(s.highest, highestTile(board)),
    energy: Math.min(MAX_ENERGY, s.energy + energy),
    prev: snapshot(s),
    lastEvents: events,
  };

  if (next.config.mode === 'endless' && next.highest >= next.nextMilestone) {
    next = { ...next, pendingPick: milestoneOptions(next, rng), rng: rng.state, nextMilestone: next.highest * 2 };
  }
  return settle(next);
}

/** Pays for a power-up, preferring a free charge. Returns null if the player can't pay. */
function pay(s: GameState, id: PowerUpId): Pick<GameState, 'charges' | 'energy' | 'powerUpsUsed'> | null {
  const free = s.charges[id] ?? 0;
  if (free > 0) return { charges: { ...s.charges, [id]: free - 1 }, energy: s.energy, powerUpsUsed: s.powerUpsUsed + 1 };
  const cost = powerUpCost(s, id);
  if (s.energy < cost) return null;
  return { charges: s.charges, energy: s.energy - cost, powerUpsUsed: s.powerUpsUsed + 1 };
}

function canUsePowerUps(s: GameState): boolean {
  return (s.status === 'playing' || s.status === 'locked') && !s.pendingPick;
}

export function canUndo(s: GameState): boolean {
  return canUsePowerUps(s) && s.prev !== null;
}

export function canUpgradeTile(s: GameState, index: number): boolean {
  const v = numValue(s.board.cells[index]);
  return v > 0 && v * 2 <= highestTile(s.board);
}

export function canSwapTiles(s: GameState, a: number, b: number): boolean {
  const ta = s.board.cells[a];
  const tb = s.board.cells[b];
  return (
    ta?.kind === 'num' && tb?.kind === 'num' && ta.value !== tb.value && areAdjacent(s.board, a, b)
  );
}

export function reduce(s: GameState, action: Action): GameState {
  switch (action.type) {
    case 'move':
      return move(s, action.dir);

    case 'undo': {
      if (!canUndo(s)) return s;
      const paid = pay(s, 'undo');
      if (!paid) return s;
      const p = s.prev!;
      return settle({ ...s, ...paid, ...p, prev: null, lastEvents: null });
    }

    case 'bomb': {
      const t = s.board.cells[action.index];
      if (!canUsePowerUps(s) || !t) return s;
      const paid = pay(s, 'bomb');
      if (!paid) return s;
      const board = cloneBoard(s.board);
      board.cells[action.index] = null;
      return settle({
        ...s,
        ...paid,
        board,
        prev: snapshot(s),
        lastEvents: { ...noEvents(), destroyed: [t.id] },
      });
    }

    case 'swap': {
      if (!canUsePowerUps(s) || !canSwapTiles(s, action.a, action.b)) return s;
      const paid = pay(s, 'swap');
      if (!paid) return s;
      const board = cloneBoard(s.board);
      [board.cells[action.a], board.cells[action.b]] = [board.cells[action.b], board.cells[action.a]];
      return settle({ ...s, ...paid, board, prev: snapshot(s), lastEvents: noEvents() });
    }

    case 'upgrade': {
      if (!canUsePowerUps(s) || !canUpgradeTile(s, action.index)) return s;
      const paid = pay(s, 'upgrade');
      if (!paid) return s;
      const board = cloneBoard(s.board);
      const t = board.cells[action.index] as Extract<Tile, { kind: 'num' }>;
      board.cells[action.index] = { ...t, value: t.value * 2 };
      return settle({
        ...s,
        ...paid,
        board,
        prev: snapshot(s),
        lastEvents: { ...noEvents(), merged: [t.id] },
      });
    }

    case 'pick': {
      const opt = s.pendingPick?.[action.option];
      if (!opt) return s;
      let next: GameState = { ...s, pendingPick: null, prev: null, lastEvents: null };
      if (opt.kind === 'perk') {
        next.perks = [...s.perks, opt.perk];
        if (opt.perk === 'wideBoard') {
          next.board = widen(s.board);
          next.scoreMultiplier = s.scoreMultiplier * WIDE_BOARD_MULTIPLIER;
        }
      } else if (opt.kind === 'charge') {
        next.charges = { ...s.charges, [opt.powerUp]: (s.charges[opt.powerUp] ?? 0) + opt.count };
      } else {
        next.energy = Math.min(MAX_ENERGY, s.energy + opt.amount);
      }
      return s.status === 'locked' || next.board !== s.board ? settle(next) : next;
    }

    case 'adSecondWind': {
      if (s.config.mode !== 'endless' || s.status !== 'locked' || s.adSecondWindUsed) return s;
      const board = cloneBoard(s.board);
      const destroyed = clearLowest(board, SECOND_WIND_CLEARS);
      return settle({
        ...s,
        board,
        adSecondWindUsed: true,
        prev: null,
        lastEvents: { ...noEvents(), destroyed },
      });
    }
  }
}

/** Level and daily results: score plus a bonus for moves left and power-up charges not used. */
export function finalScore(s: GameState): number {
  if (s.status !== 'won') return s.score;
  const unusedCharges = Object.values(s.charges).reduce((a, b) => a + (b ?? 0), 0);
  return s.score + (movesLeft(s) ?? 0) * 5 + unusedCharges * 25;
}

/** 1 star for finishing, 2 with a quarter of the moves to spare, 3 if that was done without power-ups. */
export function starsFor(s: GameState): number {
  if (s.status !== 'won') return 0;
  const limit = s.config.moveLimit;
  const spare = limit ? (movesLeft(s) ?? 0) >= limit / 4 : true;
  if (!spare) return 1;
  return s.powerUpsUsed === 0 ? 3 : 2;
}
