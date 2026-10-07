import { it } from 'vitest';
import { stageDef } from '../game/stage';
import type { HeroStats, WeaponId } from '../game/types';
import { simulate } from './bot';

// `npm run sim` — prints how a bot fares per chapter for a few power levels.
const SEEDS = [1, 2, 3, 4, 5, 6];

function row(label: string, chapter: number, hero: HeroStats, loadout: WeaponId[], level: number): void {
  const levels = Object.fromEntries(['capsule', ...loadout].map((id) => [id, level]));
  const results = SEEDS.map((seed) => simulate(stageDef(chapter, 'normal'), hero, loadout, levels, seed * 7919 + chapter));
  const wins = results.filter((r) => r.won).length;
  const avgP = results.reduce((a, r) => a + r.progress, 0) / results.length;
  const avgT = results.reduce((a, r) => a + r.time, 0) / results.length;
  const avgC = results.reduce((a, r) => a + r.coins, 0) / results.length;
  const avgPicks = results.reduce((a, r) => a + r.picks, 0) / results.length;
  console.log(
    `${label.padEnd(10)} ch${String(chapter).padStart(2)}  wins ${wins}/${results.length}  progress ${(avgP * 100).toFixed(0).padStart(3)}%  time ${avgT.toFixed(0).padStart(4)}s  picks ${avgPicks.toFixed(1).padStart(4)}  coins ${avgC.toFixed(0).padStart(5)}`,
  );
}

it('balance report', () => {
  const fresh: HeroStats = { atk: 10, critRate: 0.05, critDmg: 1.5, cdr: 0 };
  for (let c = 1; c <= 3; c++) row('fresh', c, fresh, ['swab', 'needle'], 1);
  const mid: HeroStats = { atk: 22, critRate: 0.08, critDmg: 1.6, cdr: 0.05 };
  for (let c = 2; c <= 5; c++) row('mid', c, mid, ['swab', 'needle', 'bubble', 'snot'], 3);
});
