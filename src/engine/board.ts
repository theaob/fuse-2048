import type { Board, Dir, Tile } from './types';

/**
 * Parses a board shape. Each string is one row: `#` is a playable cell and `.` is a wall.
 * Example (Donut): ["#####", "#####", "##.##", "#####", "#####"].
 */
export function parseShape(rows: readonly string[]): { w: number; h: number; open: boolean[] } {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  if (!h || !w || rows.some((r) => r.length !== w)) throw new Error('Shape rows must be non-empty and equal length');
  const open: boolean[] = [];
  for (const row of rows) for (const ch of row) open.push(ch === '#');
  return { w, h, open };
}

export function squareShape(w: number, h = w): string[] {
  return Array.from({ length: h }, () => '#'.repeat(w));
}

export function emptyBoard(rows: readonly string[]): Board {
  const { w, h, open } = parseShape(rows);
  return { w, h, open, cells: open.map(() => null) };
}

export function cloneBoard(b: Board): Board {
  return { w: b.w, h: b.h, open: b.open, cells: b.cells.slice() };
}

/** Cell indices of each row or column, ordered from the side tiles slide toward. */
export function lines(b: Board, dir: Dir): number[][] {
  const out: number[][] = [];
  const horizontal = dir === 'left' || dir === 'right';
  const count = horizontal ? b.h : b.w;
  const len = horizontal ? b.w : b.h;
  for (let k = 0; k < count; k++) {
    const line: number[] = [];
    for (let j = 0; j < len; j++) line.push(horizontal ? k * b.w + j : j * b.w + k);
    if (dir === 'right' || dir === 'down') line.reverse();
    out.push(line);
  }
  return out;
}

/** Splits a line into runs that tiles can slide within. Walls and stones end a run. */
export function segments(b: Board, line: number[]): number[][] {
  const out: number[][] = [];
  let cur: number[] = [];
  for (const i of line) {
    const blocked = !b.open[i] || b.cells[i]?.kind === 'stone';
    if (blocked) {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push(i);
  }
  if (cur.length) out.push(cur);
  return out;
}

export function neighbors(b: Board, i: number): number[] {
  const x = i % b.w;
  const y = Math.floor(i / b.w);
  const out: number[] = [];
  if (x > 0) out.push(i - 1);
  if (x < b.w - 1) out.push(i + 1);
  if (y > 0) out.push(i - b.w);
  if (y < b.h - 1) out.push(i + b.w);
  return out;
}

export function areAdjacent(b: Board, i: number, j: number): boolean {
  return neighbors(b, i).includes(j);
}

export function emptyCells(b: Board): number[] {
  const out: number[] = [];
  for (let i = 0; i < b.cells.length; i++) if (b.open[i] && !b.cells[i]) out.push(i);
  return out;
}

export function numValue(t: Tile | null): number {
  return t && t.kind === 'num' ? t.value : 0;
}

export function highestTile(b: Board): number {
  let m = 0;
  for (const t of b.cells) m = Math.max(m, numValue(t));
  return m;
}

export function canMove(b: Board): boolean {
  if (emptyCells(b).length) return true;
  for (let i = 0; i < b.cells.length; i++) {
    const v = numValue(b.cells[i]);
    if (!v) continue;
    const x = i % b.w;
    if (x < b.w - 1 && numValue(b.cells[i + 1]) === v) return true;
    if (i + b.w < b.cells.length && numValue(b.cells[i + b.w]) === v) return true;
  }
  return false;
}

export interface SlideResult {
  board: Board;
  moved: boolean;
  /** Destination cell of each merge, with the value it produced. */
  merges: { index: number; value: number; id: number }[];
  removed: { id: number; to: number }[];
}

/** Slides and merges tiles. Each tile merges at most once per move, like classic 2048. */
export function slide(b: Board, dir: Dir): SlideResult {
  const board = cloneBoard(b);
  const merges: SlideResult['merges'] = [];
  const removed: SlideResult['removed'] = [];
  let moved = false;

  for (const line of lines(b, dir)) {
    for (const seg of segments(b, line)) {
      const tiles = seg.map((i) => b.cells[i]).filter((t): t is Tile => t !== null);
      const out: { tile: Tile; merged: boolean }[] = [];
      const pendingRemoved: { id: number; slot: number }[] = [];
      for (const t of tiles) {
        const last = out[out.length - 1];
        if (last && !last.merged && last.tile.kind === 'num' && t.kind === 'num' && last.tile.value === t.value) {
          last.tile = { ...last.tile, value: last.tile.value * 2 };
          last.merged = true;
          pendingRemoved.push({ id: t.id, slot: out.length - 1 });
        } else out.push({ tile: t, merged: false });
      }
      seg.forEach((cell, k) => {
        const next = out[k]?.tile ?? null;
        const before = b.cells[cell];
        if ((before?.id ?? -1) !== (next?.id ?? -1) || out[k]?.merged) moved = true;
        board.cells[cell] = next;
      });
      out.forEach((o, k) => {
        if (o.merged && o.tile.kind === 'num') merges.push({ index: seg[k], value: o.tile.value, id: o.tile.id });
      });
      for (const r of pendingRemoved) removed.push({ id: r.id, to: seg[r.slot] });
    }
  }
  return { board, moved, merges, removed };
}
