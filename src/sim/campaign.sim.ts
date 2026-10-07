import { it } from 'vitest';
import { Rng } from '../core/rng';
import { stageDef } from '../game/stage';
import type { WeaponId } from '../game/types';
import { World } from '../game/world';
import {
  claimMilestone,
  combatPower,
  HERO_STAT_DEFS,
  heroStats,
  MAX_WEAPON_LEVEL,
  recommendedPower,
  settleRun,
  weaponUpgradeCost,
} from '../meta/economy';
import { freshSave, type SaveData } from '../meta/save';
import { playOut } from './bot';

/** Spend like a sensible player: weapon levels when shards allow, then the best power-per-coin stat. */
function spend(save: SaveData): void {
  for (let guard = 0; guard < 500; guard++) {
    let bought = false;
    for (const id of ['capsule', ...save.loadout] as WeaponId[]) {
      const w = save.weapons[id];
      if (w.level >= MAX_WEAPON_LEVEL) continue;
      const cost = weaponUpgradeCost(w.level);
      if (w.shards >= cost.shards && save.coins >= cost.coins) {
        w.shards -= cost.shards;
        save.coins -= cost.coins;
        w.level++;
        bought = true;
      }
    }
    const base = combatPower(save);
    let best: { key: (typeof HERO_STAT_DEFS)[number]['key']; cost: number; gain: number } | null = null;
    for (const def of HERO_STAT_DEFS) {
      const lvl = save.hero[def.key];
      if (lvl >= def.maxLevel) continue;
      const cost = def.cost(lvl);
      if (cost > save.coins) continue;
      save.hero[def.key]++;
      const gain = (combatPower(save) - base) / cost;
      save.hero[def.key]--;
      if (!best || gain > best.gain) best = { key: def.key, cost, gain };
    }
    if (best) {
      save.coins -= best.cost;
      save.hero[best.key]++;
      bought = true;
    }
    if (!bought) return;
  }
}

it('campaign pacing', () => {
  const save = freshSave();
  const rng = new Rng(2024);
  let totalTime = 0;
  let runs = 0;
  const firstClear: string[] = [];
  let runsThisChapter = 0;
  while (runs < 120 && save.maxChapter <= 12) {
    const chapter = save.maxChapter;
    const levels = Object.fromEntries(Object.entries(save.weapons).map(([id, w]) => [id, w.level]));
    const world = playOut(
      new World({ stage: stageDef(chapter, 'normal'), hero: heroStats(save), loadout: [...save.loadout], levels, seed: rng.int(1, 1e9), fx: false }),
    );
    const r = settleRun(save, world, () => rng.next());
    for (let i = 0; i < 3; i++) claimMilestone(save, chapter, 'normal', i, () => rng.next());
    spend(save);
    runs++;
    runsThisChapter++;
    totalTime += world.time;
    if (r.won) {
      firstClear.push(
        `ch${String(chapter).padStart(2)} cleared after ${String(runsThisChapter).padStart(2)} run(s) | total ${String(runs).padStart(3)} runs ${(totalTime / 60).toFixed(0).padStart(3)} min | power ${combatPower(save)} vs rec ${recommendedPower(chapter + 1, 'normal')} next | atk lvl ${save.hero.atk} | weapons ${(['capsule', ...save.loadout] as WeaponId[]).map((id) => id + ':' + save.weapons[id].level).join(' ')}`,
      );
      runsThisChapter = 0;
    }
  }
  console.log(firstClear.join('\n'));
  console.log(`stopped at chapter ${save.maxChapter} after ${runs} runs`);
});
