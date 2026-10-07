import { buildPath, Path, type Waypoint } from './path';
import { FENCE_Y, FIELD_H, FIELD_W, HERO_Y } from './constants';
import type { Rng } from '../core/rng';

export type LayoutKind = 'rows' | 'columns' | 'spiral';

export interface Layout {
  kind: LayoutKind;
  path: Path;
  /** Where the hero stands. `mobile` heroes slide along the fence. */
  hero: { x: number; y: number; mobile: boolean };
  /** Fence line for bottom-defence layouts; spiral layouts defend a ring instead. */
  fenceY: number | null;
  goalRadius: number;
}

const ENTRY = 150; // how far off-screen the track starts

export function makeLayout(kind: LayoutKind, rng: Rng): Layout {
  switch (kind) {
    case 'rows':
      return rowsLayout(rng);
    case 'columns':
      return columnsLayout(rng);
    case 'spiral':
      return spiralLayout(rng);
  }
}

/** Horizontal serpentine filling the top of the field, ending at the fence. */
function rowsLayout(rng: Rng): Layout {
  const gap = 72;
  const r = gap / 2;
  const rows = rng.int(9, 10);
  const y0 = 112;
  const xL = rng.int(48, 62);
  const xR = FIELD_W - rng.int(48, 62);
  const pts: [number, number][] = [[-ENTRY, y0]];
  for (let k = 0; k < rows; k++) {
    const y = y0 + k * gap;
    const right = k % 2 === 0;
    const sideX = right ? xR + r : xL - r;
    pts.push([sideX, y]);
    if (k < rows - 1) pts.push([sideX, y + gap]);
    else pts.push([sideX, FENCE_Y]);
  }
  const mirrored = rng.chance(0.5);
  return {
    kind: 'rows',
    path: buildPath(mirrored ? mirror(pts) : pts, r),
    hero: { x: FIELD_W / 2, y: HERO_Y, mobile: true },
    fenceY: FENCE_Y,
    goalRadius: 0,
  };
}

/** Vertical serpentine: columns snaking down and up, last one drops to the fence. */
function columnsLayout(rng: Rng): Layout {
  const gap = 72;
  const r = gap / 2;
  const cols = 7;
  const x0 = FIELD_W / 2 - ((cols - 1) * gap) / 2;
  const yT = rng.int(130, 150);
  const yB = rng.int(700, 740);
  const pts: [number, number][] = [[x0, -ENTRY]];
  for (let k = 0; k < cols; k++) {
    const x = x0 + k * gap;
    const down = k % 2 === 0;
    if (k < cols - 1) {
      const turnY = down ? yB + r : yT - r;
      pts.push([x, turnY], [x + gap, turnY]);
    } else {
      pts.push([x, FENCE_Y]);
    }
  }
  const mirrored = rng.chance(0.5);
  return {
    kind: 'columns',
    path: buildPath(mirrored ? mirror(pts) : pts, r),
    hero: { x: FIELD_W / 2, y: HERO_Y, mobile: true },
    fenceY: FENCE_Y,
    goalRadius: 0,
  };
}

/** Rectangular spiral closing in on a hero who stands in the middle. */
function spiralLayout(rng: Rng): Layout {
  const gap = 72;
  const l = 44;
  const t = 96;
  const rgt = FIELD_W - 44;
  const b = FIELD_H - 64;
  const cx = (l + rgt) / 2;
  const cy = (t + b) / 2;
  const pts: [number, number][] = [[-ENTRY, t]];
  let k = 0;
  // Walk inward ring by ring while the current ring still leaves a lane for the hero.
  const minSide = 2 * gap + 20;
  while (rgt - l - 2 * k * gap >= minSide && b - t - 2 * k * gap >= minSide) {
    const inset = k * gap;
    pts.push([rgt - inset, t + inset]);
    pts.push([rgt - inset, b - inset]);
    pts.push([l + inset, b - inset]);
    pts.push([l + inset, t + inset + gap]);
    k++;
  }
  // Final approach: across to the centre line, then down towards the hero.
  const inset = k * gap;
  const goalR = 70;
  pts.push([cx, t + inset]);
  pts.push([cx, cy - goalR]);
  const mirrored = rng.chance(0.5);
  return {
    kind: 'spiral',
    path: buildPath(mirrored ? mirror(pts) : pts, 30),
    hero: { x: cx, y: cy, mobile: false },
    fenceY: null,
    goalRadius: goalR,
  };
}

function mirror(pts: readonly Waypoint[]): [number, number][] {
  return pts.map(([x, y]) => [FIELD_W - x, y]);
}
