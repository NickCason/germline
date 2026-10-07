import type { ThemeId } from './stage';

export interface Palette {
  floor: string;
  floorAlt: string;
  floorLine: string;
  debris: string;
  body: string;
  bodyDark: string;
  bodyLight: string;
  spot: string;
  head: string;
  headDark: string;
  horn: string;
  /** Particle colours when a segment pops. */
  pop: string[];
}

export const PALETTES: Record<ThemeId, Palette> = {
  slate: {
    floor: '#3a3e5b',
    floorAlt: '#343852',
    floorLine: '#2a2d43',
    debris: '#4d5274',
    body: '#d98b7b',
    bodyDark: '#5a2d29',
    bodyLight: '#f6bfae',
    spot: '#b5685a',
    head: '#7b4636',
    headDark: '#3a1f17',
    horn: '#ecc77d',
    pop: ['#f6bfae', '#d98b7b', '#ffe3d8'],
  },
  crimson: {
    floor: '#5b2229',
    floorAlt: '#521e25',
    floorLine: '#43171d',
    debris: '#6e2f37',
    body: '#cdeae4',
    bodyDark: '#2c4a47',
    bodyLight: '#ffffff',
    spot: '#97c6be',
    head: '#f19fb0',
    headDark: '#5e2335',
    horn: '#ffd166',
    pop: ['#ffffff', '#cdeae4', '#97c6be'],
  },
  swamp: {
    floor: '#253a2e',
    floorAlt: '#213428',
    floorLine: '#1a2a20',
    debris: '#33503f',
    body: '#b78ce2',
    bodyDark: '#3b2357',
    bodyLight: '#e2ccff',
    spot: '#9067c4',
    head: '#6c3fa1',
    headDark: '#2c1745',
    horn: '#a2e66f',
    pop: ['#e2ccff', '#b78ce2', '#a2e66f'],
  },
  violet: {
    floor: '#2f2546',
    floorAlt: '#2a2140',
    floorLine: '#201933',
    debris: '#40355e',
    body: '#f3a85c',
    bodyDark: '#5c3210',
    bodyLight: '#ffd6a8',
    spot: '#d8853a',
    head: '#c0582b',
    headDark: '#4f1f0b',
    horn: '#fff0b3',
    pop: ['#ffd6a8', '#f3a85c', '#fff0b3'],
  },
  ice: {
    floor: '#1f3b46',
    floorAlt: '#1b343e',
    floorLine: '#152a32',
    debris: '#2b5060',
    body: '#93d6f5',
    bodyDark: '#1d4862',
    bodyLight: '#e4f7ff',
    spot: '#6bb6dc',
    head: '#3c7ea7',
    headDark: '#16354a',
    horn: '#ffffff',
    pop: ['#e4f7ff', '#93d6f5', '#ffffff'],
  },
  amber: {
    floor: '#3e3121',
    floorAlt: '#372b1c',
    floorLine: '#2b2115',
    debris: '#55432c',
    body: '#9fe36e',
    bodyDark: '#2e5118',
    bodyLight: '#d6ffb4',
    spot: '#78c049',
    head: '#4f8a2c',
    headDark: '#1f3a10',
    horn: '#ffb347',
    pop: ['#d6ffb4', '#9fe36e', '#ffb347'],
  },
};
