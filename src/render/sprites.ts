import { SEG_RADIUS } from '../game/constants';
import type { ThemeId } from '../game/stage';
import { PALETTES, type Palette } from '../game/themes';

/** A pre-rendered image plus its size in field units. */
export interface Sprite {
  c: HTMLCanvasElement;
  w: number;
  h: number;
}

export const INK = '#21142e';

export function makeSprite(w: number, h: number, k: number, draw: (g: CanvasRenderingContext2D) => void): Sprite {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * k));
  c.height = Math.max(1, Math.ceil(h * k));
  const g = c.getContext('2d')!;
  g.scale(k, k);
  g.translate(w / 2, h / 2);
  draw(g);
  return { c, w, h };
}

export function drawSprite(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, scale = 1): void {
  const w = s.w * scale;
  const h = s.h * scale;
  ctx.drawImage(s.c, x - w / 2, y - h / 2, w, h);
}

export class ThemeSprites {
  readonly ringA: Sprite;
  readonly ringB: Sprite;
  readonly outline: Sprite;
  readonly flash: Sprite;
  readonly chest: Sprite;
  readonly elite: Sprite;
  readonly head: Sprite;
  readonly hero: Sprite;
  readonly palette: Palette;

  constructor(theme: ThemeId, k: number) {
    const p = (this.palette = PALETTES[theme]);
    this.ringA = ring(p, k, false);
    this.ringB = ring(p, k, true);
    this.outline = silhouette(k);
    this.flash = makeSprite(SEG_RADIUS * 2 + 8, SEG_RADIUS * 2 + 8, k, (g) => {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(0, 0, SEG_RADIUS + 1, 0, Math.PI * 2);
      g.fill();
    });
    this.chest = chest(k, false);
    this.elite = chest(k, true);
    this.head = virusHead(p, k);
    this.hero = heartHero(k);
  }
}

function ring(p: Palette, k: number, alt: boolean): Sprite {
  const R = SEG_RADIUS;
  return makeSprite(R * 2 + 10, R * 2 + 10, k, (g) => {
    const grad = g.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
    grad.addColorStop(0, p.bodyLight);
    grad.addColorStop(0.6, alt ? p.spot : p.body);
    grad.addColorStop(1, alt ? p.bodyDark : p.spot);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.fill();
    // a soft rib line; overlapping rings turn these into a segmented body
    g.lineWidth = 1.6;
    g.strokeStyle = p.bodyDark;
    g.globalAlpha = 0.55;
    g.stroke();
    g.globalAlpha = 0.5;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(-R * 0.38, -R * 0.45, R * 0.24, R * 0.13, -0.5, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  });
}

/** Ink silhouette drawn under every ring so the whole train reads as one body. */
function silhouette(k: number): Sprite {
  const R = SEG_RADIUS;
  return makeSprite(R * 2 + 16, R * 2 + 22, k, (g) => {
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.beginPath();
    g.ellipse(0, 6, R + 2, R * 0.92, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = INK;
    g.beginPath();
    g.arc(0, 0, R + 2.6, 0, Math.PI * 2);
    g.fill();
  });
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function chest(k: number, elite: boolean): Sprite {
  const body = elite ? '#ffc93c' : '#2ec4b0';
  const lid = elite ? '#ffe594' : '#6fe6d3';
  const band = elite ? '#d9971a' : '#1e8f81';
  return makeSprite(56, 52, k, (g) => {
    g.lineJoin = 'round';
    g.lineWidth = 3;
    g.strokeStyle = INK;
    g.fillStyle = body;
    roundRect(g, -21, -6, 42, 24, 5);
    g.fill();
    g.stroke();
    g.fillStyle = lid;
    roundRect(g, -23, -17, 46, 14, 6);
    g.fill();
    g.stroke();
    g.fillStyle = band;
    g.fillRect(-13, -15, 5, 31);
    g.fillRect(8, -15, 5, 31);
    g.fillStyle = elite ? '#e63e6d' : '#ffd34d';
    roundRect(g, -5, -8, 10, 12, 3);
    g.fill();
    g.lineWidth = 2;
    g.stroke();
    if (elite) {
      // tiny crown so gold chests stand out at a glance
      g.lineWidth = 2.5;
      g.fillStyle = '#ffe594';
      g.beginPath();
      g.moveTo(-12, -18);
      g.lineTo(-12, -25);
      g.lineTo(-6, -21);
      g.lineTo(0, -28);
      g.lineTo(6, -21);
      g.lineTo(12, -25);
      g.lineTo(12, -18);
      g.closePath();
      g.fill();
      g.stroke();
    }
  });
}

/** A spiky, furious virus; faces right. */
function virusHead(p: Palette, k: number): Sprite {
  const R = 36;
  return makeSprite(R * 2 + 36, R * 2 + 36, k, (g) => {
    g.lineJoin = 'round';
    g.lineCap = 'round';
    // spike proteins
    const spikes = 10;
    for (let i = 0; i < spikes; i++) {
      const a = (i / spikes) * Math.PI * 2 + 0.2;
      const x0 = Math.cos(a) * (R - 4);
      const y0 = Math.sin(a) * (R - 4);
      const x1 = Math.cos(a) * (R + 9);
      const y1 = Math.sin(a) * (R + 9);
      g.strokeStyle = INK;
      g.lineWidth = 8;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
      g.strokeStyle = p.horn;
      g.lineWidth = 4;
      g.stroke();
      g.fillStyle = p.horn;
      g.lineWidth = 2.5;
      g.strokeStyle = INK;
      g.beginPath();
      g.arc(Math.cos(a) * (R + 12), Math.sin(a) * (R + 12), 5.5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    const grad = g.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.15, 0, 0, R);
    grad.addColorStop(0, lighten(p.head, 0.35));
    grad.addColorStop(1, p.head);
    g.fillStyle = grad;
    g.strokeStyle = p.headDark;
    g.lineWidth = 3.5;
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    // face, nudged toward the direction of travel
    const fx = 7;
    g.fillStyle = '#ffffff';
    g.strokeStyle = INK;
    g.lineWidth = 2.5;
    for (const ex of [-11, 11]) {
      g.beginPath();
      g.ellipse(fx + ex, -6, 8, 9.5, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = INK;
      g.beginPath();
      g.arc(fx + ex + 3, -4, 4.2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
    }
    // angry brows
    g.lineWidth = 4.5;
    g.beginPath();
    g.moveTo(fx - 20, -20);
    g.lineTo(fx - 5, -14);
    g.moveTo(fx + 20, -20);
    g.lineTo(fx + 5, -14);
    g.stroke();
    // snarling mouth with fangs
    g.fillStyle = '#3a0d18';
    g.lineWidth = 2.5;
    roundRect(g, fx - 12, 9, 24, 12, 6);
    g.fill();
    g.stroke();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(fx - 8, 10);
    g.lineTo(fx - 4, 10);
    g.lineTo(fx - 6, 16);
    g.closePath();
    g.moveTo(fx + 4, 10);
    g.lineTo(fx + 8, 10);
    g.lineTo(fx + 6, 16);
    g.closePath();
    g.fill();
    g.globalAlpha = 0.5;
    g.beginPath();
    g.ellipse(-R * 0.45, -R * 0.5, 8, 5, -0.6, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  });
}

export function heartPath(g: CanvasRenderingContext2D, s: number): void {
  g.beginPath();
  g.moveTo(0, s * 0.95);
  g.bezierCurveTo(-s * 1.25, s * 0.15, -s * 1.05, -s * 0.95, -s * 0.5, -s * 0.95);
  g.bezierCurveTo(-s * 0.18, -s * 0.95, 0, -s * 0.7, 0, -s * 0.45);
  g.bezierCurveTo(0, -s * 0.7, s * 0.18, -s * 0.95, s * 0.5, -s * 0.95);
  g.bezierCurveTo(s * 1.05, -s * 0.95, s * 1.25, s * 0.15, 0, s * 0.95);
  g.closePath();
}

/** The hero without pupils or syringe; those follow the aim each frame. */
function heartHero(k: number): Sprite {
  return makeSprite(70, 70, k, (g) => {
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath();
    g.ellipse(0, 25, 22, 6, 0, 0, Math.PI * 2);
    g.fill();
    const grad = g.createRadialGradient(-8, -10, 2, 0, 0, 30);
    grad.addColorStop(0, '#ff9db0');
    grad.addColorStop(1, '#ef3a5d');
    g.fillStyle = grad;
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.lineJoin = 'round';
    heartPath(g, 25);
    g.fill();
    g.stroke();
    g.fillStyle = '#ffffff';
    g.lineWidth = 2;
    for (const ex of [-9, 9]) {
      g.beginPath();
      g.ellipse(ex, -4, 7, 8, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    g.globalAlpha = 0.65;
    g.beginPath();
    g.ellipse(-14, -14, 5, 3, -0.6, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  });
}

export function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const gg = (n >> 8) & 255;
  const b = n & 255;
  const mix = (c: number) => Math.round(c + (255 - c) * amt);
  return `rgb(${mix(r)},${mix(gg)},${mix(b)})`;
}
