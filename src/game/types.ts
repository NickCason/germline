import type { Segment } from './chain';

export type AimMode = 'auto' | 'manual';

/** A temporary run-wide effect (ultimates); return false when finished. */
export interface TimedEffect {
  kind: 'laser' | 'clones' | 'barrage' | 'rain' | 'pulse' | 'decree';
  t: number;
  dur: number;
  /** Free-form state for the effect (sweep position, shot timers). */
  a: number;
  b: number;
  step(world: World, e: TimedEffect, dt: number): boolean;
}
import type { World } from './world';

export type WeaponId =
  | 'capsule'
  | 'swab'
  | 'needle'
  | 'bubble'
  | 'snot'
  | 'roller'
  | 'tower'
  | 'scalpel'
  | 'meteor'
  | 'satellite'
  | 'laser'
  | 'phage'
  | 'defib'
  | 'gravity'
  | 'prism';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
export const RARITIES: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic'];

export interface HeroStats {
  atk: number;
  critRate: number;
  /** Crit multiplier, e.g. 1.5 = +50%. */
  critDmg: number;
  /** Cooldown reduction fraction, 0..0.6. */
  cdr: number;
}

/** Per-run tunables for one owned weapon; cards mutate these. */
export interface WeaponStats {
  dmgMult: number;
  qty: number;
  cdMult: number;
  size: number;
  critAdd: number;
  critDmgAdd: number;
  speed: number;
  pierce: number;
  split: number;
  burst: number;
  duration: number;
  range: number;
  bounces: number;
  flags: Set<string>;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  blurb: string;
  /** Seconds between casts before modifiers. */
  cooldown: number;
  /** Damage per hit as a multiple of hero attack. */
  power: number;
  /** Base projectiles / summons per cast. */
  qty: number;
  /** Rarity of the "Get <weapon>" card. */
  getRarity: Rarity;
  color: string;
  /** Called when the cooldown is up and there is something to shoot. Return false to retry next frame. */
  fire?(world: World, w: OwnedWeapon): boolean;
  /** Continuous behaviour every step (bursts, summons that persist). */
  update?(world: World, w: OwnedWeapon, dt: number): void;
  /** One-time setup when picked up during a run. */
  acquire?(world: World, w: OwnedWeapon): void;
}

export interface OwnedWeapon {
  def: WeaponDef;
  level: number;
  stats: WeaponStats;
  cd: number;
  /** card id → times taken this run */
  stacks: Map<string, number>;
  /** scratch timers used by individual weapons */
  timers: Record<string, number>;
  /** Damage dealt this run, for the results breakdown. */
  dealt: number;
}

export type ProjKind =
  | 'capsule'
  | 'needle'
  | 'bubble'
  | 'snot'
  | 'swab'
  | 'scalpel'
  | 'meteor'
  | 'roller'
  | 'syringe'
  | 'cannon'
  | 'phage'
  | 'spectrum';

export interface Projectile {
  kind: ProjKind;
  w: OwnedWeapon;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  dmg: number;
  life: number;
  age: number;
  pierce: number;
  /** Segment ids already hit (piercing projectiles hit each target once). */
  hit: Set<number>;
  /** Per-target re-hit timers for things that touch repeatedly. */
  touch?: Map<number, number>;
  child: boolean;
  rot: number;
  /** Behaviour; returns false when the projectile should be removed. */
  step(world: World, p: Projectile, dt: number): boolean;
  /** Free-form per-kind data (targets, phases). */
  tx?: number;
  ty?: number;
  phase?: number;
  target?: Segment;
  /** Seconds to wait at the hero before launching (cascading volleys). */
  delay?: number;
  /** Launch origin and flight progress for arcing projectiles. */
  ox?: number;
  oy?: number;
  t?: number;
  /** Recent positions (x, y pairs) for trails and dragon bodies. */
  trail?: number[];
  /** Tint override (refracted rainbow capsules). */
  color?: string;
  /** Phage generation, so chain reactions stop eventually. */
  gen?: number;
  /** Capsule already split by a prism. */
  refracted?: boolean;
}

export type ZoneKind = 'swab' | 'puddle' | 'fire' | 'tower' | 'well';

export interface Zone {
  kind: ZoneKind;
  w: OwnedWeapon;
  x: number;
  y: number;
  r: number;
  life: number;
  maxLife: number;
  tick: number;
  tickT: number;
  dmg: number;
  rot: number;
  /** Towers placed by the same cast connect with lasers. */
  group?: number;
}

export interface Cloud {
  w: OwnedWeapon;
  x: number;
  y: number;
  t: number;
  target?: Segment;
}
