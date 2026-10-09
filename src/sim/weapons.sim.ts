import { it } from 'vitest';
import { stageDef } from '../game/stage';
import type { HeroStats, WeaponId } from '../game/types';
import { WEAPON_UNLOCK_ORDER } from '../game/weapons';
import { World } from '../game/world';
import { playOut } from './bot';

// Weapon tiers: each weapon alone (as the starter, no pickups) against the same chapter.
it('weapon solo strength', () => {
  const hero: HeroStats = { atk: 30, critRate: 0.08, critDmg: 1.6, cdr: 0.05 };
  const rows: string[] = [];
  for (const id of WEAPON_UNLOCK_ORDER as WeaponId[]) {
    let prog = 0;
    let share = 0;
    const seeds = [11, 22, 33, 44];
    for (const seed of seeds) {
      const world = playOut(
        new World({ stage: stageDef(4, 'normal'), hero, loadout: [id], levels: { capsule: 3, [id]: 3 }, seed, fx: false }),
      );
      prog += world.progress;
      const total = world.weapons.reduce((a, w) => a + w.dealt, 0) || 1;
      share += (world.owned(id)?.dealt ?? 0) / total;
    }
    rows.push(`${id.padEnd(10)} progress ${((prog / seeds.length) * 100).toFixed(0).padStart(3)}%  share of damage ${((share / seeds.length) * 100).toFixed(0).padStart(3)}%`);
  }
  console.log(rows.join('\n'));
});
