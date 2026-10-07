import { FIELD_H, FIELD_W } from './constants';
import type { Segment } from './chain';
import type { OwnedWeapon, Projectile, ProjKind, WeaponDef, WeaponId, WeaponStats } from './types';
import type { World } from './world';

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

type Step = Projectile['step'];

function proj(
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

function offField(p: Projectile, margin = 60): boolean {
  return p.x < -margin || p.x > FIELD_W + margin || p.y < -margin || p.y > FIELD_H + margin;
}

function floorY(world: World): number {
  return world.layout.fenceY !== null ? world.layout.fenceY - 14 : FIELD_H - 20;
}

// ------------------------------------------------------------------ capsule

const capsuleStep: Step = (world, p, dt) => {
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.life -= dt;
  if (p.life <= 0 || offField(p)) return false;
  const seg = world.contact(p.x, p.y, p.r, p.hit);
  if (!seg) return true;
  p.hit.add(seg.id);
  world.hit(seg, p.dmg, p.w);
  world.fx.spark(p.x, p.y, '#e3f6ff');
  const split = p.w.stats.split;
  if (!p.child && split > 0) {
    const base = Math.atan2(p.vy, p.vx);
    const sp = Math.hypot(p.vx, p.vy);
    for (let i = 0; i < split; i++) {
      const a = base + (i - (split - 1) / 2) * 0.5;
      world.spawn(
        proj('capsule', p.w, p.x, p.y, Math.cos(a) * sp, Math.sin(a) * sp, 6, p.dmg * 0.5, 0.7, capsuleStep, {
          child: true,
          pierce: 1,
          hit: new Set(p.hit),
        }),
      );
    }
  }
  if (p.pierce > 0) {
    p.pierce--;
    return true;
  }
  return false;
};

/** A capsule volley from (ox, oy) toward the current aim point. Returns the angle, or null. */
export function capsuleVolleyFrom(world: World, w: OwnedWeapon, ox: number, oy: number): number | null {
  const target = world.aimPoint();
  if (!target) return null;
  let a = Math.atan2(target.y - oy, target.x - ox);
  if (world.hero.mobile) a = Math.min(-0.3, Math.max(-Math.PI + 0.3, a));
  const n = world.qty(w);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const speed = 980 * w.stats.speed;
  const dmg = world.weaponDamage(w);
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * 15;
    const x = ox + cos * 26 - sin * off;
    const y = oy - 8 + sin * 26 + cos * off;
    world.spawn(proj('capsule', w, x, y, cos * speed, sin * speed, 7, dmg, 1.4, capsuleStep, { pierce: w.stats.pierce }));
  }
  return a;
}

function capsuleVolley(world: World, w: OwnedWeapon): void {
  const a = capsuleVolleyFrom(world, w, world.hero.x, world.hero.y);
  if (a === null) return;
  world.hero.aim = a;
  world.hero.recoil = 1;
}

const capsule: WeaponDef = {
  id: 'capsule',
  name: 'Capsule',
  blurb: 'Your trusty pill launcher. Fires at the front of the train, or wherever you aim.',
  cooldown: 0.3,
  power: 1,
  qty: 1,
  getRarity: 'common',
  color: '#9fd8ff',
  fire(world, w) {
    if (!world.aimPoint()) return false;
    capsuleVolley(world, w);
    if (w.stats.burst > 0) {
      w.timers.burstLeft = w.stats.burst;
      w.timers.burstT = 0.07;
    }
    if (w.stats.flags.has('frenzy') && world.rng.chance(0.06)) w.timers.frenzy = 3;
    return true;
  },
  update(world, w, dt) {
    if ((w.timers.frenzy ?? 0) > 0) {
      w.timers.frenzy -= dt;
      w.cd = Math.min(w.cd, world.cooldown(w) * 0.3);
    }
    if ((w.timers.burstLeft ?? 0) > 0) {
      w.timers.burstT -= dt;
      if (w.timers.burstT <= 0) {
        capsuleVolley(world, w);
        w.timers.burstLeft--;
        w.timers.burstT = 0.07;
      }
    }
  },
};

// --------------------------------------------------------------------- swab

const swabStep: Step = (world, p, dt) => {
  const tx = p.tx ?? p.x;
  const ty = p.ty ?? p.y;
  const d = Math.hypot(tx - p.x, ty - p.y);
  const sp = 680;
  p.rot += dt * 14;
  if (d <= sp * dt) {
    const s = p.w.stats;
    world.addZone({
      kind: 'swab',
      w: p.w,
      x: tx,
      y: ty,
      r: 44 * s.size,
      life: 3.2 * s.duration,
      maxLife: 3.2 * s.duration,
      tick: s.flags.has('spin') ? 0.12 : 0.24,
      tickT: 0,
      dmg: p.dmg,
      rot: 0,
    });
    return false;
  }
  p.x += ((tx - p.x) / d) * sp * dt;
  p.y += ((ty - p.y) / d) * sp * dt;
  return true;
};

const swab: WeaponDef = {
  id: 'swab',
  name: 'Cotton Swab',
  blurb: 'Tosses a blazing swab that spins in place, scorching everything nearby.',
  cooldown: 4.2,
  power: 2.5,
  qty: 1,
  getRarity: 'rare',
  color: '#ff9a3c',
  fire(world, w) {
    const n = world.qty(w);
    for (let i = 0; i < n; i++) {
      const t = i === 0 ? world.primaryTarget() : world.randomVisible();
      if (!t) continue;
      world.spawn(proj('swab', w, world.hero.x, world.hero.y - 20, 0, 0, 20 * w.stats.size, world.weaponDamage(w), 5, swabStep, { tx: t.x, ty: t.y }));
    }
    return true;
  },
};

// ------------------------------------------------------------------- needle

const needleStep: Step = (world, p, dt) => {
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.life -= dt;
  if (p.life <= 0 || offField(p)) return false;
  const seg = world.contact(p.x, p.y, p.r, p.hit);
  if (!seg) return true;
  p.hit.add(seg.id);
  world.hit(seg, p.dmg, p.w);
  if (p.w.stats.flags.has('arc') && !p.child && !p.ty) {
    // Lightning Rod: the first hit arcs to two neighbours.
    p.ty = 1;
    const done = new Set([seg.id]);
    let from = seg;
    for (let k = 0; k < 2; k++) {
      const next = world.nearest(from.x, from.y, done);
      if (!next || Math.hypot(next.x - from.x, next.y - from.y) > 160) break;
      done.add(next.id);
      world.fx.bolt(from.x, from.y, next.x, next.y);
      world.hit(next, p.dmg * 0.7, p.w);
      from = next;
    }
  }
  const split = p.w.stats.split;
  if (!p.child && split > 0 && !p.phase) {
    p.phase = 1;
    const base = Math.atan2(p.vy, p.vx);
    const sp = Math.hypot(p.vx, p.vy);
    for (let i = 0; i < split; i++) {
      const a = base + world.rng.range(-1.3, 1.3);
      world.spawn(
        proj('needle', p.w, p.x, p.y, Math.cos(a) * sp, Math.sin(a) * sp, 4, p.dmg * 0.6, 0.45, needleStep, {
          child: true,
          hit: new Set(p.hit),
        }),
      );
    }
  }
  return true; // needles pierce everything
};

const needle: WeaponDef = {
  id: 'needle',
  name: 'Acupuncture',
  blurb: 'Golden needles that pierce clean through every segment in their path.',
  cooldown: 1.6,
  power: 1.2,
  qty: 2,
  getRarity: 'rare',
  color: '#ffd34d',
  fire(world, w) {
    const n = world.qty(w);
    const sp = 1150 * w.stats.speed;
    const dmg = world.weaponDamage(w);
    for (let i = 0; i < n; i++) {
      const t = i === 0 ? world.primaryTarget() : world.randomVisible();
      if (!t) continue;
      const a = world.aimFromHero(t.x, t.y) + world.rng.range(-0.05, 0.05);
      world.spawn(
        proj('needle', w, world.hero.x, world.hero.y - 16, Math.cos(a) * sp, Math.sin(a) * sp, 5, dmg, 1.1, needleStep),
      );
    }
    return true;
  },
};

// ------------------------------------------------------------------- bubble

function bubbleBurst(world: World, p: Projectile): void {
  const s = p.w.stats;
  const r = 58 * s.size;
  world.forEachInCircle(p.x, p.y, r, (seg) => world.hit(seg, p.dmg, p.w));
  world.fx.ring(p.x, p.y, r, 'rgba(143,232,255,0.9)');
  if (s.flags.has('puddle')) {
    world.addZone({ kind: 'puddle', w: p.w, x: p.x, y: p.y, r: 52 * s.size, life: 6, maxLife: 6, tick: 0.3, tickT: 0.3, dmg: p.dmg * 0.22, rot: 0 });
  }
}

const bubbleStep: Step = (world, p, dt) => {
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.life -= dt;
  if (p.x < p.r) {
    p.x = p.r;
    p.vx = Math.abs(p.vx);
  } else if (p.x > FIELD_W - p.r) {
    p.x = FIELD_W - p.r;
    p.vx = -Math.abs(p.vx);
  }
  if (p.y < p.r) {
    p.y = p.r;
    p.vy = Math.abs(p.vy);
  } else if (p.y > floorY(world)) {
    p.y = floorY(world);
    p.vy = -Math.abs(p.vy);
  }
  const touch = (p.touch ??= new Map());
  const seg = world.contact(p.x, p.y, p.r);
  if (seg && (touch.get(seg.id) ?? -1) <= p.age) {
    touch.set(seg.id, p.age + 0.25);
    world.hit(seg, p.dmg * 0.3, p.w);
    // Bounce off the body like a pinball.
    const k = world.closestCircle(seg, p.x, p.y);
    let nx = p.x - seg.cx[k];
    let ny = p.y - seg.cy[k];
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    const dot = p.vx * nx + p.vy * ny;
    if (dot < 0) {
      p.vx -= 2 * dot * nx;
      p.vy -= 2 * dot * ny;
    }
    p.phase = (p.phase ?? 0) - 1;
    if (p.phase < 0) {
      bubbleBurst(world, p);
      return false;
    }
  }
  if (p.life <= 0) {
    bubbleBurst(world, p);
    return false;
  }
  return true;
};

const bubble: WeaponDef = {
  id: 'bubble',
  name: 'Disinfectant Bubble',
  blurb: 'Bouncing water balls that ricochet off the train and burst at the end.',
  cooldown: 2.6,
  power: 3,
  qty: 2,
  getRarity: 'rare',
  color: '#8fe8ff',
  fire(world, w) {
    const n = world.qty(w);
    const sp = 440 * w.stats.speed;
    for (let i = 0; i < n; i++) {
      let a: number;
      if (world.hero.mobile) a = -Math.PI / 2 + world.rng.range(-0.95, 0.95);
      else {
        const t = world.randomVisible();
        a = t ? Math.atan2(t.y - world.hero.y, t.x - world.hero.x) + world.rng.range(-0.5, 0.5) : world.rng.range(0, Math.PI * 2);
      }
      world.spawn(
        proj('bubble', w, world.hero.x, world.hero.y - 20, Math.cos(a) * sp, Math.sin(a) * sp, 11, world.weaponDamage(w), 3.2, bubbleStep, {
          phase: 3 + w.stats.bounces,
        }),
      );
    }
    return true;
  },
};

// --------------------------------------------------------------------- snot

const snotStep: Step = (world, p, dt) => {
  if (!p.target?.alive || !p.target.visible || p.age > (p.phase ?? 0)) {
    p.target = world.randomVisible();
    p.phase = p.age + 1.3;
  }
  const sp = 300;
  if (p.target) {
    const dx = p.target.x - p.x;
    const dy = p.target.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    const blend = Math.min(1, 3 * dt);
    p.vx += ((dx / d) * sp - p.vx) * blend;
    p.vy += ((dy / d) * sp - p.vy) * blend;
  }
  const wob = Math.sin(p.age * 7) * 60;
  p.x += (p.vx + wob * Math.sin(p.rot)) * dt;
  p.y += (p.vy - wob * Math.cos(p.rot)) * dt;
  p.rot = Math.atan2(p.vy, p.vx);
  p.life -= dt;
  const touch = (p.touch ??= new Map());
  world.forEachInCircle(p.x, p.y, p.r, (seg) => {
    if ((touch.get(seg.id) ?? -1) > p.age) return;
    touch.set(seg.id, p.age + 0.35);
    world.hit(seg, p.dmg, p.w);
  });
  if (p.life <= 0) {
    if (p.w.stats.flags.has('sneeze')) {
      world.forEachInCircle(p.x, p.y, 72 * p.w.stats.size, (seg) => world.hit(seg, p.dmg * 2.5, p.w));
      world.fx.ring(p.x, p.y, 72 * p.w.stats.size, 'rgba(160,230,90,0.9)');
    }
    return false;
  }
  return true;
};

const snot: WeaponDef = {
  id: 'snot',
  name: 'Snot Dragon',
  blurb: 'A wandering glob of snot that slimes every segment it touches.',
  cooldown: 6,
  power: 1.5,
  qty: 1,
  getRarity: 'rare',
  color: '#9be04f',
  fire(world, w) {
    const n = world.qty(w);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + world.rng.range(-0.6, 0.6);
      world.spawn(
        proj('snot', w, world.hero.x, world.hero.y - 20, Math.cos(a) * 260, Math.sin(a) * 260, 18 * w.stats.size, world.weaponDamage(w), 5 * w.stats.duration, snotStep),
      );
    }
    return true;
  },
};

// ------------------------------------------------------------------- roller

const rollerStep: Step = (world, p, dt) => {
  p.x += p.vx * dt;
  p.life -= dt;
  p.rot += (p.vx / 30) * dt;
  if (p.life <= 0 || p.x < -80 || p.x > FIELD_W + 80) return false;
  const h = p.r;
  world.forEachOnLine(p.x, p.y - h, p.x, p.y + h, 12, (seg) => {
    if (p.hit.has(seg.id)) return;
    p.hit.add(seg.id);
    world.hit(seg, p.dmg, p.w);
    if (p.w.stats.flags.has('knock') && !p.phase) {
      p.phase = 1;
      world.chain.knockback(55);
    }
  });
  return true;
};

const roller: WeaponDef = {
  id: 'roller',
  name: 'Massage Stick',
  blurb: 'A heavy roller sweeps across a whole row of the train.',
  cooldown: 5.5,
  power: 6,
  qty: 1,
  getRarity: 'rare',
  color: '#b77cff',
  fire(world, w) {
    const n = world.qty(w);
    for (let i = 0; i < n; i++) {
      const t = i === 0 ? world.primaryTarget() : world.randomVisible();
      if (!t) continue;
      w.timers.side = 1 - (w.timers.side ?? 0);
      const fromLeft = w.timers.side === 1;
      world.spawn(
        proj('roller', w, fromLeft ? -50 : FIELD_W + 50, t.y, fromLeft ? 520 : -520, 0, 24 * w.stats.size, world.weaponDamage(w), 2.6, rollerStep),
      );
    }
    return true;
  },
};

// -------------------------------------------------------------------- tower

const tower: WeaponDef = {
  id: 'tower',
  name: 'Medical Tower',
  blurb: 'Drops little towers that link up with electrotherapy lasers.',
  cooldown: 8,
  power: 0.8,
  qty: 2,
  getRarity: 'epic',
  color: '#6dff9a',
  fire(world, w) {
    const n = world.qty(w);
    const group = world.newGroup();
    const life = 6 * w.stats.duration;
    const bottom = world.layout.fenceY !== null ? world.layout.fenceY - 40 : FIELD_H - 40;
    for (let i = 0; i < n; i++) {
      const t = i === 0 ? world.primaryTarget() : world.randomVisible();
      if (!t) continue;
      const x = Math.min(FIELD_W - 24, Math.max(24, t.x + world.rng.range(-80, 80)));
      const y = Math.min(bottom, Math.max(40, t.y + world.rng.range(-80, 80)));
      world.addZone({ kind: 'tower', w, x, y, r: 16, life, maxLife: life, tick: 0.2, tickT: 0.2, dmg: 0, rot: 0, group });
    }
    return true;
  },
  update(world, w, dt) {
    w.timers.tick = (w.timers.tick ?? 0.2) - dt;
    const thunder = w.stats.flags.has('thunder');
    if (thunder) w.timers.thunder = (w.timers.thunder ?? 1) - dt;
    if (w.timers.tick > 0 && !(thunder && w.timers.thunder <= 0)) return;
    const towers = world.zones.filter((z) => z.kind === 'tower' && z.w === w);
    const dmg = world.weaponDamage(w);
    if (w.timers.tick <= 0) {
      w.timers.tick += 0.2;
      for (let i = 0; i < towers.length; i++) {
        for (let j = i + 1; j < towers.length; j++) {
          const a = towers[i];
          const b = towers[j];
          if (a.group !== b.group) continue;
          world.forEachOnLine(a.x, a.y, b.x, b.y, 5, (seg) => world.hit(seg, dmg, w));
        }
      }
    }
    if (thunder && w.timers.thunder <= 0) {
      w.timers.thunder += 1;
      for (const z of towers) {
        const seg = world.nearest(z.x, z.y);
        if (!seg || Math.hypot(seg.x - z.x, seg.y - z.y) > 280) continue;
        world.fx.bolt(z.x, z.y, seg.x, seg.y);
        world.hit(seg, dmg * 4, w);
      }
    }
  },
};

// ------------------------------------------------------------------ scalpel

const scalpelStep: Step = (world, p, dt) => {
  p.rot += dt * 16;
  p.life -= dt;
  const sp = Math.hypot(p.vx, p.vy);
  if (!p.phase) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const range = 380 * p.w.stats.range;
    if (Math.hypot(p.x - (p.tx ?? 0), p.y - (p.ty ?? 0)) >= range || offField(p, 0)) {
      p.phase = 1;
      p.hit.clear();
    }
  } else {
    const dx = world.hero.x - p.x;
    const dy = world.hero.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < 26) return false;
    p.vx = (dx / d) * sp;
    p.vy = (dy / d) * sp;
    p.x += p.vx * dt * 1.15;
    p.y += p.vy * dt * 1.15;
  }
  if (p.life <= 0) return false;
  const seg = world.contact(p.x, p.y, p.r, p.hit);
  if (seg) {
    p.hit.add(seg.id);
    world.hit(seg, p.dmg, p.w);
  }
  return true;
};

const scalpel: WeaponDef = {
  id: 'scalpel',
  name: 'Flying Scalpel',
  blurb: 'Spinning blades fly out, carve through the train and boomerang back.',
  cooldown: 2.4,
  power: 2,
  qty: 2,
  getRarity: 'epic',
  color: '#d8e4f0',
  fire(world, w) {
    const t = world.primaryTarget();
    if (!t) return false;
    const n = world.qty(w);
    const base = world.aimFromHero(t.x, t.y);
    const sp = 700 * w.stats.speed;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.3;
      world.spawn(
        proj('scalpel', w, world.hero.x, world.hero.y - 16, Math.cos(a) * sp, Math.sin(a) * sp, 15 * w.stats.size, world.weaponDamage(w), 4, scalpelStep, {
          tx: world.hero.x,
          ty: world.hero.y,
          phase: 0,
        }),
      );
    }
    return true;
  },
};

// ------------------------------------------------------------------- meteor

const meteorStep: Step = (world, p, dt) => {
  const tx = p.tx ?? p.x;
  const ty = p.ty ?? p.y;
  const d = Math.hypot(tx - p.x, ty - p.y);
  const sp = 1300;
  if (d <= sp * dt) {
    const s = p.w.stats;
    const r = 56 * s.size;
    world.forEachInCircle(tx, ty, r, (seg) => world.hit(seg, p.dmg, p.w));
    world.fx.ring(tx, ty, r, 'rgba(255,190,80,0.95)', 0.35);
    world.fx.burst(tx, ty, '#ffb347', 10);
    world.fx.kick(2);
    world.events.push({ type: 'boom' });
    if (s.flags.has('burn')) {
      world.addZone({ kind: 'fire', w: p.w, x: tx, y: ty, r: 46 * s.size, life: 3, maxLife: 3, tick: 0.25, tickT: 0.25, dmg: p.dmg * 0.3, rot: 0 });
    }
    return false;
  }
  p.x += ((tx - p.x) / d) * sp * dt;
  p.y += ((ty - p.y) / d) * sp * dt;
  return true;
};

const meteor: WeaponDef = {
  id: 'meteor',
  name: 'Skyfall Star',
  blurb: 'Calls down a shower of meteors on random segments.',
  cooldown: 5,
  power: 5,
  qty: 4,
  getRarity: 'epic',
  color: '#ffb347',
  fire(world, w) {
    const vis = world.visible();
    if (!vis.length) return false;
    const n = world.qty(w);
    const dmg = world.weaponDamage(w);
    for (let i = 0; i < n; i++) {
      const t = world.randomVisible();
      if (!t) continue;
      const lead = 520 + i * 110; // stagger the impacts
      world.spawn(proj('meteor', w, t.x + lead * 0.3, t.y - lead, 0, 0, 14, dmg, 3, meteorStep, { tx: t.x, ty: t.y }));
    }
    return true;
  },
};

// ---------------------------------------------------------------- satellite

const satellite: WeaponDef = {
  id: 'satellite',
  name: 'Satellite Storm',
  blurb: 'Thunderclouds that lock onto treasure chests and zap them.',
  cooldown: 1.1,
  power: 4,
  qty: 1,
  getRarity: 'epic',
  color: '#bfe3ff',
  update(world, w, dt) {
    const mine = world.clouds.filter((c) => c.w === w);
    while (mine.length < world.qty(w)) {
      const c = { w, x: world.hero.x, y: world.hero.y - 60, t: 0.6 + mine.length * 0.3 };
      world.clouds.push(c);
      mine.push(c);
    }
    const dmg = world.weaponDamage(w);
    for (const c of mine) {
      if (!c.target?.alive || !c.target.visible) c.target = pickCloudTarget(world, c.x, c.y);
      const t = c.target;
      if (t) {
        const gx = t.x;
        const gy = t.y - 70;
        const d = Math.hypot(gx - c.x, gy - c.y);
        if (d > 1) {
          const step = Math.min(d, 320 * dt);
          c.x += ((gx - c.x) / d) * step;
          c.y += ((gy - c.y) / d) * step;
        }
      }
      c.t -= dt;
      if (c.t > 0 || !t) continue;
      c.t = world.cooldown(w);
      world.fx.bolt(c.x, c.y + 10, t.x, t.y);
      world.hit(t, dmg, w);
      if (w.stats.flags.has('fork')) {
        const done = new Set([t.id]);
        let from = t;
        for (let k = 0; k < 2; k++) {
          const next = world.nearest(from.x, from.y, done);
          if (!next || Math.hypot(next.x - from.x, next.y - from.y) > 170) break;
          done.add(next.id);
          world.fx.bolt(from.x, from.y, next.x, next.y);
          world.hit(next, dmg * 0.6, w);
          from = next;
        }
      }
    }
  },
};

function pickCloudTarget(world: World, x: number, y: number): Segment | undefined {
  let best: Segment | undefined;
  let bestD = Infinity;
  for (const seg of world.visible()) {
    if (!seg.alive || seg.kind === 'normal') continue;
    const d = Math.hypot(seg.x - x, seg.y - y);
    if (d < bestD) {
      bestD = d;
      best = seg;
    }
  }
  return best ?? world.primaryTarget();
}

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
};

/** Order in which chapters unlock weapons. The first two are available from the start. */
export const WEAPON_UNLOCK_ORDER: WeaponId[] = [
  'swab',
  'needle',
  'bubble',
  'snot',
  'meteor',
  'roller',
  'scalpel',
  'tower',
  'satellite',
];
