import { FIELD_H } from '../game/constants';
import type { Projectile, Zone } from '../game/types';
import { laserBeams, RAINBOW } from '../game/weapons';
import type { World } from '../game/world';
import { beginGlow, endGlow, glow, glowCtx } from './glow';
import { INK } from './sprites';

/** Glow colour per projectile kind (refracted capsules carry their own). */
const GLOW: Record<Projectile['kind'], string> = {
  capsule: '#7fd0ff',
  needle: '#ffd34d',
  bubble: '#8fe8ff',
  snot: '#9be04f',
  swab: '#ff9a3c',
  scalpel: '#e8f0ff',
  meteor: '#ff8a3c',
  roller: '#b77cff',
  syringe: '#9fd8ff',
  cannon: '#ff7a2e',
  phage: '#c7f36b',
  spectrum: '#ffffff',
};

/** Ground-level weapon effects that sit under the trains. */
export function drawWeaponLayerBelow(ctx: CanvasRenderingContext2D, world: World): void {
  const t = world.time;
  for (const z of world.zones) {
    if (z.kind === 'puddle' || z.kind === 'fire' || z.kind === 'well') drawZone(ctx, z, t);
  }
  drawTowerLasers(ctx, world);
}

/** Everything that flies, burns or floats above the trains. */
export function drawWeaponLayerAbove(ctx: CanvasRenderingContext2D, world: World): void {
  const t = world.time;
  for (const z of world.zones) {
    if (z.kind === 'swab' || z.kind === 'tower') drawZone(ctx, z, t);
  }
  drawBeams(ctx, world);
  // glows first, in one additive batch, then the bodies
  beginGlow(ctx);
  for (const p of world.projectiles) {
    if (p.delay !== undefined && p.age < p.delay) continue;
    const c = p.color ?? GLOW[p.kind];
    const r = p.kind === 'meteor' ? 34 : p.kind === 'needle' ? 16 : p.kind === 'roller' ? 30 : p.kind === 'snot' ? p.r * 2 : 14 + p.r;
    glow(ctx, p.x, p.y, r, c, p.kind === 'capsule' && p.child ? 0.5 : 0.75);
  }
  endGlow(ctx);
  for (const p of world.projectiles) drawProjectile(ctx, p, t);
  drawPrisms(ctx, world);
  drawClouds(ctx, world);
  drawUltEffects(ctx, world);
}

function drawZone(ctx: CanvasRenderingContext2D, z: Zone, time: number): void {
  const fade = Math.min(1, z.life / 0.4, (z.maxLife - z.life) / 0.2 + 0.2);
  switch (z.kind) {
    case 'swab': {
      beginGlow(ctx);
      glow(ctx, z.x, z.y, z.r * 1.6, '#ff7a2e', 0.55 * fade);
      endGlow(ctx);
      ctx.globalAlpha = fade;
      ctx.save();
      ctx.translate(z.x, z.y);
      ctx.rotate(z.rot);
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#ff7a2e';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(0, 0, z.r * 0.82, 0, Math.PI * 1.2);
      ctx.stroke();
      ctx.strokeStyle = '#ffe28a';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(-z.r * 0.8, 0);
      ctx.lineTo(z.r * 0.8, 0);
      ctx.stroke();
      ctx.strokeStyle = '#f4efe6';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#ffb347';
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(sx * z.r * 0.8, 0, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      // embers
      beginGlow(ctx);
      for (let i = 0; i < 5; i++) {
        const a = z.rot * 0.7 + i * 1.26;
        const rr = z.r * (0.4 + ((time * 0.8 + i * 0.37) % 1) * 0.7);
        glow(ctx, z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr - ((time * 40 + i * 13) % 30), 6, '#ffd34d', 0.8 * fade);
      }
      endGlow(ctx);
      break;
    }
    case 'puddle': {
      beginGlow(ctx);
      glow(ctx, z.x, z.y, z.r * 1.5, '#5fd3ff', 0.45 * fade);
      endGlow(ctx);
      ctx.globalAlpha = fade;
      ctx.fillStyle = 'rgba(120,220,255,0.25)';
      ctx.strokeStyle = 'rgba(190,245,255,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(z.x, z.y, z.r, z.r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      for (const k of [0, 0.5]) {
        const ripple = ((time * 1.5 + k) % 1) * z.r;
        ctx.globalAlpha = fade * (1 - ripple / z.r);
        ctx.beginPath();
        ctx.ellipse(z.x, z.y, ripple, ripple * 0.8, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case 'fire': {
      const flick = 0.85 + Math.sin(time * 30 + z.x) * 0.15;
      beginGlow(ctx);
      glow(ctx, z.x, z.y, z.r * 1.7 * flick, '#ff6a2a', 0.7 * fade);
      glow(ctx, z.x, z.y, z.r * 0.8 * flick, '#ffd34d', 0.6 * fade);
      endGlow(ctx);
      break;
    }
    case 'well': {
      drawWell(ctx, z, time, fade);
      break;
    }
    case 'tower': {
      beginGlow(ctx);
      glow(ctx, z.x, z.y, 34, '#6dff9a', 0.5 * fade);
      endGlow(ctx);
      ctx.globalAlpha = fade;
      ctx.fillStyle = '#f4f7ff';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(z.x - 11, z.y - 12, 22, 24, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#3fd27a';
      ctx.fillRect(z.x - 3, z.y - 8, 6, 16);
      ctx.fillRect(z.x - 8, z.y - 3, 16, 6);
      break;
    }
  }
  ctx.globalAlpha = 1;
}

/** A singularity: black core, a spinning accretion disk and matter spiralling in. */
function drawWell(ctx: CanvasRenderingContext2D, z: Zone, time: number, fade: number): void {
  const r = z.r;
  beginGlow(ctx);
  glow(ctx, z.x, z.y, r * 1.6, '#7b5bff', 0.55 * fade);
  // disk arms (they are light, so they go where the light goes)
  const g = glowCtx(ctx);
  g.lineCap = 'round';
  for (let arm = 0; arm < 3; arm++) {
    g.strokeStyle = arm === 0 ? '#c9b4ff' : arm === 1 ? '#ff8ad8' : '#9b7bff';
    g.lineWidth = 5 - arm;
    g.globalAlpha = 0.8 * fade;
    g.beginPath();
    for (let k = 0; k <= 24; k++) {
      const u = k / 24;
      const a = time * 4 + arm * 2.09 + u * 4.2;
      const rr = r * (1 - u * 0.75);
      const x = z.x + Math.cos(a) * rr;
      const y = z.y + Math.sin(a) * rr * 0.62;
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  // matter spiralling inward
  for (let i = 0; i < 14; i++) {
    const u = (time * 0.6 + i / 14) % 1;
    const a = i * 2.4 + u * 9;
    const rr = r * 1.3 * (1 - u);
    glow(ctx, z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr * 0.62, 5, '#e6dcff', fade * u);
  }
  endGlow(ctx);
  ctx.globalAlpha = fade;
  const core = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, r * 0.42);
  core.addColorStop(0, '#000000');
  core.addColorStop(0.7, '#05010d');
  core.addColorStop(1, 'rgba(10,0,30,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(z.x, z.y, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(230,220,255,0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(z.x, z.y, r * 0.3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawTowerLasers(ctx: CanvasRenderingContext2D, world: World): void {
  const towers = world.zones.filter((z) => z.kind === 'tower');
  if (towers.length < 2) return;
  const flick = 0.7 + Math.random() * 0.3;
  const light = glowCtx(ctx);
  ctx.lineCap = 'round';
  light.lineCap = 'round';
  beginGlow(ctx);
  for (let i = 0; i < towers.length; i++) {
    for (let j = i + 1; j < towers.length; j++) {
      const a = towers[i];
      const b = towers[j];
      if (a.group !== b.group) continue;
      light.globalAlpha = 0.5 * flick;
      light.strokeStyle = '#6dff9a';
      light.lineWidth = 16;
      light.beginPath();
      light.moveTo(a.x, a.y);
      light.lineTo(b.x, b.y);
      light.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#e4ffee';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  endGlow(ctx);
}

/** Laser Lance beams: wide glow, hot core, sparks where they bite. */
function drawBeams(ctx: CanvasRenderingContext2D, world: World): void {
  const w = world.owned('laser');
  if (!w || (w.timers.beam ?? 0) <= 0) return;
  const t = world.time;
  const fade = Math.min(1, w.timers.beam / 0.25);
  const rainbow = w.stats.flags.has('rainbow');
  const flicker = 0.88 + Math.sin(t * 70) * 0.12;
  const light = glowCtx(ctx);
  ctx.lineCap = 'round';
  light.lineCap = 'round';
  beginGlow(ctx);
  laserBeams(world, w).forEach((b, i) => {
    const color = rainbow ? RAINBOW[(i + Math.floor(t * 8)) % RAINBOW.length] : '#ff5bd1';
    for (const [width, alpha, c, g] of [
      [b.width * 4.5, 0.3, color, light],
      [b.width * 1.8, 0.7, color, light],
      [b.width * 1.4, 0.85, color, ctx],
      [b.width * 0.6, 1, '#ffffff', ctx],
    ] as const) {
      g.globalAlpha = alpha * fade;
      g.strokeStyle = c;
      g.lineWidth = width * flicker;
      g.beginPath();
      g.moveTo(b.x1, b.y1);
      g.lineTo(b.x2, b.y2);
      g.stroke();
    }
    glow(ctx, b.x1, b.y1, 30, color, fade);
    // sparks running up the beam
    for (let k = 0; k < 6; k++) {
      const u = (t * 2.5 + k / 6) % 1;
      glow(ctx, b.x1 + (b.x2 - b.x1) * u * 0.7, b.y1 + (b.y2 - b.y1) * u * 0.7, 9, '#ffffff', 0.7 * fade);
    }
  });
  endGlow(ctx);
}

function drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile, time: number): void {
  if (p.delay !== undefined && p.age < p.delay) return;
  switch (p.kind) {
    case 'capsule': {
      const sp = Math.hypot(p.vx, p.vy) || 1;
      const ux = p.vx / sp;
      const uy = p.vy / sp;
      // motion streak
      ctx.strokeStyle = p.color ?? 'rgba(160,220,255,0.45)';
      ctx.globalAlpha = 0.45;
      ctx.lineCap = 'round';
      ctx.lineWidth = p.child ? 4 : 6;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - ux * 22, p.y - uy * 22);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.atan2(p.vy, p.vx));
      const len = p.child ? 13 : 17;
      const wid = p.child ? 6 : 8;
      ctx.fillStyle = p.color ?? '#7cc8ff';
      ctx.beginPath();
      ctx.roundRect(-len / 2, -wid / 2, len, wid, wid / 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(0, -wid / 2, len / 2, wid, [0, wid / 2, wid / 2, 0]);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-len / 2, -wid / 2, len, wid, wid / 2);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'needle': {
      // a golden comet: long fading streak, white-hot tip
      const sp = Math.hypot(p.vx, p.vy) || 1;
      const ux = p.vx / sp;
      const uy = p.vy / sp;
      const len = p.child ? 30 : 46;
      const grad = ctx.createLinearGradient(p.x - ux * len, p.y - uy * len, p.x, p.y);
      grad.addColorStop(0, 'rgba(255,211,77,0)');
      grad.addColorStop(0.6, 'rgba(255,211,77,0.85)');
      grad.addColorStop(1, '#fff6d0');
      ctx.lineCap = 'round';
      ctx.strokeStyle = grad;
      ctx.lineWidth = p.child ? 3.5 : 5;
      ctx.beginPath();
      ctx.moveTo(p.x - ux * len, p.y - uy * len);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(p.x - ux * len * 0.4, p.y - uy * len * 0.4);
      ctx.lineTo(p.x + ux * 4, p.y + uy * 4);
      ctx.stroke();
      break;
    }
    case 'bubble': {
      ctx.fillStyle = 'rgba(143,232,255,0.4)';
      ctx.strokeStyle = '#e4fbff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // iridescent rim
      ctx.strokeStyle = `hsla(${(time * 200 + p.x) % 360}, 90%, 75%, 0.7)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r - 2.5, -0.4, 1.4);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.26, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'snot': {
      drawSnotDragon(ctx, p, time);
      break;
    }
    case 'swab': {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-18, 0);
      ctx.lineTo(18, 0);
      ctx.stroke();
      ctx.strokeStyle = '#f4efe6';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#ff9a3c';
      for (const sx of [-18, 18]) {
        ctx.beginPath();
        ctx.arc(sx, 0, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 'scalpel': {
      // afterimages along the spin
      for (const k of [2, 1, 0]) {
        ctx.globalAlpha = k === 0 ? 1 : 0.22 / k;
        ctx.save();
        ctx.translate(p.x - p.vx * 0.012 * k, p.y - p.vy * 0.012 * k);
        ctx.rotate(p.rot - k * 0.5);
        const s = p.r / 15;
        ctx.scale(s, s);
        ctx.fillStyle = '#eef4ff';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-4, -3);
        ctx.lineTo(10, -6);
        ctx.quadraticCurveTo(20, -2, 18, 4);
        ctx.lineTo(-4, 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#5b6377';
        ctx.beginPath();
        ctx.roundRect(-20, -3, 17, 7, 3);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'meteor': {
      const tx = p.tx ?? p.x;
      const ty = p.ty ?? p.y;
      const d = Math.hypot(tx - p.x, ty - p.y) || 1;
      const ux = (p.x - tx) / d;
      const uy = (p.y - ty) / d;
      const grad = ctx.createLinearGradient(p.x, p.y, p.x + ux * 110, p.y + uy * 110);
      grad.addColorStop(0, 'rgba(255,230,140,0.95)');
      grad.addColorStop(0.4, 'rgba(255,122,46,0.6)');
      grad.addColorStop(1, 'rgba(255,60,30,0)');
      ctx.lineCap = 'round';
      ctx.strokeStyle = grad;
      ctx.lineWidth = 20;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + ux * 110, p.y + uy * 110);
      ctx.stroke();
      ctx.fillStyle = '#ffe8a8';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 0.9, 0, Math.PI * 2);
      ctx.fill();
      // target marker
      ctx.strokeStyle = 'rgba(255,190,80,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(tx, ty, 18 + Math.sin(time * 20) * 3, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'roller': {
      ctx.save();
      ctx.translate(p.x, p.y);
      const h = p.r;
      if (p.phase === 0) ctx.rotate(p.rot);
      ctx.fillStyle = '#b77cff';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-15, -h, 30, h * 2, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#efe2ff';
      const off = ((p.rot * 10) % 12 + 12) % 12;
      for (let y = -h + 6 + off; y < h - 4; y += 12) {
        ctx.beginPath();
        ctx.arc(-5, y, 3.2, 0, Math.PI * 2);
        ctx.arc(5, y + 6 > h - 4 ? y : y + 6, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 'syringe': {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.fillStyle = '#9fd8ff';
      ctx.beginPath();
      ctx.roundRect(-16, -5, 22, 10, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-21, -3, 5, 6);
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(18, 0);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'cannon': {
      ctx.fillStyle = '#2b2440';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'phage': {
      drawPhage(ctx, p, time);
      break;
    }
    case 'spectrum': {
      const sp = Math.hypot(p.vx, p.vy) || 1;
      ctx.lineCap = 'round';
      ctx.strokeStyle = p.color ?? '#ffffff';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(p.x - (p.vx / sp) * 26, p.y - (p.vy / sp) * 26);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      break;
    }
  }
}

/** A little snot dragon: a tapering body that follows its loops, horned head and eyes. */
function drawSnotDragon(ctx: CanvasRenderingContext2D, p: Projectile, time: number): void {
  const trail = p.trail ?? [];
  const n = trail.length / 2;
  // body: outline pass, then fill pass
  for (const pass of [0, 1]) {
    for (let i = n - 1; i >= 1; i -= 1) {
      const u = i / n;
      const r = p.r * (1 - u * 0.7) * (pass ? 0.82 : 1);
      ctx.fillStyle = pass ? (i % 3 === 0 ? '#b8f070' : '#9be04f') : '#2f5a12';
      ctx.beginPath();
      ctx.arc(trail[i * 2], trail[i * 2 + 1], r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  const r = p.r * 1.05;
  // horns
  ctx.fillStyle = '#e8ffb0';
  ctx.strokeStyle = '#2f5a12';
  ctx.lineWidth = 2;
  for (const sy of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-r * 0.2, sy * r * 0.6);
    ctx.lineTo(-r * 1.1, sy * r * 1.15);
    ctx.lineTo(-r * 0.6, sy * r * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  const wob = 1 + Math.sin(time * 14 + p.x) * 0.06;
  ctx.fillStyle = '#9be04f';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.15 * wob, r / wob, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  for (const sy of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(r * 0.35, sy * r * 0.38, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(r * 0.45, sy * r * 0.38, r * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
  }
  ctx.restore();
}

/** A bacteriophage: icosahedral head, tail sheath and spindly legs. */
function drawPhage(ctx: CanvasRenderingContext2D, p: Projectile, time: number): void {
  ctx.save();
  ctx.translate(p.x, p.y);
  const latched = p.phase === 1;
  // fly head-first; once latched, stand on the segment, legs down
  ctx.rotate(latched ? 0 : p.rot - Math.PI / 2);
  if (latched) {
    const pump = 1 + Math.sin(time * 30) * 0.08;
    ctx.scale(pump, 2 - pump);
  }
  const s = 1.1;
  ctx.scale(s, latched ? s : -s);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.lineTo(sx * 6, 11);
    ctx.lineTo(sx * 9, 16);
    ctx.stroke();
  }
  ctx.fillStyle = '#8fd0c4';
  ctx.fillRect(-2, -2, 4, 11);
  ctx.strokeRect(-2, -2, 4, 11);
  ctx.fillStyle = '#c7f36b';
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    ctx.lineTo(Math.cos(a) * 7, -8 + Math.sin(a) * 7);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Prism crystals: a slowly turning facet with rainbow light around it. */
function drawPrisms(ctx: CanvasRenderingContext2D, world: World): void {
  if (!world.prisms.length) return;
  const t = world.time;
  beginGlow(ctx);
  for (const pr of world.prisms) {
    RAINBOW.forEach((c, i) => {
      const a = t * 1.5 + (i / RAINBOW.length) * Math.PI * 2;
      glow(ctx, pr.x + Math.cos(a) * pr.r * 0.6, pr.y + Math.sin(a) * pr.r * 0.6, pr.r * 1.1, c, 0.35);
    });
  }
  endGlow(ctx);
  for (const pr of world.prisms) {
    ctx.save();
    ctx.translate(pr.x, pr.y);
    ctx.rotate(Math.sin(t * 0.8) * 0.4);
    const r = pr.r * 0.85;
    ctx.fillStyle = 'rgba(236,226,255,0.78)';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.87, r * 0.5);
    ctx.lineTo(-r * 0.87, r * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(160,140,255,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(0, r * 0.5);
    ctx.stroke();
    ctx.restore();
  }
}

function drawClouds(ctx: CanvasRenderingContext2D, world: World): void {
  const t = world.time;
  for (const c of world.clouds) {
    beginGlow(ctx);
    glow(ctx, c.x, c.y + 4, 46, '#9fd0ff', 0.25 + 0.25 * Math.max(0, Math.sin(t * 13 + c.x)));
    endGlow(ctx);
    ctx.fillStyle = '#c9d6ea';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(c.x - 14, c.y + 2, 12, 0, Math.PI * 2);
    ctx.arc(c.x + 2, c.y - 6, 15, 0, Math.PI * 2);
    ctx.arc(c.x + 16, c.y + 3, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8f9cc0';
    ctx.beginPath();
    ctx.roundRect(c.x - 26, c.y + 2, 52, 12, 6);
    ctx.fill();
  }
}

function drawUltEffects(ctx: CanvasRenderingContext2D, world: World): void {
  for (const e of world.effects) {
    if (e.kind !== 'laser') continue;
    const x = e.a;
    const fade = Math.min(1, (e.dur - e.t) / 0.3, e.t / 0.15);
    const light = glowCtx(ctx);
    beginGlow(ctx);
    light.globalAlpha = 0.45 * fade;
    light.fillStyle = '#ff5bd1';
    light.fillRect(x - 70, -200, 140, FIELD_H + 400);
    light.globalAlpha = 0.9 * fade;
    light.fillStyle = '#ffd6f4';
    light.fillRect(x - 22, -200, 44, FIELD_H + 400);
    endGlow(ctx);
    ctx.globalAlpha = 0.85 * fade;
    ctx.fillStyle = '#ffd6f4';
    ctx.fillRect(x - 14, -200, 28, FIELD_H + 400);
    ctx.globalAlpha = fade;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 5, -200, 10, FIELD_H + 400);
    ctx.globalAlpha = 1;
  }
}
