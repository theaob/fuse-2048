import { dailyKey, dailyLevel, goalText, LEVELS, msUntilNextDaily, parseShape, WORLDS, type LevelDef } from '../engine';
import { fmt, h, icon, stars } from './dom';
import { currentStreak, load, save } from './storage';

export interface HomeNav {
  daily(practice: boolean): void;
  levels(): void;
  endless(fresh?: boolean): void;
  playLevel(id: string): void;
  home(): void;
}

function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export function isUnlocked(level: LevelDef): boolean {
  const i = LEVELS.indexOf(level);
  return i <= 0 || (load().levelStars[LEVELS[i - 1].id] ?? 0) > 0;
}

export function nextLevelToPlay(): LevelDef {
  return LEVELS.find((l) => !(load().levelStars[l.id] > 0)) ?? LEVELS[LEVELS.length - 1];
}

function logo(): HTMLElement {
  return h(
    'div',
    { class: 'logo' },
    h('div', { class: 'logo-mark', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i')),
    h('div', { class: 'logo-text' }, 'Fuse ', h('span', { class: 'accent' }, '2048')),
  );
}

/** Mounts the home screen and returns a cleanup function. */
export function mountHome(root: HTMLElement, nav: HomeNav): () => void {
  const data = load();
  const now = new Date();
  const today = dailyLevel(now);
  const done = data.daily[dailyKey(now)];
  const streak = currentStreak(dailyKey(now));
  const timer = h('span', { class: 'pill dark' });
  const tick = () => (timer.textContent = `${countdown(msUntilNextDaily(new Date()))} left`);
  tick();
  const interval = setInterval(tick, 1000);

  const totalStars = Object.values(data.levelStars).reduce((a, b) => a + b, 0);
  const next = nextLevelToPlay();
  const endlessInProgress = data.endlessGame && data.endlessGame.status !== 'locked';

  const dailyCard = h(
    'button',
    { type: 'button', class: 'daily-card', onclick: () => nav.daily(!!done) },
    h('div', { class: 'row' }, h('span', { class: 'eyebrow' }, `Daily challenge · ${now.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}`), timer),
    h('div', { class: 'daily-title' }, today.theme),
    h('div', { class: 'daily-goal' }, `${goalText(today.goal)} in ${today.moveLimit} moves. ${today.intro}`),
    h(
      'div',
      { class: 'row' },
      done
        ? h('span', { class: 'daily-done' }, stars(done.stars), ` ${fmt(done.score)} pts`)
        : h('span', { class: 'daily-sub' }, 'First attempt counts'),
      h('span', { class: 'daily-play' }, done ? 'Practice' : 'Play'),
    ),
  );

  const hapticsToggle = h('button', { type: 'button', class: 'link-btn', onclick: () => { save((d) => (d.haptics = !d.haptics)); render(); } });
  function render() {
    hapticsToggle.textContent = `Haptics ${load().haptics ? 'on' : 'off'}`;
  }
  render();

  root.replaceChildren(
    h(
      'div',
      { class: 'screen home' },
      h(
        'header',
        { class: 'home-top' },
        logo(),
        h('div', { class: 'pill', 'aria-label': `Daily streak ${streak} days` }, icon('flame', 18, 'accent'), String(streak)),
      ),
      dailyCard,
      h(
        'div',
        { class: 'mode-grid' },
        h(
          'button',
          { type: 'button', class: 'mode-card', onclick: () => nav.levels() },
          icon('map', 28, 'accent'),
          h('div', { class: 'mode-title' }, 'Levels'),
          h('div', { class: 'muted' }, `World ${next.world} · ${WORLDS.find((w) => w.id === next.world)?.name}`, h('br'), `${totalStars} of ${LEVELS.length * 3} stars`),
          h('div', { class: 'progress' }, h('div', { style: `width:${Math.round((totalStars / (LEVELS.length * 3)) * 100)}%` })),
        ),
        h(
          'button',
          { type: 'button', class: 'mode-card', onclick: () => nav.endless() },
          icon('infinity', 28, 'blue'),
          h('div', { class: 'mode-title' }, 'Endless'),
          h('div', { class: 'muted' }, `Best ${fmt(data.endlessBest)}`, h('br'), endlessInProgress ? 'Game in progress' : 'Power-ups and perks'),
          h('div', { class: 'mode-cta' }, endlessInProgress ? 'Resume' : 'Play'),
        ),
      ),
      h(
        'div',
        { class: 'card how' },
        h('b', {}, 'How to play'),
        h('p', { class: 'muted' }, 'Swipe or use the arrow keys. Equal tiles fuse. Fusing fills energy, and energy pays for power-ups: Undo, Bomb, Swap and Upgrade.'),
      ),
      h('footer', { class: 'home-foot' }, h('span', { class: 'muted' }, 'Prototype · progress saved on this device'), hapticsToggle),
    ),
  );
  return () => clearInterval(interval);
}

function shapePreview(shape: string[]): HTMLElement {
  const { w, open } = parseShape(shape);
  const el = h('div', { class: 'shape', 'aria-hidden': 'true', style: `grid-template-columns:repeat(${w},6px)` });
  for (const o of open) el.append(h('i', { class: o ? 'on' : '' }));
  return el;
}

export function mountLevels(root: HTMLElement, nav: HomeNav): () => void {
  const data = load();
  root.replaceChildren(
    h(
      'div',
      { class: 'screen levels' },
      h(
        'header',
        { class: 'topbar' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Back', onclick: () => nav.home() }, icon('back', 22)),
        h('div', { class: 'title-block' }, h('div', { class: 'title' }, 'Levels'), h('div', { class: 'subtitle' }, '1 to 3 minutes each')),
      ),
      WORLDS.map((world) =>
        h(
          'section',
          { class: 'world' },
          h('h2', {}, `World ${world.id} · ${world.name}`),
          h('p', { class: 'muted' }, world.blurb),
          h(
            'div',
            { class: 'level-grid' },
            LEVELS.filter((l) => l.world === world.id).map((l) => {
              const unlocked = isUnlocked(l);
              const st = data.levelStars[l.id] ?? 0;
              return h(
                'button',
                {
                  type: 'button',
                  class: `level-btn${unlocked ? '' : ' locked'}${st ? ' done' : ''}`,
                  disabled: !unlocked,
                  'aria-label': `Level ${l.id}, ${l.name}${unlocked ? `, ${st} stars` : ', locked'}`,
                  onclick: () => nav.playLevel(l.id),
                },
                h('div', { class: 'level-head' }, h('span', { class: 'level-id' }, l.id), unlocked ? shapePreview(l.shape) : icon('lock', 16)),
                h('div', { class: 'level-name' }, l.name),
                stars(st),
              );
            }),
          ),
        ),
      ),
    ),
  );
  return () => {};
}
