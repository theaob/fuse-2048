type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | undefined | null>;

/** Tiny element builder: h('button', { class: 'x', onclick: fn }, 'Label'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Inline stroke icons (from the mockup). Decorative, so hidden from screen readers. */
const ICON_PATHS: Record<string, string> = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  bomb: '<circle cx="11" cy="14" r="7"/><path d="M15 8l2-2"/><path d="M18 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/>',
  swap: '<path d="M7 4L3 8l4 4"/><path d="M3 8h14"/><path d="M17 20l4-4-4-4"/><path d="M21 16H7"/>',
  upgrade: '<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/><path d="M6 21h12"/>',
  flame: '<path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z"/>',
  map: '<path d="M4 20V5l5 2 6-3 5 2v14l-5-2-6 3-5-2z"/><path d="M9 7v13M15 4v13"/>',
  infinity: '<path d="M18 8a4 4 0 1 1 0 8c-3 0-5-4-6-4s-3 4-6 4a4 4 0 1 1 0-8c3 0 5 4 6 4s3-4 6-4z"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  share: '<path d="M12 3v12"/><path d="M7 8l5-5 5 5"/><path d="M5 14v6h14v-6"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
};

export function icon(name: keyof typeof ICON_PATHS | string, size = 24, cls = ''): SVGSVGElement {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="${cls}">${ICON_PATHS[name] ?? ''}</svg>`;
  return wrap.firstElementChild as SVGSVGElement;
}

export function stars(n: number, of = 3): HTMLElement {
  const el = h('span', { class: 'stars', 'aria-label': `${n} of ${of} stars`, role: 'img' });
  for (let i = 0; i < of; i++) el.append(icon('star', 16, i < n ? 'star on' : 'star'));
  return el;
}

export function fmt(n: number): string {
  return n.toLocaleString('en-US');
}
