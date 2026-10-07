import { describe, expect, it } from 'vitest';
import { fmt } from './format';

describe('fmt', () => {
  it('keeps small numbers whole', () => {
    expect(fmt(0)).toBe('0');
    expect(fmt(36.7)).toBe('36');
    expect(fmt(9540)).toBe('9540');
  });

  it('compacts large numbers without rounding up', () => {
    expect(fmt(12_340)).toBe('12.3K');
    expect(fmt(120_000)).toBe('120K');
    expect(fmt(999_999)).toBe('999K');
    expect(fmt(1_234_567)).toBe('1.23M');
    expect(fmt(10_000)).toBe('10K');
    expect(fmt(2.5e9)).toBe('2.5B');
  });
});
