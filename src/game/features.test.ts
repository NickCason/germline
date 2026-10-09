import { describe, expect, it } from 'vitest';
import { SIM_DT } from './constants';
import { COSTUMES } from './costumes';
import { triggerPower } from './powerups';
import { endlessDef, stageDef } from './stage';
import type { Rarity } from './types';
import { availableCards, rollCards } from './upgrades';
import { RUN_REROLLS, RUN_REVIVES, RUN_TAKE_ALLS, World, type RunSetup } from './world';

function world(overrides: Partial<RunSetup> = {}): World {
  return new World({
    stage: stageDef(1, 'normal'),
    hero: { atk: 10, critRate: 0.05, critDmg: 1.5, cdr: 0 },
    loadout: ['swab', 'needle', 'bubble'],
    levels: {},
    seed: 42,
    fx: false,
    ...overrides,
  });
}

function run(w: World, seconds: number): void {
  const steps = Math.round(seconds / SIM_DT);
  for (let i = 0; i < steps && w.state === 'playing'; i++) w.step(SIM_DT);
}

/** Like run(), but takes the first card whenever a chest opens. */
function play(w: World, seconds: number): void {
  const steps = Math.round(seconds / SIM_DT);
  for (let i = 0; i < steps; i++) {
    if (w.state === 'picking') w.choose(0);
    if (w.state !== 'playing') return;
    w.step(SIM_DT);
  }
}

const RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };

describe('run allowances', () => {
  it('gives the bigger reroll/revive/take-all budget, adjusted by costume perks', () => {
    const w = world();
    expect([w.rerolls, w.revives, w.takeAlls]).toEqual([RUN_REROLLS, RUN_REVIVES, RUN_TAKE_ALLS]);
    expect(world({ costume: 'nurse' }).revives).toBe(RUN_REVIVES + 1);
    expect(world({ costume: 'wizard' }).rerolls).toBe(RUN_REROLLS + 2);
    expect(world({ costume: 'royal' }).takeAlls).toBe(RUN_TAKE_ALLS + 1);
    expect(world({ costume: 'astronaut' }).owned('capsule')!.stats.qty).toBe(1);
  });
});

describe('rerolls', () => {
  it('roll rarer cards the more you reroll', () => {
    const w = world();
    const avg = (luck: number) => {
      let total = 0;
      let n = 0;
      for (let i = 0; i < 400; i++) {
        for (const c of rollCards(w, false, luck)) {
          total += RANK[c.rarity];
          n++;
        }
      }
      return total / n;
    };
    const fresh = avg(0);
    const once = avg(1);
    const thrice = avg(3);
    expect(once).toBeGreaterThan(fresh + 0.3);
    expect(thrice).toBeGreaterThan(once + 0.3);
  });

  it('are free once per chest, then spend the pool, and keep raising luck', () => {
    const w = world({ stage: { ...stageDef(1, 'normal'), segments: 30 }, hero: { atk: 500, critRate: 0, critDmg: 1.5, cdr: 0 } });
    while (w.state === 'playing') w.step(SIM_DT);
    expect(w.state).toBe('picking');
    expect(w.reroll()).toBe(true); // free
    expect(w.rerolls).toBe(RUN_REROLLS);
    expect(w.reroll()).toBe(true); // paid
    expect(w.rerolls).toBe(RUN_REROLLS - 1);
    expect(w.offerRerolls).toBe(2);
    expect(w.offerLuck).toBe(2);
    // The next chest gets a fresh free reroll.
    w.choose(0);
    while ((w.state as string) === 'playing') w.step(SIM_DT);
    if (w.state === 'picking') {
      expect(w.freeReroll).toBe(true);
      expect(w.offerLuck).toBe(0);
    }
  });
});

describe('take all', () => {
  it('applies every card on offer and uses one charge', () => {
    const w = world({ stage: { ...stageDef(1, 'normal'), segments: 30 }, hero: { atk: 500, critRate: 0, critDmg: 1.5, cdr: 0 } });
    while (w.state === 'playing') w.step(SIM_DT);
    const before = w.picksTaken;
    const offered = w.offer!.length;
    expect(w.takeAll()).toBe(true);
    expect(w.takeAlls).toBe(RUN_TAKE_ALLS - 1);
    expect(w.picksTaken).toBe(before + offered);
  });
});

describe('manual aim', () => {
  it('fires at the finger, then locks onto the segment under it', () => {
    const w = world({ aimMode: 'manual' });
    run(w, 6);
    const vis = w.visible();
    expect(vis.length).toBeGreaterThan(3);
    const pick = vis[vis.length - 1]; // far from the front
    w.pointer(pick.x, pick.y, 'down');
    expect(w.aimPoint()).toEqual({ x: pick.x, y: pick.y });
    expect(w.primaryTarget()).toBe(pick);
    w.pointer(pick.x, pick.y, 'up');
    expect(w.aim.lock).toBe(pick);
    expect(w.primaryTarget()).toBe(pick);
    // In auto mode the front is always the target.
    w.setAimMode('auto');
    expect(w.primaryTarget()).toBe(w.front());
  });

  it('hands the lock to the neighbour that slides into place when the target dies', () => {
    const w = world({ aimMode: 'manual', hero: { atk: 0.0001, critRate: 0, critDmg: 1.5, cdr: 0 } });
    run(w, 8);
    const vis = w.visible();
    const pick = vis[Math.floor(vis.length / 2)];
    w.pointer(pick.x, pick.y, 'down');
    w.pointer(pick.x, pick.y, 'up');
    w.hitRaw(pick, pick.hp + 1, 'power');
    run(w, 0.5);
    expect(w.aim.lock).not.toBeNull();
    expect(w.aim.lock).not.toBe(pick);
    expect(w.aim.lock!.alive).toBe(true);
  });
});

describe('power-ups', () => {
  it('freeze stops the train and reverse drives it backwards', () => {
    const w = world({ hero: { atk: 0.0001, critRate: 0, critDmg: 1.5, cdr: 0 } });
    run(w, 12);
    const seg = w.front()!;
    triggerPower(w, seg, 'freeze');
    const s0 = w.chains[0].headS;
    run(w, 2);
    expect(w.chains[0].headS).toBeCloseTo(s0, 0);
    run(w, 3); // thaw
    triggerPower(w, w.front()!, 'reverse');
    const s1 = w.chains[0].headS;
    run(w, 2);
    expect(w.chains[0].headS).toBeLessThan(s1 - 100);
  });

  it('bomb deals a share of max HP around the segment', () => {
    const w = world({ hero: { atk: 0.0001, critRate: 0, critDmg: 1.5, cdr: 0 } });
    run(w, 12);
    const seg = w.visible()[2];
    const neighbours = w.visible().filter((s) => Math.hypot(s.x - seg.x, s.y - seg.y) < 90 && s !== seg);
    const before = neighbours.map((s) => s.hp);
    triggerPower(w, seg, 'bomb');
    neighbours.forEach((s, i) => expect(s.hp).toBeLessThan(before[i]));
    expect(w.powerDealt).toBeGreaterThan(0);
  });

  it('a popped power-up segment triggers its power', () => {
    const w = world({ hero: { atk: 0.0001, critRate: 0, critDmg: 1.5, cdr: 0 } });
    run(w, 12);
    const seg = w.front()!;
    seg.power = 'freeze';
    seg.powerLife = 10;
    w.hitRaw(seg, seg.hp + 1, 'ult');
    expect(w.frozen).toBeGreaterThan(0);
    expect(w.powersUsed).toBe(1);
  });
});

describe('ultimates', () => {
  it('charge from kills and fire once full', () => {
    const w = world({ costume: 'classic' });
    expect(w.useUlt()).toBe(false);
    play(w, 10);
    w.ultCharge = w.ultNeed;
    const before = w.chains[0].headS;
    expect(w.useUlt()).toBe(true);
    expect(w.ultCharge).toBe(0);
    run(w, 2);
    // Antibody Pulse shoves the train back.
    expect(w.chains[0].headS).toBeLessThan(before);
  });

  for (const id of Object.keys(COSTUMES) as (keyof typeof COSTUMES)[]) {
    it(`${id} ultimate runs without errors and does damage`, () => {
      const w = world({ costume: id, hero: { atk: 0.0001, critRate: 0, critDmg: 1.5, cdr: 0 } });
      run(w, 12);
      w.ultCharge = w.ultNeed;
      expect(w.useUlt()).toBe(true);
      run(w, 8);
      expect(w.ultDealt + (id === 'ninja' ? w.owned('capsule')!.dealt : 0)).toBeGreaterThan(0);
    });
  }
});

describe('evolutions', () => {
  it('appear only with the partner weapon and enough upgrades', () => {
    const w = world({ loadout: ['bubble', 'snot'], levels: {} });
    const has = () => availableCards(w).some((c) => c.id === 'evo_slime');
    expect(has()).toBe(false);
    w.addWeapon('snot');
    expect(has()).toBe(false);
    w.owned('bubble')!.stacks.set('bubble_dmg', 3);
    expect(has()).toBe(true);
  });
});

describe('endless', () => {
  it('keeps feeding the train and never ends in a win', () => {
    const w = world({ stage: endlessDef(3, 1), hero: { atk: 400, critRate: 0, critDmg: 1.5, cdr: 0 } });
    for (let t = 0; t < 120; t += SIM_DT) {
      if (w.state === 'picking') w.choose(0);
      else if (w.state !== 'playing') break;
      w.step(SIM_DT);
    }
    expect(w.state).not.toBe('won');
    expect(w.score).toBeGreaterThan(60);
    expect(w.totalSegments).toBeGreaterThan(w.score);
  });
});
