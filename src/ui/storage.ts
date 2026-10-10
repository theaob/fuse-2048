import type { GameState } from '../engine';

// No accounts: everything lives in this browser's localStorage.
// Every read and write is guarded, so private windows and blocked storage still play.

export interface DailyRecord {
  score: number;
  stars: number;
  won: boolean;
  moves: number;
  share: string;
}

export interface SaveData {
  version: 1;
  levelStars: Record<string, number>;
  endlessBest: number;
  endlessGame: GameState | null;
  daily: Record<string, DailyRecord>;
  streak: { count: number; lastKey: string | null };
  haptics: boolean;
}

const KEY = 'fuse2048:save';

function blank(): SaveData {
  return {
    version: 1,
    levelStars: {},
    endlessBest: 0,
    endlessGame: null,
    daily: {},
    streak: { count: 0, lastKey: null },
    haptics: true,
  };
}

let cache: SaveData | null = null;

export function load(): SaveData {
  if (cache) return cache;
  let data = blank();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = { ...data, ...JSON.parse(raw) };
  } catch {
    // Unreadable storage: start fresh.
  }
  cache = data;
  return data;
}

export function save(update: (d: SaveData) => void): void {
  const d = load();
  update(d);
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    // Storage full or blocked: keep playing from memory.
  }
}

function previousKey(key: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** The streak still shown today: alive if the last daily played was today or yesterday. */
export function currentStreak(todayKey: string): number {
  const { count, lastKey } = load().streak;
  return lastKey === todayKey || lastKey === previousKey(todayKey) ? count : 0;
}

export function recordDaily(key: string, record: DailyRecord): void {
  save((d) => {
    if (d.daily[key]) return; // Only the first attempt of the day counts.
    d.daily[key] = record;
    const { count, lastKey } = d.streak;
    d.streak = { count: lastKey === previousKey(key) ? count + 1 : lastKey === key ? count : 1, lastKey: key };
  });
}
