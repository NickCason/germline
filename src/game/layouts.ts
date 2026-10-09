import { buildPath, Path, type Waypoint } from './path';
import { FENCE_Y, FIELD_H, FIELD_W, HERO_Y } from './constants';
import type { Rng } from '../core/rng';

export type LayoutKind = 'rows' | 'columns' | 'spiral' | 'twinColumns' | 'twinRows';

export interface Layout {
  kind: LayoutKind;
  /** One track per germ train. Double Dragon layouts have two. */
  paths: Path[];
  /** Where the hero stands. `mobile` heroes slide along the fence. */
  hero: { x: number; y: number; mobile: boolean };
  /** Fence line for bottom-defence layouts; spiral layouts defend a ring instead. */
  fenceY: number | null;
  goalRadius: number;
}

export function isTwin(kind: LayoutKind): boolean {
  return kind === 'twinColumns' || kind === 'twinRows';
}

const ENTRY = 150; // how far off-screen the track starts
const GAP = 72; // distance between neighbouring lanes of the same track

export function makeLayout(kind: LayoutKind, rng: Rng): Layout {
  switch (kind) {
    case 'rows':
      return rowsLayout(rng);
    case 'columns':
      return columnsLayout(rng);
    case 'spiral':
      return spiralLayout(rng);
    case 'twinColumns':
      return twinColumnsLayout(rng);
    case 'twinRows':
      return twinRowsLayout(rng);
  }
}

function bottomDefence(kind: LayoutKind, paths: Path[]): Layout {
  return { kind, paths, hero: { x: FIELD_W / 2, y: HERO_Y, mobile: true }, fenceY: FENCE_Y, goalRadius: 0 };
}

/** Serpentine rows between xL and xR, entering from the left, ending at the fence. */
function rowWaypoints(xL: number, xR: number, rows: number, y0: number): [number, number][] {
  const r = GAP / 2;
  const pts: [number, number][] = [[-ENTRY, y0]];
  for (let k = 0; k < rows; k++) {
    const y = y0 + k * GAP;
    const right = k % 2 === 0;
    const sideX = right ? xR + r : xL - r;
    pts.push([sideX, y]);
    if (k < rows - 1) pts.push([sideX, y + GAP]);
    else pts.push([sideX, FENCE_Y]);
  }
  return pts;
}

/** Vertical serpentine through columns at xs, entering from the top, ending at the fence. */
function columnWaypoints(xs: number[], yT: number, yB: number): [number, number][] {
  const r = GAP / 2;
  const pts: [number, number][] = [[xs[0], -ENTRY]];
  for (let k = 0; k < xs.length; k++) {
    const down = k % 2 === 0;
    if (k < xs.length - 1) {
      const turnY = down ? yB + r : yT - r;
      pts.push([xs[k], turnY], [xs[k + 1], turnY]);
    } else {
      pts.push([xs[k], FENCE_Y]);
    }
  }
  return pts;
}

/** Horizontal serpentine filling the top of the field, ending at the fence. */
function rowsLayout(rng: Rng): Layout {
  const pts = rowWaypoints(rng.int(48, 62), FIELD_W - rng.int(48, 62), rng.int(9, 10), 112);
  const mirrored = rng.chance(0.5);
  return bottomDefence('rows', [buildPath(mirrored ? mirror(pts) : pts, GAP / 2)]);
}

/** Vertical serpentine: columns snaking down and up, last one drops to the fence. */
function columnsLayout(rng: Rng): Layout {
  const cols = 7;
  const x0 = FIELD_W / 2 - ((cols - 1) * GAP) / 2;
  const xs = Array.from({ length: cols }, (_, k) => x0 + k * GAP);
  const pts = columnWaypoints(xs, rng.int(130, 150), rng.int(700, 740));
  const mirrored = rng.chance(0.5);
  return bottomDefence('columns', [buildPath(mirrored ? mirror(pts) : pts, GAP / 2)]);
}

/** Double Dragon: two column snakes side by side, both racing for the fence. */
function twinColumnsLayout(rng: Rng): Layout {
  const yT = rng.int(130, 150);
  const yB = rng.int(690, 730);
  const left = columnWaypoints([54, 54 + GAP, 54 + 2 * GAP], yT, yB);
  return bottomDefence('twinColumns', [buildPath(left, GAP / 2), buildPath(mirror(left), GAP / 2)]);
}

/** Double Dragon: two short-row serpentines, one per half, finishing near the middle. */
function twinRowsLayout(rng: Rng): Layout {
  const rows = rng.chance(0.5) ? 9 : 7;
  const left = rowWaypoints(46, 204, rows, 112);
  return bottomDefence('twinRows', [buildPath(left, GAP / 2), buildPath(mirror(left), GAP / 2)]);
}

/** Rectangular spiral closing in on a hero who stands in the middle. */
function spiralLayout(rng: Rng): Layout {
  const l = 44;
  const t = 96;
  const rgt = FIELD_W - 44;
  const b = FIELD_H - 64;
  const cx = (l + rgt) / 2;
  const cy = (t + b) / 2;
  const pts: [number, number][] = [[-ENTRY, t]];
  let k = 0;
  // Walk inward ring by ring while the current ring still leaves a lane for the hero.
  const minSide = 2 * GAP + 20;
  while (rgt - l - 2 * k * GAP >= minSide && b - t - 2 * k * GAP >= minSide) {
    const inset = k * GAP;
    pts.push([rgt - inset, t + inset]);
    pts.push([rgt - inset, b - inset]);
    pts.push([l + inset, b - inset]);
    pts.push([l + inset, t + inset + GAP]);
    k++;
  }
  // Final approach: across to the centre line, then down towards the hero.
  const inset = k * GAP;
  const goalR = 70;
  pts.push([cx, t + inset]);
  pts.push([cx, cy - goalR]);
  const mirrored = rng.chance(0.5);
  return {
    kind: 'spiral',
    paths: [buildPath(mirrored ? mirror(pts) : pts, 30)],
    hero: { x: cx, y: cy, mobile: false },
    fenceY: null,
    goalRadius: goalR,
  };
}

function mirror(pts: readonly Waypoint[]): [number, number][] {
  return pts.map(([x, y]) => [FIELD_W - x, y]);
}
