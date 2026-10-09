import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import { FENCE_Y, FIELD_W } from './constants';
import { isTwin, makeLayout, type LayoutKind } from './layouts';
import { buildPath, Path } from './path';

describe('Path', () => {
  it('measures and samples a straight line', () => {
    const p = buildPath(
      [
        [0, 0],
        [100, 0],
      ],
      10,
    );
    expect(p.length).toBeCloseTo(100, 0);
    const mid = p.pos(50);
    expect(mid.x).toBeCloseTo(50, 1);
    expect(mid.y).toBeCloseTo(0, 5);
    expect(mid.a).toBeCloseTo(0, 5);
  });

  it('extrapolates straight back off the start', () => {
    const p = buildPath(
      [
        [0, 0],
        [0, 100],
      ],
      10,
    );
    const before = p.pos(-40);
    expect(before.x).toBeCloseTo(0, 3);
    expect(before.y).toBeCloseTo(-40, 1);
  });

  it('rounds corners: shorter than the legs and continuous', () => {
    const p = buildPath(
      [
        [0, 0],
        [100, 0],
        [100, 100],
      ],
      30,
    );
    expect(p.length).toBeLessThan(200);
    expect(p.length).toBeGreaterThan(180);
    let prev = p.pos(0);
    for (let s = Path.STEP; s <= p.length; s += Path.STEP) {
      const cur = p.pos(s);
      expect(Math.hypot(cur.x - prev.x, cur.y - prev.y)).toBeLessThan(Path.STEP + 0.05);
      prev = { ...cur };
    }
  });
});

describe('layouts', () => {
  const kinds: LayoutKind[] = ['rows', 'columns', 'spiral', 'twinColumns', 'twinRows'];
  for (const kind of kinds) {
    it(`${kind}: a long track that ends at the defence line`, () => {
      for (let seed = 1; seed <= 5; seed++) {
        const layout = makeLayout(kind, new Rng(seed));
        expect(layout.paths.length).toBe(isTwin(kind) ? 2 : 1);
        for (const path of layout.paths) {
          expect(path.length).toBeGreaterThan(isTwin(kind) ? 2000 : 4000);
          const end = path.pos(path.length);
          if (layout.fenceY !== null) {
            expect(Math.abs(end.y - FENCE_Y)).toBeLessThan(Path.STEP + 0.5);
          } else {
            const d = Math.hypot(end.x - layout.hero.x, end.y - layout.hero.y);
            expect(Math.abs(d - layout.goalRadius)).toBeLessThan(Path.STEP + 0.5);
          }
          // The start is off-screen so the train slides in.
          const start = path.pos(0);
          expect(start.x < 0 || start.x > FIELD_W || start.y < 0).toBe(true);
        }
      }
    });
  }
});
