import { heartPath, INK } from './sprites';

/**
 * Hand-drawn (well, code-drawn) icons for weapons, cards and currencies,
 * rendered once to data URLs so the DOM UI and canvas share one look.
 */
export type IconId =
  | 'capsule'
  | 'swab'
  | 'needle'
  | 'bubble'
  | 'snot'
  | 'roller'
  | 'tower'
  | 'scalpel'
  | 'meteor'
  | 'satellite'
  | 'g_dmg'
  | 'g_crit'
  | 'g_critdmg'
  | 'g_cd'
  | 'g_slow'
  | 'g_coin'
  | 'coin'
  | 'shard'
  | 'atk'
  | 'chest'
  | 'chestOpen'
  | 'lock'
  | 'heart'
  | 'virus'
  | 'gear';

type Draw = (g: CanvasRenderingContext2D) => void;

const cache = new Map<string, string>();

export function iconUrl(id: IconId, px = 96): string {
  const key = `${id}@${px}`;
  let url = cache.get(key);
  if (!url) {
    const c = document.createElement('canvas');
    c.width = c.height = px;
    const g = c.getContext('2d')!;
    g.scale(px / 64, px / 64);
    g.translate(32, 32);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    DRAW[id](g);
    url = c.toDataURL('image/png');
    cache.set(key, url);
  }
  return url;
}

export function iconImg(id: IconId, cls = 'icon'): HTMLImageElement {
  const img = new Image();
  img.src = iconUrl(id);
  img.alt = '';
  img.className = cls;
  img.draggable = false;
  return img;
}

function outline(g: CanvasRenderingContext2D, w = 3): void {
  g.strokeStyle = INK;
  g.lineWidth = w;
  g.stroke();
}

function pill(g: CanvasRenderingContext2D, len: number, wid: number, a: string, b: string): void {
  const r = wid / 2;
  g.beginPath();
  g.moveTo(-len / 2 + r, -r);
  g.lineTo(0, -r);
  g.lineTo(0, r);
  g.lineTo(-len / 2 + r, r);
  g.arc(-len / 2 + r, 0, r, Math.PI / 2, -Math.PI / 2);
  g.closePath();
  g.fillStyle = a;
  g.fill();
  g.beginPath();
  g.moveTo(0, -r);
  g.lineTo(len / 2 - r, -r);
  g.arc(len / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2);
  g.lineTo(0, r);
  g.closePath();
  g.fillStyle = b;
  g.fill();
  g.beginPath();
  g.moveTo(-len / 2 + r, -r);
  g.lineTo(len / 2 - r, -r);
  g.arc(len / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2);
  g.lineTo(-len / 2 + r, r);
  g.arc(-len / 2 + r, 0, r, Math.PI / 2, -Math.PI / 2);
  outline(g);
  g.beginPath();
  g.moveTo(0, -r);
  g.lineTo(0, r);
  outline(g, 2);
}

function coin(g: CanvasRenderingContext2D): void {
  g.fillStyle = '#ffc93c';
  g.beginPath();
  g.arc(0, 0, 22, 0, Math.PI * 2);
  g.fill();
  outline(g);
  g.strokeStyle = '#d9971a';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(0, 0, 15, 0, Math.PI * 2);
  g.stroke();
  star(g, 0, 0, 8, 4, '#fff1b8');
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r1: number, r2: number, fill: string): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? r1 : r2;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  outline(g, 2);
}

function flame(g: CanvasRenderingContext2D, x: number, y: number, s: number, outer: string, inner: string): void {
  g.beginPath();
  g.moveTo(x, y - s);
  g.bezierCurveTo(x + s * 0.9, y - s * 0.2, x + s * 0.8, y + s * 0.8, x, y + s * 0.8);
  g.bezierCurveTo(x - s * 0.8, y + s * 0.8, x - s * 0.9, y - s * 0.1, x - s * 0.15, y - s * 0.35);
  g.quadraticCurveTo(x - s * 0.05, y - s * 0.7, x, y - s);
  g.closePath();
  g.fillStyle = outer;
  g.fill();
  outline(g, 2.5);
  g.beginPath();
  g.ellipse(x, y + s * 0.3, s * 0.35, s * 0.45, 0, 0, Math.PI * 2);
  g.fillStyle = inner;
  g.fill();
}

function bolt(g: CanvasRenderingContext2D, x: number, y: number, s: number, fill: string): void {
  g.beginPath();
  g.moveTo(x + s * 0.2, y - s);
  g.lineTo(x - s * 0.55, y + s * 0.1);
  g.lineTo(x - s * 0.02, y + s * 0.1);
  g.lineTo(x - s * 0.25, y + s);
  g.lineTo(x + s * 0.6, y - s * 0.2);
  g.lineTo(x + s * 0.05, y - s * 0.2);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  outline(g, 2.5);
}

const DRAW: Record<IconId, Draw> = {
  capsule: (g) => {
    g.rotate(-0.7);
    pill(g, 50, 22, '#7cc8ff', '#ffffff');
  },
  swab: (g) => {
    g.rotate(-0.78);
    g.beginPath();
    g.moveTo(-22, 0);
    g.lineTo(22, 0);
    g.strokeStyle = INK;
    g.lineWidth = 7;
    g.stroke();
    g.strokeStyle = '#f4efe6';
    g.lineWidth = 3.5;
    g.stroke();
    for (const x of [-22, 22]) {
      g.beginPath();
      g.ellipse(x, 0, 9, 7, 0, 0, Math.PI * 2);
      g.fillStyle = '#ffffff';
      g.fill();
      outline(g, 2.5);
    }
    g.rotate(0.78);
    flame(g, 17, -19, 11, '#ff7a2e', '#ffd34d');
  },
  needle: (g) => {
    g.rotate(-0.78);
    g.beginPath();
    g.moveTo(-6, 0);
    g.lineTo(28, 0);
    g.strokeStyle = INK;
    g.lineWidth = 5;
    g.stroke();
    g.strokeStyle = '#ffe9a0';
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = '#ffc93c';
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.ellipse(-12 - i * 5, 0, 3, 7, 0, 0, Math.PI * 2);
      g.fill();
      outline(g, 2);
    }
    g.beginPath();
    g.arc(-32, 0, 4, 0, Math.PI * 2);
    g.fill();
    outline(g, 2);
  },
  bubble: (g) => {
    g.fillStyle = 'rgba(143,232,255,0.75)';
    g.beginPath();
    g.arc(-3, 3, 21, 0, Math.PI * 2);
    g.fill();
    outline(g);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.ellipse(-11, -6, 6, 4, -0.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(143,232,255,0.75)';
    g.beginPath();
    g.arc(19, -18, 7, 0, Math.PI * 2);
    g.fill();
    outline(g, 2.5);
  },
  snot: (g) => {
    g.beginPath();
    const bumps = 9;
    for (let i = 0; i <= bumps; i++) {
      const a = (i / bumps) * Math.PI * 2;
      const r = 22 + (i % 2 === 0 ? 3 : -2);
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.85 + 3);
    }
    g.closePath();
    g.fillStyle = '#9be04f';
    g.fill();
    outline(g);
    g.fillStyle = '#ffffff';
    for (const ex of [-8, 8]) {
      g.beginPath();
      g.arc(ex, -2, 5.5, 0, Math.PI * 2);
      g.fill();
      outline(g, 2);
      g.fillStyle = INK;
      g.beginPath();
      g.arc(ex + 1.5, -1, 2.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
    }
  },
  roller: (g) => {
    g.rotate(-0.5);
    g.fillStyle = '#b77cff';
    g.beginPath();
    g.roundRect(-24, -11, 40, 22, 9);
    g.fill();
    outline(g);
    g.fillStyle = '#e6d2ff';
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.arc(-15 + i * 10, -3, 3, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.moveTo(16, 0);
    g.lineTo(30, 0);
    g.strokeStyle = INK;
    g.lineWidth = 7;
    g.stroke();
    g.strokeStyle = '#7a4bd1';
    g.lineWidth = 3.5;
    g.stroke();
  },
  tower: (g) => {
    g.fillStyle = '#f4f7ff';
    g.beginPath();
    g.roundRect(-16, -12, 32, 34, 6);
    g.fill();
    outline(g);
    g.fillStyle = '#3fd27a';
    g.fillRect(-4, -6, 8, 22);
    g.fillRect(-11, 1, 22, 8);
    g.beginPath();
    g.moveTo(0, -12);
    g.lineTo(0, -24);
    outline(g);
    bolt(g, 0, -26, 8, '#6dff9a');
  },
  scalpel: (g) => {
    g.rotate(-0.78);
    g.fillStyle = '#5b6377';
    g.beginPath();
    g.roundRect(-30, -5, 30, 10, 4);
    g.fill();
    outline(g);
    g.fillStyle = '#e8eef6';
    g.beginPath();
    g.moveTo(0, -6);
    g.lineTo(18, -9);
    g.quadraticCurveTo(32, -4, 30, 4);
    g.lineTo(0, 6);
    g.closePath();
    g.fill();
    outline(g);
  },
  meteor: (g) => {
    g.lineWidth = 6;
    for (const [dx, c] of [
      [0, '#ffd34d'],
      [8, '#ff7a2e'],
    ] as const) {
      g.strokeStyle = c;
      g.beginPath();
      g.moveTo(-26 + dx, -26);
      g.lineTo(2 + dx, 2);
      g.stroke();
    }
    g.fillStyle = '#ff9a3c';
    g.beginPath();
    g.arc(8, 8, 16, 0, Math.PI * 2);
    g.fill();
    outline(g);
    g.fillStyle = '#ffd34d';
    g.beginPath();
    g.arc(4, 4, 7, 0, Math.PI * 2);
    g.fill();
  },
  satellite: (g) => {
    g.fillStyle = '#c9d6ea';
    g.beginPath();
    g.arc(-12, -4, 12, 0, Math.PI * 2);
    g.arc(4, -10, 15, 0, Math.PI * 2);
    g.arc(16, -1, 11, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.roundRect(-24, -4, 50, 14, 7);
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(-12, -4, 12, Math.PI * 0.9, Math.PI * 1.75);
    g.stroke();
    g.beginPath();
    g.arc(4, -10, 15, Math.PI * 1.1, Math.PI * 1.95);
    g.stroke();
    g.beginPath();
    g.arc(16, -1, 11, Math.PI * 1.5, Math.PI * 0.4);
    g.stroke();
    bolt(g, 0, 18, 12, '#ffd34d');
  },
  g_dmg: (g) => flame(g, 0, 2, 26, '#ff5a3c', '#ffd34d'),
  g_crit: (g) => {
    g.lineWidth = 3;
    for (const [r, c] of [
      [22, '#ff5b6e'],
      [14, '#ffffff'],
      [7, '#ff5b6e'],
    ] as const) {
      g.fillStyle = c;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fill();
      outline(g, 2.5);
    }
    g.beginPath();
    g.moveTo(0, -30);
    g.lineTo(0, -16);
    g.moveTo(0, 16);
    g.lineTo(0, 30);
    g.moveTo(-30, 0);
    g.lineTo(-16, 0);
    g.moveTo(16, 0);
    g.lineTo(30, 0);
    outline(g, 3.5);
  },
  g_critdmg: (g) => {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.roundRect(-6, -28, 12, 40, 6);
    g.fill();
    outline(g);
    g.fillStyle = '#ff4f6d';
    g.fillRect(-2.5, -12, 5, 24);
    g.beginPath();
    g.arc(0, 18, 10, 0, Math.PI * 2);
    g.fill();
    outline(g);
  },
  g_cd: (g) => bolt(g, 0, 0, 27, '#ffd34d'),
  g_slow: (g) => {
    g.strokeStyle = INK;
    for (const w of [8, 4]) {
      g.lineWidth = w;
      g.strokeStyle = w === 8 ? INK : '#bfeaff';
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI;
        g.beginPath();
        g.moveTo(Math.cos(a) * 25, Math.sin(a) * 25);
        g.lineTo(-Math.cos(a) * 25, -Math.sin(a) * 25);
        g.stroke();
      }
    }
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(0, 0, 6, 0, Math.PI * 2);
    g.fill();
    outline(g, 2.5);
  },
  g_coin: coin,
  coin,
  shard: (g) => {
    g.fillStyle = '#5ff0dc';
    g.beginPath();
    g.moveTo(0, -26);
    g.lineTo(16, -6);
    g.lineTo(8, 24);
    g.lineTo(-10, 24);
    g.lineTo(-17, -4);
    g.closePath();
    g.fill();
    outline(g);
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath();
    g.moveTo(0, -20);
    g.lineTo(-10, -3);
    g.lineTo(-3, 2);
    g.closePath();
    g.fill();
  },
  atk: (g) => {
    g.rotate(0.78);
    g.fillStyle = '#e8eef6';
    g.beginPath();
    g.moveTo(-4, -28);
    g.lineTo(4, -28);
    g.lineTo(5, 8);
    g.lineTo(-5, 8);
    g.closePath();
    g.fill();
    outline(g);
    g.fillStyle = '#ffc93c';
    g.beginPath();
    g.roundRect(-14, 8, 28, 7, 3);
    g.fill();
    outline(g);
    g.fillStyle = '#8b5a3c';
    g.beginPath();
    g.roundRect(-4, 15, 8, 14, 3);
    g.fill();
    outline(g);
  },
  heart: heartIcon,
  virus: virusIcon,
  gear: gearIcon,
  chest: (g) => chestIcon(g, false),
  chestOpen: (g) => chestIcon(g, true),
  lock: (g) => {
    g.lineWidth = 6;
    g.strokeStyle = INK;
    g.beginPath();
    g.arc(0, -6, 12, Math.PI, 0);
    g.stroke();
    g.strokeStyle = '#c8cfdc';
    g.lineWidth = 3;
    g.stroke();
    g.fillStyle = '#ffc93c';
    g.beginPath();
    g.roundRect(-17, -6, 34, 28, 6);
    g.fill();
    outline(g);
    g.fillStyle = INK;
    g.beginPath();
    g.arc(0, 6, 4, 0, Math.PI * 2);
    g.fill();
  },
};

function heartIcon(g: CanvasRenderingContext2D): void {
  g.fillStyle = '#ff4f6d';
  heartPath(g, 24);
  g.fill();
  outline(g);
  g.fillStyle = '#ffffff';
  for (const ex of [-8, 8]) {
    g.beginPath();
    g.ellipse(ex, -3, 6, 7, 0, 0, Math.PI * 2);
    g.fill();
    outline(g, 2);
    g.fillStyle = INK;
    g.beginPath();
    g.arc(ex + 1.5, -2, 3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
  }
}

function virusIcon(g: CanvasRenderingContext2D): void {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    g.beginPath();
    g.moveTo(Math.cos(a) * 14, Math.sin(a) * 14);
    g.lineTo(Math.cos(a) * 25, Math.sin(a) * 25);
    outline(g, 6);
    g.strokeStyle = '#ecc77d';
    g.lineWidth = 3;
    g.stroke();
    g.fillStyle = '#ecc77d';
    g.beginPath();
    g.arc(Math.cos(a) * 27, Math.sin(a) * 27, 4.5, 0, Math.PI * 2);
    g.fill();
    outline(g, 2);
  }
  g.fillStyle = '#b5685a';
  g.beginPath();
  g.arc(0, 0, 18, 0, Math.PI * 2);
  g.fill();
  outline(g);
  g.fillStyle = '#ffffff';
  for (const ex of [-6, 6]) {
    g.beginPath();
    g.arc(ex, -3, 4.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = INK;
    g.beginPath();
    g.arc(ex + 1, -2, 2.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
  }
  g.beginPath();
  g.moveTo(-11, -11);
  g.lineTo(-3, -8);
  g.moveTo(11, -11);
  g.lineTo(3, -8);
  outline(g, 3);
  g.fillStyle = '#3a0d18';
  g.beginPath();
  g.roundRect(-6, 5, 12, 6, 3);
  g.fill();
}

function gearIcon(g: CanvasRenderingContext2D): void {
  g.fillStyle = '#d6dbe8';
  g.beginPath();
  const teeth = 8;
  for (let i = 0; i < teeth * 2; i++) {
    const r = i % 2 === 0 ? 26 : 19;
    const a0 = (i / (teeth * 2)) * Math.PI * 2;
    const a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
    g.arc(0, 0, r, a0, a1);
  }
  g.closePath();
  g.fill();
  outline(g);
  g.fillStyle = '#2a2147';
  g.beginPath();
  g.arc(0, 0, 8, 0, Math.PI * 2);
  g.fill();
  outline(g, 2.5);
}

function chestIcon(g: CanvasRenderingContext2D, open: boolean): void {
  g.fillStyle = '#2ec4b0';
  g.beginPath();
  g.roundRect(-24, -4, 48, 26, 5);
  g.fill();
  outline(g);
  g.fillStyle = '#6fe6d3';
  g.beginPath();
  if (open) g.roundRect(-26, -24, 52, 12, 6);
  else g.roundRect(-26, -16, 52, 14, 6);
  g.fill();
  outline(g);
  g.fillStyle = '#ffd34d';
  g.beginPath();
  g.roundRect(-5, -6, 10, 12, 3);
  g.fill();
  outline(g, 2);
  if (open) {
    g.fillStyle = 'rgba(255,240,150,0.9)';
    g.beginPath();
    g.moveTo(-18, -8);
    g.lineTo(-26, -30);
    g.lineTo(26, -30);
    g.lineTo(18, -8);
    g.closePath();
    g.fill();
  }
}
