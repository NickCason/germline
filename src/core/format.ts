const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'aa', 'ab', 'ac', 'ad', 'ae', 'af'];

// Compact number for HP labels and damage pops: 9540, 12.3K, 123K, 1.23M.
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  const sign = n < 0 ? '-' : '';
  n = Math.abs(n);
  if (n < 10_000) return sign + Math.floor(n).toString();
  let tier = Math.floor(Math.log10(n) / 3);
  tier = Math.min(tier, SUFFIXES.length - 1);
  const scaled = n / Math.pow(1000, tier);
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  // Truncate rather than round so 999.96K never displays as "1000K".
  const factor = Math.pow(10, digits);
  const shown = Math.floor(scaled * factor) / factor;
  let text = shown.toFixed(digits);
  if (digits > 0) text = text.replace(/0+$/, '').replace(/\.$/, '');
  return sign + text + SUFFIXES[tier];
}

export function pct(fraction: number, digits = 0): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}
