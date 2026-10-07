import { fmt } from '../core/format';
import { FIELD_H, FIELD_W, SEG_LEN, SEG_RADIUS } from '../game/constants';
import type { Segment } from '../game/chain';
import type { ThemeId } from '../game/stage';
import { PALETTES } from '../game/themes';
import type { Projectile, Zone } from '../game/types';
import type { World } from '../game/world';
import type { PowerKind } from '../game/chain';
import type { CostumeId } from '../game/costumes';
import { iconCanvas, type IconId } from './icons';
import { drawSprite, heroSprite, INK, ThemeSprites, type Sprite } from './sprites';

const POWER_STYLE: Record<PowerKind, { icon: IconId; color: string }> = {
  freeze: { icon: 'g_slow', color: '#9fe7ff' },
  reverse: { icon: 'p_reverse', color: '#c9a2ff' },
  bomb: { icon: 'p_bomb', color: '#ff6b4a' },
  lightning: { icon: 'g_cd', color: '#ffd34d' },
  rapid: { icon: 'p_rapid', color: '#7cc8ff' },
  coins: { icon: 'coin', color: '#ffc93c' },
};

const RING_OFFSETS = [-32, -16, 0, 16, 32];
const LABEL_FONT = '600 17px "Fredoka Variable", ui-rounded, system-ui, sans-serif';
const NUM_FONT = '600 14px "Fredoka Variable", ui-rounded, system-ui, sans-serif';
const CRIT_FONT = '700 20px "Fredoka Variable", ui-rounded, system-ui, sans-serif';

export interface Viewport {
  /** CSS pixels reserved at the top / bottom for HUD and safe areas. */
  top: number;
  bottom: number;
}

/**
 * Draws a World onto a full-screen canvas. The 540×960 field is scaled to
 * fit between the reserved HUD areas; the tissue backdrop fills the rest.
 */
export class Renderer {
  readonly canvas: HTMLCanvasElement;
  /** Static layer under the game canvas: tissue, track groove, defence line. */
  private readonly under: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private vw = 0;
  private vh = 0;
  scale = 1;
  ox = 0;
  oy = 0;
  private sprites: ThemeSprites | null = null;
  private spritesKey = '';
  private backdropFor: World | null = null;
  private numbers = true;
  private readonly tmp = { x: 0, y: 0, a: 0 };
  private heroSprites = new Map<string, Sprite>();
  /** Contiguous stretches of train this frame, as [startS, endS] pairs. */
  private groups: number[] = [];

  constructor(canvas: HTMLCanvasElement, under: HTMLCanvasElement) {
    this.canvas = canvas;
    this.under = under;
    this.ctx = canvas.getContext('2d')!;
  }

  setShowNumbers(on: boolean): void {
    this.numbers = on;
  }

  resize(view: Viewport): void {
    // 2x is plenty for chunky cartoon art and saves a lot of fill on 3x phones.
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    for (const c of [this.canvas, this.under]) {
      c.width = Math.round(this.vw * this.dpr);
      c.height = Math.round(this.vh * this.dpr);
      c.style.width = `${this.vw}px`;
      c.style.height = `${this.vh}px`;
    }
    const avail = Math.max(200, this.vh - view.top - view.bottom);
    this.scale = Math.min(this.vw / FIELD_W, avail / FIELD_H);
    this.ox = (this.vw - FIELD_W * this.scale) / 2;
    this.oy = view.top + (avail - FIELD_H * this.scale) / 2;
    this.backdropFor = null;
    this.spritesKey = '';
  }

  /** Screen (CSS px) → field units. */
  toField(clientX: number, clientY: number): { x: number; y: number } {
    return { x: (clientX - this.ox) / this.scale, y: (clientY - this.oy) / this.scale };
  }

  render(world: World): void {
    const ctx = this.ctx;
    const k = this.dpr * this.scale;
    this.ensureSprites(world.stage.theme, k);
    if (this.backdropFor !== world) this.buildBackdrop(world);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const shake = world.fx.shake;
    const sx = shake ? (Math.random() - 0.5) * shake : 0;
    const sy = shake ? (Math.random() - 0.5) * shake : 0;
    ctx.setTransform(k, 0, 0, k, (this.ox + sx) * this.dpr, (this.oy + sy) * this.dpr);

    this.drawDanger(world);
    for (const z of world.zones) this.drawZone(z, world.time);
    this.drawLasers(world);
    this.drawChain(world);
    this.drawReticle(world);
    for (const p of world.projectiles) this.drawProjectile(p, world.time);
    this.drawClouds(world);
    this.drawEffects(world);
    this.drawHero(world);
    this.drawFx(world);
  }

  // ---------------------------------------------------------------- set-up

  private ensureSprites(theme: ThemeId, k: number): void {
    const key = `${theme}@${k.toFixed(3)}`;
    if (key === this.spritesKey) return;
    this.sprites = new ThemeSprites(theme, k);
    this.spritesKey = key;
    this.heroSprites.clear();
  }

  private hero(costume: CostumeId): Sprite {
    let sp = this.heroSprites.get(costume);
    if (!sp) {
      sp = heroSprite(costume, this.dpr * this.scale);
      this.heroSprites.set(costume, sp);
    }
    return sp;
  }

  /** Tissue floor, track groove and defence line, cached per run + size. */
  private buildBackdrop(world: World): void {
    const c = this.under;
    const g = c.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const p = PALETTES[world.stage.theme];
    g.fillStyle = p.floor;
    g.fillRect(0, 0, c.width, c.height);

    // Cells of tissue, seeded so the backdrop is stable for the run.
    let seed = world.stage.chapter * 977 + 13;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const unit = this.dpr * this.scale;
    const count = Math.round((c.width * c.height) / (unit * unit * 2600));
    for (let i = 0; i < count; i++) {
      const x = rnd() * c.width;
      const y = rnd() * c.height;
      const r = (16 + rnd() * 26) * unit;
      g.globalAlpha = 0.5;
      g.fillStyle = rnd() < 0.5 ? p.floorAlt : p.floor;
      g.strokeStyle = p.floorLine;
      g.lineWidth = 2 * unit;
      g.beginPath();
      g.ellipse(x, y, r, r * (0.75 + rnd() * 0.3), rnd() * Math.PI, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = p.debris;
      g.globalAlpha = 0.35;
      g.beginPath();
      g.arc(x + (rnd() - 0.5) * r * 0.6, y + (rnd() - 0.5) * r * 0.6, r * 0.16, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }

    g.setTransform(unit, 0, 0, unit, this.ox * this.dpr, this.oy * this.dpr);
    // Faint groove so you can read where the train will go.
    g.strokeStyle = 'rgba(0,0,0,0.2)';
    g.lineWidth = SEG_RADIUS * 2 + 8;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.beginPath();
    let first = true;
    for (const [x, y] of world.layout.path.points(6)) {
      if (first) g.moveTo(x, y);
      else g.lineTo(x, y);
      first = false;
    }
    g.stroke();

    const layout = world.layout;
    if (layout.fenceY !== null) this.drawMembrane(g, layout.fenceY);
    else this.drawRing(g, layout.hero.x, layout.hero.y, layout.goalRadius);

    // Microscope vignette.
    g.setTransform(1, 0, 0, 1, 0, 0);
    const vg = g.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.3, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = vg;
    g.fillRect(0, 0, c.width, c.height);
    this.backdropFor = world;
  }

  /** The defence line: a lipid bilayer you are not letting them cross. */
  private drawMembrane(g: CanvasRenderingContext2D, y: number): void {
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(-200, y - 2, FIELD_W + 400, 16);
    for (const row of [0, 12]) {
      for (let x = -200; x < FIELD_W + 200; x += 10) {
        g.fillStyle = 'rgba(255,214,226,0.55)';
        g.beginPath();
        g.arc(x + (row ? 5 : 0), y + row, 4, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  private drawRing(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    g.strokeStyle = 'rgba(255,214,226,0.45)';
    g.lineWidth = 5;
    g.setLineDash([2, 9]);
    g.beginPath();
    g.arc(x, y, r + 6, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
  }

  // ---------------------------------------------------------------- drawing

  private drawDanger(world: World): void {
    const d = world.chain.danger;
    if (d < 0.75) return;
    const ctx = this.ctx;
    const pulse = 0.5 + 0.5 * Math.sin(world.time * 10);
    const a = Math.min(1, (d - 0.75) / 0.2) * (0.25 + 0.35 * pulse);
    ctx.fillStyle = `rgba(255,40,70,${a.toFixed(3)})`;
    const layout = world.layout;
    if (layout.fenceY !== null) {
      ctx.fillRect(-200, layout.fenceY - 4, FIELD_W + 400, 20);
    } else {
      ctx.beginPath();
      ctx.arc(layout.hero.x, layout.hero.y, layout.goalRadius + 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawChain(world: World): void {
    const ctx = this.ctx;
    const sp = this.sprites!;
    const chain = world.chain;
    const path = chain.path;
    const segs = chain.segs;
    const tmp = this.tmp;
    this.drawSilhouette(world);
    // Tail first so the front of the train draws on top.
    for (let i = segs.length - 1; i >= 0; i--) {
      const seg = segs[i];
      if (!seg.visible) continue;
      for (let r = 0; r < RING_OFFSETS.length; r++) {
        path.pos(seg.s + RING_OFFSETS[r], tmp);
        drawSprite(ctx, (seg.index + r) % 2 === 0 ? sp.ringA : sp.ringB, tmp.x, tmp.y + 2);
      }
      if (seg.flash > 0) {
        ctx.globalAlpha = Math.min(1, seg.flash / 0.07) * 0.75;
        for (let r = 1; r < RING_OFFSETS.length - 1; r++) {
          path.pos(seg.s + RING_OFFSETS[r], tmp);
          drawSprite(ctx, sp.flash, tmp.x, tmp.y + 2);
        }
        ctx.globalAlpha = 1;
      }
    }
    // Frozen trains go icy, reversing ones glow violet.
    if (world.frozen > 0 || world.reversing > 0) {
      const fade = Math.min(1, (world.frozen > 0 ? world.frozen : world.reversing) / 0.5);
      ctx.strokeStyle = world.frozen > 0 ? `rgba(190,235,255,${(0.5 * fade).toFixed(3)})` : `rgba(190,150,255,${(0.4 * fade).toFixed(3)})`;
      ctx.lineWidth = SEG_RADIUS * 2;
      this.strokeGroups(world, 2);
    }
    // Chests and HP labels on top of the body.
    ctx.font = LABEL_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (let i = segs.length - 1; i >= 0; i--) {
      const seg = segs[i];
      if (!seg.visible) continue;
      if (seg.kind !== 'normal') this.drawChest(seg, world.time);
      if (seg.power) this.drawPower(seg, world.time);
      const label = hpLabel(seg);
      ctx.lineWidth = 4;
      ctx.strokeStyle = INK;
      ctx.strokeText(label, seg.x, seg.y + (seg.kind === 'normal' ? 1 : 9));
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, seg.x, seg.y + (seg.kind === 'normal' ? 1 : 9));
    }
    this.drawHead(world);
  }

  /**
   * One ink outline (plus a drop shadow) around the whole train, stroked as
   * a fat path along the track rather than hundreds of sprites.
   */
  private drawSilhouette(world: World): void {
    const ctx = this.ctx;
    const segs = world.chain.segs;
    const groups: number[] = [];
    this.groups = groups;
    let start = NaN;
    let end = NaN;
    for (let i = segs.length - 1; i >= 0; i--) {
      const seg = segs[i];
      if (seg.s < -SEG_LEN) continue;
      const a = seg.s + RING_OFFSETS[0];
      const b = seg.s + RING_OFFSETS[RING_OFFSETS.length - 1];
      if (Number.isNaN(start)) {
        start = a;
        end = b;
      } else if (a - end > 18) {
        groups.push(start, end);
        start = a;
        end = b;
      } else end = b;
    }
    if (!Number.isNaN(start)) groups.push(start, end);
    if (!groups.length) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = SEG_RADIUS * 2 + 4;
    this.strokeGroups(world, 8);
    ctx.strokeStyle = INK;
    ctx.lineWidth = SEG_RADIUS * 2 + 5.2;
    this.strokeGroups(world, 2);
  }

  /** Stroke the current stroke style along every stretch of train. */
  private strokeGroups(world: World, dy: number): void {
    const ctx = this.ctx;
    const path = world.chain.path;
    const tmp = this.tmp;
    const groups = this.groups;
    if (!groups.length) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let g = 0; g < groups.length; g += 2) {
      const a = groups[g];
      const b = groups[g + 1];
      path.pos(a, tmp);
      ctx.moveTo(tmp.x, tmp.y + dy);
      for (let s = a + 8; s < b; s += 8) {
        path.pos(s, tmp);
        ctx.lineTo(tmp.x, tmp.y + dy);
      }
      path.pos(b, tmp);
      ctx.lineTo(tmp.x, tmp.y + dy);
    }
    ctx.stroke();
  }

  /** A lit power-up: coloured halo, its icon, and a ring that runs down as it fades. */
  private drawPower(seg: Segment, time: number): void {
    const ctx = this.ctx;
    const style = POWER_STYLE[seg.power!];
    const pulse = 0.75 + 0.25 * Math.sin(time * 9 + seg.id);
    const blink = seg.powerLife < 3 && Math.sin(time * 18) < 0;
    ctx.globalAlpha = 0.45 * pulse;
    ctx.fillStyle = style.color;
    ctx.beginPath();
    ctx.arc(seg.x, seg.y, SEG_RADIUS + 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = style.color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(seg.x, seg.y, SEG_RADIUS + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (seg.powerLife / 12));
    ctx.stroke();
    if (!blink) ctx.drawImage(iconCanvas(style.icon, 64), seg.x - 17, seg.y - 50, 34, 34);
  }

  /** Manual aim: crosshair on the finger or the locked segment. */
  private drawReticle(world: World): void {
    if (world.aimMode !== 'manual') return;
    const p = world.aim.point ?? (world.aim.lock?.alive ? { x: world.aim.lock.x, y: world.aim.lock.y } : null);
    if (!p) return;
    const ctx = this.ctx;
    const r = 26 + Math.sin(world.time * 8) * 3;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(world.time * 1.5);
    ctx.lineCap = 'round';
    for (const [w, c] of [
      [7, INK],
      [3.5, '#ff5b6e'],
    ] as const) {
      ctx.lineWidth = w;
      ctx.strokeStyle = c;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, r, (i * Math.PI) / 2 + 0.25, ((i + 1) * Math.PI) / 2 - 0.25);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawEffects(world: World): void {
    const ctx = this.ctx;
    for (const e of world.effects) {
      if (e.kind === 'laser') {
        const x = e.a;
        const fade = Math.min(1, (e.dur - e.t) / 0.3, e.t / 0.15);
        ctx.globalAlpha = 0.35 * fade;
        ctx.fillStyle = '#ff5bd1';
        ctx.fillRect(x - 46, -200, 92, FIELD_H + 400);
        ctx.globalAlpha = 0.85 * fade;
        ctx.fillStyle = '#ffd6f4';
        ctx.fillRect(x - 14, -200, 28, FIELD_H + 400);
        ctx.globalAlpha = fade;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 4, -200, 8, FIELD_H + 400);
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawChest(seg: Segment, time: number): void {
    const sp = this.sprites!;
    const bob = Math.sin(time * 4 + seg.id) * 1.5;
    drawSprite(this.ctx, seg.kind === 'elite' ? sp.elite : sp.chest, seg.x, seg.y - 4 + bob, 0.95);
  }

  private drawHead(world: World): void {
    const chain = world.chain;
    if (!chain.segs.length) return;
    const h = chain.head;
    if (h.y < -60 || h.x < -60 || h.x > FIELD_W + 60) return;
    const ctx = this.ctx;
    const squash = 1 + Math.sin(world.time * 6) * 0.03;
    ctx.save();
    ctx.translate(h.x, h.y);
    if (Math.cos(h.a) < -0.1) ctx.scale(-1, 1);
    ctx.scale(squash, 2 - squash);
    drawSprite(ctx, this.sprites!.head, 0, 0);
    ctx.restore();
  }

  private drawZone(z: Zone, time: number): void {
    const ctx = this.ctx;
    const fade = Math.min(1, z.life / 0.4, (z.maxLife - z.life) / 0.2 + 0.2);
    ctx.globalAlpha = fade;
    switch (z.kind) {
      case 'swab': {
        ctx.save();
        ctx.translate(z.x, z.y);
        ctx.fillStyle = 'rgba(255,140,40,0.16)';
        ctx.beginPath();
        ctx.arc(0, 0, z.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.rotate(z.rot);
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#ff7a2e';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.arc(0, 0, z.r * 0.82, 0, Math.PI * 1.2);
        ctx.stroke();
        ctx.strokeStyle = '#ffd34d';
        ctx.lineWidth = 3;
        ctx.stroke();
        // the swab itself, spinning
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
        break;
      }
      case 'puddle': {
        ctx.fillStyle = 'rgba(120,220,255,0.28)';
        ctx.strokeStyle = 'rgba(190,245,255,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(z.x, z.y, z.r, z.r * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        const ripple = ((time * 1.5) % 1) * z.r;
        ctx.beginPath();
        ctx.ellipse(z.x, z.y, ripple, ripple * 0.8, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'fire': {
        const flick = 0.85 + Math.sin(time * 30 + z.x) * 0.15;
        ctx.fillStyle = 'rgba(255,120,40,0.3)';
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r * flick, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,210,80,0.35)';
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r * 0.5 * flick, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'tower': {
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

  private drawLasers(world: World): void {
    const towers = world.zones.filter((z) => z.kind === 'tower');
    if (towers.length < 2) return;
    const ctx = this.ctx;
    ctx.lineCap = 'round';
    const flick = 0.7 + Math.random() * 0.3;
    for (let i = 0; i < towers.length; i++) {
      for (let j = i + 1; j < towers.length; j++) {
        const a = towers[i];
        const b = towers[j];
        if (a.group !== b.group) continue;
        ctx.strokeStyle = `rgba(109,255,154,${(0.25 * flick).toFixed(3)})`;
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.strokeStyle = '#d9ffe6';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    }
  }

  private drawProjectile(p: Projectile, time: number): void {
    const ctx = this.ctx;
    switch (p.kind) {
      case 'capsule': {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.atan2(p.vy, p.vx));
        const len = p.child ? 13 : 17;
        const wid = p.child ? 6 : 8;
        ctx.fillStyle = '#7cc8ff';
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
        const sp = Math.hypot(p.vx, p.vy) || 1;
        const tx = p.x - (p.vx / sp) * 26;
        const ty = p.y - (p.vy / sp) * 26;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(255,211,77,0.35)';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.strokeStyle = '#ffe9a0';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        break;
      }
      case 'bubble': {
        ctx.fillStyle = 'rgba(143,232,255,0.55)';
        ctx.strokeStyle = '#d8faff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(p.x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.28, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'snot': {
        const sp = Math.hypot(p.vx, p.vy) || 1;
        ctx.fillStyle = 'rgba(155,224,79,0.45)';
        for (let i = 3; i >= 1; i--) {
          ctx.beginPath();
          ctx.arc(p.x - (p.vx / sp) * i * 9, p.y - (p.vy / sp) * i * 9, p.r * (1 - i * 0.2), 0, Math.PI * 2);
          ctx.fill();
        }
        const wob = 1 + Math.sin(time * 14 + p.x) * 0.08;
        ctx.fillStyle = '#9be04f';
        ctx.strokeStyle = '#2f5a12';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.r * wob, p.r / wob, p.rot, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath();
        ctx.arc(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.25, 0, Math.PI * 2);
        ctx.fill();
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
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        const s = p.r / 15;
        ctx.scale(s, s);
        ctx.fillStyle = 'rgba(220,235,255,0.25)';
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e8eef6';
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
        break;
      }
      case 'meteor': {
        const tx = p.tx ?? p.x;
        const ty = p.ty ?? p.y;
        const d = Math.hypot(tx - p.x, ty - p.y) || 1;
        const ux = (p.x - tx) / d;
        const uy = (p.y - ty) / d;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(255,122,46,0.45)';
        ctx.lineWidth = 16;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + ux * 70, p.y + uy * 70);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,211,77,0.8)';
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.fillStyle = '#ffb347';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // target marker
        ctx.strokeStyle = 'rgba(255,190,80,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(tx, ty, 18 + Math.sin(time * 20) * 3, 0, Math.PI * 2);
        ctx.stroke();
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
      case 'roller': {
        ctx.save();
        ctx.translate(p.x, p.y);
        const h = p.r;
        ctx.fillStyle = '#b77cff';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(-15, -h, 30, h * 2, 12);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#e6d2ff';
        const off = (p.rot * 10) % 12;
        for (let y = -h + 6 + off; y < h - 4; y += 12) {
          ctx.beginPath();
          ctx.arc(0, y, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        break;
      }
    }
  }

  private drawClouds(world: World): void {
    const ctx = this.ctx;
    for (const c of world.clouds) {
      ctx.fillStyle = 'rgba(30,30,60,0.25)';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y + 26, 30, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c9d6ea';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(c.x - 14, c.y + 2, 12, 0, Math.PI * 2);
      ctx.arc(c.x + 2, c.y - 6, 15, 0, Math.PI * 2);
      ctx.arc(c.x + 16, c.y + 3, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#9aa8c4';
      ctx.beginPath();
      ctx.roundRect(c.x - 26, c.y + 2, 52, 12, 6);
      ctx.fill();
    }
  }

  private drawHero(world: World): void {
    const ctx = this.ctx;
    const h = world.hero;
    const costume = world.costume.id;
    const sprite = this.hero(costume);
    const bob = Math.sin(world.time * 5) * 1.5;
    // Shadow clones (ninja ultimate) flank the hero, translucent.
    for (const e of world.effects) {
      if (e.kind !== 'clones') continue;
      const fade = Math.min(1, (e.dur - e.t) / 0.4, e.t / 0.2);
      ctx.globalAlpha = 0.45 * fade;
      for (const side of [-1, 1]) {
        const cx = Math.min(FIELD_W - 20, Math.max(20, h.x + side * 78));
        drawSprite(ctx, sprite, cx, h.y + 6 + Math.sin(world.time * 5 + side) * 1.5);
      }
      ctx.globalAlpha = 1;
    }
    if (world.rapid > 0) {
      // rapid-fire aura
      ctx.globalAlpha = 0.25 + 0.15 * Math.sin(world.time * 20);
      ctx.fillStyle = '#9fd8ff';
      ctx.beginPath();
      ctx.arc(h.x, h.y + bob, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    const kick = h.recoil * 4;
    const x = h.x - Math.cos(h.aim) * kick;
    const y = h.y + bob - Math.sin(h.aim) * kick;
    drawSprite(ctx, sprite, x, y);
    // pupils follow the aim (the pirate's right eye is under the patch)
    ctx.fillStyle = INK;
    const px = Math.cos(h.aim) * 3;
    const py = Math.sin(h.aim) * 3;
    for (const ex of costume === 'pirate' ? [-9] : [-9, 9]) {
      ctx.beginPath();
      ctx.arc(x + ex + px, y - 4 + py, 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // syringe held toward the target
    ctx.save();
    ctx.translate(x + 18, y + 4);
    ctx.rotate(h.aim);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.fillStyle = '#9fd8ff';
    ctx.beginPath();
    ctx.roundRect(-4, -5, 22, 10, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-8, -3, 4, 6);
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(30, 0);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  private drawFx(world: World): void {
    const ctx = this.ctx;
    const fx = world.fx;
    for (const p of fx.particles) {
      const t = p.life / p.max;
      ctx.globalAlpha = p.dust ? t * 0.6 : Math.min(1, t * 1.5);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.dust ? p.size * (1.6 - t * 0.6) : p.size * t, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const r of fx.rings) {
      const t = 1 - r.life / r.max;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 4 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r * (0.35 + 0.65 * t), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.lineJoin = 'round';
    for (const b of fx.bolts) {
      ctx.globalAlpha = b.life / b.max;
      for (const [w, c] of [
        [7, 'rgba(140,190,255,0.5)'],
        [2.5, '#ffffff'],
      ] as const) {
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(b.pts[0], b.pts[1]);
        for (let i = 2; i < b.pts.length; i += 2) ctx.lineTo(b.pts[i], b.pts[i + 1]);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    if (!this.numbers) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const n of fx.numbers) {
      const t = n.life / n.max;
      ctx.globalAlpha = Math.min(1, t * 2.5);
      ctx.font = n.crit ? CRIT_FONT : NUM_FONT;
      ctx.lineWidth = n.crit ? 5 : 4;
      ctx.strokeStyle = INK;
      ctx.strokeText(n.text, n.x, n.y);
      ctx.fillStyle = n.crit ? '#ff5b4d' : '#ffffff';
      ctx.fillText(n.text, n.x, n.y);
    }
    ctx.globalAlpha = 1;
  }
}

function hpLabel(seg: Segment): string {
  return fmt(Math.max(1, Math.ceil(seg.hp)));
}
