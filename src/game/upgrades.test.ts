import { describe, expect, it } from 'vitest';
import { stageDef } from './stage';
import { availableCards, rollCards } from './upgrades';
import { World, type RunSetup } from './world';

function world(overrides: Partial<RunSetup> = {}): World {
  return new World({
    stage: stageDef(1, 'normal'),
    hero: { atk: 10, critRate: 0.05, critDmg: 1.5, cdr: 0 },
    loadout: ['swab', 'needle'],
    levels: {},
    seed: 42,
    fx: false,
    ...overrides,
  });
}

describe('chest cards', () => {
  it('offers three distinct cards', () => {
    const w = world();
    for (let i = 0; i < 20; i++) {
      const offer = rollCards(w, false);
      expect(offer).toHaveLength(3);
      expect(new Set(offer.map((o) => o.def.id)).size).toBe(3);
    }
  });

  it('starts with the lead loadout weapon', () => {
    const w = world();
    expect(w.weapons.map((x) => x.def.id)).toEqual(['capsule', 'swab']);
  });

  it('only offers weapons from the loadout that are not owned yet', () => {
    const w = world({ loadout: ['swab', 'needle', 'bubble'] });
    const grants = availableCards(w)
      .filter((c) => c.grants)
      .map((c) => c.grants);
    expect(grants.sort()).toEqual(['bubble', 'needle']);
    w.addWeapon('needle');
    const after = availableCards(w)
      .filter((c) => c.grants)
      .map((c) => c.grants);
    expect(after).toEqual(['bubble']);
  });

  it('hides affixes for weapons you do not own and gates specials by level', () => {
    const w = world();
    const ids = new Set(availableCards(w).map((c) => c.id));
    expect(ids.has('swab_dmg')).toBe(true);
    expect(ids.has('needle_dmg')).toBe(false);
    expect(ids.has('capsule_split')).toBe(false); // needs capsule level 3
    const leveled = world({ levels: { capsule: 3 } });
    expect(new Set(availableCards(leveled).map((c) => c.id)).has('capsule_split')).toBe(true);
  });

  it('respects max stacks', () => {
    const w = world();
    const cap = w.owned('capsule')!;
    cap.stacks.set('capsule_pierce', 3);
    expect(availableCards(w).some((c) => c.id === 'capsule_pierce')).toBe(false);
  });

  it('elite chests never roll common for multi-tier cards', () => {
    const w = world();
    for (let i = 0; i < 50; i++) {
      for (const card of rollCards(w, true)) {
        if (Object.keys(card.def.tiers).length > 1 && 'rare' in card.def.tiers) {
          expect(card.rarity).not.toBe('common');
        }
      }
    }
  });
});
