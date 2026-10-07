import { HARD_HP, HP_GROWTH, stageDef, type Difficulty } from '../game/stage';
import type { HeroStats, WeaponId } from '../game/types';
import { WEAPON_UNLOCK_ORDER } from '../game/weapons';
import type { World } from '../game/world';
import { freshSave, stageRecord, type HeroStatKey, type SaveData } from './save';

export interface HeroStatDef {
  key: HeroStatKey;
  name: string;
  maxLevel: number;
  value(level: number): number;
  cost(level: number): number;
  show(value: number): string;
}

export const HERO_STAT_DEFS: readonly HeroStatDef[] = [
  {
    key: 'atk',
    name: 'Attack',
    maxLevel: 200,
    value: (l) => 10 * Math.pow(1.07, l),
    cost: (l) => Math.round(30 * Math.pow(1.08, l)),
    show: (v) => (v < 100 ? v.toFixed(1) : Math.round(v).toLocaleString()),
  },
  {
    key: 'crit',
    name: 'Crit rate',
    maxLevel: 60,
    value: (l) => 0.05 + 0.005 * l,
    cost: (l) => Math.round(40 * Math.pow(1.1, l)),
    show: (v) => `${(v * 100).toFixed(1)}%`,
  },
  {
    key: 'critDmg',
    name: 'Crit damage',
    maxLevel: 50,
    value: (l) => 1.5 + 0.04 * l,
    cost: (l) => Math.round(40 * Math.pow(1.09, l)),
    show: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: 'cdr',
    name: 'Cooldown',
    maxLevel: 50,
    value: (l) => 0.006 * l,
    cost: (l) => Math.round(50 * Math.pow(1.12, l)),
    show: (v) => `-${(v * 100).toFixed(1)}%`,
  },
];

export const MAX_WEAPON_LEVEL = 10;

export function heroStats(save: SaveData): HeroStats {
  const get = (key: HeroStatKey) => HERO_STAT_DEFS.find((d) => d.key === key)!.value(save.hero[key]);
  return { atk: get('atk'), critRate: get('crit'), critDmg: get('critDmg'), cdr: get('cdr') };
}

export function weaponUpgradeCost(level: number): { shards: number; coins: number } {
  return { shards: 2 + 2 * level, coins: Math.round(40 * Math.pow(1.3, level - 1)) };
}

/** What a weapon level unlocks in the chest card pool. */
export function weaponLevelPerks(level: number): string {
  if (level === 3) return 'Unlocks its epic card';
  if (level === 6) return 'Unlocks its legendary card';
  return '+15% damage';
}

export function combatPower(save: SaveData): number {
  const h = heroStats(save);
  const equipped: WeaponId[] = ['capsule', ...save.loadout];
  const avgLevel = equipped.reduce((a, id) => a + save.weapons[id].level, 0) / equipped.length;
  const critFactor = 1 + h.critRate * (h.critDmg - 1);
  const cdFactor = 1 / (1 - h.cdr);
  const weaponFactor = (1 + 0.15 * (avgLevel - 1)) * (1 + 0.08 * save.loadout.length);
  return Math.round(10 * h.atk * critFactor * cdFactor * weaponFactor);
}

const FRESH_POWER = combatPower(freshSave());

export function recommendedPower(chapter: number, difficulty: Difficulty): number {
  const hard = difficulty === 'hard' ? Math.pow(HARD_HP, 0.9) : 1;
  return Math.round(FRESH_POWER * Math.pow(HP_GROWTH, chapter - 1) * hard);
}

export interface RunRewards {
  coins: number;
  shards: Partial<Record<WeaponId, number>>;
  unlocked: WeaponId[];
  newChapter: boolean;
  firstClear: boolean;
  progress: number;
  won: boolean;
}

/** Bank the results of a finished run into the save. */
export function settleRun(save: SaveData, world: World, rng: () => number = Math.random): RunRewards {
  const stage = world.stage;
  const won = world.state === 'won';
  const progress = world.progress;
  let coins = world.coins;
  if (won) coins += Math.round(100 * stage.coinMult);

  const pool: WeaponId[] = ['capsule', ...save.loadout];
  const shardCount = won ? 4 + stage.chapter + (stage.difficulty === 'hard' ? 4 : 0) : Math.floor(progress * (2 + stage.chapter / 2));
  const shards: Partial<Record<WeaponId, number>> = {};
  for (let i = 0; i < shardCount; i++) {
    const id = pool[Math.floor(rng() * pool.length)];
    shards[id] = (shards[id] ?? 0) + 1;
  }

  const rec = stageRecord(save, stage.chapter, stage.difficulty);
  const firstClear = won && !rec.cleared;
  rec.best = Math.max(rec.best, progress);
  if (won) rec.cleared = true;

  const unlocked: WeaponId[] = [];
  let newChapter = false;
  if (firstClear && stage.difficulty === 'normal') {
    const next = WEAPON_UNLOCK_ORDER[stage.chapter + 1];
    if (next && !save.unlocked.includes(next)) {
      save.unlocked.push(next);
      unlocked.push(next);
      // Fill an empty loadout slot so the new toy shows up straight away.
      if (save.loadout.length < 5) save.loadout.push(next);
    }
    if (stage.chapter >= save.maxChapter) {
      save.maxChapter = stage.chapter + 1;
      newChapter = true;
    }
  }

  save.coins += coins;
  for (const [id, n] of Object.entries(shards) as [WeaponId, number][]) save.weapons[id].shards += n;
  save.stats.runs++;
  if (won) save.stats.wins++;
  save.stats.kills += world.chain.killed;
  return { coins, shards, unlocked, newChapter, firstClear, progress, won };
}

export const MILESTONES = [0.25, 0.5, 1] as const;

export function milestoneReward(chapter: number, difficulty: Difficulty, index: number): { coins: number; shards: number } {
  const mult = stageDef(chapter, difficulty).coinMult;
  return {
    coins: Math.round([60, 120, 250][index] * mult),
    shards: [0, 3, 6][index] + (difficulty === 'hard' ? 2 : 0),
  };
}

export function claimMilestone(save: SaveData, chapter: number, difficulty: Difficulty, index: number, rng: () => number = Math.random): { coins: number; shards: Partial<Record<WeaponId, number>> } | null {
  const rec = stageRecord(save, chapter, difficulty);
  if (rec.claimed.includes(index) || rec.best < MILESTONES[index]) return null;
  const reward = milestoneReward(chapter, difficulty, index);
  rec.claimed.push(index);
  save.coins += reward.coins;
  const pool: WeaponId[] = ['capsule', ...save.loadout];
  const shards: Partial<Record<WeaponId, number>> = {};
  for (let i = 0; i < reward.shards; i++) {
    const id = pool[Math.floor(rng() * pool.length)];
    shards[id] = (shards[id] ?? 0) + 1;
    save.weapons[id].shards++;
  }
  return { coins: reward.coins, shards };
}
