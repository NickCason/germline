import type { OwnedWeapon, Rarity, WeaponId } from './types';
import { WEAPONS } from './weapons';
import type { World } from './world';

/**
 * "Enhance Attributes" cards offered when a chest segment pops. Most cards
 * come in several rarities with bigger numbers at higher rarity; special
 * affixes have one fixed rarity and may need the weapon's meta level.
 */
export interface CardDef {
  id: string;
  /** Weapon the card modifies; null for global cards. */
  weapon: WeaponId | null;
  name: string;
  tiers: Partial<Record<Rarity, number>>;
  /** Max times it can be taken in one run. */
  max?: number;
  /** Weapon meta level required to see this card. */
  minLevel?: number;
  weight?: number;
  /** "Get <weapon>" card. */
  grants?: WeaponId;
  /** Evolution: needs this partner weapon owned and `picks` upgrades on the main one. */
  evo?: { partner: WeaponId; picks: number };
  /** Devil's bargain: a big boon with a cost, only offered from gold chests. */
  bargain?: boolean;
  /** Extra availability rule. */
  when?(world: World): boolean;
  desc(v: number): string;
  apply(world: World, w: OwnedWeapon | null, v: number): void;
}

export interface OfferedCard {
  def: CardDef;
  rarity: Rarity;
  value: number;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

const dmgTiers = { common: 0.3, rare: 0.5, epic: 0.8, legendary: 1.2, mythic: 2 };
const cdTiers = { common: 0.15, rare: 0.25, mythic: 0.35 };

/** Shared card shapes, specialised per weapon below. */
function damage(weapon: WeaponId, name: string): CardDef {
  return {
    id: `${weapon}_dmg`,
    weapon,
    name,
    tiers: dmgTiers,
    desc: (v) => `${WEAPONS[weapon].name} damage +${pct(v)}`,
    apply: (_world, w, v) => {
      w!.stats.dmgMult *= 1 + v;
    },
  };
}

function cooldown(weapon: WeaponId, name: string, max = 4): CardDef {
  return {
    id: `${weapon}_cd`,
    weapon,
    name,
    tiers: cdTiers,
    max,
    desc: (v) => `${WEAPONS[weapon].name} cooldown -${pct(v)}`,
    apply: (_world, w, v) => {
      w!.stats.cdMult *= 1 - v;
    },
  };
}

function quantity(weapon: WeaponId, name: string, tiers: Partial<Record<Rarity, number>>, max: number, noun = 'quantity'): CardDef {
  // Every quantity card can also roll mythic, one better than its best tier.
  const best = Math.max(...Object.values(tiers).map((v) => v ?? 0));
  return {
    id: `${weapon}_qty`,
    weapon,
    name,
    tiers: { ...tiers, mythic: best + 1 },
    max,
    desc: (v) => `${WEAPONS[weapon].name} ${noun} +${v}`,
    apply: (_world, w, v) => {
      w!.stats.qty += v;
    },
  };
}

function size(weapon: WeaponId, name: string, noun = 'size'): CardDef {
  return {
    id: `${weapon}_size`,
    weapon,
    name,
    tiers: { common: 0.25, rare: 0.4 },
    max: 3,
    desc: (v) => `${WEAPONS[weapon].name} ${noun} +${pct(v)}`,
    apply: (_world, w, v) => {
      w!.stats.size *= 1 + v;
    },
  };
}

function special(
  weapon: WeaponId,
  id: string,
  name: string,
  rarity: Rarity,
  minLevel: number,
  desc: string,
  apply: (w: OwnedWeapon, world: World) => void,
): CardDef {
  return {
    id: `${weapon}_${id}`,
    weapon,
    name,
    tiers: { [rarity]: 1 },
    max: 1,
    minLevel,
    desc: () => desc,
    apply: (world, w) => apply(w!, world),
  };
}

const GLOBAL_CARDS: CardDef[] = [
  {
    id: 'g_dmg',
    weapon: null,
    name: 'Inflammation',
    tiers: { common: 0.08, rare: 0.12, epic: 0.18, legendary: 0.25, mythic: 0.4 },
    desc: (v) => `All damage +${pct(v)}`,
    apply: (world, _w, v) => {
      world.globalDmg *= 1 + v;
    },
  },
  {
    id: 'g_crit',
    weapon: null,
    name: 'Sharp Eye',
    tiers: { common: 0.04, rare: 0.06, epic: 0.09, mythic: 0.14 },
    max: 6,
    desc: (v) => `Crit rate +${pct(v)} for every weapon`,
    apply: (world, _w, v) => {
      world.globalCrit += v;
    },
  },
  {
    id: 'g_critdmg',
    weapon: null,
    name: 'Fever Pitch',
    tiers: { common: 0.25, rare: 0.4, epic: 0.6, mythic: 1 },
    max: 6,
    desc: (v) => `Crit damage +${pct(v)} for every weapon`,
    apply: (world, _w, v) => {
      world.globalCritDmg += v;
    },
  },
  {
    id: 'g_cd',
    weapon: null,
    name: 'Adrenaline',
    tiers: { common: 0.05, rare: 0.08, epic: 0.12, mythic: 0.18 },
    max: 5,
    desc: (v) => `All cooldowns -${pct(v)}`,
    apply: (world, _w, v) => {
      world.globalCd *= 1 - v;
    },
  },
  {
    id: 'g_slow',
    weapon: null,
    name: 'Cold Snap',
    tiers: { rare: 0.06, epic: 0.1 },
    max: 4,
    weight: 0.8,
    desc: (v) => `The germ train crawls ${pct(v)} slower`,
    apply: (world, _w, v) => {
      world.slow = Math.min(0.4, world.slow + v);
    },
  },
  {
    id: 'g_coin',
    weapon: null,
    name: 'Lucky Find',
    tiers: { common: 0.25, rare: 0.4 },
    max: 3,
    weight: 0.6,
    desc: (v) => `+${pct(v)} coins from this run`,
    apply: (world, _w, v) => {
      world.coinBonus += v;
    },
  },
];

const WEAPON_CARDS: CardDef[] = [
  // capsule
  quantity('capsule', 'Capsule Quantity', { rare: 1, epic: 2 }, 4),
  {
    id: 'capsule_rate',
    weapon: 'capsule',
    name: 'Boost Fire Rate',
    tiers: { common: 0.15, rare: 0.25, epic: 0.4 },
    max: 5,
    desc: (v) => `Capsule fire rate +${pct(v)}`,
    apply: (_world, w, v) => {
      w!.stats.cdMult /= 1 + v;
    },
  },
  damage('capsule', 'Capsule Damage'),
  {
    id: 'capsule_pierce',
    weapon: 'capsule',
    name: 'Penetrating Capsule',
    tiers: { rare: 1 },
    max: 3,
    desc: () => 'Capsules pierce +1 segment',
    apply: (_world, w) => {
      w!.stats.pierce += 1;
    },
  },
  {
    id: 'capsule_burst',
    weapon: 'capsule',
    name: 'Rapid Fire',
    tiers: { rare: 1 },
    max: 3,
    desc: () => 'Each volley fires one extra burst',
    apply: (_world, w) => {
      w!.stats.burst += 1;
    },
  },
  {
    id: 'capsule_amp',
    weapon: 'capsule',
    name: 'Attack Amplification',
    tiers: { epic: 1 },
    max: 2,
    desc: () => 'Capsule crit rate +10% and damage +50%',
    apply: (_world, w) => {
      w!.stats.critAdd += 0.1;
      w!.stats.dmgMult *= 1.5;
    },
  },
  special('capsule', 'split', 'Splitting Capsule', 'epic', 3, 'Capsules split into 3 piercing capsules on hit', (w) => {
    w.stats.split = 3;
  }),
  special('capsule', 'frenzy', 'Frenzied Shooting', 'legendary', 6, 'Each volley may send the capsule into a 3s frenzy', (w) => {
    w.stats.flags.add('frenzy');
  }),

  // cotton swab
  quantity('swab', 'Swab Quantity', { rare: 1, epic: 2 }, 3),
  size('swab', 'Size Boost'),
  cooldown('swab', 'Cooldown Reduction'),
  damage('swab', 'Swab Damage'),
  {
    id: 'swab_critdmg',
    weapon: 'swab',
    name: 'Critical Damage Boost',
    tiers: { rare: 0.5, epic: 0.8 },
    max: 3,
    desc: (v) => `Cotton Swab crit damage +${pct(v)}`,
    apply: (_world, w, v) => {
      w!.stats.critDmgAdd += v;
    },
  },
  {
    id: 'swab_dur',
    weapon: 'swab',
    name: 'Long Burn',
    tiers: { common: 0.4 },
    max: 3,
    desc: (v) => `Cotton Swab spins ${pct(v)} longer`,
    apply: (_world, w, v) => {
      w!.stats.duration *= 1 + v;
    },
  },
  special('swab', 'spin', 'Spin Cycle', 'epic', 3, 'Cotton Swab burns twice as often', (w) => {
    w.stats.flags.add('spin');
  }),
  special('swab', 'inferno', 'Inferno Swab', 'legendary', 6, 'Cotton Swab size and damage +50%', (w) => {
    w.stats.size *= 1.5;
    w.stats.dmgMult *= 1.5;
  }),

  // acupuncture
  quantity('needle', 'Boost Quantity', { rare: 2, epic: 3 }, 4, 'shot quantity'),
  {
    id: 'needle_split',
    weapon: 'needle',
    name: 'Boost Split',
    tiers: { rare: 1, epic: 2 },
    max: 3,
    desc: (v) => `Needles split into +${v} more on first hit`,
    apply: (_world, w, v) => {
      w!.stats.split += v;
    },
  },
  damage('needle', 'Needle Damage'),
  {
    id: 'needle_crit',
    weapon: 'needle',
    name: 'Critical Boost',
    tiers: { rare: 0.15, epic: 0.2 },
    max: 3,
    desc: (v) => `Acupuncture crit rate +${pct(v)}`,
    apply: (_world, w, v) => {
      w!.stats.critAdd += v;
    },
  },
  cooldown('needle', 'Quick Hands'),
  special('needle', 'point', 'Pressure Point', 'epic', 3, 'Acupuncture crit damage +100%', (w) => {
    w.stats.critDmgAdd += 1;
  }),
  special('needle', 'gold', 'Golden Needles', 'legendary', 6, 'Needle damage x2 and split +2', (w) => {
    w.stats.dmgMult *= 2;
    w.stats.split += 2;
  }),

  // bubble
  quantity('bubble', 'Boost Quantity', { rare: 2 }, 3, 'launch quantity'),
  {
    id: 'bubble_speed',
    weapon: 'bubble',
    name: 'Rapid Ejection',
    tiers: { common: 0.25 },
    max: 2,
    desc: (v) => `Disinfectant Bubble flight speed +${pct(v)}`,
    apply: (_world, w, v) => {
      w!.stats.speed *= 1 + v;
    },
  },
  damage('bubble', 'Bubble Damage'),
  cooldown('bubble', 'Bubble Cooldown'),
  {
    id: 'bubble_bounce',
    weapon: 'bubble',
    name: 'Extra Bounce',
    tiers: { rare: 2 },
    max: 2,
    desc: (v) => `Bubbles bounce +${v} more times before bursting`,
    apply: (_world, w, v) => {
      w!.stats.bounces += v;
    },
  },
  size('bubble', 'Big Burst', 'burst radius'),
  special('bubble', 'puddle', '88 Disinfectant', 'epic', 3, 'Bursts leave a puddle that burns for 6s', (w) => {
    w.stats.flags.add('puddle');
  }),
  special('bubble', 'bath', 'Bubble Bath', 'legendary', 6, 'Launch quantity +3, burst radius +30%', (w) => {
    w.stats.qty += 3;
    w.stats.size *= 1.3;
  }),

  // snot dragon
  quantity('snot', 'Snot Quantity', { rare: 1 }, 3),
  damage('snot', 'Snot Damage'),
  {
    id: 'snot_dur',
    weapon: 'snot',
    name: 'Extra Sticky',
    tiers: { common: 0.4 },
    max: 3,
    desc: (v) => `Snot lasts ${pct(v)} longer`,
    apply: (_world, w, v) => {
      w!.stats.duration *= 1 + v;
    },
  },
  size('snot', 'Big Booger'),
  cooldown('snot', 'Runny Nose', 3),
  special('snot', 'sneeze', 'Sneeze', 'epic', 3, 'Snot explodes when it expires', (w) => {
    w.stats.flags.add('sneeze');
  }),
  special('snot', 'king', 'Snot Dragon King', 'legendary', 6, 'Snot size, duration and damage +50%', (w) => {
    w.stats.size *= 1.5;
    w.stats.duration *= 1.5;
    w.stats.dmgMult *= 1.5;
  }),

  // massage stick
  quantity('roller', 'Extra Roller', { rare: 1 }, 3),
  damage('roller', 'Roller Damage'),
  size('roller', 'Wide Grip', 'width'),
  cooldown('roller', 'Roller Cooldown', 3),
  special('roller', 'knock', 'Deep Tissue', 'epic', 3, 'Each roll shoves the train backwards', (w) => {
    w.stats.flags.add('knock');
  }),
  special('roller', 'steam', 'Steamroller', 'legendary', 6, 'Roller quantity +2, damage +50%', (w) => {
    w.stats.qty += 2;
    w.stats.dmgMult *= 1.5;
  }),

  // medical tower
  quantity('tower', 'Boost Quantity', { rare: 1 }, 3, 'tower quantity'),
  damage('tower', 'Laser Damage'),
  {
    id: 'tower_dur',
    weapon: 'tower',
    name: 'Battery Pack',
    tiers: { common: 0.4 },
    max: 3,
    desc: (v) => `Towers last ${pct(v)} longer`,
    apply: (_world, w, v) => {
      w!.stats.duration *= 1 + v;
    },
  },
  cooldown('tower', 'Tower Cooldown', 3),
  special('tower', 'thunder', 'Thunder King', 'legendary', 6, 'Towers also call lightning every second', (w) => {
    w.stats.flags.add('thunder');
  }),

  // flying scalpel
  quantity('scalpel', 'Scalpel Quantity', { rare: 1 }, 4),
  damage('scalpel', 'Scalpel Damage'),
  size('scalpel', 'Bigger Blades'),
  {
    id: 'scalpel_range',
    weapon: 'scalpel',
    name: 'Long Throw',
    tiers: { common: 0.25 },
    max: 3,
    desc: (v) => `Scalpel range +${pct(v)}`,
    apply: (_world, w, v) => {
      w!.stats.range *= 1 + v;
    },
  },
  {
    id: 'scalpel_crit',
    weapon: 'scalpel',
    name: 'Surgical Precision',
    tiers: { rare: 0.15, epic: 0.25 },
    max: 3,
    desc: (v) => `Scalpel crit rate +${pct(v)}`,
    apply: (_world, w, v) => {
      w!.stats.critAdd += v;
    },
  },
  cooldown('scalpel', 'Scalpel Cooldown', 3),
  special('scalpel', 'storm', 'Scalpel Storm', 'legendary', 6, 'Scalpel quantity +3', (w) => {
    w.stats.qty += 3;
  }),

  // skyfall star
  quantity('meteor', 'Meteor Shower', { rare: 2 }, 3, 'meteors'),
  damage('meteor', 'Meteor Damage'),
  size('meteor', 'Impact Radius', 'impact radius'),
  cooldown('meteor', 'Meteor Cooldown', 3),
  special('meteor', 'burn', 'Scorched Earth', 'epic', 3, 'Impacts leave fire for 3s', (w) => {
    w.stats.flags.add('burn');
  }),
  special('meteor', 'arma', 'Armageddon', 'legendary', 6, 'Meteors +4, damage +30%', (w) => {
    w.stats.qty += 4;
    w.stats.dmgMult *= 1.3;
  }),

  // satellite storm
  quantity('satellite', 'Extra Cloud', { rare: 1 }, 3, 'clouds'),
  damage('satellite', 'Storm Damage'),
  cooldown('satellite', 'Static Charge', 3),
  special('satellite', 'fork', 'Forked Lightning', 'epic', 3, 'Strikes chain to 2 more segments', (w) => {
    w.stats.flags.add('fork');
  }),
  special('satellite', 'super', 'Supercell', 'legendary', 6, 'Clouds +2', (w) => {
    w.stats.qty += 2;
  }),

  // laser lance
  quantity('laser', 'Twin Beam', { rare: 1 }, 2, 'beams'),
  damage('laser', 'Beam Damage'),
  {
    id: 'laser_dur',
    weapon: 'laser',
    name: 'Long Burn',
    tiers: { common: 0.4, rare: 0.6 },
    max: 3,
    desc: (v) => `Laser Lance fires ${pct(v)} longer`,
    apply: (_world, w, v) => {
      w!.stats.duration *= 1 + v;
    },
  },
  size('laser', 'Wider Beam', 'width'),
  cooldown('laser', 'Capacitor', 3),
  special('laser', 'overcharge', 'Overcharge', 'epic', 3, 'The beam burns 50% faster', (w) => {
    w.stats.flags.add('overcharge');
  }),
  special('laser', 'deathray', 'Death Ray', 'legendary', 6, 'Beam width x2.2, damage +60%, lasts 50% longer', (w) => {
    w.stats.size *= 2.2;
    w.stats.dmgMult *= 1.6;
    w.stats.duration *= 1.5;
  }),

  // phage swarm
  quantity('phage', 'Swarm Size', { rare: 1, epic: 2 }, 3, 'phages'),
  damage('phage', 'Burst Damage'),
  cooldown('phage', 'Incubation', 3),
  {
    id: 'phage_latch',
    weapon: 'phage',
    name: 'Rapid Injection',
    tiers: { common: 0.3, rare: 0.5 },
    max: 3,
    desc: (v) => `Phages inject ${pct(v)} faster`,
    apply: (_world, w, v) => {
      w!.stats.speed *= 1 + v;
    },
  },
  special('phage', 'lytic', 'Lytic Cycle', 'epic', 3, 'Bursts splash onto neighbouring segments', (w) => {
    w.stats.flags.add('lytic');
  }),
  special('phage', 'plague', 'Plague', 'legendary', 6, 'Kills release 3 phages, and their offspring can chain again', (w) => {
    w.stats.flags.add('plague');
  }),

  // defibrillator
  {
    id: 'defib_chain',
    weapon: 'defib',
    name: 'Longer Arc',
    tiers: { rare: 2, epic: 3 },
    max: 3,
    desc: (v) => `Each jolt jumps +${v} more segments`,
    apply: (_world, w, v) => {
      w!.stats.bounces += v;
    },
  },
  damage('defib', 'Jolt Damage'),
  cooldown('defib', 'Quick Charge', 3),
  quantity('defib', 'Second Paddle', { epic: 1 }, 2, 'jolts'),
  special('defib', 'charged', 'Charged Paddles', 'epic', 3, 'Jolts jump 4 more segments', (w) => {
    w.stats.bounces += 4;
  }),
  special('defib', 'arrest', 'Cardiac Arrest', 'legendary', 6, 'Every jolt stuns the trains for a moment', (w) => {
    w.stats.flags.add('arrest');
  }),

  // gravity well
  size('gravity', 'Wider Well', 'radius'),
  {
    id: 'gravity_dur',
    weapon: 'gravity',
    name: 'Stable Singularity',
    tiers: { common: 0.35, rare: 0.5 },
    max: 3,
    desc: (v) => `Wells stay open ${pct(v)} longer`,
    apply: (_world, w, v) => {
      w!.stats.duration *= 1 + v;
    },
  },
  damage('gravity', 'Crushing Force'),
  cooldown('gravity', 'Faster Collapse', 3),
  quantity('gravity', 'Binary Wells', { epic: 1 }, 2, 'wells'),
  special('gravity', 'horizon', 'Event Horizon', 'epic', 3, 'Wells grow 50% wider and last 40% longer', (w) => {
    w.stats.size *= 1.5;
    w.stats.duration *= 1.4;
  }),
  special('gravity', 'spaghetti', 'Spaghettification', 'legendary', 6, 'Segments in a well lose 2% of their max HP every tick', (w) => {
    w.stats.flags.add('spaghetti');
  }),

  // prism crystal
  quantity('prism', 'Twin Crystal', { epic: 1 }, 2, 'crystals'),
  damage('prism', 'Spectrum Damage'),
  cooldown('prism', 'Faster Spectrum', 3),
  size('prism', 'Bigger Crystal'),
  special('prism', 'dispersion', 'Dispersion', 'epic', 3, 'Capsules split into 5 rainbow shots instead of 3', (w) => {
    w.stats.flags.add('dispersion');
  }),
  special('prism', 'spectral', 'Spectral Storm', 'legendary', 6, '+1 crystal, and spectrum bolts pierce 3 segments', (w) => {
    w.stats.qty += 1;
    w.stats.flags.add('spectral');
  }),
];

/**
 * Evolutions (Survivor.io / Vampire Survivors style): invest in a weapon,
 * own its partner, and a one-time legendary transformation appears.
 */
const EVOLUTIONS: CardDef[] = [
  {
    id: 'evo_wildfire',
    weapon: 'swab',
    name: 'Wildfire',
    tiers: { legendary: 1 },
    max: 1,
    weight: 4,
    evo: { partner: 'meteor', picks: 3 },
    desc: () => 'Swabs grow 50% and burn twice as hard; every meteor leaves fire behind',
    apply: (world, w) => {
      w!.stats.size *= 1.5;
      w!.stats.dmgMult *= 2;
      world.owned('meteor')?.stats.flags.add('burn');
    },
  },
  {
    id: 'evo_rod',
    weapon: 'needle',
    name: 'Lightning Rod',
    tiers: { legendary: 1 },
    max: 1,
    weight: 4,
    evo: { partner: 'satellite', picks: 3 },
    desc: () => 'Needles arc lightning to two neighbours; clouds strike 30% faster',
    apply: (world, w) => {
      w!.stats.flags.add('arc');
      const sat = world.owned('satellite');
      if (sat) sat.stats.cdMult *= 0.7;
    },
  },
  {
    id: 'evo_slime',
    weapon: 'bubble',
    name: 'Slime Bath',
    tiers: { legendary: 1 },
    max: 1,
    weight: 4,
    evo: { partner: 'snot', picks: 3 },
    desc: () => 'Bubbles leave burning puddles; snot +1 and explodes when it expires',
    apply: (world, w) => {
      w!.stats.flags.add('puddle');
      const snot = world.owned('snot');
      if (snot) {
        snot.stats.qty += 1;
        snot.stats.flags.add('sneeze');
      }
    },
  },
  {
    id: 'evo_surgery',
    weapon: 'capsule',
    name: 'Surgical Strike',
    tiers: { legendary: 1 },
    max: 1,
    weight: 4,
    evo: { partner: 'scalpel', picks: 4 },
    desc: () => 'Capsules pierce +2 and hit 50% harder; scalpels +2',
    apply: (world, w) => {
      w!.stats.pierce += 2;
      w!.stats.dmgMult *= 1.5;
      const sc = world.owned('scalpel');
      if (sc) sc.stats.qty += 2;
    },
  },
  {
    id: 'evo_grid',
    weapon: 'tower',
    name: 'Power Grid',
    tiers: { legendary: 1 },
    max: 1,
    weight: 4,
    evo: { partner: 'roller', picks: 3 },
    desc: () => 'Towers +2 and last twice as long; rollers shove the train back',
    apply: (world, w) => {
      w!.stats.qty += 2;
      w!.stats.duration *= 2;
      world.owned('roller')?.stats.flags.add('knock');
    },
  },
  {
    id: 'evo_spectrum',
    weapon: 'laser',
    name: 'Spectrum Lance',
    tiers: { legendary: 1 },
    max: 1,
    weight: 4,
    evo: { partner: 'prism', picks: 3 },
    desc: () => 'The laser splits into a rainbow of 3 extra beams, damage +50%',
    apply: (_world, w) => {
      w!.stats.qty += 3;
      w!.stats.dmgMult *= 1.5;
      w!.stats.flags.add('rainbow');
    },
  },
  {
    id: 'evo_super',
    weapon: 'defib',
    name: 'Superconductor',
    tiers: { legendary: 1 },
    max: 1,
    weight: 4,
    evo: { partner: 'satellite', picks: 3 },
    desc: () => 'Jolts jump 6 more segments; clouds strike 30% faster',
    apply: (world, w) => {
      w!.stats.bounces += 6;
      const sat = world.owned('satellite');
      if (sat) sat.stats.cdMult *= 0.7;
    },
  },
];

/** Archero-style devil's bargains: only from gold chests, always with a catch. */
const BARGAINS: CardDef[] = [
  {
    id: 'bargain_blood',
    weapon: null,
    name: 'Blood Pact',
    tiers: { legendary: 1 },
    max: 1,
    bargain: true,
    when: (world) => world.revives > 0,
    desc: () => 'All damage +60%, but you lose a revive',
    apply: (world) => {
      world.globalDmg *= 1.6;
      world.revives -= 1;
    },
  },
  {
    id: 'bargain_greed',
    weapon: null,
    name: 'Greed',
    tiers: { legendary: 1 },
    max: 1,
    bargain: true,
    desc: () => 'Coins from this run doubled, but the train moves 12% faster',
    apply: (world) => {
      world.coinBonus += 1;
      world.slow = Math.max(-0.5, world.slow - 0.12);
    },
  },
  {
    id: 'bargain_overclock',
    weapon: null,
    name: 'Overclock',
    tiers: { legendary: 1 },
    max: 1,
    bargain: true,
    desc: () => 'All cooldowns -30%, but the train moves 10% faster',
    apply: (world) => {
      world.globalCd *= 0.7;
      world.slow = Math.max(-0.5, world.slow - 0.1);
    },
  },
  {
    id: 'bargain_glass',
    weapon: null,
    name: 'Glass Cannon',
    tiers: { legendary: 1 },
    max: 1,
    bargain: true,
    when: (world) => world.takeAlls > 0,
    desc: () => 'Crit damage +150%, but you lose a take-all',
    apply: (world) => {
      world.globalCritDmg += 1.5;
      world.takeAlls -= 1;
    },
  },
];

/**
 * Mythic rarity: only shows up on heavily rerolled chests, late gold chests,
 * or deep into endless. Big, run-defining effects.
 */
const MYTHIC_GLOBALS: CardDef[] = [
  {
    id: 'm_apex',
    weapon: null,
    name: 'Apex Predator',
    tiers: { mythic: 1 },
    max: 3,
    desc: () => 'All damage x1.8',
    apply: (world) => {
      world.globalDmg *= 1.8;
    },
  },
  {
    id: 'm_mito',
    weapon: null,
    name: 'Mitochondrial Surge',
    tiers: { mythic: 1 },
    max: 2,
    desc: () => 'All cooldowns -25%',
    apply: (world) => {
      world.globalCd *= 0.75;
    },
  },
  {
    id: 'm_poly',
    weapon: null,
    name: 'Polyploidy',
    tiers: { mythic: 1 },
    max: 2,
    desc: () => 'Every weapon you hold fires +1 projectile',
    apply: (world) => {
      for (const w of world.weapons) w.stats.qty += 1;
    },
  },
  {
    id: 'm_heart',
    weapon: null,
    name: 'Second Heart',
    tiers: { mythic: 1 },
    max: 2,
    desc: () => '+1 revive and +1 take-all',
    apply: (world) => {
      world.revives += 1;
      world.takeAlls += 1;
    },
  },
  {
    id: 'm_contagion',
    weapon: null,
    name: 'Contagion',
    tiers: { mythic: 1 },
    max: 2,
    desc: () => 'Dying segments burst for 12% of their max HP onto their neighbours',
    apply: (world) => {
      world.contagion += 0.12;
    },
  },
  {
    id: 'm_symbiosis',
    weapon: null,
    name: 'Symbiosis',
    tiers: { mythic: 1 },
    max: 1,
    desc: () => 'Carry one more weapon this run',
    apply: (world) => {
      world.maxWeapons += 1;
    },
  },
];

/** Per-weapon cards that keep long runs interesting once the basics are maxed. */
function longRunCards(id: WeaponId): CardDef[] {
  const name = WEAPONS[id].name;
  return [
    {
      id: `${id}_ascend`,
      weapon: id,
      name: `Ascended ${name}`,
      tiers: { mythic: 1 },
      max: 3,
      when: (world) => upgradesTaken(world, id) >= 5,
      desc: () => `${name}: damage x2, +1 quantity, cooldown -15%`,
      apply: (_world, w) => {
        w!.stats.dmgMult *= 2;
        w!.stats.qty += 1;
        w!.stats.cdMult *= 0.85;
      },
    },
    {
      id: `${id}_overdrive`,
      weapon: id,
      name: `${name} Overdrive`,
      tiers: { legendary: 1 },
      weight: 1.2,
      when: (world) => upgradesTaken(world, id) >= 8,
      desc: () => `${name}: damage +35%, cooldown -8%. Stacks forever`,
      apply: (_world, w) => {
        w!.stats.dmgMult *= 1.35;
        w!.stats.cdMult *= 0.92;
      },
    },
  ];
}

const GET_CARDS: CardDef[] = (Object.keys(WEAPONS) as WeaponId[])
  .filter((id) => id !== 'capsule')
  .map((id) => ({
    id: `get_${id}`,
    weapon: id,
    grants: id,
    name: WEAPONS[id].name,
    tiers: { [WEAPONS[id].getRarity]: 1 },
    max: 1,
    weight: 2.4,
    desc: () => WEAPONS[id].blurb,
    apply: (world: World) => {
      world.addWeapon(id);
    },
  }));

export const ALL_CARDS: readonly CardDef[] = [
  ...GET_CARDS,
  ...GLOBAL_CARDS,
  ...WEAPON_CARDS,
  ...EVOLUTIONS,
  ...MYTHIC_GLOBALS,
  ...(Object.keys(WEAPONS) as WeaponId[]).flatMap(longRunCards),
];
export { BARGAINS, EVOLUTIONS };

/**
 * Rarity odds by "luck": 0 for a fresh chest, +1 for each reroll on it. The
 * climb keeps going: deep rerolls are mostly legendary and mythic.
 */
const RARITY_LADDER: Record<'normal' | 'elite', Record<Rarity, number>[]> = {
  normal: [
    { common: 52, rare: 32, epic: 12, legendary: 4, mythic: 0 },
    { common: 18, rare: 36, epic: 32, legendary: 14, mythic: 0 },
    { common: 6, rare: 26, epic: 40, legendary: 26, mythic: 2 },
    { common: 0, rare: 14, epic: 40, legendary: 38, mythic: 8 },
    { common: 0, rare: 6, epic: 32, legendary: 44, mythic: 18 },
    { common: 0, rare: 2, epic: 22, legendary: 46, mythic: 30 },
    { common: 0, rare: 0, epic: 14, legendary: 44, mythic: 42 },
    { common: 0, rare: 0, epic: 8, legendary: 40, mythic: 52 },
  ],
  elite: [
    { common: 0, rare: 30, epic: 48, legendary: 20, mythic: 2 },
    { common: 0, rare: 14, epic: 48, legendary: 32, mythic: 6 },
    { common: 0, rare: 6, epic: 40, legendary: 40, mythic: 14 },
    { common: 0, rare: 2, epic: 30, legendary: 44, mythic: 24 },
    { common: 0, rare: 0, epic: 20, legendary: 44, mythic: 36 },
    { common: 0, rare: 0, epic: 12, legendary: 40, mythic: 48 },
  ],
};

export function rarityOdds(elite: boolean, luck: number): Record<Rarity, number> {
  const steps = RARITY_LADDER[elite ? 'elite' : 'normal'];
  return steps[Math.min(steps.length - 1, Math.max(0, Math.floor(luck)))];
}

/** Mythic-only cards wait until a chest is heavily rerolled, the run is long, or endless gets deep. */
function mythicOpen(world: World, elite: boolean, luck: number): boolean {
  return luck >= 2 || (elite && world.picksTaken >= 10) || world.mutation >= 2;
}

function takenCount(world: World, card: CardDef): number {
  if (card.grants) return world.owned(card.grants) ? 1 : 0;
  if (card.weapon === null) return world.globalStacks.get(card.id) ?? 0;
  return world.owned(card.weapon)?.stacks.get(card.id) ?? 0;
}

export function upgradesTaken(world: World, weapon: WeaponId): number {
  const w = world.owned(weapon);
  if (!w) return 0;
  let n = 0;
  for (const v of w.stacks.values()) n += v;
  return n;
}

/** Whether a card can still be offered (and applied) right now. */
export function cardAvailable(world: World, card: CardDef): boolean {
  if (card.grants) return new Set(world.setup.loadout).has(card.grants) && !world.owned(card.grants) && world.weaponSlotsFree;
  if (card.max !== undefined && takenCount(world, card) >= card.max) return false;
  if (card.when && !card.when(world)) return false;
  if (card.weapon === null) return true;
  const w = world.owned(card.weapon);
  if (!w) return false;
  if (card.evo) return !!world.owned(card.evo.partner) && upgradesTaken(world, card.weapon) >= card.evo.picks;
  return w.level >= (card.minLevel ?? 1);
}

export function availableCards(world: World): CardDef[] {
  return ALL_CARDS.filter((card) => cardAvailable(world, card));
}

/** Used by take-all: an earlier card in the same offer may have used the last slot. */
export function canApply(world: World, offered: OfferedCard): boolean {
  return cardAvailable(world, offered.def);
}

/**
 * Three distinct cards. `luck` 0 = fresh chest; each reroll raises it and
 * shifts the odds toward legendary and mythic, with no ceiling until the
 * ladder tops out.
 */
export function rollCards(world: World, elite: boolean, luck = 0, count = 3): OfferedCard[] {
  const odds = rarityOdds(elite, luck);
  const base = rarityOdds(elite, 0);
  const mythic = mythicOpen(world, elite, luck);
  const pool = availableCards(world).filter((c) => mythic || !isMythicOnly(c));
  const out: OfferedCard[] = [];
  while (out.length < count && pool.length > 0) {
    const card = world.rng.weighted(pool, (c) => {
      const tiers = Object.keys(c.tiers) as Rarity[];
      // Single-rarity cards get likelier as their rarity does, relative to a fresh chest.
      const r = tiers[0];
      const scale = tiers.length === 1 ? Math.min(3, Math.max(0.12, odds[r] / Math.max(base[r], 4))) : 1;
      return (c.weight ?? (c.weapon === null ? 0.7 : 1)) * scale;
    });
    pool.splice(pool.indexOf(card), 1);
    out.push(withRarity(world, card, odds, mythic));
  }
  // Gold chests sometimes slip a devil's bargain in as the last card.
  if (elite && out.length === count && world.rng.chance(0.35)) {
    const bargains = BARGAINS.filter((b) => cardAvailable(world, b));
    if (bargains.length) out[count - 1] = withRarity(world, world.rng.pick(bargains), odds, mythic);
  }
  return out;
}

function isMythicOnly(card: CardDef): boolean {
  const tiers = Object.keys(card.tiers);
  return tiers.length === 1 && tiers[0] === 'mythic';
}

function withRarity(world: World, card: CardDef, odds: Record<Rarity, number>, mythic: boolean): OfferedCard {
  let tiers = Object.keys(card.tiers) as Rarity[];
  // A card's mythic tier stays locked until mythics are in play (mythic-only cards are filtered earlier).
  if (!mythic && tiers.length > 1) tiers = tiers.filter((t) => t !== 'mythic');
  let rarity = tiers[0];
  if (tiers.length > 1) {
    // If the odds rule out every tier (elite + common-only), fall back to the best tier.
    const usable = tiers.filter((t) => odds[t] > 0);
    rarity = usable.length ? world.rng.weighted(usable, (t) => odds[t]) : tiers[tiers.length - 1];
  }
  return { def: card, rarity, value: card.tiers[rarity]! };
}

export function applyCard(world: World, offered: OfferedCard): void {
  const card = offered.def;
  if (card.grants) {
    card.apply(world, null, offered.value);
    return;
  }
  if (card.weapon === null) {
    world.globalStacks.set(card.id, (world.globalStacks.get(card.id) ?? 0) + 1);
    card.apply(world, null, offered.value);
    return;
  }
  const w = world.owned(card.weapon);
  if (!w) return;
  w.stacks.set(card.id, (w.stacks.get(card.id) ?? 0) + 1);
  card.apply(world, w, offered.value);
}
