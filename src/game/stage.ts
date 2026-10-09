import type { Rng } from '../core/rng';
import type { SegKind, SegmentSpec } from './chain';
import { isTwin, type LayoutKind } from './layouts';

export type Difficulty = 'normal' | 'hard';

export type ThemeId = 'slate' | 'crimson' | 'swamp' | 'violet' | 'ice' | 'amber';
const THEME_CYCLE: ThemeId[] = ['slate', 'crimson', 'swamp', 'violet', 'ice', 'amber'];

export interface StageDef {
  chapter: number;
  difficulty: Difficulty;
  name: string;
  theme: ThemeId;
  layout: LayoutKind;
  /** Number of segments in the train. */
  segments: number;
  /** Seconds for the head to cover the whole path if nothing is ever killed. */
  crossTime: number;
  /** Multiplier on every segment's HP. */
  hpScale: number;
  /** Multiplier on coins per kill and clear bonus. */
  coinMult: number;
  /** Endless mode: the train keeps coming until it breaks through. */
  endless?: boolean;
}

const VIRUS_NAMES = [
  'Social Butterfly',
  'Reply-All',
  'Doomscroll',
  'Snooze Button',
  'Group Chat',
  'Monday Morning',
  'Hangry',
  'Know-It-All',
  'Backseat Driver',
  'Humblebrag',
  'Spoiler Alert',
  'Hype Beast',
  'Couch Potato',
  'Overthinker',
  'Night Owl',
  'Drama Llama',
  'Main Character',
  'Sore Loser',
  'Gym Bro',
  'Influencer',
  'Paparazzi',
  'Karaoke',
  'Sugar Rush',
  'Tax Season',
  'Traffic Jam',
  'Quiet Quitter',
  'Hot Take',
  'Ghoster',
  'Copycat',
  'Final Boss',
];

/** Per-chapter HP growth; hard mode multiplies on top. */
export const HP_GROWTH = 1.65;
export const HARD_HP = 4;
/** Per-chapter coin growth; slightly behind HP growth so later chapters take a few more runs. */
export const COIN_GROWTH = 1.35;
/**
 * Double Dragon trains are half as long each, so their tails never get as
 * tough; this keeps the total fight comparable to a single long train.
 */
export const TWIN_HP = 2.6;

export function stageDef(chapter: number, difficulty: Difficulty): StageDef {
  const c = Math.max(1, Math.floor(chapter));
  const base = VIRUS_NAMES[(c - 1) % VIRUS_NAMES.length];
  const lap = Math.floor((c - 1) / VIRUS_NAMES.length);
  const name = `${base} Virus${lap > 0 ? ` ${roman(lap + 1)}` : ''}`;
  const hard = difficulty === 'hard';
  return {
    chapter: c,
    difficulty,
    name,
    theme: THEME_CYCLE[(c - 1) % THEME_CYCLE.length],
    layout: layoutFor(c),
    segments: Math.min(100 + (c - 1) * 3, 160),
    crossTime: 104,
    hpScale: Math.pow(HP_GROWTH, c - 1) * (hard ? HARD_HP : 1) * (isTwin(layoutFor(c)) ? TWIN_HP : 1),
    coinMult: Math.pow(COIN_GROWTH, c - 1) * (hard ? 2.5 : 1),
  };
}

/** Chapters 1–2 teach on rows; after that layouts rotate, with a Double Dragon every few chapters. */
export function layoutFor(chapter: number): LayoutKind {
  if (chapter <= 2) return 'rows';
  const cycle: LayoutKind[] = ['columns', 'spiral', 'twinColumns', 'rows', 'columns', 'twinRows', 'spiral', 'rows'];
  return cycle[(chapter - 3) % cycle.length];
}

/** HP of the i-th segment before stage scaling: soft at the head, brutal at the tail. */
export function baseSegmentHp(i: number): number {
  return 10 + 20 * Math.pow(i, 1.6);
}

/** Endless supply of segment specs in train order: HP ramps up, chests every few segments. */
export function specStream(stage: StageDef, rng: Rng): () => SegmentSpec {
  let i = 0;
  let nextChest = 3;
  let nextElite = 15 + rng.int(0, 4);
  return () => {
    let kind: SegKind = 'normal';
    if (i === nextElite) {
      kind = 'elite';
      nextElite += 20 + rng.int(0, 5);
      if (nextChest <= i) nextChest = i + 3 + rng.int(0, 2);
    } else if (i === nextChest) {
      kind = 'chest';
      nextChest += 5 + rng.int(0, 1);
    }
    const hp = Math.max(1, Math.round(baseSegmentHp(i) * stage.hpScale * rng.range(0.92, 1.08)));
    i++;
    return { hp, kind };
  };
}

export function segmentSpecs(stage: StageDef, rng: Rng): SegmentSpec[] {
  const next = specStream(stage, rng);
  const count = stage.endless ? ENDLESS_START : stage.segments;
  return Array.from({ length: count }, next);
}

/** Endless runs start with this many segments queued and keep feeding more. */
export const ENDLESS_START = 40;

/**
 * Endless mode: a train that never ends. Toughness tracks your campaign
 * progress so it opens with a fight instead of a warm-up.
 */
export function endlessDef(maxChapter: number, seed: number): StageDef {
  const layouts: LayoutKind[] = ['rows', 'columns', 'spiral', 'twinColumns', 'twinRows'];
  const layout = layouts[seed % layouts.length];
  // Starts as tough as your best unlocked chapter; mutations ramp it from there.
  const level = Math.max(0, maxChapter - 1);
  return {
    chapter: maxChapter,
    difficulty: 'normal',
    name: isTwin(layout) ? 'Endless Double Dragon' : 'Endless Mutation',
    theme: THEME_CYCLE[seed % THEME_CYCLE.length],
    layout,
    segments: Infinity,
    crossTime: 100,
    hpScale: Math.pow(HP_GROWTH, level) * (isTwin(layout) ? TWIN_HP : 1),
    coinMult: Math.pow(COIN_GROWTH, level) * 0.7,
    endless: true,
  };
}

/** Endless: every this many kills the virus mutates (tougher, faster). */
export const MUTATION_EVERY = 35;

function roman(n: number): string {
  const table: [number, string][] = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let out = '';
  for (const [v, s] of table) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out;
}
