import { describe, expect, it } from 'vitest';
import { SIM_DT } from './constants';
import type { LayoutKind } from './layouts';
import { stageDef } from './stage';
import type { WeaponId } from './types';
import { World } from './world';

const ALL: WeaponId[] = ['swab', 'needle', 'bubble', 'snot', 'roller', 'tower', 'scalpel', 'meteor', 'satellite'];

function play(world: World, seconds: number): void {
  for (let t = 0; t < seconds; t += SIM_DT) {
    if (world.state === 'picking') world.choose(0);
    if (world.state === 'revive') world.revive();
    if (world.state === 'won' || world.state === 'lost') return;
    world.step(SIM_DT);
  }
}

describe('World', () => {
  for (const layout of ['rows', 'columns', 'spiral'] as LayoutKind[]) {
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
      for (const id of ALL.slice(0, 5)) world.addWeapon(id);
      play(world, 90);
      expect(world.chain.killed).toBeGreaterThan(10);
      expect(Number.isFinite(world.chain.headS)).toBe(true);
      for (const p of world.projectiles) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      }
    });
  }

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
    expect(a.chain.killed).toBe(b.chain.killed);
    expect(a.chain.headS).toBe(b.chain.headS);
  });
});
