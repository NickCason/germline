import { Rng } from '../core/rng';
import { Chain, type PowerKind, type SegKind, type Segment, type SegmentSpec } from './chain';
import {
  FIELD_H,
  FIELD_W,
  HERO_SPEED,
  MAX_WEAPONS,
  SEG_CIRCLE_OFFSETS,
  SEG_RADIUS,
} from './constants';
import { COSTUMES, ULT_CHARGE, ULT_GAIN, type CostumeDef, type CostumeId } from './costumes';
import { Fx } from './fx';
import { makeLayout, type Layout } from './layouts';
import { triggerPower, updatePowerups } from './powerups';
import { MUTATION_EVERY, segmentSpecs, specStream, type StageDef } from './stage';
import type { AimMode, Cloud, HeroStats, OwnedWeapon, Projectile, TimedEffect, WeaponId, Zone } from './types';
import { applyCard, canApply, rollCards, type OfferedCard } from './upgrades';
import { freshStats, WEAPONS } from './weapons';

export type RunState = 'playing' | 'picking' | 'revive' | 'won' | 'lost';

/**
 * Per-run allowances (the original game gated these behind ads). Every chest
 * also gets one free reroll; the pool below pays for the second and beyond.
 */
export const RUN_REROLLS = 10;
export const RUN_REVIVES = 3;
export const RUN_TAKE_ALLS = 2;

export interface RunSetup {
  stage: StageDef;
  hero: HeroStats;
  /** Equipped weapons: the first starts owned, the rest can be picked up from chests. */
  loadout: readonly WeaponId[];
  levels: Partial<Record<WeaponId, number>>;
  seed: number;
  rerolls?: number;
  revives?: number;
  takeAlls?: number;
  costume?: CostumeId;
  aimMode?: AimMode;
  /** Visual effects off for headless simulation. */
  fx?: boolean;
}

export type RunEvent =
  | { type: 'kill'; kind: SegKind; x: number; y: number }
  | { type: 'chest'; elite: boolean; x: number; y: number }
  | { type: 'offer' }
  | { type: 'boom'; x: number; y: number; r: number }
  | { type: 'revive' }
  | { type: 'power'; kind: PowerKind; x: number; y: number }
  | { type: 'power-spawn' }
  | { type: 'ult'; x: number; y: number }
  | { type: 'mutation'; tier: number }
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
  /** One germ train per track; Double Dragon levels have two. */
  readonly chains: Chain[] = [];
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
  /** Floating prism crystals (the prism weapon refracts capsules through these). */
  prisms: { x: number; y: number; r: number }[] = [];
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
  /** Contagion mythic: a dying segment hurts its neighbours by this share of its max HP. */
  contagion = 0;
  rerolls: number;
  revives: number;
  takeAlls: number;
  /** Extra rarity on rerolled offers (wizard perk). */
  rerollLuck = 0;
  /** Rerolls spent on the offer currently shown; each makes the next roll rarer. */
  offerRerolls = 0;
  /** The first reroll on every chest is free. */
  freeReroll = true;
  maxWeapons = MAX_WEAPONS;
  readonly costume: CostumeDef;
  ultCharge = 0;
  ultNeed = ULT_CHARGE;
  effects: TimedEffect[] = [];
  /** Power-up timers (seconds left). */
  frozen = 0;
  reversing = 0;
  rapid = 0;
  powerTimer = 12;
  powersUsed = 0;
  ultsUsed = 0;
  ultDealt = 0;
  powerDealt = 0;
  /** Endless mutation tier and the HP multiplier applied to new segments. */
  mutation = 0;
  endlessHp = 1;
  aimMode: AimMode;
  /** Manual aim: the finger position while touching, then a locked segment. */
  readonly aim: { point: { x: number; y: number } | null; lock: Segment | null; lx: number; ly: number } = {
    point: null,
    lock: null,
    lx: 0,
    ly: 0,
  };
  /** Times each global card was taken this run. */
  readonly globalStacks = new Map<string, number>();
  /** Chests waiting to be opened, front first. */
  pending: SegKind[] = [];
  offer: OfferedCard[] | null = null;
  offerElite = false;
  picksTaken = 0;

  private spawned: Projectile[] = [];
  private grid: Segment[][] = Array.from({ length: GRID_COLS * GRID_ROWS }, () => []);
  private marks = new Uint32Array(256);
  private stamp = 1;
  private visibleCache: Segment[] = [];
  private nextGroup = 1;

  constructor(setup: RunSetup) {
    this.setup = setup;
    this.stage = setup.stage;
    this.rng = new Rng(setup.seed);
    this.layout = makeLayout(setup.stage.layout, this.rng);
    const ids = { next: 1 };
    const lanes = this.layout.paths.length;
    this.layout.paths.forEach((path, lane) => {
      const stage = setup.stage;
      const speed = path.length / stage.crossTime;
      const laneStage = { ...stage, segments: Math.ceil(stage.segments / lanes) };
      const specs = segmentSpecs(laneStage, this.rng);
      // Endless trains draw more segments from the same stream forever.
      let feed: (() => SegmentSpec) | null = null;
      if (stage.endless) {
        const stream = specStream(stage, new Rng(setup.seed ^ (0x5eed + lane)));
        for (let i = 0; i < specs.length; i++) stream();
        feed = () => {
          const spec = stream();
          spec.hp = Math.max(1, Math.round(spec.hp * this.endlessHp));
          return spec;
        };
      }
      this.chains.push(new Chain(path, specs, speed, 760, feed, ids, lane));
    });
    this.fx = new Fx(setup.seed ^ 0xa5a5, setup.fx ?? true);
    this.rerolls = setup.rerolls ?? RUN_REROLLS;
    this.revives = setup.revives ?? RUN_REVIVES;
    this.takeAlls = setup.takeAlls ?? RUN_TAKE_ALLS;
    this.aimMode = setup.aimMode ?? 'auto';
    const h = this.layout.hero;
    this.hero = { x: h.x, y: h.y, mobile: h.mobile, aim: -Math.PI / 2, recoil: 0, pointerX: null, manualUntil: 0 };
    this.addWeapon('capsule');
    // The lead loadout slot is the starter weapon, active from the first second.
    if (setup.loadout.length > 0) this.addWeapon(setup.loadout[0]);
    this.costume = COSTUMES[setup.costume ?? 'classic'];
    this.costume.applyPerk(this);
  }

  // ------------------------------------------------------------ the trains

  /** How close the most advanced head is to breaking through (0..1). */
  get danger(): number {
    let d = 0;
    for (const c of this.chains) if (c.segs.length) d = Math.max(d, c.danger);
    return d;
  }

  get killed(): number {
    let n = 0;
    for (const c of this.chains) n += c.killed;
    return n;
  }

  get totalSegments(): number {
    let n = 0;
    for (const c of this.chains) n += c.total;
    return n;
  }

  /** Shove every train back along its track. */
  knockback(dist: number): void {
    for (const c of this.chains) c.knockback(dist);
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
    return this.weapons.length < this.maxWeapons;
  }

  /** Damage of one hit before crits. */
  weaponDamage(w: OwnedWeapon): number {
    return (
      this.setup.hero.atk * w.def.power * (1 + 0.15 * (w.level - 1)) * w.stats.dmgMult * this.globalDmg
    );
  }

  cooldown(w: OwnedWeapon): number {
    const cdr = Math.min(0.6, this.setup.hero.cdr);
    const rapid = this.rapid > 0 ? 0.5 : 1;
    return Math.max(0.05, w.def.cooldown * w.stats.cdMult * this.globalCd * (1 - cdr) * rapid);
  }

  qty(w: OwnedWeapon): number {
    return w.def.qty + w.stats.qty;
  }

  // ------------------------------------------------------------------- step

  step(dt: number): void {
    if (this.state !== 'playing') return;
    this.time += dt;
    this.rebuildGrid();
    this.updateAim();
    this.updateHero(dt);
    updatePowerups(this, dt);
    for (const w of this.weapons) this.updateWeapon(w, dt);
    this.updateEffects(dt);
    this.updateProjectiles(dt);
    this.updateZones(dt);
    const mult = this.reversing > 0 ? -2.2 : this.frozen > 0 ? 0 : 1 - this.slow;
    for (const c of this.chains) {
      c.speedMult = mult;
      c.update(dt);
      if (c.retracting) this.fx.dust(c.head.x, c.head.y);
    }
    this.fx.update(dt);

    if (!this.stage.endless && this.chains.every((c) => c.segs.length === 0)) {
      this.state = 'won';
      for (const c of this.chains) this.fx.burst(c.head.x, c.head.y, '#ffffff', 30);
      this.events.push({ type: 'won' });
      return;
    }
    if (this.chains.some((c) => c.segs.length > 0 && c.headS >= c.path.length)) {
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
    if (this.aimMode === 'manual') {
      // Slide under whatever you are aiming at so shots fly straight into it.
      const tx = this.aim.point?.x ?? this.primaryTarget()?.x;
      if (tx === undefined) return;
      const maxStep = HERO_SPEED * (this.aim.point ? 2 : 1) * dt;
      h.x = clamp(h.x + clamp(tx - h.x, -maxStep, maxStep), 24, FIELD_W - 24);
      return;
    }
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

  private updateEffects(dt: number): void {
    if (!this.effects.length) return;
    this.effects = this.effects.filter((e) => e.step(this, e, dt));
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
      if (z.kind === 'tower' || z.kind === 'well') continue; // driven by their weapons
      if (z.kind === 'swab') {
        const f = this.primaryTarget();
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
    this.fx.number(seg.x, seg.y - 22, dmg, crit, w.def.color);
    if (seg.hp <= 0) this.kill(seg);
    return dmg;
  }

  /** Damage that ignores crits and weapon stats (ultimates, power-ups). */
  hitRaw(seg: Segment, dmg: number, source: 'ult' | 'power'): number {
    if (!seg.alive || dmg <= 0) return 0;
    seg.hp -= dmg;
    seg.flash = 0.07;
    const dealt = Math.min(dmg, dmg + seg.hp);
    this.damageDealt += dealt;
    if (source === 'ult') this.ultDealt += dealt;
    else this.powerDealt += dealt;
    this.fx.number(seg.x, seg.y - 22, dmg, true, source === 'ult' ? '#ff9db0' : '#ffd34d');
    if (seg.hp <= 0) this.kill(seg);
    return dmg;
  }

  private kill(seg: Segment): void {
    const chain = this.chains[seg.lane];
    chain.remove(seg);
    this.coins += Math.ceil(this.stage.coinMult * (1 + seg.index / 25) * (1 + this.coinBonus));
    this.ultCharge = Math.min(this.ultNeed, this.ultCharge + ULT_GAIN[seg.kind]);
    if (seg.kind !== 'normal') {
      this.pending.push(seg.kind);
      this.events.push({ type: 'chest', elite: seg.kind === 'elite', x: seg.x, y: seg.y });
      this.fx.burst(seg.x, seg.y, seg.kind === 'elite' ? '#ffd34d' : '#6ff2e1', 18);
    }
    this.fx.pop(seg.x, seg.y, this.stage.theme);
    this.events.push({ type: 'kill', kind: seg.kind, x: seg.x, y: seg.y });
    if (seg.power) {
      const power = seg.power;
      seg.power = null;
      triggerPower(this, seg, power);
    }
    if (this.contagion > 0) {
      // Contagion: the burst splashes onto whatever is touching the dead segment.
      const splash = seg.maxHp * this.contagion;
      this.forEachInCircle(seg.x, seg.y, 34, (n) => this.hitRaw(n, splash, 'power'));
    }
    if (this.stage.endless && this.killed >= (this.mutation + 1) * MUTATION_EVERY) this.mutate();
  }

  /** Endless: the virus adapts. New segments get tougher, the trains speed up. */
  private mutate(): void {
    this.mutation++;
    this.endlessHp *= 1.32;
    for (const c of this.chains) c.speed *= 1.05;
    if (this.mutation === 3) this.maxWeapons += 1;
    this.events.push({ type: 'mutation', tier: this.mutation });
  }

  // ---------------------------------------------------------------- ultimate

  get ultReady(): boolean {
    return this.ultCharge >= this.ultNeed;
  }

  useUlt(): boolean {
    if (this.state !== 'playing' || !this.ultReady) return false;
    this.ultCharge = 0;
    this.ultsUsed++;
    this.costume.ult(this);
    this.events.push({ type: 'ult', x: this.hero.x, y: this.hero.y });
    return true;
  }

  addEffect(e: TimedEffect): void {
    this.effects.push(e);
  }

  // -------------------------------------------------------------------- aim

  setAimMode(mode: AimMode): void {
    this.aimMode = mode;
    this.aim.point = null;
    this.aim.lock = null;
    this.hero.pointerX = null;
  }

  /**
   * Touch input in field units. Auto aim: drag to slide the hero. Manual aim:
   * the finger is the aim point; on release, lock onto the segment under it.
   */
  pointer(x: number, y: number, phase: 'down' | 'move' | 'up'): void {
    if (this.aimMode === 'auto') {
      if (this.hero.mobile) this.hero.pointerX = phase === 'up' ? null : x;
      return;
    }
    if (phase !== 'up') {
      this.aim.point = { x, y };
      this.aim.lock = null;
      return;
    }
    const p = this.aim.point;
    this.aim.point = null;
    if (!p) return;
    const seg = this.nearest(p.x, p.y);
    if (seg && Math.hypot(seg.x - p.x, seg.y - p.y) < 110) {
      this.aim.lock = seg;
      this.aim.lx = seg.x;
      this.aim.ly = seg.y;
    }
  }

  private updateAim(): void {
    const lock = this.aim.lock;
    if (!lock) return;
    if (lock.alive && lock.visible) {
      this.aim.lx = lock.x;
      this.aim.ly = lock.y;
      return;
    }
    // When the locked segment dies its neighbour slides into the same spot: keep chewing there.
    const next = this.nearest(this.aim.lx, this.aim.ly);
    this.aim.lock = next && Math.hypot(next.x - this.aim.lx, next.y - this.aim.ly) < 140 ? next : null;
  }

  /** The segment weapons should focus: your pick in manual aim, otherwise the front. */
  primaryTarget(): Segment | undefined {
    if (this.aimMode === 'manual') {
      const p = this.aim.point;
      if (p) return this.nearest(p.x, p.y) ?? this.front();
      const lock = this.aim.lock;
      if (lock?.alive && lock.visible) return lock;
    }
    return this.front();
  }

  /** Where the capsule gun points: the raw finger position counts, so you can shoot anywhere. */
  aimPoint(): { x: number; y: number } | undefined {
    if (this.aimMode === 'manual' && this.aim.point) return this.aim.point;
    const t = this.primaryTarget();
    return t ? { x: t.x, y: t.y } : undefined;
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

  /** The visible segment closest to breaking through, across every train. */
  front(): Segment | undefined {
    let best: Segment | undefined;
    let bestDanger = -Infinity;
    for (const c of this.chains) {
      if (c.danger <= bestDanger) continue;
      for (const seg of c.segs) {
        if (!seg.visible) continue;
        best = seg;
        bestDanger = c.danger;
        break;
      }
    }
    return best;
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
    for (const chain of this.chains) {
      for (const seg of chain.segs) {
        if (!seg.visible) continue;
        // Endless trains keep minting ids; grow the dedupe table to match.
        if (seg.id >= this.marks.length) {
          const bigger = new Uint32Array(Math.max(seg.id + 1, this.marks.length * 2));
          bigger.set(this.marks);
          this.marks = bigger;
        }
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

  /** Rarity luck for the current offer: rerolls on it plus perks. */
  get offerLuck(): number {
    return this.offerRerolls > 0 ? this.offerRerolls + this.rerollLuck : 0;
  }

  /** Long endless runs widen every chest to four cards. */
  get offerSize(): number {
    return this.stage.endless && this.mutation >= 2 ? 4 : 3;
  }

  private openOffer(): void {
    while (this.pending.length > 0) {
      this.offerElite = this.pending[0] === 'elite';
      this.offerRerolls = 0;
      this.freeReroll = true;
      const offer = rollCards(this, this.offerElite, 0, this.offerSize);
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

  get canReroll(): boolean {
    return this.state === 'picking' && (this.freeReroll || this.rerolls > 0);
  }

  /**
   * The first reroll on each chest is free; later ones spend the run's pool.
   * Every reroll on the same chest raises the rarity odds again, all the way
   * up to mythic.
   */
  reroll(): boolean {
    if (!this.canReroll) return false;
    if (this.freeReroll) this.freeReroll = false;
    else this.rerolls--;
    this.offerRerolls++;
    this.offer = rollCards(this, this.offerElite, this.offerLuck, this.offerSize);
    return true;
  }

  /** Take every card on offer (limited per run). */
  takeAll(): boolean {
    if (this.state !== 'picking' || !this.offer || this.takeAlls <= 0) return false;
    this.takeAlls--;
    for (const card of this.offer) {
      if (!canApply(this, card)) continue;
      applyCard(this, card);
      this.picksTaken++;
    }
    this.pending.shift();
    this.offer = null;
    this.state = 'playing';
    if (this.pending.length > 0) this.openOffer();
    return true;
  }

  // ---------------------------------------------------------- end of a run

  revive(): void {
    if (this.state !== 'revive' || this.revives <= 0) return;
    this.revives--;
    for (const c of this.chains) c.knockback(c.path.length * 0.32);
    this.state = 'playing';
    this.events.push({ type: 'revive' });
  }

  giveUp(): void {
    if (this.state === 'won' || this.state === 'lost') return;
    this.state = 'lost';
    this.events.push({ type: 'lost' });
  }

  get progress(): number {
    return this.stage.endless ? 0 : this.killed / this.totalSegments;
  }

  /** Endless score: segments destroyed. */
  get score(): number {
    return this.killed;
  }
}

function cellCoord(v: number, n: number): number {
  return clamp(Math.floor(v / GRID) + 1, 0, n - 1);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
