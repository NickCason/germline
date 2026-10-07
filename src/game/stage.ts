import type { Rng } from '../core/rng';
import type { SegKind, SegmentSpec } from './chain';
import type { LayoutKind } from './layouts';

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
export const HP_GROWTH = 1.6;
export const HARD_HP = 4;

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
    hpScale: Math.pow(HP_GROWTH, c - 1) * (hard ? HARD_HP : 1),
    coinMult: (1 + 0.3 * (c - 1)) * (hard ? 2.5 : 1),
  };
}

function layoutFor(chapter: number): LayoutKind {
  if (chapter <= 2) return 'rows';
  const cycle: LayoutKind[] = ['columns', 'spiral', 'rows'];
  return cycle[(chapter - 3) % cycle.length];
}

/** HP of the i-th segment before stage scaling: soft at the head, brutal at the tail. */
export function baseSegmentHp(i: number): number {
  return 10 + 6.7 * Math.pow(i, 1.6);
}

export function segmentSpecs(stage: StageDef, rng: Rng): SegmentSpec[] {
  const specs: SegmentSpec[] = [];
  let nextChest = 3;
  let nextElite = 15 + rng.int(0, 4);
  for (let i = 0; i < stage.segments; i++) {
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
    specs.push({ hp, kind });
  }
  return specs;
}

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
