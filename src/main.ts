import { dailyLevel, levelById, LEVELS, newGame, squareShape, startLevel } from './engine';
import { mountGame, type GameContext } from './ui/game-screen';
import { isUnlocked, mountHome, mountLevels, type HomeNav } from './ui/screens';
import { load } from './ui/storage';
import './ui/styles.css';

const root = document.getElementById('app')!;
let cleanup: () => void = () => {};

function show(mount: () => () => void): void {
  cleanup();
  cleanup = mount();
  window.scrollTo(0, 0);
}

function randomSeed(): number {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  } catch {
    return Math.floor(Math.random() * 2 ** 32);
  }
}

const nav: HomeNav = {
  home: () => show(() => mountHome(root, nav)),
  levels: () => show(() => mountLevels(root, nav)),
  playLevel(id) {
    const level = levelById(id);
    if (!level || !isUnlocked(level)) return nav.levels();
    const next = LEVELS[LEVELS.indexOf(level) + 1];
    const ctx: GameContext = { kind: 'level', level, next };
    show(() => mountGame(root, ctx, startLevel(level), nav));
  },
  endless(fresh = false) {
    const saved = load().endlessGame;
    const resume = !fresh && saved && saved.status !== 'locked' ? saved : null;
    const state = resume ?? newGame({ config: { mode: 'endless' }, shape: squareShape(4), seed: randomSeed() });
    show(() => mountGame(root, { kind: 'endless' }, state, nav));
  },
  daily(practice) {
    const level = dailyLevel(new Date());
    const scored = !practice && !load().daily[level.key];
    show(() => mountGame(root, { kind: 'daily', level, scored }, startLevel(level, 'daily'), nav));
  },
};

nav.home();
