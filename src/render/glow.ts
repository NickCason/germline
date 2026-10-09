/**
 * Soft radial glows, cached per colour. Drawn with additive blending they
 * light up their surroundings, and the compositor's bloom picks them up.
 */
const cache = new Map<string, HTMLCanvasElement>();

export function glowSprite(color: string): HTMLCanvasElement {
  let c = cache.get(color);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, color);
    grad.addColorStop(0.25, withAlpha(color, 0.55));
    grad.addColorStop(0.6, withAlpha(color, 0.14));
    grad.addColorStop(1, withAlpha(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    cache.set(color, c);
  }
  return c;
}

/**
 * With the WebGL compositor, glows go to a separate emissive layer (so only
 * light blooms, not the bright cartoon bodies). Without it they go straight
 * onto the scene. The emissive context mirrors the scene's field transform.
 */
let target: CanvasRenderingContext2D | null = null;

export function setGlowTarget(t: CanvasRenderingContext2D | null): void {
  target = t;
}

/** The context light should be drawn into. */
export function glowCtx(ctx: CanvasRenderingContext2D): CanvasRenderingContext2D {
  return target ?? ctx;
}

/** Start a batch of additive glows; call endGlow() after. */
export function beginGlow(ctx: CanvasRenderingContext2D): void {
  glowCtx(ctx).globalCompositeOperation = 'lighter';
}

export function endGlow(ctx: CanvasRenderingContext2D): void {
  const g = glowCtx(ctx);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
}

/** One glow of radius r (field units). Must be inside beginGlow/endGlow, in untransformed field space. */
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 1): void {
  const g = glowCtx(ctx);
  g.globalAlpha = alpha;
  g.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
}

/** '#rrggbb' or 'rgb(...)' → rgba with the given alpha. */
export function withAlpha(color: string, a: number): string {
  if (color.startsWith('#')) {
    const n = parseInt(color.slice(1, 7), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  const m = color.match(/[\d.]+/g);
  if (!m) return color;
  return `rgba(${m[0]},${m[1]},${m[2]},${a})`;
}
