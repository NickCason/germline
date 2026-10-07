import type { PowerKind, Segment } from './chain';
import type { World } from './world';

/**
 * Zuma/Luxor-style power-ups. Every so often a segment near the front lights
 * up with one; pop that segment before it fades to trigger it.
 */
export interface PowerDef {
  kind: PowerKind;
  name: string;
  /** What triggering it does, shown nowhere but kept for tooltips/tests. */
  blurb: string;
  weight: number;
}

export const POWERS: Record<PowerKind, PowerDef> = {
  freeze: { kind: 'freeze', name: 'Freeze', blurb: 'Stops the train for 4 seconds', weight: 1 },
  reverse: { kind: 'reverse', name: 'Reverse', blurb: 'Drives the train backwards for 3 seconds', weight: 1 },
  bomb: { kind: 'bomb', name: 'Bomb', blurb: 'Blows up everything nearby', weight: 1.2 },
  lightning: { kind: 'lightning', name: 'Lightning', blurb: 'Zaps eight segments', weight: 1 },
  rapid: { kind: 'rapid', name: 'Rapid fire', blurb: 'Halves every cooldown for 6 seconds', weight: 1 },
  coins: { kind: 'coins', name: 'Coin bag', blurb: 'A pile of coins', weight: 0.7 },
};

const KINDS = Object.keys(POWERS) as PowerKind[];
/** Seconds a power-up stays lit on its segment. */
export const POWER_LIFE = 12;

export function updatePowerups(world: World, dt: number): void {
  world.frozen = Math.max(0, world.frozen - dt);
  world.reversing = Math.max(0, world.reversing - dt);
  world.rapid = Math.max(0, world.rapid - dt);
  for (const seg of world.visible()) {
    if (!seg.power) continue;
    seg.powerLife -= dt;
    if (seg.powerLife <= 0) seg.power = null;
  }
  if (world.time < 10) return;
  world.powerTimer -= dt;
  if (world.powerTimer > 0) return;
  world.powerTimer = world.rng.range(9, 15);
  // Light up a plain segment in the front half of what is on screen.
  const vis = world.visible().filter((s) => s.kind === 'normal' && !s.power);
  if (!vis.length) return;
  const seg = vis[Math.floor(world.rng.next() * Math.min(vis.length, Math.max(3, vis.length / 2)))];
  seg.power = world.rng.weighted(KINDS, (k) => POWERS[k].weight);
  seg.powerLife = POWER_LIFE;
  world.events.push({ type: 'power-spawn' });
}

export function triggerPower(world: World, seg: Segment, kind: PowerKind): void {
  world.events.push({ type: 'power', kind });
  world.powersUsed++;
  switch (kind) {
    case 'freeze':
      world.frozen = 4;
      world.fx.burst(seg.x, seg.y, '#bfeaff', 24);
      break;
    case 'reverse':
      world.reversing = 3;
      world.fx.burst(seg.x, seg.y, '#c9a2ff', 24);
      break;
    case 'bomb': {
      const r = 130;
      world.fx.ring(seg.x, seg.y, r, 'rgba(255,120,80,0.95)', 0.45);
      world.fx.burst(seg.x, seg.y, '#ff7a2e', 30);
      world.fx.kick(6);
      world.forEachInCircle(seg.x, seg.y, r, (s) => world.hitRaw(s, s.maxHp * 0.4, 'power'));
      break;
    }
    case 'lightning': {
      const targets = world.rng.shuffle(world.visible().filter((s) => s.alive)).slice(0, 8);
      for (const t of targets) {
        world.fx.bolt(t.x, t.y - 260, t.x, t.y);
        world.hitRaw(t, t.maxHp * 0.25, 'power');
      }
      break;
    }
    case 'rapid':
      world.rapid = 6;
      world.fx.burst(seg.x, seg.y, '#9fd8ff', 20);
      break;
    case 'coins': {
      const gain = Math.ceil(world.stage.coinMult * 30 * (1 + world.coinBonus));
      world.coins += gain;
      world.fx.burst(seg.x, seg.y, '#ffc93c', 26);
      break;
    }
  }
}
