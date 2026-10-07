// The track the germ train crawls along. Built from corner waypoints with
// rounded (filleted) corners, then resampled at a fixed step so lookups by
// arc length are O(1).

export interface PathPos {
  x: number;
  y: number;
  /** Heading in radians (screen space, y down). */
  a: number;
}

export type Waypoint = readonly [number, number];

export class Path {
  static readonly STEP = 2;

  readonly length: number;
  private readonly xs: Float32Array;
  private readonly ys: Float32Array;
  private readonly angs: Float32Array;

  constructor(xs: Float32Array, ys: Float32Array, angs: Float32Array) {
    this.xs = xs;
    this.ys = ys;
    this.angs = angs;
    this.length = (xs.length - 1) * Path.STEP;
  }

  /** Position at arc length s. Extrapolates straight off either end. */
  pos(s: number, out: PathPos = { x: 0, y: 0, a: 0 }): PathPos {
    const last = this.xs.length - 1;
    if (s <= 0) {
      const a = this.angs[0];
      out.x = this.xs[0] + Math.cos(a) * s;
      out.y = this.ys[0] + Math.sin(a) * s;
      out.a = a;
      return out;
    }
    if (s >= this.length) {
      const a = this.angs[last];
      const over = s - this.length;
      out.x = this.xs[last] + Math.cos(a) * over;
      out.y = this.ys[last] + Math.sin(a) * over;
      out.a = a;
      return out;
    }
    const f = s / Path.STEP;
    const i = Math.floor(f);
    const t = f - i;
    out.x = this.xs[i] + (this.xs[i + 1] - this.xs[i]) * t;
    out.y = this.ys[i] + (this.ys[i + 1] - this.ys[i]) * t;
    out.a = this.angs[i];
    return out;
  }

  /** Dense points for drawing the faint track groove. */
  *points(every = 8): Generator<[number, number]> {
    const stride = Math.max(1, Math.round(every / Path.STEP));
    for (let i = 0; i < this.xs.length; i += stride) yield [this.xs[i], this.ys[i]];
  }
}

/** Build a path through waypoints, rounding each interior corner with radius `fillet`. */
export function buildPath(waypoints: readonly Waypoint[], fillet: number): Path {
  if (waypoints.length < 2) throw new Error('path needs at least two waypoints');
  const dense: number[] = [];
  const push = (x: number, y: number) => {
    const n = dense.length;
    if (n >= 2 && Math.abs(dense[n - 2] - x) < 1e-6 && Math.abs(dense[n - 1] - y) < 1e-6) return;
    dense.push(x, y);
  };

  push(waypoints[0][0], waypoints[0][1]);
  for (let i = 1; i < waypoints.length - 1; i++) {
    const [px, py] = waypoints[i - 1];
    const [cx, cy] = waypoints[i];
    const [nx, ny] = waypoints[i + 1];
    const inLen = Math.hypot(cx - px, cy - py);
    const outLen = Math.hypot(nx - cx, ny - cy);
    const r = Math.min(fillet, inLen / 2, outLen / 2);
    const ax = cx - ((cx - px) / inLen) * r;
    const ay = cy - ((cy - py) / inLen) * r;
    const bx = cx + ((nx - cx) / outLen) * r;
    const by = cy + ((ny - cy) / outLen) * r;
    push(ax, ay);
    // Quadratic Bézier with the corner as control point: a smooth fillet.
    const N = 14;
    for (let k = 1; k <= N; k++) {
      const t = k / N;
      const u = 1 - t;
      push(u * u * ax + 2 * u * t * cx + t * t * bx, u * u * ay + 2 * u * t * cy + t * t * by);
    }
  }
  const end = waypoints[waypoints.length - 1];
  push(end[0], end[1]);

  return resample(dense);
}

function resample(dense: number[]): Path {
  const step = Path.STEP;
  const outX: number[] = [dense[0]];
  const outY: number[] = [dense[1]];
  let carry = 0; // distance already travelled past the last emitted sample
  for (let i = 0; i + 3 < dense.length; i += 2) {
    const x0 = dense[i];
    const y0 = dense[i + 1];
    const x1 = dense[i + 2];
    const y1 = dense[i + 3];
    const segLen = Math.hypot(x1 - x0, y1 - y0);
    if (segLen === 0) continue;
    let d = step - carry;
    while (d <= segLen) {
      const t = d / segLen;
      outX.push(x0 + (x1 - x0) * t);
      outY.push(y0 + (y1 - y0) * t);
      d += step;
    }
    carry = segLen - (d - step);
  }
  const n = outX.length;
  const xs = Float32Array.from(outX);
  const ys = Float32Array.from(outY);
  const angs = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    angs[i] = Math.atan2(ys[b] - ys[a], xs[b] - xs[a]);
  }
  return new Path(xs, ys, angs);
}
