import { SIM_DT } from '../game/constants';
import type { StageDef } from '../game/stage';
import type { HeroStats, Rarity, WeaponId } from '../game/types';
import type { OfferedCard } from '../game/upgrades';
import { World } from '../game/world';

const RARITY_BONUS: Record<Rarity, number> = { common: 1, rare: 1.3, epic: 1.7, legendary: 2.2 };

/** A reasonable-but-not-perfect player: grabs weapons early, then stacks damage. */
export function scoreCard(world: World, card: OfferedCard): number {
  const id = card.def.id;
  let base = 3;
  if (card.def.grants) base = world.weapons.length < 4 ? 10 : 4;
  else if (id.endsWith('_qty')) base = 8;
  else if (id.endsWith('_dmg')) base = 6;
  else if (id.endsWith('_split') || id.endsWith('_pierce') || id.endsWith('_burst')) base = 7;
  else if (id.endsWith('_rate') || id.endsWith('_cd')) base = 5;
  else if (id === 'g_slow') base = 6;
  else if (id === 'g_coin') base = 1;
  else if (card.rarity === 'legendary') base = 9;
  return base * RARITY_BONUS[card.rarity];
}

export interface SimResult {
  won: boolean;
  progress: number;
  time: number;
  picks: number;
  coins: number;
  weapons: string[];
}

export function simulate(
  stage: StageDef,
  hero: HeroStats,
  loadout: WeaponId[],
  levels: Partial<Record<WeaponId, number>>,
  seed: number,
): SimResult {
  const world = playOut(new World({ stage, hero, loadout, levels, seed, fx: false }));
  return {
    won: world.state === 'won',
    progress: world.progress,
    time: world.time,
    picks: world.picksTaken,
    coins: world.coins,
    weapons: world.weapons.map((w) => w.def.id),
  };
}

/** Play a world to the end with the bot's card choices. */
export function playOut(world: World): World {
  const limit = 20 * 60;
  while (world.time < limit) {
    if (world.state === 'picking' && world.offer) {
      // Gold chests: take everything while the take-alls last.
      if (world.offerElite && world.takeAlls > 0) {
        world.takeAll();
        continue;
      }
      let best = 0;
      world.offer.forEach((c, i) => {
        if (scoreCard(world, c) > scoreCard(world, world.offer![best])) best = i;
      });
      // A weak offer is worth a reroll while they last (keep a couple in reserve).
      if (scoreCard(world, world.offer[best]) < 6 && world.rerolls > 2 && world.offerRerolls < 2) {
        world.reroll();
        continue;
      }
      world.choose(best);
      continue;
    }
    if (world.state === 'playing' && world.ultReady) world.useUlt();
    if (world.state === 'revive') {
      world.revive();
      continue;
    }
    if (world.state === 'won' || world.state === 'lost') break;
    world.step(SIM_DT);
  }
  return world;
}
