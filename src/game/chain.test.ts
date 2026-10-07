import { describe, expect, it } from 'vitest';
import { Chain, type SegmentSpec } from './chain';
import { HEAD_GAP, SEG_LEN } from './constants';
import { buildPath } from './path';

const line = buildPath(
  [
    [0, 0],
    [20000, 0],
  ],
  0,
);

function specs(n: number): SegmentSpec[] {
  return Array.from({ length: n }, () => ({ hp: 100, kind: 'normal' as const }));
}

function settle(chain: Chain, seconds: number, dt = 1 / 60): void {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) chain.update(dt);
}

describe('Chain', () => {
  it('keeps rigid spacing while it is pushed along', () => {
    const chain = new Chain(line, specs(10), 50, 0);
    settle(chain, 2);
    for (let i = 1; i < chain.segs.length; i++) {
      expect(chain.segs[i - 1].s - chain.segs[i].s).toBeCloseTo(SEG_LEN, 3);
    }
    expect(chain.headS - chain.segs[0].s).toBeCloseTo(HEAD_GAP, 3);
    // Tail moved ~100 units in 2s at 50u/s.
    expect(chain.segs[9].s).toBeCloseTo(-HEAD_GAP - 9 * SEG_LEN + 100, 0);
  });

  it('yanks the front back when a segment dies', () => {
    const a = new Chain(line, specs(10), 50, 0);
    const b = new Chain(line, specs(10), 50, 0);
    settle(a, 3);
    settle(b, 3);
    b.remove(b.segs[4]);
    a.update(1 / 60);
    b.update(1 / 60);
    expect(b.retracting).toBe(true);
    // The head is pulled back, not left waiting.
    expect(b.headS).toBeLessThan(a.headS);
    settle(a, 1);
    settle(b, 1);
    expect(b.retracting).toBe(false);
    expect(a.headS - b.headS).toBeCloseTo(SEG_LEN, 1);
    for (let i = 1; i < b.segs.length; i++) {
      expect(b.segs[i - 1].s - b.segs[i].s).toBeCloseTo(SEG_LEN, 3);
    }
  });

  it('knockback pushes the whole train back', () => {
    const chain = new Chain(line, specs(5), 50, 0);
    settle(chain, 4);
    const before = chain.headS;
    chain.knockback(300);
    settle(chain, 2);
    // 2s of pushing at 50u/s = +100, minus the 300 knockback.
    expect(chain.headS).toBeCloseTo(before - 300 + 100, 0);
  });

  it('does not rush again after a knockback', () => {
    const chain = new Chain(line, specs(5), 50, 760);
    settle(chain, 10);
    chain.knockback(2000);
    settle(chain, 5);
    const before = chain.headS;
    settle(chain, 1);
    expect(chain.headS - before).toBeCloseTo(50, 0);
  });

  it('reports danger as head progress along the path', () => {
    const chain = new Chain(line, specs(3), 1000, 0);
    settle(chain, 1);
    expect(chain.danger).toBeCloseTo(1000 / line.length, 2);
  });
});
