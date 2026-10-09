import type { WeaponDef, WeaponId } from '../types';
import { bubble, capsule, meteor, needle, roller, satellite, scalpel, snot, swab, tower } from './classic';
import { defib, gravity, laser, phage, prism } from './novel';

export { freshStats } from './common';
export { capsuleVolleyFrom, RAINBOW } from './classic';
export { laserBeams, type Beam } from './novel';

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  capsule,
  swab,
  needle,
  bubble,
  snot,
  roller,
  tower,
  scalpel,
  meteor,
  satellite,
  laser,
  phage,
  defib,
  gravity,
  prism,
};

/** Unlock order: the first two come free, every cleared chapter unlocks the next two. */
export const WEAPON_UNLOCK_ORDER: WeaponId[] = [
  'swab',
  'needle',
  'bubble',
  'laser',
  'snot',
  'phage',
  'meteor',
  'defib',
  'roller',
  'prism',
  'scalpel',
  'gravity',
  'tower',
  'satellite',
];

/** Weapons available at a campaign progress (maxChapter = highest chapter unlocked). */
export function unlockedWeapons(maxChapter: number): WeaponId[] {
  const n = Math.min(WEAPON_UNLOCK_ORDER.length, 2 + 2 * Math.max(0, maxChapter - 1));
  return ['capsule', ...WEAPON_UNLOCK_ORDER.slice(0, n)];
}

/** The chapter whose first clear unlocks this weapon (0 = available from the start). */
export function unlockChapter(id: WeaponId): number {
  const i = WEAPON_UNLOCK_ORDER.indexOf(id);
  return i < 2 ? 0 : Math.floor(i / 2);
}
