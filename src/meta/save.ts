import { LOADOUT_SLOTS } from '../game/constants';
import type { CostumeId } from '../game/costumes';
import type { Difficulty } from '../game/stage';
import type { AimMode, WeaponId } from '../game/types';
import { WEAPON_UNLOCK_ORDER, WEAPONS } from '../game/weapons';

export type HeroStatKey = 'atk' | 'crit' | 'critDmg' | 'cdr';

export interface StageRecord {
  /** Best progress fraction reached. */
  best: number;
  /** Milestone chest indexes already claimed (0=25%, 1=50%, 2=100%). */
  claimed: number[];
  cleared: boolean;
}

export interface SaveData {
  v: 1;
  coins: number;
  hero: Record<HeroStatKey, number>;
  weapons: Record<WeaponId, { level: number; shards: number }>;
  unlocked: WeaponId[];
  /** Equipped weapons; the first one starts every run already active. */
  loadout: WeaponId[];
  /** Highest chapter unlocked on normal. */
  maxChapter: number;
  stages: Record<string, StageRecord>;
  selected: { chapter: number; difficulty: Difficulty };
  /** Battle tab mode. */
  mode: 'chapters' | 'endless';
  costume: CostumeId;
  endlessBest: number;
  settings: {
    sfx: boolean;
    sfxVol: number;
    music: boolean;
    musicVol: number;
    numbers: boolean;
    fast: boolean;
    aim: AimMode;
  };
  stats: { runs: number; wins: number; kills: number; ults: number; powers: number };
}

const KEY = 'germline.save.v1';

export function freshSave(): SaveData {
  const weapons = {} as SaveData['weapons'];
  for (const id of Object.keys(WEAPONS) as WeaponId[]) weapons[id] = { level: 1, shards: 0 };
  return {
    v: 1,
    coins: 0,
    hero: { atk: 0, crit: 0, critDmg: 0, cdr: 0 },
    weapons,
    unlocked: ['capsule', WEAPON_UNLOCK_ORDER[0], WEAPON_UNLOCK_ORDER[1]],
    loadout: [WEAPON_UNLOCK_ORDER[0], WEAPON_UNLOCK_ORDER[1]],
    maxChapter: 1,
    stages: {},
    selected: { chapter: 1, difficulty: 'normal' },
    mode: 'chapters',
    costume: 'classic',
    endlessBest: 0,
    settings: { sfx: true, sfxVol: 0.8, music: true, musicVol: 0.5, numbers: true, fast: false, aim: 'auto' },
    stats: { runs: 0, wins: 0, kills: 0, ults: 0, powers: 0 },
  };
}

export function stageKey(chapter: number, difficulty: Difficulty): string {
  return `${chapter}-${difficulty}`;
}

export function stageRecord(save: SaveData, chapter: number, difficulty: Difficulty): StageRecord {
  const key = stageKey(chapter, difficulty);
  return (save.stages[key] ??= { best: 0, claimed: [], cleared: false });
}

/** Parse a stored save, filling anything missing from a fresh save. */
export function parseSave(raw: string | null): SaveData {
  const base = freshSave();
  if (!raw) return base;
  try {
    const data = JSON.parse(raw) as Partial<SaveData>;
    if (data.v !== 1) return base;
    const save: SaveData = {
      ...base,
      ...data,
      hero: { ...base.hero, ...data.hero },
      weapons: { ...base.weapons, ...data.weapons },
      settings: { ...base.settings, ...data.settings },
      stats: { ...base.stats, ...data.stats },
      selected: { ...base.selected, ...data.selected },
      stages: { ...data.stages },
    };
    const known = new Set(Object.keys(WEAPONS));
    save.unlocked = (save.unlocked ?? base.unlocked).filter((id) => known.has(id));
    if (!save.unlocked.includes('capsule')) save.unlocked.unshift('capsule');
    save.loadout = (save.loadout ?? base.loadout)
      .filter((id) => id !== 'capsule' && save.unlocked.includes(id))
      .slice(0, LOADOUT_SLOTS);
    return save;
  } catch {
    return base;
  }
}

export function loadSave(): SaveData {
  try {
    return parseSave(localStorage.getItem(KEY));
  } catch {
    return freshSave();
  }
}

export function writeSave(save: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Storage full or blocked (private mode): the game still works for this session.
  }
}

/** Portable text for backing up a save; base64 so it survives copy/paste. */
export function exportSave(save: SaveData): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(save))));
}

export function importSave(text: string): SaveData | null {
  try {
    const json = decodeURIComponent(escape(atob(text.trim())));
    const parsed = parseSave(json);
    return JSON.parse(json).v === 1 ? parsed : null;
  } catch {
    return null;
  }
}
