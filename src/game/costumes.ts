import type { Segment } from './chain';
import { FIELD_H, FIELD_W } from './constants';
import type { Projectile, TimedEffect } from './types';
import { capsuleVolleyFrom } from './weapons';
import type { World } from './world';

/**
 * Costumes: each one changes the hero's look, adds a small perk, and brings
 * its own ultimate — charged by kills and fired from the HUD button.
 */
export type CostumeId = 'classic' | 'nurse' | 'pirate' | 'wizard' | 'astronaut' | 'ninja' | 'royal';

export type CostumeUnlock = { kind: 'free' } | { kind: 'chapter'; chapter: number } | { kind: 'hard' };

export interface CostumeDef {
  id: CostumeId;
  name: string;
  perk: string;
  ultName: string;
  ultDesc: string;
  unlock: CostumeUnlock;
  /** Heart body gradient: shadow tone, highlight tone. */
  heart: [string, string];
  applyPerk(world: World): void;
  ult(world: World): void;
}

export const ULT_CHARGE = 100;

/** Charge gained per kill, by segment kind. */
export const ULT_GAIN = { normal: 4, chest: 10, elite: 18 } as const;

export const COSTUMES: Record<CostumeId, CostumeDef> = {
  classic: {
    id: 'classic',
    name: 'Cel',
    perk: 'Antibody Pulse charges 25% faster',
    ultName: 'Antibody Pulse',
    ultDesc: 'A shockwave that shoves the whole train back and dents every segment',
    unlock: { kind: 'free' },
    heart: ['#ef3a5d', '#ff9db0'],
    applyPerk: (world) => {
      world.ultNeed = ULT_CHARGE * 0.75;
    },
    ult: (world) => {
      world.knockback(420);
      world.fx.ring(world.hero.x, world.hero.y, 520, 'rgba(255,157,176,0.9)', 0.6);
      world.fx.kick(5);
      for (const seg of [...world.visible()]) world.hitRaw(seg, seg.maxHp * 0.08, 'ult');
    },
  },
  nurse: {
    id: 'nurse',
    name: 'Head Nurse',
    perk: '+1 revive every run',
    ultName: 'Vaccine Rain',
    ultDesc: 'Two dozen syringes rain down on the train',
    unlock: { kind: 'free' },
    heart: ['#f2557f', '#ffc2d6'],
    applyPerk: (world) => {
      world.revives += 1;
    },
    ult: (world) => {
      world.addEffect({ kind: 'rain', t: 0, dur: 1.6, a: 0, b: 0, step: rainStep });
    },
  },
  pirate: {
    id: 'pirate',
    name: 'Captain Plaque',
    perk: '+30% coins',
    ultName: 'Cannon Barrage',
    ultDesc: 'Six cannonballs blast the front of the train',
    unlock: { kind: 'free' },
    heart: ['#d62f4b', '#ff8a9a'],
    applyPerk: (world) => {
      world.coinBonus += 0.3;
    },
    ult: (world) => {
      world.addEffect({ kind: 'barrage', t: 0, dur: 1.3, a: 0, b: 0, step: barrageStep });
    },
  },
  wizard: {
    id: 'wizard',
    name: 'Professor Petri',
    perk: '+2 rerolls, and rerolls land rarer cards',
    ultName: 'Time Stop',
    ultDesc: 'Freezes the train solid for 6 seconds',
    unlock: { kind: 'chapter', chapter: 3 },
    heart: ['#d2457f', '#ffb0d2'],
    applyPerk: (world) => {
      world.rerolls += 2;
      world.rerollLuck += 1;
    },
    ult: (world) => {
      world.frozen = Math.max(world.frozen, 6);
      world.fx.ring(world.hero.x, world.hero.y, 600, 'rgba(191,234,255,0.9)', 0.7);
      for (const seg of [...world.visible()]) world.hitRaw(seg, seg.maxHp * 0.05, 'ult');
    },
  },
  astronaut: {
    id: 'astronaut',
    name: 'Major Cell',
    perk: 'Capsule quantity +1',
    ultName: 'Orbital Laser',
    ultDesc: 'A beam from orbit sweeps across the whole field',
    unlock: { kind: 'chapter', chapter: 5 },
    heart: ['#e83e5c', '#ffa3b5'],
    applyPerk: (world) => {
      const cap = world.owned('capsule');
      if (cap) cap.stats.qty += 1;
    },
    ult: (world) => {
      world.addEffect({ kind: 'laser', t: 0, dur: 2.2, a: 0, b: 0, step: laserStep });
    },
  },
  ninja: {
    id: 'ninja',
    name: 'Shinobi',
    perk: 'Crit rate +8%',
    ultName: 'Shadow Clones',
    ultDesc: 'Two clones join you and fire capsules for 7 seconds',
    unlock: { kind: 'hard' },
    heart: ['#a8213f', '#e2627d'],
    applyPerk: (world) => {
      world.globalCrit += 0.08;
    },
    ult: (world) => {
      world.addEffect({ kind: 'clones', t: 0, dur: 7, a: 0, b: 0, step: clonesStep });
    },
  },
  royal: {
    id: 'royal',
    name: 'His Majesty',
    perk: '+1 take-all and +10% damage',
    ultName: 'Royal Decree',
    ultDesc: 'Every chest on screen pops at once, and the whole train is taxed',
    unlock: { kind: 'chapter', chapter: 10 },
    heart: ['#e0244f', '#ff8fa6'],
    applyPerk: (world) => {
      world.takeAlls += 1;
      world.globalDmg *= 1.1;
    },
    ult: (world) => {
      world.fx.ring(world.hero.x, world.hero.y, 600, 'rgba(255,201,60,0.9)', 0.7);
      for (const seg of [...world.visible()]) {
        if (seg.kind !== 'normal') world.hitRaw(seg, seg.hp + 1, 'ult');
        else world.hitRaw(seg, seg.maxHp * 0.06, 'ult');
      }
    },
  },
};

export const COSTUME_ORDER: CostumeId[] = ['classic', 'nurse', 'pirate', 'wizard', 'astronaut', 'ninja', 'royal'];

export function unlockText(def: CostumeDef): string {
  switch (def.unlock.kind) {
    case 'free':
      return 'Available';
    case 'chapter':
      return `Clear chapter ${def.unlock.chapter}`;
    case 'hard':
      return 'Clear any chapter on hard';
  }
}

// ------------------------------------------------------------ ult effects

function frontish(world: World): Segment[] {
  return world.visible().filter((s) => s.alive);
}

/** Falling syringes, one every few frames, each a sure hit. */
const rainStep: TimedEffect['step'] = (world, e, dt) => {
  e.t += dt;
  e.a -= dt;
  while (e.a <= 0 && e.b < 24) {
    e.a += e.dur / 24;
    e.b++;
    const pool = frontish(world);
    if (!pool.length) break;
    const t = pool[Math.floor(Math.pow(world.rng.next(), 1.6) * pool.length)];
    world.spawn(fallingShot(world, 'syringe', t, 0.12, 0));
  }
  return e.t < e.dur + 0.5;
};

/** Cannonballs fired from the hero at the front of the train. */
const barrageStep: TimedEffect['step'] = (world, e, dt) => {
  e.t += dt;
  e.a -= dt;
  while (e.a <= 0 && e.b < 6) {
    e.a += 0.2;
    e.b++;
    const pool = frontish(world);
    const t = pool[Math.min(pool.length - 1, Math.floor(world.rng.next() * Math.min(5, pool.length)))];
    if (!t) break;
    world.spawn(fallingShot(world, 'cannon', t, 0.22, 70));
    world.hero.recoil = 1;
  }
  return e.t < e.dur + 0.5;
};

/** A beam that sweeps left to right; segments under it take repeated damage. */
const laserStep: TimedEffect['step'] = (world, e, dt) => {
  e.t += dt;
  e.a = -40 + (FIELD_W + 80) * Math.min(1, e.t / e.dur);
  e.b -= dt;
  if (e.b <= 0) {
    e.b += 0.1;
    world.forEachOnLine(e.a, -50, e.a, FIELD_H + 50, 36, (seg) => world.hitRaw(seg, seg.maxHp * 0.035, 'ult'));
  }
  return e.t < e.dur;
};

/** Two shadow clones beside the hero, firing capsule volleys of their own. */
const clonesStep: TimedEffect['step'] = (world, e, dt) => {
  e.t += dt;
  e.a -= dt;
  const cap = world.owned('capsule');
  if (cap && e.a <= 0) {
    e.a += 0.18;
    for (const side of [-1, 1]) {
      const x = Math.min(FIELD_W - 20, Math.max(20, world.hero.x + side * 78));
      capsuleVolleyFrom(world, cap, x, world.hero.y + 6);
    }
  }
  return e.t < e.dur;
};

/** Projectile that homes onto a target point and hits for a % of max HP (plus splash). */
function fallingShot(world: World, kind: 'syringe' | 'cannon', target: Segment, pct: number, splash: number): Projectile {
  const fromHero = kind === 'cannon';
  const x = fromHero ? world.hero.x : target.x + world.rng.range(-60, 60);
  const y = fromHero ? world.hero.y - 20 : -60;
  return {
    kind,
    w: world.weapons[0],
    x,
    y,
    vx: 0,
    vy: 0,
    r: kind === 'cannon' ? 14 : 8,
    dmg: pct,
    life: 3,
    age: 0,
    pierce: 0,
    hit: new Set(),
    child: false,
    rot: 0,
    tx: target.x,
    ty: target.y,
    target,
    phase: splash,
    step: (w, p, dt) => {
      const tx = p.target?.alive ? p.target.x : (p.tx ?? p.x);
      const ty = p.target?.alive ? p.target.y : (p.ty ?? p.y);
      p.tx = tx;
      p.ty = ty;
      const d = Math.hypot(tx - p.x, ty - p.y);
      const sp = kind === 'cannon' ? 900 : 1100;
      p.rot = Math.atan2(ty - p.y, tx - p.x);
      p.life -= dt;
      if (d <= sp * dt || p.life <= 0) {
        const pct = p.dmg;
        if (p.phase) {
          w.fx.ring(tx, ty, p.phase, 'rgba(255,170,80,0.9)', 0.35);
          w.fx.kick(2);
          w.forEachInCircle(tx, ty, p.phase, (seg) => w.hitRaw(seg, seg.maxHp * pct, 'ult'));
        } else if (p.target?.alive) {
          w.hitRaw(p.target, p.target.maxHp * pct, 'ult');
          w.fx.burst(tx, ty, '#bff3ff', 6);
        }
        return false;
      }
      p.vx = ((tx - p.x) / d) * sp;
      p.vy = ((ty - p.y) / d) * sp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      return true;
    },
  };
}
