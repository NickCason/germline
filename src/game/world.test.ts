import { describe, expect, it } from 'vitest';
import { SIM_DT } from './constants';
import type { LayoutKind } from './layouts';
import { stageDef } from './stage';
import type { WeaponId } from './types';
import { World } from './world';

const ALL: WeaponId[] = [
  'swab',
  'needle',
  'bubble',
  'snot',
  'roller',
  'tower',
  'scalpel',
  'meteor',
  'satellite',
  'laser',
  'phage',
  'defib',
  'gravity',
  'prism',
];

function play(world: World, seconds: number): void {
  for (let t = 0; t < seconds; t += SIM_DT) {
    if (world.state === 'picking') world.choose(0);
    if (world.state === 'revive') world.revive();
    if (world.state === 'won' || world.state === 'lost') return;
    world.step(SIM_DT);
  }
}

describe('World', () => {
  for (const layout of ['rows', 'columns', 'spiral', 'twinColumns', 'twinRows'] as LayoutKind[]) {
    it(`runs a ${layout} stage with every weapon without blowing up`, () => {
      const stage = { ...stageDef(1, 'normal'), layout };
      const world = new World({
        stage,
        hero: { atk: 40, critRate: 0.1, critDmg: 1.5, cdr: 0 },
        loadout: ALL,
        levels: Object.fromEntries(ALL.map((id) => [id, 6])),
        seed: 7,
      });
      // Hand every weapon over up front so they all get exercised.
      for (const id of ALL) world.addWeapon(id);
      play(world, 90);
      expect(world.killed).toBeGreaterThan(10);
      for (const c of world.chains) expect(Number.isFinite(c.headS)).toBe(true);
      for (const p of world.projectiles) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      }
      // Every weapon should have landed damage.
      const idle = world.weapons.filter((w) => w.dealt <= 0).map((w) => w.def.id);
      expect(idle).toEqual([]);
    });
  }

  it('double dragon: two trains, both must die to win', () => {
    const world = new World({
      stage: { ...stageDef(5, 'normal'), layout: 'twinColumns', segments: 16, hpScale: 0.01 },
      hero: { atk: 500, critRate: 0, critDmg: 1.5, cdr: 0 },
      loadout: [],
      levels: {},
      seed: 5,
      fx: false,
    });
    expect(world.chains.length).toBe(2);
    expect(world.totalSegments).toBe(16);
    play(world, 200);
    expect(world.state).toBe('won');
    expect(world.chains.every((c) => c.segs.length === 0)).toBe(true);
  });

  it('wins when the whole train is destroyed', () => {
    const world = new World({
      stage: { ...stageDef(1, 'normal'), segments: 12 },
      hero: { atk: 5000, critRate: 0, critDmg: 1.5, cdr: 0 },
      loadout: [],
      levels: {},
      seed: 3,
      fx: false,
    });
    play(world, 120);
    expect(world.state).toBe('won');
    expect(world.progress).toBe(1);
    expect(world.coins).toBeGreaterThan(0);
  });

  it('loses (after the revive) when the head reaches the line', () => {
    const world = new World({
      stage: stageDef(1, 'normal'),
      hero: { atk: 0, critRate: 0, critDmg: 1.5, cdr: 0 },
      loadout: [],
      levels: {},
      seed: 3,
      fx: false,
    });
    let revived = false;
    for (let t = 0; t < 400 && world.state !== 'lost'; t += SIM_DT) {
      if (world.state === 'revive') {
        revived = true;
        world.revive();
      }
      world.step(SIM_DT);
    }
    expect(revived).toBe(true);
    expect(world.state).toBe('lost');
  });

  it('is deterministic for a given seed', () => {
    const make = () =>
      new World({
        stage: stageDef(2, 'normal'),
        hero: { atk: 12, critRate: 0.05, critDmg: 1.5, cdr: 0 },
        loadout: ['swab', 'needle', 'bubble'],
        levels: {},
        seed: 99,
        fx: false,
      });
    const a = make();
    const b = make();
    play(a, 60);
    play(b, 60);
    expect(a.killed).toBe(b.killed);
    expect(a.chains[0].headS).toBe(b.chains[0].headS);
  });
});
