import { describe, expect, it } from 'vitest';
import { ALL_CARDS, BARGAINS } from '../game/upgrades';
import { hasIcon } from './icons';

describe('icons', () => {
  it('every card without a weapon has its own icon', () => {
    const missing = [...ALL_CARDS, ...BARGAINS].filter((c) => !c.weapon && !c.bargain && !hasIcon(c.id)).map((c) => c.id);
    expect(missing).toEqual([]);
  });
});
