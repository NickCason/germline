import { SEG_RADIUS } from '../game/constants';
import { COSTUMES, type CostumeId } from '../game/costumes';
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
  readonly flash: Sprite;
  readonly chest: Sprite;
  readonly elite: Sprite;
  /** Head body and spikes; the face is drawn live so it can blink and chomp. */
  readonly head: Sprite;
  readonly crack1: Sprite;
  readonly crack2: Sprite;
  readonly splat: Sprite;
  readonly palette: Palette;

  constructor(theme: ThemeId, k: number) {
    const p = (this.palette = PALETTES[theme]);
    this.ringA = ring(p, k, false);
    this.ringB = ring(p, k, true);
    this.flash = makeSprite(SEG_RADIUS * 2 + 8, SEG_RADIUS * 2 + 8, k, (g) => {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(0, 0, SEG_RADIUS + 1, 0, Math.PI * 2);
      g.fill();
    });
    this.chest = chest(k, false);
    this.elite = chest(k, true);
    this.head = virusHead(p, k);
    this.crack1 = cracks(p, k, 1);
    this.crack2 = cracks(p, k, 2);
    this.splat = splat(p, k);
  }
}

/** Fracture lines that appear as a segment loses HP. */
function cracks(p: Palette, k: number, level: number): Sprite {
  const R = SEG_RADIUS;
  return makeSprite(R * 2, R * 2, k, (g) => {
    g.strokeStyle = p.bodyDark;
    g.lineWidth = 2;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const lines: [number, number][][] = [
      [
        [-14, -10],
        [-6, -4],
        [-9, 4],
        [-2, 10],
      ],
      [
        [12, -14],
        [6, -6],
        [12, 2],
      ],
    ];
    if (level > 1) {
      lines.push(
        [
          [-18, 6],
          [-10, 8],
          [-6, 18],
        ],
        [
          [4, 4],
          [10, 10],
          [16, 8],
        ],
        [
          [-2, -18],
          [0, -10],
          [-4, -4],
        ],
      );
    }
    for (const line of lines) {
      g.beginPath();
      line.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
    }
  });
}

/** A gooey stain left where a segment burst. */
function splat(p: Palette, k: number): Sprite {
  return makeSprite(96, 96, k, (g) => {
    g.fillStyle = p.body;
    g.globalAlpha = 0.5;
    g.beginPath();
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 24 + (i % 3 === 0 ? 12 : i % 2 === 0 ? 4 : 8);
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.4;
      g.beginPath();
      g.arc(Math.cos(a) * 38, Math.sin(a) * 38, 4 + (i % 3) * 2, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 0.35;
    g.fillStyle = p.bodyLight;
    g.beginPath();
    g.arc(-6, -6, 12, 0, Math.PI * 2);
    g.fill();
  });
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
    // fluorescent rim light along the lower edge, in the stain's colour
    g.save();
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.clip();
    const rim = g.createRadialGradient(R * 0.45, R * 0.55, R * 0.2, R * 0.45, R * 0.55, R * 1.1);
    rim.addColorStop(0, 'rgba(0,0,0,0)');
    rim.addColorStop(0.75, 'rgba(0,0,0,0)');
    rim.addColorStop(1, p.rim);
    g.globalAlpha = 0.55;
    g.fillStyle = rim;
    g.fillRect(-R, -R, R * 2, R * 2);
    g.restore();
    // glowing nucleus
    const nuc = g.createRadialGradient(R * 0.12, R * 0.1, 0, R * 0.12, R * 0.1, R * 0.42);
    nuc.addColorStop(0, 'rgba(255,255,255,0.55)');
    nuc.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = nuc;
    g.beginPath();
    g.arc(R * 0.12, R * 0.1, R * 0.42, 0, Math.PI * 2);
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

/** A spiky virus body (no face; the renderer draws an animated one on top). */
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
    g.save();
    g.clip();
    const rim = g.createRadialGradient(R * 0.4, R * 0.5, R * 0.3, R * 0.4, R * 0.5, R * 1.1);
    rim.addColorStop(0.7, 'rgba(0,0,0,0)');
    rim.addColorStop(1, p.rim);
    g.globalAlpha = 0.6;
    g.fillStyle = rim;
    g.fillRect(-R, -R, R * 2, R * 2);
    g.restore();
    g.globalAlpha = 0.5;
    g.fillStyle = '#ffffff';
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

/**
 * The hero: a heart-shaped cell in one of several costumes. Pupils and the
 * syringe are drawn per frame so they can follow the aim.
 */
export function drawHeroBody(g: CanvasRenderingContext2D, costume: CostumeId, pupils: boolean): void {
  const [dark, light] = COSTUMES[costume].heart;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath();
  g.ellipse(0, 26, 22, 6, 0, 0, Math.PI * 2);
  g.fill();
  if (costume === 'royal') {
    // cape behind the body
    g.fillStyle = '#b3132e';
    g.strokeStyle = INK;
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(-20, -6);
    g.quadraticCurveTo(-36, 14, -30, 28);
    g.lineTo(30, 28);
    g.quadraticCurveTo(36, 14, 20, -6);
    g.closePath();
    g.fill();
    g.stroke();
  }
  const grad = g.createRadialGradient(-8, -10, 2, 0, 0, 30);
  grad.addColorStop(0, light);
  grad.addColorStop(1, dark);
  g.fillStyle = grad;
  g.strokeStyle = INK;
  g.lineWidth = 3;
  heartPath(g, 25);
  g.fill();
  g.stroke();
  if (costume === 'ninja') {
    // mask band across the eyes, headband tails streaming behind
    g.fillStyle = '#2a2238';
    g.beginPath();
    g.moveTo(-23, -14);
    g.lineTo(23, -14);
    g.lineTo(21, 2);
    g.lineTo(-21, 2);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(-22, -10);
    g.quadraticCurveTo(-34, -14, -42, -4);
    g.lineTo(-38, 0);
    g.quadraticCurveTo(-32, -8, -22, -4);
    g.closePath();
    g.fill();
    g.stroke();
  }
  g.fillStyle = '#ffffff';
  g.strokeStyle = INK;
  g.lineWidth = 2;
  for (const ex of [-9, 9]) {
    g.beginPath();
    g.ellipse(ex, -4, 7, 8, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  if (pupils) {
    g.fillStyle = INK;
    for (const ex of costume === 'pirate' ? [-9] : [-9, 9]) {
      g.beginPath();
      g.arc(ex + 1.5, -3, 3.4, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalAlpha = 0.65;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.ellipse(-14, -14, 5, 3, -0.6, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
  g.strokeStyle = INK;
  switch (costume) {
    case 'nurse': {
      g.fillStyle = '#ffffff';
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(-15, -20);
      g.lineTo(-11, -36);
      g.quadraticCurveTo(0, -41, 11, -36);
      g.lineTo(15, -20);
      g.quadraticCurveTo(0, -25, -15, -20);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = '#ff4f6d';
      g.fillRect(-2.5, -35, 5, 12);
      g.fillRect(-6, -31.5, 12, 5);
      break;
    }
    case 'pirate': {
      g.fillStyle = '#d7263d';
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(-27, -12);
      g.quadraticCurveTo(-18, -34, 0, -34);
      g.quadraticCurveTo(18, -34, 27, -12);
      g.quadraticCurveTo(14, -22, 0, -22);
      g.quadraticCurveTo(-14, -22, -27, -12);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = '#ffffff';
      for (const [dx, dy] of [
        [-14, -26],
        [0, -29],
        [14, -26],
      ]) {
        g.beginPath();
        g.arc(dx, dy, 2, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#d7263d';
      g.beginPath();
      g.moveTo(26, -14);
      g.lineTo(38, -20);
      g.lineTo(34, -10);
      g.closePath();
      g.moveTo(26, -12);
      g.lineTo(36, -4);
      g.lineTo(28, -4);
      g.closePath();
      g.fill();
      g.stroke();
      // eyepatch over the right eye
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(-22, -16);
      g.lineTo(24, 2);
      g.stroke();
      g.fillStyle = '#1b1426';
      g.beginPath();
      g.ellipse(9, -4, 8, 8.5, 0, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'wizard': {
      g.fillStyle = '#6c4bd1';
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(-17, -22);
      g.quadraticCurveTo(-6, -40, 2, -60);
      g.quadraticCurveTo(10, -42, 17, -22);
      g.closePath();
      g.fill();
      g.stroke();
      g.beginPath();
      g.ellipse(0, -21, 27, 6, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = '#ffd34d';
      for (const [sx, sy, r] of [
        [-4, -32, 3.5],
        [6, -44, 2.6],
        [5, -27, 2],
      ]) {
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const rr = i % 2 === 0 ? r : r * 0.45;
          const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
          g.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr);
        }
        g.closePath();
        g.fill();
      }
      break;
    }
    case 'astronaut': {
      g.fillStyle = 'rgba(190,230,255,0.22)';
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(0, -2, 33, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.75)';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(0, -2, 27, Math.PI * 1.1, Math.PI * 1.45);
      g.stroke();
      g.strokeStyle = INK;
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(16, -30);
      g.lineTo(22, -44);
      g.stroke();
      g.fillStyle = '#ff4f6d';
      g.beginPath();
      g.arc(23, -46, 4, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      break;
    }
    case 'royal': {
      g.fillStyle = '#ffc93c';
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(-15, -22);
      g.lineTo(-17, -40);
      g.lineTo(-8, -31);
      g.lineTo(0, -44);
      g.lineTo(8, -31);
      g.lineTo(17, -40);
      g.lineTo(15, -22);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = '#e63e6d';
      g.beginPath();
      g.arc(0, -27, 3.5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      break;
    }
  }
}

export function heroSprite(costume: CostumeId, k: number): Sprite {
  return makeSprite(100, 124, k, (g) => drawHeroBody(g, costume, false));
}

export function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const gg = (n >> 8) & 255;
  const b = n & 255;
  const mix = (c: number) => Math.round(c + (255 - c) * amt);
  return `rgb(${mix(r)},${mix(gg)},${mix(b)})`;
}
