import type { Board, GameState, Tile } from '../engine';
import { h } from './dom';

const GAP_RATIO = 0.12;
const SLIDE_MS = 110;

const TILE_COLORS: Record<number, [string, string]> = {
  2: ['#E6EBF7', '#11152A'],
  4: ['#C9D6F5', '#11152A'],
  8: ['#7FA6FF', '#11152A'],
  16: ['#4F7FF0', '#FFFFFF'],
  32: ['#3D5BD9', '#FFFFFF'],
  64: ['#7048E8', '#FFFFFF'],
  128: ['#FF9F45', '#11152A'],
  256: ['#FF7A45', '#11152A'],
  512: ['#FFC23D', '#11152A'],
  1024: ['#34D8B0', '#11152A'],
  2048: ['#FF5FA2', '#11152A'],
};

export function tileColors(value: number): [string, string] {
  return TILE_COLORS[value] ?? ['#E0337E', '#FFFFFF'];
}

export interface Highlight {
  /** Cells that can be tapped right now (power-up targeting). */
  targets?: Set<number>;
  selected?: number | null;
}

/**
 * Draws a board with absolutely positioned tiles moved by CSS transforms, so slides,
 * merges and spawns animate without re-creating elements.
 */
export class BoardView {
  readonly el: HTMLDivElement;
  private tiles = new Map<number, HTMLDivElement>();
  private cellEls: HTMLDivElement[] = [];
  private dims = '';
  private cell = 64;
  private gap = 8;
  private maxSize = { w: 360, h: 360 };

  constructor() {
    this.el = h('div', { class: 'board', role: 'grid', 'aria-label': 'Game board' });
  }

  /** Sets the space the board may use; the board keeps square cells inside it. */
  fit(maxW: number, maxH: number, board: Board): void {
    this.maxSize = { w: maxW, h: maxH };
    this.dims = '';
    this.layout(board);
  }

  private layout(board: Board): void {
    const key = `${board.w}x${board.h}:${board.open.join('')}:${this.maxSize.w}x${this.maxSize.h}`;
    if (key === this.dims) return;
    this.dims = key;
    const unitW = board.w + (board.w + 1) * GAP_RATIO;
    const unitH = board.h + (board.h + 1) * GAP_RATIO;
    this.cell = Math.floor(Math.min(this.maxSize.w / unitW, this.maxSize.h / unitH, 96));
    this.gap = Math.max(4, Math.round(this.cell * GAP_RATIO));
    const w = board.w * this.cell + (board.w + 1) * this.gap;
    const hgt = board.h * this.cell + (board.h + 1) * this.gap;
    this.el.style.width = `${w}px`;
    this.el.style.height = `${hgt}px`;
    this.el.style.setProperty('--cell-size', `${this.cell}px`);
    this.el.style.setProperty('--radius', `${Math.round(this.cell * 0.16)}px`);

    for (const c of this.cellEls) c.remove();
    this.cellEls = board.open.map((open, i) => {
      const c = h('div', { class: open ? 'cell' : 'cell wall', 'data-index': i });
      c.style.transform = this.translate(i, board);
      this.el.prepend(c);
      return c;
    });
    // Tiles from a different-sized board are re-placed on the next render.
    for (const t of this.tiles.values()) t.remove();
    this.tiles.clear();
  }

  private translate(i: number, board: Board): string {
    const x = this.gap + (i % board.w) * (this.cell + this.gap);
    const y = this.gap + Math.floor(i / board.w) * (this.cell + this.gap);
    return `translate(${x}px, ${y}px)`;
  }

  /** Returns the cell under a client point, or -1. */
  cellAt(clientX: number, clientY: number, board: Board): number {
    const r = this.el.getBoundingClientRect();
    const x = Math.floor((clientX - r.left - this.gap / 2) / (this.cell + this.gap));
    const y = Math.floor((clientY - r.top - this.gap / 2) / (this.cell + this.gap));
    if (x < 0 || y < 0 || x >= board.w || y >= board.h) return -1;
    return y * board.w + x;
  }

  render(state: GameState, hl: Highlight = {}): void {
    const { board } = state;
    this.layout(board);
    const ev = state.lastEvents;
    const live = new Set<number>();

    board.cells.forEach((tile, i) => {
      if (!tile) return;
      live.add(tile.id);
      let el = this.tiles.get(tile.id);
      const isNew = !el;
      if (!el) {
        el = h('div', { class: 'tile' }, h('div', { class: 'face' }));
        this.tiles.set(tile.id, el);
        this.el.append(el);
      }
      const face = el.firstElementChild as HTMLDivElement;
      this.paint(face, tile);
      el.style.transform = this.translate(i, board);
      face.classList.toggle('target', !!hl.targets?.has(i));
      face.classList.toggle('selected', hl.selected === i);
      if (isNew && ev?.spawned.includes(tile.id)) restartAnim(face, 'appear');
      else if (ev?.merged.includes(tile.id)) restartAnim(face, 'pop');
    });

    for (const c of this.cellEls) {
      const i = Number(c.dataset.index);
      c.classList.toggle('target', !!hl.targets?.has(i) && !board.cells[i]);
    }

    // Tiles that merged slide into their partner, then disappear.
    for (const r of ev?.removed ?? []) {
      const el = this.tiles.get(r.id);
      if (!el || live.has(r.id)) continue;
      this.tiles.delete(r.id);
      el.style.zIndex = '1';
      el.style.transform = this.translate(r.to, board);
      setTimeout(() => el.remove(), SLIDE_MS);
    }
    for (const [id, el] of this.tiles) {
      if (live.has(id)) continue;
      this.tiles.delete(id);
      const vanished = ev?.crumbled.includes(id) || ev?.destroyed.includes(id);
      if (vanished) {
        el.firstElementChild?.classList.add('vanish');
        setTimeout(() => el.remove(), 220);
      } else el.remove();
    }
  }

  private paint(el: HTMLDivElement, tile: Tile): void {
    el.classList.toggle('stone', tile.kind === 'stone');
    el.classList.toggle('num', tile.kind === 'num');
    if (tile.kind === 'stone') {
      el.style.background = '';
      el.style.color = '';
      el.setAttribute('aria-label', `Stone, ${tile.hp} merges to crumble`);
      el.replaceChildren(h('span', { class: 'hp' }, String(tile.hp)));
      return;
    }
    const [bg, fg] = tileColors(tile.value);
    el.style.background = bg;
    el.style.color = fg;
    const digits = String(tile.value).length;
    el.style.fontSize = `${Math.round(this.cell * (digits <= 2 ? 0.46 : digits === 3 ? 0.38 : digits === 4 ? 0.3 : 0.24))}px`;
    el.setAttribute('aria-label', `Tile ${tile.value}`);
    if (el.textContent !== String(tile.value)) el.textContent = String(tile.value);
  }
}

function restartAnim(el: HTMLElement, cls: string): void {
  el.classList.remove('appear', 'pop');
  void el.offsetWidth;
  el.classList.add(cls);
}
