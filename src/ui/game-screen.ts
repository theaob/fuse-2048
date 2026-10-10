import {
  canAfford,
  canSwapTiles,
  canUndo,
  canUpgradeTile,
  finalScore,
  goalText,
  MAX_ENERGY,
  movesLeft,
  neighbors,
  powerUpCost,
  reduce,
  starsFor,
  stonesLeft,
  type Action,
  type Dir,
  type GameState,
  type LevelDef,
  type PickOption,
  type PowerUpId,
} from '../engine';
import { BoardView } from './board-view';
import { fmt, h, icon, stars } from './dom';
import { shareText } from './share';
import { load, recordDaily, save } from './storage';

export type GameContext =
  | { kind: 'endless' }
  | { kind: 'level'; level: LevelDef; next?: LevelDef }
  | { kind: 'daily'; level: LevelDef & { theme: string; key: string }; scored: boolean };

export interface Nav {
  home(): void;
  levels(): void;
  playLevel(id: string): void;
  endless(fresh?: boolean): void;
}

const POWER_UPS: { id: PowerUpId; name: string }[] = [
  { id: 'undo', name: 'Undo' },
  { id: 'bomb', name: 'Bomb' },
  { id: 'swap', name: 'Swap' },
  { id: 'upgrade', name: 'Upgrade' },
];

const KEY_DIRS: Record<string, Dir> = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  a: 'left', d: 'right', w: 'up', s: 'down',
};

const SWIPE_MIN = 24;
const TAP_MAX = 10;

type Targeting = { power: 'bomb' | 'upgrade' | 'swap'; first: number | null } | null;

export function pickLabel(o: PickOption): { title: string; text: string } {
  if (o.kind === 'energy') return { title: 'Full energy', text: 'Fill the energy meter now.' };
  if (o.kind === 'charge') {
    const name = POWER_UPS.find((p) => p.id === o.powerUp)!.name;
    return { title: `+${o.count} ${name}`, text: 'Free uses that need no energy.' };
  }
  return {
    calmSpawn: { title: 'Calm Spawn', text: 'Far fewer 4s spawn.' },
    comboCharger: { title: 'Combo Charger', text: 'Combos give double energy.' },
    thrifty: { title: 'Thrifty', text: 'Power-ups cost 1 less energy.' },
    secondWind: { title: 'Second Wind', text: 'Once, when the board locks, clear the 4 lowest tiles.' },
    wideBoard: { title: 'Wide Board', text: 'The board grows to 5x5. Points x0.8 from now on.' },
  }[o.perk];
}

/** Mounts a game in `root` and returns a cleanup function. */
export function mountGame(root: HTMLElement, ctx: GameContext, initial: GameState, nav: Nav): () => void {
  let s = initial;
  let targeting: Targeting = null;
  let overlay: HTMLElement | null = null;
  let introShown = false;
  let finished = false;

  const board = new BoardView();
  const title = ctx.kind === 'endless' ? 'Endless' : ctx.kind === 'level' ? `${ctx.level.id} · ${ctx.level.name}` : ctx.level.theme;
  const subtitle = ctx.kind === 'daily' ? (ctx.scored ? 'Daily challenge' : 'Daily practice (not scored)') : ctx.kind === 'level' ? 'Level' : 'Classic 4x4';

  const scoreVal = h('div', { class: 'stat-val' });
  const stat2Label = h('div', { class: 'stat-label' }, ctx.kind === 'endless' ? 'Best' : 'Moves');
  const stat2Val = h('div', { class: 'stat-val' });
  const infoLeft = h('span');
  const infoRight = h('span');
  const energyLabel = h('span', { class: 'accent' });
  const segments = Array.from({ length: MAX_ENERGY }, () => h('div', { class: 'seg' }));
  const hint = h('div', { class: 'hint', 'aria-live': 'polite' });
  const boardWrap = h('div', { class: 'board-wrap' }, board.el);
  const powerButtons = POWER_UPS.map((p) => {
    const sub = h('span', { class: 'pu-cost' });
    const btn = h('button', { type: 'button', class: 'pu', onclick: () => onPowerUp(p.id) }, icon(p.id, 26), h('span', { class: 'pu-name' }, p.name), sub);
    return { id: p.id, btn, sub };
  });

  const screen = h(
    'div',
    { class: 'screen game' },
    h(
      'header',
      { class: 'topbar' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Back', onclick: () => onBack() }, icon('back', 22)),
      h('div', { class: 'title-block' }, h('div', { class: 'title' }, title), h('div', { class: 'subtitle' }, subtitle)),
      h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, 'Score'), scoreVal),
      h('div', { class: 'stat' }, stat2Label, stat2Val),
    ),
    h('div', { class: 'info' }, infoLeft, infoRight),
    boardWrap,
    h('div', { class: 'energy' }, h('div', { class: 'energy-head' }, h('span', {}, 'Energy'), energyLabel), h('div', { class: 'segs', 'aria-hidden': 'true' }, segments)),
    hint,
    h('div', { class: 'powerups' }, powerButtons.map((p) => p.btn)),
  );
  root.replaceChildren(screen);

  // ---- state changes ----

  function dispatch(action: Action): boolean {
    const next = reduce(s, action);
    if (next === s) return false;
    s = next;
    afterChange();
    return true;
  }

  function afterChange(): void {
    const ev = s.lastEvents;
    if (load().haptics && ev && ev.mergeCount > 0 && 'vibrate' in navigator) {
      navigator.vibrate(ev.merged.length > 1 || s.highest >= 128 ? 18 : 8);
    }
    if (ctx.kind === 'endless') {
      save((d) => {
        d.endlessBest = Math.max(d.endlessBest, s.score);
        d.endlessGame = s;
      });
    }
    render();
    checkEnd();
  }

  function checkEnd(): void {
    if (overlay) return;
    if (s.pendingPick) return showPick();
    if (s.status === 'won' || s.status === 'outOfMoves') return showResult();
    if (s.status === 'locked') return showLocked();
  }

  // ---- rendering ----

  function targets(): Set<number> | undefined {
    if (!targeting) return undefined;
    const out = new Set<number>();
    s.board.cells.forEach((t, i) => {
      if (!t) return;
      if (targeting!.power === 'bomb') out.add(i);
      else if (targeting!.power === 'upgrade' && canUpgradeTile(s, i)) out.add(i);
      else if (targeting!.power === 'swap') {
        if (targeting!.first === null) {
          if (neighbors(s.board, i).some((n) => canSwapTiles(s, i, n))) out.add(i);
        } else if (canSwapTiles(s, targeting!.first, i)) out.add(i);
      }
    });
    return out;
  }

  function render(): void {
    scoreVal.textContent = fmt(s.score);
    const left = movesLeft(s);
    stat2Val.textContent = ctx.kind === 'endless' ? fmt(Math.max(load().endlessBest, s.score)) : String(left ?? '');

    if (ctx.kind === 'endless') {
      infoLeft.replaceChildren('Next pick at ', h('b', { class: 'accent' }, fmt(s.nextMilestone)));
    } else {
      const g = ctx.level.goal;
      infoLeft.replaceChildren(goalText(g), g.type === 'stones' ? ` · ${stonesLeft(s.board)} left` : '');
    }
    const combo = s.lastEvents?.mergeCount ?? 0;
    infoRight.textContent = combo > 1 ? `Combo x${combo}` : ctx.kind === 'endless' ? '' : `${left} moves left`;

    energyLabel.textContent = `${s.energy} / ${MAX_ENERGY}`;
    segments.forEach((seg, i) => seg.classList.toggle('on', i < s.energy));

    for (const p of powerButtons) {
      const free = s.charges[p.id] ?? 0;
      p.sub.textContent = free > 0 ? `${free} free` : `${powerUpCost(s, p.id)} energy`;
      const usable = p.id === 'undo' ? canUndo(s) && canAfford(s, 'undo') : canAfford(s, p.id) && (s.status === 'playing' || s.status === 'locked');
      p.btn.classList.toggle('off', !usable);
      p.btn.classList.toggle('active', targeting?.power === p.id);
      p.btn.setAttribute('aria-pressed', String(targeting?.power === p.id));
    }

    hint.textContent = !targeting
      ? ''
      : targeting.power === 'bomb'
        ? 'Tap a tile to destroy it'
        : targeting.power === 'upgrade'
          ? 'Tap a tile to double it (up to your highest tile)'
          : targeting.first === null
            ? 'Tap a tile, then a neighbour to swap them'
            : 'Now tap a neighbour to swap with';

    board.render(s, { targets: targets(), selected: targeting?.power === 'swap' ? targeting.first : null });
  }

  function fitBoard(): void {
    const r = boardWrap.getBoundingClientRect();
    board.fit(Math.max(160, r.width), Math.max(160, r.height), s.board);
    board.render(s, { targets: targets() });
  }

  // ---- power-ups ----

  function onPowerUp(id: PowerUpId): void {
    if (overlay && !overlay.classList.contains('dismissable')) return;
    if (id === 'undo') {
      targeting = null;
      closeOverlay();
      dispatch({ type: 'undo' });
      return;
    }
    if (targeting?.power === id) targeting = null;
    else if (canAfford(s, id) && (s.status === 'playing' || s.status === 'locked')) {
      targeting = { power: id, first: null };
      closeOverlay();
    }
    render();
  }

  function onTap(cell: number): void {
    if (!targeting || cell < 0) return;
    const t = targeting;
    const ok = targets()?.has(cell);
    if (!ok) return;
    if (t.power === 'bomb') {
      targeting = null;
      dispatch({ type: 'bomb', index: cell });
    } else if (t.power === 'upgrade') {
      targeting = null;
      dispatch({ type: 'upgrade', index: cell });
    } else if (t.first === null) {
      targeting = { power: 'swap', first: cell };
    } else {
      targeting = null;
      dispatch({ type: 'swap', a: t.first, b: cell });
    }
    render();
  }

  // ---- input ----

  function tryMove(dir: Dir): void {
    targeting = null;
    if (dispatch({ type: 'move', dir })) return;
    render();
    // A swipe on a locked board brings the locked panel back.
    checkEnd();
  }

  let start: { x: number; y: number; id: number } | null = null;
  screen.addEventListener('pointerdown', (e) => {
    if (overlay || (e.target as HTMLElement).closest('button')) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  screen.addEventListener('pointerup', (e) => {
    if (!start || start.id !== e.pointerId) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    const dist = Math.max(Math.abs(dx), Math.abs(dy));
    if (dist <= TAP_MAX) return onTap(board.cellAt(e.clientX, e.clientY, s.board));
    if (dist < SWIPE_MIN) return;
    targeting = null;
    const dir: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    tryMove(dir);
  });
  screen.addEventListener('pointercancel', () => (start = null));

  function onKey(e: KeyboardEvent): void {
    if (overlay) return;
    const dir = KEY_DIRS[e.key] ?? KEY_DIRS[e.key.toLowerCase()];
    if (dir) {
      e.preventDefault();
      tryMove(dir);
    } else if (e.key === 'Escape' && targeting) {
      targeting = null;
      render();
      checkEnd();
    } else if (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'u') {
      onPowerUp('undo');
    }
  }
  window.addEventListener('keydown', onKey);
  const onResize = () => fitBoard();
  window.addEventListener('resize', onResize);

  // ---- overlays ----

  function showOverlay(content: HTMLElement, opts: { dismissable?: boolean } = {}): void {
    closeOverlay();
    overlay = h('div', { class: `overlay${opts.dismissable ? ' dismissable' : ''}`, role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'sheet' }, content));
    screen.append(overlay);
    (overlay.querySelector('button') as HTMLButtonElement | null)?.focus();
  }

  function closeOverlay(): void {
    overlay?.remove();
    overlay = null;
  }

  function btn(label: string, onclick: () => void, cls = 'btn'): HTMLButtonElement {
    return h('button', { type: 'button', class: cls, onclick }, label);
  }

  function showIntro(): void {
    if (ctx.kind === 'endless' || introShown || s.moves > 0) return;
    introShown = true;
    const lv = ctx.level;
    showOverlay(
      h(
        'div',
        { class: 'stack' },
        h('div', { class: 'eyebrow' }, ctx.kind === 'daily' ? (ctx.scored ? 'Today’s challenge' : 'Practice run') : `World ${lv.world}`),
        h('h2', {}, lv.name),
        h('p', {}, lv.intro),
        h('div', { class: 'goal-box' }, h('b', {}, goalText(lv.goal)), h('span', {}, `in ${lv.moveLimit} moves`)),
        ctx.kind === 'daily' && ctx.scored ? h('p', { class: 'muted' }, 'Your first attempt today is the one that counts for your streak.') : null,
        btn('Start', () => closeOverlay(), 'btn primary'),
      ),
    );
  }

  function showPick(): void {
    const opts = s.pendingPick ?? [];
    showOverlay(
      h(
        'div',
        { class: 'stack' },
        h('div', { class: 'eyebrow' }, `New highest tile: ${fmt(s.highest)}`),
        h('h2', {}, 'Pick one'),
        h(
          'div',
          { class: 'picks' },
          opts.map((o, i) => {
            const l = pickLabel(o);
            return h(
              'button',
              { type: 'button', class: 'pick', onclick: () => { closeOverlay(); dispatch({ type: 'pick', option: i }); } },
              h('b', {}, l.title),
              h('span', {}, l.text),
            );
          }),
        ),
      ),
    );
  }

  function anyRescue(): boolean {
    return canAfford(s, 'bomb') || (canUndo(s) && canAfford(s, 'undo'));
  }

  function showLocked(): void {
    const items: (HTMLElement | null)[] = [h('h2', {}, 'Board locked'), h('p', { class: 'muted' }, `Score ${fmt(s.score)}`)];
    if (anyRescue()) items.push(btn('Use a power-up', () => closeOverlay(), 'btn'));
    if (ctx.kind === 'endless') {
      if (!s.adSecondWindUsed) {
        items.push(btn('Second Wind: watch an ad', () => showAd(() => { closeOverlay(); dispatch({ type: 'adSecondWind' }); }), 'btn primary'));
      }
      items.push(btn('New game', () => { save((d) => (d.endlessGame = null)); nav.endless(true); }, 'btn ghost'));
    } else {
      items.push(btn(ctx.kind === 'daily' ? 'Finish' : 'Give up', () => showResult(), 'btn ghost'));
    }
    showOverlay(h('div', { class: 'stack' }, items), { dismissable: true });
  }

  function showAd(onReward: () => void): void {
    let left = 3;
    const count = h('div', { class: 'ad-count' }, String(left));
    const claim = btn('Claim reward', onReward, 'btn primary');
    claim.disabled = true;
    showOverlay(
      h(
        'div',
        { class: 'stack' },
        h('div', { class: 'eyebrow' }, 'Rewarded ad'),
        h('div', { class: 'ad-box' }, h('span', {}, 'Ad placeholder'), count),
        h('p', { class: 'muted' }, 'A real rewarded video plugs in here. Players always choose to watch.'),
        claim,
      ),
    );
    const timer = setInterval(() => {
      left--;
      count.textContent = left > 0 ? String(left) : '✓';
      if (left <= 0) {
        clearInterval(timer);
        claim.disabled = false;
        claim.focus();
      }
    }, 1000);
  }

  function showResult(): void {
    if (ctx.kind === 'endless') return;
    const won = s.status === 'won';
    const st = starsFor(s);
    const total = finalScore(s);
    const items: (HTMLElement | null)[] = [
      h('div', { class: 'eyebrow' }, won ? 'Goal reached' : s.status === 'outOfMoves' ? 'Out of moves' : 'Board locked'),
      h('h2', {}, won ? (st === 3 ? 'Perfect!' : 'Level complete') : 'So close'),
      h('div', { class: 'big-stars' }, stars(st)),
      h('div', { class: 'result-score' }, fmt(total), h('span', {}, ' points')),
      won && total > s.score ? h('p', { class: 'muted' }, `Includes ${fmt(total - s.score)} bonus for moves and power-ups left`) : null,
    ];

    if (ctx.kind === 'level') {
      if (!finished) {
        finished = true;
        if (st > 0) save((d) => (d.levelStars[ctx.level.id] = Math.max(d.levelStars[ctx.level.id] ?? 0, st)));
      }
      if (won && ctx.next) items.push(btn('Next level', () => nav.playLevel(ctx.next!.id), 'btn primary'));
      items.push(btn('Retry', () => nav.playLevel(ctx.level.id), won ? 'btn' : 'btn primary'));
      items.push(btn('Level map', () => nav.levels(), 'btn ghost'));
    } else {
      const text = shareText(ctx.level, s, total, st);
      if (ctx.scored && !finished) {
        finished = true;
        recordDaily(ctx.level.key, { score: total, stars: st, won, moves: s.moves, share: text });
      }
      if (!ctx.scored) items.push(h('p', { class: 'muted' }, 'Practice run, not scored.'));
      const shareBtn = btn('Share result', async () => {
        try {
          if (navigator.share) await navigator.share({ text });
          else {
            await navigator.clipboard.writeText(text);
            shareBtn.textContent = 'Copied!';
          }
        } catch {
          // Cancelled or blocked: nothing to do.
        }
      }, 'btn primary');
      items.push(h('pre', { class: 'share-preview' }, text));
      if (ctx.scored) items.push(shareBtn);
      items.push(btn('Home', () => nav.home(), 'btn ghost'));
    }
    showOverlay(h('div', { class: 'stack' }, items));
  }

  function onBack(): void {
    if (ctx.kind === 'daily' && ctx.scored && !finished && s.moves > 0) {
      showOverlay(
        h(
          'div',
          { class: 'stack' },
          h('h2', {}, 'Leave today’s challenge?'),
          h('p', { class: 'muted' }, 'Only your first attempt counts, so leaving submits your current score.'),
          btn('Keep playing', () => closeOverlay(), 'btn primary'),
          btn('Submit and leave', () => { showResult(); nav.home(); }, 'btn ghost'),
        ),
        { dismissable: true },
      );
      return;
    }
    if (ctx.kind === 'level') nav.levels();
    else nav.home();
  }

  requestAnimationFrame(() => {
    fitBoard();
    render();
    if (s.status !== 'playing' || s.pendingPick) checkEnd();
    else showIntro();
  });

  return () => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
  };
}
