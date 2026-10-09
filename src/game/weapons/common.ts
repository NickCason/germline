import { FIELD_H, FIELD_W } from '../constants';
import type { OwnedWeapon, Projectile, ProjKind, WeaponStats } from '../types';
import type { World } from '../world';

export function freshStats(): WeaponStats {
  return {
    dmgMult: 1,
    qty: 0,
    cdMult: 1,
    size: 1,
    critAdd: 0,
    critDmgAdd: 0,
    speed: 1,
    pierce: 0,
    split: 0,
    burst: 0,
    duration: 1,
    range: 1,
    bounces: 0,
    flags: new Set(),
  };
}

export type Step = Projectile['step'];

export function proj(
  kind: ProjKind,
  w: OwnedWeapon,
  x: number,
  y: number,
  vx: number,
  vy: number,
  r: number,
  dmg: number,
  life: number,
  step: Step,
  extra: Partial<Projectile> = {},
): Projectile {
  return { kind, w, x, y, vx, vy, r, dmg, life, age: 0, pierce: 0, hit: new Set(), child: false, rot: Math.atan2(vy, vx), step, ...extra };
}

export function offField(p: Projectile, margin = 60): boolean {
  return p.x < -margin || p.x > FIELD_W + margin || p.y < -margin || p.y > FIELD_H + margin;
}

export function floorY(world: World): number {
  return world.layout.fenceY !== null ? world.layout.fenceY - 14 : FIELD_H - 20;
}

