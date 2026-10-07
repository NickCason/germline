import {
  FIELD_H,
  FIELD_W,
  HEAD_GAP,
  RETRACT_SPEED,
  SEG_CIRCLE_OFFSETS,
  SEG_LEN,
} from './constants';
import type { Path, PathPos } from './path';

/** How far behind the track start the queued tail is kept. */
const FEED_MARGIN = 400;

export type SegKind = 'normal' | 'chest' | 'elite';

/** Zuma-style power-ups that light up on a segment for a while; pop it to trigger. */
export type PowerKind = 'freeze' | 'reverse' | 'bomb' | 'lightning' | 'rapid' | 'coins';

export interface SegmentSpec {
  hp: number;
  kind: SegKind;
}

export interface Segment {
  id: number;
  /** Position in the original train, 0 = right behind the head. */
  index: number;
  kind: SegKind;
  /** Arc length of the segment centre along the path. */
  s: number;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  a: number;
  /** Collision circle centres, one per SEG_CIRCLE_OFFSETS entry. */
  cx: Float32Array;
  cy: Float32Array;
  /** Seconds of white hit-flash left. */
  flash: number;
  visible: boolean;
  alive: boolean;
  /** Power-up riding on this segment, and seconds before it fades. */
  power: PowerKind | null;
  powerLife: number;
}

/** Supplies more segments behind the tail (endless mode). */
export type SegmentFeed = () => SegmentSpec;

/**
 * The germ train. The tail is pushed forward at a constant speed and every
 * segment keeps SEG_LEN spacing to the one behind it. When a segment dies
 * the part in front of the gap — head included — is yanked backwards until
 * the gap closes. Killing segments is the only thing holding the head back.
 */
export class Chain {
  readonly path: Path;
  readonly segs: Segment[] = [];
  /** Segments ever in the train (grows in endless mode). */
  total: number;
  headS: number;
  head: PathPos = { x: 0, y: 0, a: 0 };
  /** Base push speed in units/second. */
  speed: number;
  /** Multiplier from slow effects (1 = full speed). */
  speedMult = 1;
  /** True on frames where some part of the train is being pulled back. */
  retracting = false;
  /** Extra speed at the start so the head arrives on screen quickly. */
  private readonly rushDist: number;
  /** The rush only happens once; knockbacks must not re-trigger it. */
  private rushing: boolean;
  private readonly feed: SegmentFeed | null;

  constructor(path: Path, specs: readonly SegmentSpec[], speed: number, rushDist = 760, feed: SegmentFeed | null = null) {
    this.path = path;
    this.speed = speed;
    this.rushDist = rushDist;
    this.rushing = rushDist > 0;
    this.feed = feed;
    this.total = 0;
    this.headS = 0;
    for (const spec of specs) this.append(spec, -HEAD_GAP - this.total * SEG_LEN);
    this.place();
  }

  private append(spec: SegmentSpec, s: number): void {
    const i = this.total++;
    this.segs.push({
      id: i + 1,
      index: i,
      kind: spec.kind,
      s,
      hp: spec.hp,
      maxHp: spec.hp,
      x: 0,
      y: 0,
      a: 0,
      cx: new Float32Array(SEG_CIRCLE_OFFSETS.length),
      cy: new Float32Array(SEG_CIRCLE_OFFSETS.length),
      flash: 0,
      visible: false,
      alive: true,
      power: null,
      powerLife: 0,
    });
  }

  get front(): Segment | undefined {
    return this.segs[0];
  }

  get killed(): number {
    return this.total - this.segs.length;
  }

  /** Fraction of the path the head has covered; 1 = it reached the defence line. */
  get danger(): number {
    return this.headS / this.path.length;
  }

  update(dt: number): void {
    const segs = this.segs;
    const n = segs.length;
    this.retracting = false;
    for (const seg of segs) if (seg.flash > 0) seg.flash -= dt;
    if (n === 0) return;

    // Endless trains grow at the back so the tail is always just off-screen.
    if (this.feed) {
      while (segs[segs.length - 1].s > -FEED_MARGIN) this.append(this.feed(), segs[segs.length - 1].s - SEG_LEN);
    }
    let v = this.speed * this.speedMult;
    if (this.rushing) {
      if (this.headS >= this.rushDist) this.rushing = false;
      else v *= 1 + 7 * (1 - Math.max(0, this.headS) / this.rushDist);
    }
    const last = segs.length - 1;
    segs[last].s += v * dt;

    const pull = RETRACT_SPEED * dt;
    for (let j = last - 1; j >= 0; j--) {
      const desired = segs[j + 1].s + SEG_LEN;
      const cur = segs[j].s;
      if (cur < desired) {
        segs[j].s = desired;
      } else if (cur > desired + 1e-3) {
        segs[j].s = Math.max(desired, cur - pull);
        this.retracting = true;
      }
    }
    const headDesired = segs[0].s + HEAD_GAP;
    if (this.headS < headDesired) this.headS = headDesired;
    else if (this.headS > headDesired + 1e-3) {
      this.headS = Math.max(headDesired, this.headS - pull);
      this.retracting = true;
    }
    this.place();
  }

  /** Push the whole train back along the path (revive, knockback weapons). */
  knockback(dist: number): void {
    const n = this.segs.length;
    if (n === 0) return;
    this.segs[n - 1].s -= dist;
  }

  remove(seg: Segment): void {
    const i = this.segs.indexOf(seg);
    if (i >= 0) this.segs.splice(i, 1);
    seg.alive = false;
  }

  private place(): void {
    const tmp: PathPos = { x: 0, y: 0, a: 0 };
    for (const seg of this.segs) {
      if (seg.s < -FEED_MARGIN) {
        // Still queued off-screen: nothing to collide with or draw.
        seg.visible = false;
        continue;
      }
      this.path.pos(seg.s, tmp);
      seg.x = tmp.x;
      seg.y = tmp.y;
      seg.a = tmp.a;
      for (let k = 0; k < SEG_CIRCLE_OFFSETS.length; k++) {
        this.path.pos(seg.s + SEG_CIRCLE_OFFSETS[k], tmp);
        seg.cx[k] = tmp.x;
        seg.cy[k] = tmp.y;
      }
      seg.visible =
        seg.s > -SEG_LEN / 2 && seg.x > -30 && seg.x < FIELD_W + 30 && seg.y > -30 && seg.y < FIELD_H + 30;
    }
    this.path.pos(this.headS, this.head);
  }
}
