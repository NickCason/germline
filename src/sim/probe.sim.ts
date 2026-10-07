import { it } from 'vitest';
import { SIM_DT } from '../game/constants';
import { stageDef } from '../game/stage';
import { World } from '../game/world';
import { scoreCard } from './bot';

it('probe one run', () => {
  const world = new World({ stage: stageDef(1, 'normal'), hero: { atk: 10, critRate: 0.05, critDmg: 1.5, cdr: 0 }, loadout: ['swab', 'needle'], levels: {}, seed: 11, fx: false });
  let nextReport = 0;
  while (world.time < 600 && world.state !== 'won' && world.state !== 'lost') {
    if (world.state === 'picking' && world.offer) {
      let best = 0;
      world.offer.forEach((c, i) => { if (scoreCard(world, c) > scoreCard(world, world.offer![best])) best = i; });
      console.log(`  t=${world.time.toFixed(0)} pick: ${world.offer.map((c, i) => (i === best ? '*' : '') + c.def.name + '(' + c.rarity[0] + ')').join(' | ')}`);
      world.choose(best);
      continue;
    }
    if (world.state === 'revive') { console.log('  REVIVE at', world.time.toFixed(0)); world.revive(); continue; }
    world.step(SIM_DT);
    if (world.time >= nextReport) {
      nextReport += 15;
      const f = world.front();
      console.log(`t=${world.time.toFixed(0).padStart(3)} kills=${world.chain.killed} danger=${(world.chain.danger*100).toFixed(0)}% frontHP=${f ? Math.round(f.hp) + '/' + f.maxHp : '-'} dmg=${world.weapons.map(w => w.def.id + ':' + Math.round(w.dealt)).join(' ')}`);
    }
  }
  console.log('END', world.state, 'progress', (world.progress*100).toFixed(0), 'time', world.time.toFixed(0));
});
