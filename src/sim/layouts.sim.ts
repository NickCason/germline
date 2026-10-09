import { it } from 'vitest';
import type { LayoutKind } from '../game/layouts';
import { HP_GROWTH, layoutHp, stageDef } from '../game/stage';
import type { HeroStats, WeaponId } from '../game/types';
import { World } from '../game/world';
import { playOut } from './bot';

// Layout difficulty: the same build against the same chapter's HP on every layout.
it('layout difficulty', () => {
  const hero: HeroStats = { atk: 60, critRate: 0.12, critDmg: 1.8, cdr: 0.1 };
  const loadout: WeaponId[] = ['swab', 'needle', 'bubble', 'laser', 'snot'];
  const levels = Object.fromEntries(['capsule', ...loadout].map((id) => [id, 5]));
  const kinds: LayoutKind[] = ['rows', 'columns', 'spiral', 'twinColumns', 'twinRows'];
  const rows: string[] = [];
  for (const chapter of [6, 7]) {
    for (const kind of kinds) {
      const seeds = [101, 202, 303, 404, 505, 606];
      let prog = 0;
      let wins = 0;
      for (const seed of seeds) {
        const base = stageDef(chapter, 'normal');
        const stage = { ...base, layout: kind, hpScale: Math.pow(HP_GROWTH, chapter - 1) * layoutHp(kind) };
        const world = playOut(new World({ stage, hero, loadout, levels, seed, fx: false }));
        prog += world.progress;
        if (world.state === 'won') wins++;
      }
      rows.push(`ch${chapter} ${kind.padEnd(12)} wins ${wins}/${seeds.length}  progress ${((prog / seeds.length) * 100).toFixed(0).padStart(3)}%`);
    }
  }
  console.log(rows.join('\n'));
});
