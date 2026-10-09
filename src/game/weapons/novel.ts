import type { Segment } from '../chain';
import type { OwnedWeapon, WeaponDef } from '../types';
import type { World } from '../world';
import { RAINBOW } from './classic';
import { offField, proj, type Step } from './common';

// -------------------------------------------------------------------- laser

const LASER_RANGE = 1100;

export interface Beam {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
}

/** The laser's live beams (also used by the renderer). */
export function laserBeams(world: World, w: OwnedWeapon): Beam[] {
  const n = world.qty(w);
  const width = 8 * w.stats.size;
  const x1 = world.hero.x;
  const y1 = world.hero.y - 22;
  const beams: Beam[] = [];
  for (let i = 0; i < n; i++) {
    const a = (w.timers.angle ?? -Math.PI / 2) + (i - (n - 1) / 2) * 0.22;
    beams.push({ x1, y1, x2: x1 + Math.cos(a) * LASER_RANGE, y2: y1 + Math.sin(a) * LASER_RANGE, width });
  }
  return beams;
}

export const laser: WeaponDef = {
  id: 'laser',
  name: 'Laser Lance',
  blurb: 'A searing beam that tracks your target and burns through everything in its line.',
  cooldown: 4.2,
  power: 0.55,
  qty: 1,
  getRarity: 'rare',
  color: '#ff5bd1',
  fire(world, w) {
    const t = world.primaryTarget();
    if (!t) return false;
    w.timers.beam = 2.4 * w.stats.duration;
    w.timers.tick = 0;
    w.timers.angle ??= world.aimFromHero(t.x, t.y);
    return true;
  },
  update(world, w, dt) {
    if ((w.timers.beam ?? 0) <= 0) return;
    w.timers.beam -= dt;
    const t = world.primaryTarget();
    if (t) {
      // Sweep smoothly onto the target rather than snapping.
      let d = world.aimFromHero(t.x, t.y) - w.timers.angle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      w.timers.angle += Math.max(-4 * dt, Math.min(4 * dt, d));
    }
    w.timers.tick -= dt;
    if (w.timers.tick > 0) return;
    w.timers.tick += w.stats.flags.has('overcharge') ? 0.066 : 0.1;
    const dmg = world.weaponDamage(w);
    for (const b of laserBeams(world, w)) world.forEachOnLine(b.x1, b.y1, b.x2, b.y2, b.width, (seg) => world.hit(seg, dmg, w));
  },
};

// -------------------------------------------------------------------- phage

/**
 * Bacteriophages: land on a segment, inject for a beat, then burst it from
 * inside. A burst that kills releases fresh phages (a chain reaction).
 */
const phageStep: Step = (world, p, dt) => {
  p.life -= dt;
  if (p.life <= 0) return false;
  if (p.phase === 0) {
    if (!p.target?.alive || !p.target.visible) p.target = world.nearest(p.x, p.y, p.hit);
    const t = p.target;
    if (!t) return true;
    const dx = t.x - p.x;
    const dy = t.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < 16) {
      p.phase = 1;
      p.t = 0;
      p.ox = world.rng.range(-14, 14);
      p.oy = world.rng.range(-18, -8);
      return true;
    }
    const sp = 480;
    p.vx += ((dx / d) * sp - p.vx) * Math.min(1, 8 * dt);
    p.vy += ((dy / d) * sp - p.vy) * Math.min(1, 8 * dt);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot = Math.atan2(p.vy, p.vx);
    return true;
  }
  const t = p.target;
  if (!t?.alive) {
    p.phase = 0;
    return true;
  }
  p.x = t.x + (p.ox ?? 0);
  p.y = t.y + (p.oy ?? 0);
  p.rot = Math.PI / 2;
  p.t = (p.t ?? 0) + dt;
  if (p.t < 0.85 / p.w.stats.speed) return true;
  // Burst.
  world.hit(t, p.dmg, p.w);
  world.fx.burst(t.x, t.y, '#c7f36b', 12);
  if (p.w.stats.flags.has('lytic')) {
    world.forEachInCircle(t.x, t.y, 60, (n) => {
      if (n !== t) world.hit(n, p.dmg * 0.5, p.w);
    });
    world.fx.ring(t.x, t.y, 60, 'rgba(199,243,107,0.9)', 0.3);
  }
  const plague = p.w.stats.flags.has('plague');
  const maxGen = plague ? 2 : 1;
  if (!t.alive && (p.gen ?? 0) < maxGen) {
    const done = new Set<number>([t.id]);
    for (let i = 0; i < (plague ? 3 : 2); i++) {
      const next = world.nearest(t.x, t.y, done);
      if (!next) break;
      done.add(next.id);
      world.spawn(
        proj('phage', p.w, t.x, t.y, world.rng.range(-200, 200), world.rng.range(-260, -80), 8, p.dmg * 0.8, 4, phageStep, {
          phase: 0,
          gen: (p.gen ?? 0) + 1,
          target: next,
          child: true,
        }),
      );
    }
  }
  return false;
};

export const phage: WeaponDef = {
  id: 'phage',
  name: 'Phage Swarm',
  blurb: 'Bacteriophages land, inject and burst segments from the inside; kills release more phages.',
  cooldown: 3.6,
  power: 5,
  qty: 3,
  getRarity: 'epic',
  color: '#c7f36b',
  fire(world, w) {
    const n = world.qty(w);
    const dmg = world.weaponDamage(w);
    const taken = new Set<number>();
    for (let i = 0; i < n; i++) {
      const t = i === 0 ? world.primaryTarget() : world.randomVisible();
      if (!t) continue;
      taken.add(t.id);
      const a = -Math.PI / 2 + world.rng.range(-0.8, 0.8);
      world.spawn(
        proj('phage', w, world.hero.x, world.hero.y - 20, Math.cos(a) * 320, Math.sin(a) * 320, 9, dmg, 6, phageStep, { phase: 0, gen: 0, target: t }),
      );
    }
    return true;
  },
};

// ------------------------------------------------------------------- defib

export const defib: WeaponDef = {
  id: 'defib',
  name: 'Defibrillator',
  blurb: 'CLEAR! A jolt arcs down the train segment after segment and kicks it backwards.',
  cooldown: 3.2,
  power: 3.4,
  qty: 1,
  getRarity: 'epic',
  color: '#7fe8ff',
  fire(world, w) {
    const first = world.primaryTarget();
    if (!first) return false;
    const links = 5 + w.stats.bounces;
    for (let z = 0; z < world.qty(w); z++) {
      let from: Segment | undefined = z === 0 ? first : world.randomVisible();
      const done = new Set<number>();
      let px = world.hero.x;
      let py = world.hero.y - 22;
      let dmg = world.weaponDamage(w);
      for (let k = 0; k < links && from; k++) {
        done.add(from.id);
        world.fx.bolt(px, py, from.x, from.y);
        world.hit(from, dmg, w);
        px = from.x;
        py = from.y;
        dmg *= 0.9;
        const next = world.nearest(px, py, done);
        from = next && Math.hypot(next.x - px, next.y - py) < 150 ? next : undefined;
      }
    }
    world.knockback(14);
    if (w.stats.flags.has('arrest')) world.frozen = Math.max(world.frozen, 0.35);
    world.fx.flash = Math.max(world.fx.flash, 0.25);
    return true;
  },
};

// ----------------------------------------------------------------- gravity

export const gravity: WeaponDef = {
  id: 'gravity',
  name: 'Gravity Well',
  blurb: 'Tears open a singularity on the track that crushes segments and drags the whole train backwards.',
  cooldown: 9,
  power: 1.4,
  qty: 1,
  getRarity: 'epic',
  color: '#9b7bff',
  fire(world, w) {
    const n = world.qty(w);
    for (let i = 0; i < n; i++) {
      const t = i === 0 ? world.primaryTarget() : world.randomVisible();
      if (!t) continue;
      const life = 4 * w.stats.duration;
      world.addZone({ kind: 'well', w, x: t.x, y: t.y, r: 72 * w.stats.size, life, maxLife: life, tick: 0.2, tickT: 0.2, dmg: world.weaponDamage(w), rot: 0 });
      world.events.push({ type: 'boom', x: t.x, y: t.y, r: 70 });
    }
    return true;
  },
  update(world, w, dt) {
    let wells = 0;
    for (const z of world.zones) {
      if (z.kind !== 'well' || z.w !== w) continue;
      wells++;
      z.tickT -= dt;
      while (z.tickT <= 0) {
        z.tickT += z.tick;
        world.forEachInCircle(z.x, z.y, z.r, (seg) => {
          world.hit(seg, z.dmg, w);
          if (w.stats.flags.has('spaghetti')) world.hit(seg, seg.maxHp * 0.02, w);
        });
      }
    }
    // Each open well hauls every train back down its track.
    if (wells) world.knockback(42 * dt * wells);
  },
};

// ------------------------------------------------------------------- prism

const spectrumStep: Step = (world, p, dt) => {
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.life -= dt;
  if (p.life <= 0 || offField(p)) return false;
  const seg = world.contact(p.x, p.y, p.r, p.hit);
  if (!seg) return true;
  p.hit.add(seg.id);
  world.hit(seg, p.dmg, p.w);
  world.fx.spark(p.x, p.y, p.color ?? '#ffffff');
  if (p.pierce > 0) {
    p.pierce--;
    return true;
  }
  return false;
};

export const prism: WeaponDef = {
  id: 'prism',
  name: 'Prism Crystal',
  blurb: 'A floating crystal in your line of fire: capsules split into rainbows passing through, and it fires spectrum bolts.',
  cooldown: 2.2,
  power: 1.4,
  qty: 1,
  getRarity: 'epic',
  color: '#e8d8ff',
  update(world, w) {
    const n = world.qty(w);
    const h = world.hero;
    world.prisms.length = n;
    for (let i = 0; i < n; i++) {
      // Hover in the line of fire so the capsule volley passes straight through.
      const spread = (i - (n - 1) / 2) * 0.38;
      const a = h.mobile ? h.aim + spread : world.time * 1.1 + (i / n) * Math.PI * 2;
      const dist = h.mobile ? 150 : 96;
      world.prisms[i] = {
        x: h.x + Math.cos(a) * dist,
        y: h.y + Math.sin(a) * dist + Math.sin(world.time * 2.2 + i) * 6,
        r: 26 * w.stats.size,
      };
    }
  },
  fire(world, w) {
    const t = world.primaryTarget();
    if (!t || !world.prisms.length) return false;
    const dmg = world.weaponDamage(w);
    const sp = 780;
    const pierce = w.stats.flags.has('spectral') ? 3 : 1;
    for (const pr of world.prisms) {
      const base = Math.atan2(t.y - pr.y, t.x - pr.x);
      for (let i = 0; i < 5; i++) {
        const a = base + (i - 2) * 0.16;
        world.spawn(
          proj('spectrum', w, pr.x, pr.y, Math.cos(a) * sp, Math.sin(a) * sp, 6, dmg, 1.4, spectrumStep, { pierce, color: RAINBOW[i % RAINBOW.length] }),
        );
      }
    }
    return true;
  },
};
