import { Rng } from '../core/rng';
import { Chain, type SegKind, type Segment } from './chain';
import {
  FIELD_H,
  FIELD_W,
  HERO_SPEED,
  MAX_WEAPONS,
  SEG_CIRCLE_OFFSETS,
  SEG_RADIUS,
} from './constants';
import { Fx } from './fx';
import { makeLayout, type Layout } from './layouts';
import { segmentSpecs, type StageDef } from './stage';
import type { Cloud, HeroStats, OwnedWeapon, Projectile, WeaponId, Zone } from './types';
import { applyCard, rollCards, type OfferedCard } from './upgrades';
import { freshStats, WEAPONS } from './weapons';

export type RunState = 'playing' | 'picking' | 'revive' | 'won' | 'lost';

export interface RunSetup {
  stage: StageDef;
  hero: HeroStats;
  /** Equipped weapons: the first starts owned, the rest can be picked up from chests. */
  loadout: readonly WeaponId[];
  levels: Partial<Record<WeaponId, number>>;
  seed: number;
  rerolls?: number;
  revives?: number;
  /** Visual effects off for headless simulation. */
  fx?: boolean;
}

export type RunEvent =
  | { type: 'kill'; kind: SegKind }
  | { type: 'chest'; elite: boolean }
  | { type: 'offer' }
  | { type: 'boom' }
  | { type: 'revive' }
  | { type: 'won' }
  | { type: 'lost' };

const GRID = 64;
const GRID_COLS = Math.ceil(FIELD_W / GRID) + 2;
const GRID_ROWS = Math.ceil(FIELD_H / GRID) + 2;

export class World {
  readonly setup: RunSetup;
  readonly stage: StageDef;
  readonly rng: Rng;
  readonly layout: Layout;
  readonly chain: Chain;
  readonly fx: Fx;
  readonly hero: {
    x: number;
    y: number;
    mobile: boolean;
    aim: number;
    recoil: number;
    /** Field x of an active drag, or null when not touching. */
    pointerX: number | null;
    manualUntil: number;
  };
  readonly weapons: OwnedWeapon[] = [];
  projectiles: Projectile[] = [];
  zones: Zone[] = [];
  clouds: Cloud[] = [];
  readonly events: RunEvent[] = [];

  state: RunState = 'playing';
  time = 0;
  coins = 0;
  damageDealt = 0;
  globalDmg = 1;
  globalCrit = 0;
  globalCritDmg = 0;
  globalCd = 1;
  coinBonus = 0;
  slow = 0;
  rerolls: number;
  revives: number;
  /** Times each global card was taken this run. */
  readonly globalStacks = new Map<string, number>();
  /** Chests waiting to be opened, front first. */
  pending: SegKind[] = [];
  offer: OfferedCard[] | null = null;
  offerElite = false;
  picksTaken = 0;

  private spawned: Projectile[] = [];
  private grid: Segment[][] = Array.from({ length: GRID_COLS * GRID_ROWS }, () => []);
  private marks: Uint32Array;
  private stamp = 1;
  private visibleCache: Segment[] = [];
  private nextGroup = 1;

  constructor(setup: RunSetup) {
    this.setup = setup;
    this.stage = setup.stage;
    this.rng = new Rng(setup.seed);
    this.layout = makeLayout(setup.stage.layout, this.rng);
    const specs = segmentSpecs(setup.stage, this.rng);
    const speed = this.layout.path.length / setup.stage.crossTime;
    this.chain = new Chain(this.layout.path, specs, speed);
    this.marks = new Uint32Array(specs.length + 2);
    this.fx = new Fx(setup.seed ^ 0xa5a5, setup.fx ?? true);
    this.rerolls = setup.rerolls ?? 3;
    this.revives = setup.revives ?? 1;
    const h = this.layout.hero;
    this.hero = { x: h.x, y: h.y, mobile: h.mobile, aim: -Math.PI / 2, recoil: 0, pointerX: null, manualUntil: 0 };
    this.addWeapon('capsule');
    // The lead loadout slot is the starter weapon, active from the first second.
    if (setup.loadout.length > 0) this.addWeapon(setup.loadout[0]);
  }

  // ---------------------------------------------------------------- weapons

  addWeapon(id: WeaponId): OwnedWeapon {
    const existing = this.owned(id);
    if (existing) return existing;
    const def = WEAPONS[id];
    const w: OwnedWeapon = {
      def,
      level: Math.max(1, this.setup.levels[id] ?? 1),
      stats: freshStats(),
      cd: 0.25,
      stacks: new Map(),
      timers: {},
      dealt: 0,
    };
    this.weapons.push(w);
    def.acquire?.(this, w);
    return w;
  }

  owned(id: WeaponId): OwnedWeapon | undefined {
    return this.weapons.find((w) => w.def.id === id);
  }

  get weaponSlotsFree(): boolean {
    return this.weapons.length < MAX_WEAPONS;
  }

  /** Damage of one hit before crits. */
  weaponDamage(w: OwnedWeapon): number {
    return (
      this.setup.hero.atk * w.def.power * (1 + 0.15 * (w.level - 1)) * w.stats.dmgMult * this.globalDmg
    );
  }

  cooldown(w: OwnedWeapon): number {
    const cdr = Math.min(0.6, this.setup.hero.cdr);
    return Math.max(0.05, w.def.cooldown * w.stats.cdMult * this.globalCd * (1 - cdr));
  }

  qty(w: OwnedWeapon): number {
    return w.def.qty + w.stats.qty;
  }

  // ------------------------------------------------------------------- step

  step(dt: number): void {
    if (this.state !== 'playing') return;
    this.time += dt;
    this.rebuildGrid();
    this.updateHero(dt);
    for (const w of this.weapons) this.updateWeapon(w, dt);
    this.updateProjectiles(dt);
    this.updateZones(dt);
    this.chain.speedMult = 1 - this.slow;
    this.chain.update(dt);
    this.fx.update(dt);
    if (this.chain.retracting) this.fx.dust(this.chain.head.x, this.chain.head.y);

    if (this.chain.segs.length === 0) {
      this.state = 'won';
      this.fx.burst(this.chain.head.x, this.chain.head.y, '#ffffff', 30);
      this.events.push({ type: 'won' });
      return;
    }
    if (this.chain.headS >= this.layout.path.length) {
      if (this.revives > 0) this.state = 'revive';
      else {
        this.state = 'lost';
        this.events.push({ type: 'lost' });
      }
      return;
    }
    if (this.pending.length > 0) this.openOffer();
  }

  private updateHero(dt: number): void {
    const h = this.hero;
    h.recoil = Math.max(0, h.recoil - dt * 6);
    if (!h.mobile) return;
    if (h.pointerX !== null) {
      h.x = clamp(h.pointerX, 24, FIELD_W - 24);
      h.manualUntil = this.time + 1.2;
      return;
    }
    if (this.time < h.manualUntil) return;
    const target = this.front();
    if (!target) return;
    const maxStep = HERO_SPEED * dt;
    h.x = clamp(h.x + clamp(target.x - h.x, -maxStep, maxStep), 24, FIELD_W - 24);
  }

  private updateWeapon(w: OwnedWeapon, dt: number): void {
    w.def.update?.(this, w, dt);
    if (!w.def.fire) return;
    w.cd -= dt;
    if (w.cd > 0) return;
    if (!this.front()) {
      w.cd = 0;
      return;
    }
    if (w.def.fire(this, w)) w.cd += this.cooldown(w);
    if (w.cd < 0) w.cd = 0;
  }

  private updateProjectiles(dt: number): void {
    let j = 0;
    for (const p of this.projectiles) {
      p.age += dt;
      if (p.step(this, p, dt)) this.projectiles[j++] = p;
    }
    this.projectiles.length = j;
    if (this.spawned.length) {
      for (const p of this.spawned) this.projectiles.push(p);
      this.spawned.length = 0;
    }
  }

  private updateZones(dt: number): void {
    let j = 0;
    for (const z of this.zones) {
      z.life -= dt;
      z.rot += dt * 9;
      if (z.life <= 0) continue;
      this.zones[j++] = z;
      if (z.kind === 'tower') continue; // towers are driven by their weapon
      if (z.kind === 'swab') {
        const f = this.front();
        if (f) {
          const d = Math.hypot(f.x - z.x, f.y - z.y);
          if (d > 1) {
            const step = Math.min(d, 45 * dt);
            z.x += ((f.x - z.x) / d) * step;
            z.y += ((f.y - z.y) / d) * step;
          }
        }
      }
      z.tickT -= dt;
      while (z.tickT <= 0) {
        z.tickT += z.tick;
        this.forEachInCircle(z.x, z.y, z.r, (seg) => this.hit(seg, z.dmg, z.w));
      }
    }
    this.zones.length = j;
  }

  // ----------------------------------------------------------------- combat

  hit(seg: Segment, base: number, w: OwnedWeapon, scale = 1): number {
    if (!seg.alive) return 0;
    const hero = this.setup.hero;
    const crit = this.rng.next() < hero.critRate + w.stats.critAdd + this.globalCrit;
    let dmg = base * scale;
    if (crit) dmg *= hero.critDmg + w.stats.critDmgAdd + this.globalCritDmg;
    seg.hp -= dmg;
    seg.flash = 0.07;
    const dealt = Math.min(dmg, dmg + seg.hp);
    this.damageDealt += dealt;
    w.dealt += dealt;
    this.fx.number(seg.x, seg.y - 8, dmg, crit);
    if (seg.hp <= 0) this.kill(seg);
    return dmg;
  }

  private kill(seg: Segment): void {
    this.chain.remove(seg);
    this.coins += Math.ceil(this.stage.coinMult * (1 + seg.index / 25) * (1 + this.coinBonus));
    if (seg.kind !== 'normal') {
      this.pending.push(seg.kind);
      this.events.push({ type: 'chest', elite: seg.kind === 'elite' });
      this.fx.burst(seg.x, seg.y, seg.kind === 'elite' ? '#ffd34d' : '#6ff2e1', 18);
    }
    this.fx.pop(seg.x, seg.y, this.stage.theme);
    this.events.push({ type: 'kill', kind: seg.kind });
  }

  spawn(p: Projectile): void {
    this.spawned.push(p);
  }

  addZone(z: Zone): void {
    this.zones.push(z);
  }

  newGroup(): number {
    return this.nextGroup++;
  }

  // ---------------------------------------------------------------- queries

  /** The visible segment closest to breaking through. */
  front(): Segment | undefined {
    for (const seg of this.chain.segs) if (seg.visible) return seg;
    return undefined;
  }

  visible(): Segment[] {
    return this.visibleCache;
  }

  randomVisible(): Segment | undefined {
    const vis = this.visibleCache;
    if (!vis.length) return undefined;
    // Bias toward the front half: that is where the danger is.
    const k = this.rng.next();
    return vis[Math.floor(k * k * vis.length)];
  }

  nearest(x: number, y: number, exclude?: Set<number>): Segment | undefined {
    let best: Segment | undefined;
    let bestD = Infinity;
    for (const seg of this.visibleCache) {
      if (!seg.alive || exclude?.has(seg.id)) continue;
      const d = (seg.x - x) ** 2 + (seg.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = seg;
      }
    }
    return best;
  }

  /** Angle from the hero toward a point; bottom heroes only fire upward. */
  aimFromHero(x: number, y: number): number {
    const a = Math.atan2(y - this.hero.y, x - this.hero.x);
    if (!this.hero.mobile) return a;
    return clamp(a, -Math.PI + 0.3, -0.3);
  }

  /** First live segment touching the circle that is not excluded. */
  contact(x: number, y: number, r: number, exclude?: Set<number>): Segment | undefined {
    const reach = r + SEG_RADIUS;
    const reach2 = reach * reach;
    const stamp = this.nextStamp();
    let found: Segment | undefined;
    this.queryCells(x - r, y - r, x + r, y + r, (seg) => {
      if (found || this.marks[seg.id] === stamp) return;
      this.marks[seg.id] = stamp;
      if (!seg.alive || exclude?.has(seg.id)) return;
      for (let k = 0; k < SEG_CIRCLE_OFFSETS.length; k++) {
        const dx = seg.cx[k] - x;
        const dy = seg.cy[k] - y;
        if (dx * dx + dy * dy <= reach2) {
          found = seg;
          return;
        }
      }
    });
    return found;
  }

  /** Index of the collision circle of `seg` closest to (x, y). */
  closestCircle(seg: Segment, x: number, y: number): number {
    let best = 0;
    let bestD = Infinity;
    for (let k = 0; k < SEG_CIRCLE_OFFSETS.length; k++) {
      const d = (seg.cx[k] - x) ** 2 + (seg.cy[k] - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    return best;
  }

  forEachInCircle(x: number, y: number, r: number, cb: (seg: Segment) => void): void {
    const reach = r + SEG_RADIUS;
    const reach2 = reach * reach;
    const stamp = this.nextStamp();
    const hits: Segment[] = [];
    this.queryCells(x - r, y - r, x + r, y + r, (seg) => {
      if (this.marks[seg.id] === stamp) return;
      this.marks[seg.id] = stamp;
      if (!seg.alive) return;
      for (let k = 0; k < SEG_CIRCLE_OFFSETS.length; k++) {
        const dx = seg.cx[k] - x;
        const dy = seg.cy[k] - y;
        if (dx * dx + dy * dy <= reach2) {
          hits.push(seg);
          return;
        }
      }
    });
    // Callbacks may kill segments; iterate a snapshot.
    for (const seg of hits) cb(seg);
  }

  /** Segments whose body touches the line from (x1,y1) to (x2,y2). */
  forEachOnLine(x1: number, y1: number, x2: number, y2: number, thick: number, cb: (seg: Segment) => void): void {
    const reach = thick + SEG_RADIUS;
    const reach2 = reach * reach;
    const stamp = this.nextStamp();
    const hits: Segment[] = [];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1;
    this.queryCells(Math.min(x1, x2) - thick, Math.min(y1, y2) - thick, Math.max(x1, x2) + thick, Math.max(y1, y2) + thick, (seg) => {
      if (this.marks[seg.id] === stamp) return;
      this.marks[seg.id] = stamp;
      if (!seg.alive) return;
      for (let k = 0; k < SEG_CIRCLE_OFFSETS.length; k++) {
        const t = clamp(((seg.cx[k] - x1) * dx + (seg.cy[k] - y1) * dy) / len2, 0, 1);
        const px = x1 + dx * t - seg.cx[k];
        const py = y1 + dy * t - seg.cy[k];
        if (px * px + py * py <= reach2) {
          hits.push(seg);
          return;
        }
      }
    });
    for (const seg of hits) cb(seg);
  }

  private nextStamp(): number {
    this.stamp = (this.stamp + 1) >>> 0 || 1;
    return this.stamp;
  }

  private rebuildGrid(): void {
    for (const cell of this.grid) cell.length = 0;
    this.visibleCache = [];
    for (const seg of this.chain.segs) {
      if (!seg.visible) continue;
      this.visibleCache.push(seg);
      for (let k = 0; k < SEG_CIRCLE_OFFSETS.length; k++) {
        const c0 = cellCoord(seg.cx[k] - SEG_RADIUS, GRID_COLS);
        const c1 = cellCoord(seg.cx[k] + SEG_RADIUS, GRID_COLS);
        const r0 = cellCoord(seg.cy[k] - SEG_RADIUS, GRID_ROWS);
        const r1 = cellCoord(seg.cy[k] + SEG_RADIUS, GRID_ROWS);
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            const cell = this.grid[r * GRID_COLS + c];
            if (cell[cell.length - 1] !== seg) cell.push(seg);
          }
        }
      }
    }
  }

  private queryCells(x0: number, y0: number, x1: number, y1: number, cb: (seg: Segment) => void): void {
    const c0 = cellCoord(x0, GRID_COLS);
    const c1 = cellCoord(x1, GRID_COLS);
    const r0 = cellCoord(y0, GRID_ROWS);
    const r1 = cellCoord(y1, GRID_ROWS);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        for (const seg of this.grid[r * GRID_COLS + c]) cb(seg);
      }
    }
  }

  // ------------------------------------------------------------ chest picks

  private openOffer(): void {
    while (this.pending.length > 0) {
      this.offerElite = this.pending[0] === 'elite';
      const offer = rollCards(this, this.offerElite);
      if (offer.length > 0) {
        this.offer = offer;
        this.state = 'picking';
        this.events.push({ type: 'offer' });
        return;
      }
      this.pending.shift(); // nothing left to offer
    }
  }

  choose(index: number): void {
    if (this.state !== 'picking' || !this.offer) return;
    const card = this.offer[index];
    if (!card) return;
    applyCard(this, card);
    this.picksTaken++;
    this.pending.shift();
    this.offer = null;
    this.state = 'playing';
    if (this.pending.length > 0) this.openOffer();
  }

  reroll(): boolean {
    if (this.state !== 'picking' || this.rerolls <= 0) return false;
    this.rerolls--;
    this.offer = rollCards(this, this.offerElite);
    return true;
  }

  // ---------------------------------------------------------- end of a run

  revive(): void {
    if (this.state !== 'revive' || this.revives <= 0) return;
    this.revives--;
    this.chain.knockback(this.layout.path.length * 0.32);
    this.state = 'playing';
    this.events.push({ type: 'revive' });
  }

  giveUp(): void {
    if (this.state === 'won' || this.state === 'lost') return;
    this.state = 'lost';
    this.events.push({ type: 'lost' });
  }

  get progress(): number {
    return this.chain.killed / this.chain.total;
  }
}

function cellCoord(v: number, n: number): number {
  return clamp(Math.floor(v / GRID) + 1, 0, n - 1);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
