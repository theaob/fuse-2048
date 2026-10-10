import { describe, expect, it } from 'vitest';
import { botPlay } from './bot';
import { canMove, emptyBoard, numValue, slide, squareShape } from './board';
import { dailyKey, dailyLevel, msUntilNextDaily } from './daily';
import { finalScore, newGame, reduce, starsFor } from './game';
import { LEVELS, startLevel } from './levels';
import type { Board, GameState } from './types';

/** Builds a board from rows like "2 2 . 4". `#` is a wall, `S3` a stone with 3 hp. */
function boardFrom(rows: string[]): Board {
  const tokens = rows.map((r) => r.trim().split(/\s+/));
  const b = emptyBoard(tokens.map((r) => r.map((t) => (t === '#' ? '.' : '#')).join('')));
  let id = 1;
  tokens.flat().forEach((t, i) => {
    if (t === '.' || t === '#') return;
    b.cells[i] = t.startsWith('S') ? { id: id++, kind: 'stone', hp: Number(t.slice(1)) } : { id: id++, kind: 'num', value: Number(t) };
  });
  return b;
}

function values(b: Board): string[] {
  const out: string[] = [];
  for (let y = 0; y < b.h; y++) {
    const row: string[] = [];
    for (let x = 0; x < b.w; x++) {
      const i = y * b.w + x;
      const t = b.cells[i];
      row.push(!b.open[i] ? '#' : !t ? '.' : t.kind === 'stone' ? `S${t.hp}` : String(t.value));
    }
    out.push(row.join(' '));
  }
  return out;
}

function gameWith(rows: string[], extra: Partial<GameState> = {}): GameState {
  const g = newGame({ config: { mode: 'level' }, shape: squareShape(1), seed: 1, tiles: [[0, 0, 2]] });
  const board = boardFrom(rows);
  return { ...g, board, nextId: 100, highest: Math.max(...board.cells.map(numValue)), ...extra };
}

describe('slide', () => {
  it('merges each tile at most once per move', () => {
    expect(values(slide(boardFrom(['2 2 2 2']), 'left').board)).toEqual(['4 4 . .']);
    expect(values(slide(boardFrom(['4 4 8 .']), 'left').board)).toEqual(['8 8 . .']);
    expect(values(slide(boardFrom(['2 2 2 .']), 'right').board)).toEqual(['. . 2 4']);
  });

  it('reports no movement when nothing can slide', () => {
    expect(slide(boardFrom(['2 4 8 16']), 'left').moved).toBe(false);
  });

  it('treats walls as edges, so tiles never cross them', () => {
    expect(values(slide(boardFrom(['. 2 # 2 .']), 'left').board)).toEqual(['2 . # 2 .']);
    expect(values(slide(boardFrom(['2', '#', '2']), 'up').board)).toEqual(['2', '#', '2']);
  });

  it('treats stones as fixed blockers', () => {
    expect(values(slide(boardFrom(['. S3 2 2']), 'left').board)).toEqual(['. S3 4 .']);
  });
});

describe('canMove', () => {
  it('sees merges only between neighbours that are both open', () => {
    expect(canMove(boardFrom(['2 4', '8 16']))).toBe(false);
    expect(canMove(boardFrom(['2 2', '8 16']))).toBe(true);
  });
});

describe('reduce', () => {
  it('is deterministic for the same seed and moves', () => {
    const play = () => {
      let s = newGame({ config: { mode: 'endless' }, shape: squareShape(4), seed: 42 });
      for (const dir of ['left', 'up', 'right', 'down', 'left', 'up'] as const) s = reduce(s, { type: 'move', dir });
      return values(s.board);
    };
    expect(play()).toEqual(play());
  });

  it('scores merges with a 25% bonus per extra merge in the same swipe', () => {
    const s = reduce(gameWith(['2 2 4 4', '. . . .', '. . . .', '. . . .']), { type: 'move', dir: 'left' });
    expect(s.score).toBe(Math.round((4 + 8) * 1.25));
    expect(s.energy).toBe(Math.round((0 + 1) * 1.5));
  });

  it('crumbles stones after enough merges next to them', () => {
    let s = gameWith(['2 2 S2', '. . .', '. . .'], { config: { mode: 'level', goal: { type: 'stones' } } });
    s = reduce(s, { type: 'move', dir: 'right' });
    // 2+2 lands next to the stone at (0,1).
    expect(values(s.board)[0]).toMatch(/^\S+ 4 S1$/);
    s = { ...s, board: boardFrom(['. 4 S1', '. 4 .', '. . .']) };
    s = reduce(s, { type: 'move', dir: 'up' });
    expect(s.lastEvents?.crumbled.length).toBe(1);
    expect(s.status).toBe('won');
  });

  it('undo restores the board but keeps the energy spent', () => {
    const start = gameWith(['2 2 . .', '. . . .', '. . . .', '. . . .'], { energy: 5 });
    const moved = reduce(start, { type: 'move', dir: 'left' });
    const undone = reduce(moved, { type: 'undo' });
    expect(values(undone.board)).toEqual(values(start.board));
    expect(undone.energy).toBe(moved.energy - 2);
    expect(reduce(undone, { type: 'undo' })).toBe(undone);
  });

  it('spends free charges before energy', () => {
    const s = gameWith(['2 4', '8 16'], { charges: { bomb: 1 }, energy: 0 });
    const bombed = reduce(s, { type: 'bomb', index: 0 });
    expect(bombed.board.cells[0]).toBeNull();
    expect(bombed.charges.bomb).toBe(0);
    expect(reduce(bombed, { type: 'bomb', index: 1 })).toBe(bombed);
  });

  it('only upgrades tiles that stay at or below the highest tile', () => {
    const s = gameWith(['2 64', '32 .'], { energy: 10 });
    expect(reduce(s, { type: 'upgrade', index: 1 })).toBe(s);
    expect(numValue(reduce(s, { type: 'upgrade', index: 2 }).board.cells[2])).toBe(64);
  });

  it('swaps adjacent tiles only', () => {
    const s = gameWith(['2 4', '8 16'], { energy: 10 });
    expect(values(reduce(s, { type: 'swap', a: 0, b: 1 }).board)).toEqual(['4 2', '8 16']);
    expect(reduce(s, { type: 'swap', a: 0, b: 3 })).toBe(s);
  });

  it('locks when no move is left, and the ad Second Wind clears the 4 lowest tiles in Endless', () => {
    // Whatever spawns in the freed corner, nothing can merge afterwards.
    const s = gameWith(['2 4 8 16', '16 8 4 2', '2 4 8 16', '32 64 128 128'], { config: { mode: 'endless' } });
    const locked = reduce(s, { type: 'move', dir: 'left' });
    expect(locked.status).toBe('locked');
    const revived = reduce(locked, { type: 'adSecondWind' });
    expect(revived.status).toBe('playing');
    expect(revived.board.cells.filter((t) => !t).length).toBe(4);
    expect(reduce({ ...revived, status: 'locked' }, { type: 'adSecondWind' }).status).toBe('locked');
  });

  it('offers a milestone pick in Endless when a 256 is made', () => {
    const s = gameWith(['128 128 . .', '. . . .', '. . . .', '. . . .'], { config: { mode: 'endless' }, nextMilestone: 256 });
    const next = reduce(s, { type: 'move', dir: 'left' });
    expect(next.pendingPick?.length).toBe(3);
    expect(reduce(next, { type: 'move', dir: 'right' })).toBe(next);
    const picked = reduce(next, { type: 'pick', option: 0 });
    expect(picked.pendingPick).toBeNull();
    expect(picked.nextMilestone).toBe(512);
  });

  it('ends a level when the move limit is used up', () => {
    const s = gameWith(['2 . . .', '. . . .', '. . . .', '. . . .'], {
      config: { mode: 'level', goal: { type: 'tile', value: 2048 }, moveLimit: 1 },
    });
    expect(reduce(s, { type: 'move', dir: 'right' }).status).toBe('outOfMoves');
  });
});

describe('levels', () => {
  it.each(LEVELS.map((l) => [l.id, l] as const))('level %s is beatable on its fixed seed', (_, level) => {
    const end = botPlay(startLevel(level));
    expect(end.status).toBe('won');
    expect(starsFor(end)).toBeGreaterThanOrEqual(1);
    expect(finalScore(end)).toBeGreaterThanOrEqual(end.score);
  });
});

describe('daily', () => {
  it('gives every player the same challenge for a UTC date', () => {
    const a = dailyLevel(new Date('2026-10-10T01:00:00Z'));
    const b = dailyLevel(new Date('2026-10-10T23:59:00Z'));
    expect(a).toEqual(b);
    expect(dailyLevel(new Date('2026-10-11T00:00:00Z')).id).not.toBe(a.id);
    expect(a.theme).toBe('Cross day');
  });

  it('counts down to 00:00 UTC', () => {
    const now = new Date('2026-10-10T23:00:00Z');
    expect(dailyKey(now)).toBe('2026-10-10');
    expect(msUntilNextDaily(now)).toBe(3600_000);
  });
});
