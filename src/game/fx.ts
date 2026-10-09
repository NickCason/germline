import { fmt } from '../core/format';
import { Rng } from '../core/rng';
import type { ThemeId } from './stage';
import { PALETTES } from './themes';

export interface DmgNumber {
  x: number;
  y: number;
  vy: number;
  life: number;
  max: number;
  text: string;
  crit: boolean;
  /** Tint for crits, from the weapon that landed it. */
  color: string;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  dust: boolean;
}

export interface Ring {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
  color: string;
}

export interface Bolt {
  pts: number[];
  life: number;
  max: number;
}

/** A stain left on the floor where a segment burst; fades slowly. */
export interface Decal {
  x: number;
  y: number;
  r: number;
  rot: number;
  color: string;
  life: number;
  max: number;
}

/** A needle left sticking out of a segment for a moment. */
export interface Pin {
  x: number;
  y: number;
  a: number;
  life: number;
}

const MAX_NUMBERS = 48;
const MAX_PARTICLES = 420;

/**
 * Purely cosmetic effects. Has its own RNG so turning effects off (the
 * balance simulator does) never changes gameplay rolls.
 */
export class Fx {
  readonly enabled: boolean;
  private readonly rng: Rng;
  numbers: DmgNumber[] = [];
  particles: Particle[] = [];
  rings: Ring[] = [];
  bolts: Bolt[] = [];
  decals: Decal[] = [];
  pins: Pin[] = [];
  shake = 0;
  /** Full-screen flash intensity (0..1), decays quickly. */
  flash = 0;

  constructor(seed: number, enabled: boolean) {
    this.rng = new Rng(seed);
    this.enabled = enabled;
  }

  number(x: number, y: number, dmg: number, crit: boolean, color = '#ff5b4d'): void {
    if (!this.enabled) return;
    if (this.numbers.length >= MAX_NUMBERS) {
      if (!crit) return;
      this.numbers.shift();
    }
    this.numbers.push({
      x: x + this.rng.range(-14, 14),
      y,
      vy: -60,
      life: crit ? 0.7 : 0.42,
      max: crit ? 0.7 : 0.42,
      text: fmt(Math.max(1, Math.round(dmg))),
      crit,
      color,
    });
  }

  pop(x: number, y: number, theme: ThemeId): void {
    if (!this.enabled) return;
    const colors = PALETTES[theme].pop;
    for (let i = 0; i < 10; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const sp = this.rng.range(60, 220);
      this.add({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: this.rng.range(0.25, 0.5),
        max: 0.5,
        size: this.rng.range(4, 9),
        color: colors[i % colors.length],
        dust: false,
      });
    }
    this.ring(x, y, 34, 'rgba(255,255,255,0.8)');
    if (this.decals.length >= 60) this.decals.shift();
    this.decals.push({ x, y, r: this.rng.range(26, 40), rot: this.rng.range(0, Math.PI * 2), color: colors[1], life: 6, max: 6 });
  }

  pin(x: number, y: number, a: number): void {
    if (!this.enabled || this.pins.length > 40) return;
    this.pins.push({ x: x + this.rng.range(-8, 8), y: y + this.rng.range(-8, 8), a, life: 0.55 });
  }

  burst(x: number, y: number, color: string, n: number): void {
    if (!this.enabled) return;
    for (let i = 0; i < n; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const sp = this.rng.range(80, 320);
      this.add({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: this.rng.range(0.35, 0.7),
        max: 0.7,
        size: this.rng.range(3, 7),
        color,
        dust: false,
      });
    }
  }

  spark(x: number, y: number, color: string): void {
    if (!this.enabled || this.rng.next() < 0.5) return;
    const a = this.rng.range(0, Math.PI * 2);
    this.add({ x, y, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, life: 0.15, max: 0.15, size: 3, color, dust: false });
  }

  dust(x: number, y: number): void {
    if (!this.enabled || this.rng.next() < 0.5) return;
    this.add({
      x: x + this.rng.range(-18, 18),
      y: y + this.rng.range(-14, 14),
      vx: this.rng.range(-20, 20),
      vy: this.rng.range(-30, -5),
      life: 0.6,
      max: 0.6,
      size: this.rng.range(10, 18),
      color: 'rgba(240,235,220,0.55)',
      dust: true,
    });
  }

  ring(x: number, y: number, r: number, color: string, life = 0.3): void {
    if (!this.enabled) return;
    this.rings.push({ x, y, r, life, max: life, color });
  }

  bolt(x1: number, y1: number, x2: number, y2: number): void {
    if (!this.enabled) return;
    const pts = [x1, y1];
    const steps = 6;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      pts.push(x1 + (x2 - x1) * t + this.rng.range(-12, 12), y1 + (y2 - y1) * t + this.rng.range(-12, 12));
    }
    pts.push(x2, y2);
    this.bolts.push({ pts, life: 0.16, max: 0.16 });
  }

  kick(amount: number): void {
    if (!this.enabled) return;
    this.shake = Math.min(10, this.shake + amount);
  }

  update(dt: number): void {
    if (!this.enabled) return;
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt * 3);
    let j = 0;
    for (const n of this.numbers) {
      n.life -= dt;
      n.y += n.vy * dt;
      n.vy *= 0.92;
      if (n.life > 0) this.numbers[j++] = n;
    }
    this.numbers.length = j;
    j = 0;
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.9;
      p.vy *= 0.9;
      if (p.life > 0) this.particles[j++] = p;
    }
    this.particles.length = j;
    j = 0;
    for (const r of this.rings) {
      r.life -= dt;
      if (r.life > 0) this.rings[j++] = r;
    }
    this.rings.length = j;
    j = 0;
    for (const b of this.bolts) {
      b.life -= dt;
      if (b.life > 0) this.bolts[j++] = b;
    }
    this.bolts.length = j;
    j = 0;
    for (const d of this.decals) {
      d.life -= dt;
      if (d.life > 0) this.decals[j++] = d;
    }
    this.decals.length = j;
    j = 0;
    for (const p of this.pins) {
      p.life -= dt;
      if (p.life > 0) this.pins[j++] = p;
    }
    this.pins.length = j;
  }

  private add(p: Particle): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push(p);
  }
}
