import { goalText, type GameState, type LevelDef } from '../engine';

function emoji(state: GameState, i: number): string {
  if (!state.board.open[i]) return '⬜';
  const t = state.board.cells[i];
  if (!t) return '⬛';
  if (t.kind === 'stone') return '🪨';
  if (t.value >= 512) return '🟨';
  if (t.value >= 128) return '🟧';
  if (t.value >= 32) return '🟪';
  return '🟦';
}

/** Wordle-style result: an emoji picture of the final board plus the score. */
export function shareText(level: LevelDef & { key: string; theme: string }, s: GameState, total: number, stars: number): string {
  const rows: string[] = [];
  for (let y = 0; y < s.board.h; y++) {
    let row = '';
    for (let x = 0; x < s.board.w; x++) row += emoji(s, y * s.board.w + x);
    rows.push(row);
  }
  const outcome = s.status === 'won' ? `✅ ${goalText(level.goal)} in ${s.moves} moves` : `❌ ${goalText(level.goal)}`;
  return [
    `Fuse 2048 Daily ${level.key} · ${level.theme}`,
    `${outcome} · ${total.toLocaleString('en-US')} pts ${'⭐'.repeat(stars)}`,
    ...rows,
  ].join('\n');
}
