import { fmt } from '../core/format';
import type { Chain, PowerKind, Segment } from '../game/chain';
import { FIELD_H, FIELD_W, SEG_LEN, SEG_RADIUS } from '../game/constants';
import type { CostumeId } from '../game/costumes';
import type { ThemeId } from '../game/stage';
import { PALETTES } from '../game/themes';
import type { World } from '../game/world';
import { drawWeaponLayerAbove, drawWeaponLayerBelow } from './draw-weapons';
import { beginGlow, endGlow, glow, glowCtx, setGlowTarget } from './glow';
import { iconCanvas, type IconId } from './icons';
import { drawSprite, heroSprite, INK, ThemeSprites, type Sprite } from './sprites';

const RING_OFFSETS = [-32, -16, 0, 16, 32];
const LABEL_FONT = '600 17px "Fredoka Variable", ui-rounded, system-ui, sans-serif';
const NUM_FONT = '600 14px "Fredoka Variable", ui-rounded, system-ui, sans-serif';
const CRIT_FONT = '700 20px "Fredoka Variable", ui-rounded, system-ui, sans-serif';

const POWER_STYLE: Record<PowerKind, { icon: IconId; color: string }> = {
  freeze: { icon: 'g_slow', color: '#9fe7ff' },
  reverse: { icon: 'p_reverse', color: '#c9a2ff' },
  bomb: { icon: 'p_bomb', color: '#ff6b4a' },
  lightning: { icon: 'g_cd', color: '#ffd34d' },
  rapid: { icon: 'p_rapid', color: '#7cc8ff' },
  coins: { icon: 'coin', color: '#ffc93c' },
};

export interface Viewport {
  /** CSS pixels reserved at the top / bottom for HUD and safe areas. */
  top: number;
  bottom: number;
}

/**
 * Draws a World. In 'gl' mode both canvases are transparent layers that the
 * WebGL compositor turns into the final frame (background, bloom, warps);
 * in '2d' mode the under-canvas carries a painted backdrop and the two
 * canvases are simply stacked.
 */
export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly under: HTMLCanvasElement;
  /** Half-resolution light layer for the compositor's bloom (gl mode only). */
  readonly emissive: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly ectx: CanvasRenderingContext2D;
  mode: 'gl' | '2d';
  dpr = 1;
  private vw = 0;
  private vh = 0;
  scale = 1;
  ox = 0;
  oy = 0;
  /** Camera punch (1 = none), set by the run screen on big hits. */
  zoom = 1;
  /** Bumps whenever the static layer is redrawn, so the compositor re-uploads it. */
  staticVersion = 0;
  private sprites: ThemeSprites | null = null;
  private spritesKey = '';
  private backdropFor: World | null = null;
  private numbers = true;
  private readonly tmp = { x: 0, y: 0, a: 0 };
  private heroSprites = new Map<string, Sprite>();
  private groups: number[] = [];
  private lastHeroX = 0;
  private heroTrail: number[] = [];

  constructor(canvas: HTMLCanvasElement, under: HTMLCanvasElement, mode: 'gl' | '2d') {
    this.canvas = canvas;
    this.under = under;
    this.mode = mode;
    this.ctx = canvas.getContext('2d')!;
    this.emissive = document.createElement('canvas');
    this.ectx = this.emissive.getContext('2d')!;
  }

  setShowNumbers(on: boolean): void {
    this.numbers = on;
  }

  setMode(mode: 'gl' | '2d'): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.backdropFor = null;
  }

  resize(view: Viewport, dprCap = 2): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    this.vw = window.innerWidth;
    this.vh = window.innerHeight;
    for (const c of [this.canvas, this.under]) {
      c.width = Math.round(this.vw * this.dpr);
      c.height = Math.round(this.vh * this.dpr);
      c.style.width = `${this.vw}px`;
      c.style.height = `${this.vh}px`;
    }
    this.emissive.width = Math.round(this.canvas.width / 2);
    this.emissive.height = Math.round(this.canvas.height / 2);
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

  /** Field units → canvas pixels (top-left origin), for the compositor. */
  toCanvasPx(x: number, y: number): { x: number; y: number } {
    return { x: (this.ox + x * this.scale) * this.dpr, y: (this.oy + y * this.scale) * this.dpr };
  }

  get pxPerUnit(): number {
    return this.scale * this.dpr;
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
    // Zoom punches toward the middle of the field.
    const z = this.zoom;
    const cx = FIELD_W / 2;
    const cy = FIELD_H / 2;
    const tx = (this.ox + sx + (1 - z) * cx * this.scale) * this.dpr;
    const ty = (this.oy + sy + (1 - z) * cy * this.scale) * this.dpr;
    ctx.setTransform(k * z, 0, 0, k * z, tx, ty);
    if (this.mode === 'gl') {
      const e = this.ectx;
      e.setTransform(1, 0, 0, 1, 0, 0);
      e.globalCompositeOperation = 'source-over';
      e.globalAlpha = 1;
      e.clearRect(0, 0, this.emissive.width, this.emissive.height);
      e.setTransform(k * z * 0.5, 0, 0, k * z * 0.5, tx * 0.5, ty * 0.5);
      setGlowTarget(e);
    } else {
      setGlowTarget(null);
    }

    this.drawDecals(world);
    this.drawDanger(world);
    drawWeaponLayerBelow(ctx, world);
    for (const chain of world.chains) this.drawTrain(world, chain);
    this.drawReticle(world);
    drawWeaponLayerAbove(ctx, world);
    this.drawHero(world);
    this.drawFx(world);
    setGlowTarget(null);
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

  /**
   * The static layer: the track groove and the defence line. In 2D mode it
   * also carries a painted tissue backdrop (the compositor paints a live one).
   */
  private buildBackdrop(world: World): void {
    const c = this.under;
    const g = c.getContext('2d')!;
    const p = PALETTES[world.stage.theme];
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    const unit = this.dpr * this.scale;
    if (this.mode === '2d') {
      g.fillStyle = p.floor;
      g.fillRect(0, 0, c.width, c.height);
      let seed = world.stage.chapter * 977 + 13;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
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
        g.globalAlpha = 1;
      }
    }

    g.setTransform(unit, 0, 0, unit, this.ox * this.dpr, this.oy * this.dpr);
    // The groove: a soft channel with a faint stain-coloured centre line.
    g.lineJoin = 'round';
    g.lineCap = 'round';
    const stain = p.stain.glow;
    const glowCss = `rgba(${Math.round(stain[0] * 255)},${Math.round(stain[1] * 255)},${Math.round(stain[2] * 255)},`;
    for (const [w, style] of [
      [SEG_RADIUS * 2 + 10, 'rgba(0,0,0,0.28)'],
      [3, `${glowCss}0.14)`],
    ] as const) {
      g.strokeStyle = style;
      g.lineWidth = w;
      for (const path of world.layout.paths) {
        g.beginPath();
        let first = true;
        for (const [x, y] of path.points(6)) {
          if (first) g.moveTo(x, y);
          else g.lineTo(x, y);
          first = false;
        }
        g.stroke();
      }
    }

    const layout = world.layout;
    if (layout.fenceY !== null) this.drawMembrane(g, layout.fenceY, glowCss);
    else this.drawRing(g, layout.hero.x, layout.hero.y, layout.goalRadius, glowCss);

    if (this.mode === '2d') {
      g.setTransform(1, 0, 0, 1, 0, 0);
      const vg = g.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.3, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.5)');
      g.fillStyle = vg;
      g.fillRect(0, 0, c.width, c.height);
    }
    this.backdropFor = world;
    this.staticVersion++;
  }

  /** The defence line: a glowing lipid bilayer. */
  private drawMembrane(g: CanvasRenderingContext2D, y: number, glowCss: string): void {
    const grad = g.createLinearGradient(0, y - 16, 0, y + 26);
    grad.addColorStop(0, `${glowCss}0)`);
    grad.addColorStop(0.5, `${glowCss}0.22)`);
    grad.addColorStop(1, `${glowCss}0)`);
    g.fillStyle = grad;
    g.fillRect(-300, y - 16, FIELD_W + 600, 42);
    for (const row of [0, 12]) {
      for (let x = -300; x < FIELD_W + 300; x += 10) {
        g.fillStyle = row ? 'rgba(255,214,226,0.4)' : 'rgba(255,236,242,0.65)';
        g.beginPath();
        g.arc(x + (row ? 5 : 0), y + row, 4, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  private drawRing(g: CanvasRenderingContext2D, x: number, y: number, r: number, glowCss: string): void {
    g.strokeStyle = `${glowCss}0.35)`;
    g.lineWidth = 14;
    g.beginPath();
    g.arc(x, y, r + 6, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(255,224,236,0.7)';
    g.lineWidth = 4;
    g.setLineDash([2, 9]);
    g.beginPath();
    g.arc(x, y, r + 6, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
  }

  // ---------------------------------------------------------------- drawing

  private drawDecals(world: World): void {
    const ctx = this.ctx;
    const sp = this.sprites!;
    const [r, g, b] = PALETTES[world.stage.theme].stain.glow;
    const residue = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
    for (const d of world.fx.decals) {
      ctx.globalAlpha = (d.life / d.max) * 0.5;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      drawSprite(ctx, sp.splat, 0, 0, d.r / 34);
      ctx.restore();
    }
    // the burst leaves a faint fluorescent residue that fades with the stain
    beginGlow(ctx);
    for (const d of world.fx.decals) glow(ctx, d.x, d.y, d.r * 1.5, residue, (d.life / d.max) * 0.3);
    endGlow(ctx);
    ctx.globalAlpha = 1;
  }

  private drawDanger(world: World): void {
    const d = world.danger;
    if (d < 0.7) return;
    const ctx = this.ctx;
    const pulse = 0.5 + 0.5 * Math.sin(world.time * 10);
    const a = Math.min(1, (d - 0.7) / 0.22) * (0.3 + 0.4 * pulse);
    const layout = world.layout;
    beginGlow(ctx);
    if (layout.fenceY !== null) {
      for (let x = 0; x <= FIELD_W; x += 60) glow(ctx, x, layout.fenceY + 6, 70, '#ff2a4a', a * 0.7);
    } else {
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2;
        glow(ctx, layout.hero.x + Math.cos(ang) * (layout.goalRadius + 8), layout.hero.y + Math.sin(ang) * (layout.goalRadius + 8), 50, '#ff2a4a', a * 0.7);
      }
    }
    endGlow(ctx);
  }

  private drawTrain(world: World, chain: Chain): void {
    const ctx = this.ctx;
    const sp = this.sprites!;
    const path = chain.path;
    const segs = chain.segs;
    const tmp = this.tmp;
    const t = world.time;
    this.drawSilhouette(chain);
    // Tail first so the front of the train draws on top. Rings ripple in a travelling wave.
    for (let i = segs.length - 1; i >= 0; i--) {
      const seg = segs[i];
      if (!seg.visible) continue;
      for (let r = 0; r < RING_OFFSETS.length; r++) {
        const s = seg.s + RING_OFFSETS[r];
        path.pos(s, tmp);
        const wave = Math.sin(t * 5 - s * 0.045) * 2.2;
        drawSprite(ctx, (seg.index + r) % 2 === 0 ? sp.ringA : sp.ringB, tmp.x - Math.sin(tmp.a) * wave, tmp.y + 2 + Math.cos(tmp.a) * wave);
      }
      const health = seg.hp / seg.maxHp;
      if (health < 0.66) drawSprite(ctx, health < 0.33 ? sp.crack2 : sp.crack1, seg.x, seg.y + 2);
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
      this.strokeGroups(chain, 2);
    }
    // Chest and power-up halos.
    beginGlow(ctx);
    for (const seg of segs) {
      if (!seg.visible) continue;
      if (seg.kind === 'elite') glow(ctx, seg.x, seg.y - 6, 54 + Math.sin(t * 5 + seg.id) * 6, '#ffc93c', 0.75);
      else if (seg.kind === 'chest') glow(ctx, seg.x, seg.y - 6, 44, '#38e8d2', 0.55);
      if (seg.power) glow(ctx, seg.x, seg.y, 56 + Math.sin(t * 8 + seg.id) * 6, POWER_STYLE[seg.power].color, 0.75);
    }
    endGlow(ctx);
    // Chests, power-ups and HP labels on top of the body.
    ctx.font = LABEL_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (let i = segs.length - 1; i >= 0; i--) {
      const seg = segs[i];
      if (!seg.visible) continue;
      if (seg.kind !== 'normal') this.drawChest(seg, t);
      if (seg.power) this.drawPower(seg, t);
      const label = fmt(Math.max(1, Math.ceil(seg.hp)));
      const ly = seg.y + (seg.kind === 'normal' ? 1 : 9);
      ctx.lineWidth = 4;
      ctx.strokeStyle = INK;
      ctx.strokeText(label, seg.x, ly);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, seg.x, ly);
    }
    this.drawHead(world, chain);
  }

  /** One ink outline (plus a drop shadow) around the train, stroked as a fat path. */
  private drawSilhouette(chain: Chain): void {
    const ctx = this.ctx;
    const segs = chain.segs;
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
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = SEG_RADIUS * 2 + 6;
    this.strokeGroups(chain, 10);
    ctx.strokeStyle = INK;
    ctx.lineWidth = SEG_RADIUS * 2 + 7;
    this.strokeGroups(chain, 2);
  }

  /** Stroke the current stroke style along every stretch of train. */
  private strokeGroups(chain: Chain, dy: number): void {
    const ctx = this.ctx;
    const path = chain.path;
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

  private drawChest(seg: Segment, time: number): void {
    const sp = this.sprites!;
    const bob = Math.sin(time * 4 + seg.id) * 1.5;
    drawSprite(this.ctx, seg.kind === 'elite' ? sp.elite : sp.chest, seg.x, seg.y - 4 + bob, 0.95);
  }

  /** A lit power-up: its icon and a ring that runs down as it fades. */
  private drawPower(seg: Segment, time: number): void {
    const ctx = this.ctx;
    const style = POWER_STYLE[seg.power!];
    const blink = seg.powerLife < 3 && Math.sin(time * 18) < 0;
    ctx.strokeStyle = style.color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(seg.x, seg.y, SEG_RADIUS + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (seg.powerLife / 12));
    ctx.stroke();
    if (!blink) {
      const bob = Math.sin(time * 6 + seg.id) * 3;
      ctx.drawImage(iconCanvas(style.icon, 64), seg.x - 18, seg.y - 54 + bob, 36, 36);
    }
  }

  /** The virus head: body sprite plus a live face that tracks you, blinks and chomps. */
  private drawHead(world: World, chain: Chain): void {
    if (!chain.segs.length) return;
    const h = chain.head;
    if (h.y < -60 || h.x < -60 || h.x > FIELD_W + 60) return;
    const ctx = this.ctx;
    const t = world.time + chain.lane * 1.7;
    const danger = chain.danger;
    const p = PALETTES[world.stage.theme];
    if (danger > 0.72) {
      beginGlow(ctx);
      glow(ctx, h.x, h.y, 80 + Math.sin(t * 12) * 10, '#ff2a4a', Math.min(1, (danger - 0.72) * 4) * 0.8);
      endGlow(ctx);
    }
    const flip = Math.cos(h.a) < -0.1 ? -1 : 1;
    const squash = 1 + Math.sin(t * 6) * 0.03 + (chain.retracting ? 0.08 : 0);
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(Math.sin(t * 2.3) * 0.06);
    ctx.scale(flip * squash, 2 - squash);
    drawSprite(ctx, this.sprites!.head, 0, 0);
    // face (drawn facing right; the flip handles left)
    const fx = 7;
    const blink = t % 3.7 < 0.13;
    const hx = (world.hero.x - h.x) * flip;
    const hy = world.hero.y - h.y;
    const hl = Math.hypot(hx, hy) || 1;
    const lookX = (hx / hl) * 3;
    const lookY = (hy / hl) * 3;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    for (const ex of [-11, 11]) {
      ctx.beginPath();
      ctx.ellipse(fx + ex, -6, 8, blink ? 1.5 : 9.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (!blink) {
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(fx + ex + lookX, -5 + lookY, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
      }
    }
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(fx - 20, -20 - danger * 3);
    ctx.lineTo(fx - 5, -14);
    ctx.moveTo(fx + 20, -20 - danger * 3);
    ctx.lineTo(fx + 5, -14);
    ctx.stroke();
    // chomping mouth, faster as it closes in
    const chomp = (Math.sin(t * (6 + danger * 12)) + 1) / 2;
    const mh = 6 + chomp * 9;
    ctx.fillStyle = '#3a0d18';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(fx - 12, 9, 24, mh, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(fx - 8, 10);
    ctx.lineTo(fx - 4, 10);
    ctx.lineTo(fx - 6, 10 + Math.min(6, mh - 2));
    ctx.closePath();
    ctx.moveTo(fx + 4, 10);
    ctx.lineTo(fx + 8, 10);
    ctx.lineTo(fx + 6, 10 + Math.min(6, mh - 2));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // eyes glow faintly in the stain colour
    beginGlow(ctx);
    const [r, g, b] = p.stain.glow;
    const eyeGlow = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
    for (const ex of [-11, 11]) glow(ctx, h.x + (fx + ex) * flip, h.y - 6, 16, eyeGlow, 0.35);
    endGlow(ctx);
  }

  /** Manual aim: crosshair on the finger or the locked segment. */
  private drawReticle(world: World): void {
    if (world.aimMode !== 'manual') return;
    const p = world.aim.point ?? (world.aim.lock?.alive ? { x: world.aim.lock.x, y: world.aim.lock.y } : null);
    if (!p) return;
    const ctx = this.ctx;
    const r = 26 + Math.sin(world.time * 8) * 3;
    beginGlow(ctx);
    glow(ctx, p.x, p.y, 48, '#ff5b6e', 0.4);
    endGlow(ctx);
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

  private drawHero(world: World): void {
    const ctx = this.ctx;
    const h = world.hero;
    const costume = world.costume.id;
    const sprite = this.hero(costume);
    const t = world.time;
    const bob = Math.sin(t * 5) * 1.5;
    const [heartDark] = world.costume.heart;
    // movement afterimages
    const moved = h.x - this.lastHeroX;
    this.lastHeroX = h.x;
    this.heroTrail.unshift(h.x);
    if (this.heroTrail.length > 6) this.heroTrail.length = 6;
    if (Math.abs(moved) > 2) {
      for (let i = 2; i < this.heroTrail.length; i += 2) {
        ctx.globalAlpha = 0.18 * (1 - i / 6);
        drawSprite(ctx, sprite, this.heroTrail[i], h.y + bob);
      }
      ctx.globalAlpha = 1;
    }
    beginGlow(ctx);
    glow(ctx, h.x, h.y + bob, 70, heartDark, 0.35 + 0.1 * Math.sin(t * 3));
    if (world.rapid > 0) glow(ctx, h.x, h.y + bob, 90, '#7cc8ff', 0.5 + 0.2 * Math.sin(t * 20));
    endGlow(ctx);
    // Shadow clones (ninja ultimate) flank the hero, translucent.
    for (const e of world.effects) {
      if (e.kind !== 'clones') continue;
      const fade = Math.min(1, (e.dur - e.t) / 0.4, e.t / 0.2);
      ctx.globalAlpha = 0.45 * fade;
      for (const side of [-1, 1]) {
        const cx = Math.min(FIELD_W - 20, Math.max(20, h.x + side * 78));
        drawSprite(ctx, sprite, cx, h.y + 6 + Math.sin(t * 5 + side) * 1.5);
      }
      ctx.globalAlpha = 1;
    }
    const kick = h.recoil * 4;
    const x = h.x - Math.cos(h.aim) * kick;
    const y = h.y + bob - Math.sin(h.aim) * kick;
    // squash on recoil
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1 + h.recoil * 0.06, 1 - h.recoil * 0.07);
    drawSprite(ctx, sprite, 0, 0);
    ctx.restore();
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
    if (h.recoil > 0.55) {
      // muzzle flash at the syringe tip
      beginGlow(ctx);
      glow(ctx, x + 18 + Math.cos(h.aim) * 34, y + 4 + Math.sin(h.aim) * 34, 18 + h.recoil * 10, '#bff3ff', h.recoil);
      endGlow(ctx);
    }
  }

  private drawFx(world: World): void {
    const ctx = this.ctx;
    const fx = world.fx;
    // stuck needles
    ctx.lineCap = 'round';
    for (const p of fx.pins) {
      ctx.globalAlpha = Math.min(1, p.life / 0.2);
      ctx.strokeStyle = '#ffe9a0';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - Math.cos(p.a) * 16, p.y - Math.sin(p.a) * 16);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // particles: dust normal, sparks additive
    for (const p of fx.particles) {
      if (!p.dust) continue;
      const t = p.life / p.max;
      ctx.globalAlpha = t * 0.6;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1.6 - t * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
    beginGlow(ctx);
    for (const p of fx.particles) {
      if (p.dust) continue;
      const t = p.life / p.max;
      glow(ctx, p.x, p.y, p.size * 2.6 * t + 2, p.color, Math.min(1, t * 1.5));
    }
    const light = glowCtx(ctx);
    for (const r of fx.rings) {
      const t = 1 - r.life / r.max;
      for (const g of light === ctx ? [ctx] : [ctx, light]) {
        g.globalAlpha = (1 - t) * 0.9;
        g.strokeStyle = r.color;
        g.lineWidth = (6 * (1 - t) + 1) * (g === light ? 2.5 : 1);
        g.beginPath();
        g.arc(r.x, r.y, r.r * (0.35 + 0.65 * t), 0, Math.PI * 2);
        g.stroke();
      }
    }
    endGlow(ctx);
    ctx.lineJoin = 'round';
    light.lineJoin = 'round';
    for (const b of fx.bolts) {
      const a = b.life / b.max;
      for (const [w, c, g] of [
        [12, 'rgba(110,170,255,0.5)', light],
        [4, 'rgba(190,220,255,0.85)', ctx],
        [1.6, '#ffffff', ctx],
      ] as const) {
        g.globalAlpha = a;
        g.strokeStyle = c;
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(b.pts[0], b.pts[1]);
        for (let i = 2; i < b.pts.length; i += 2) g.lineTo(b.pts[i], b.pts[i + 1]);
        g.stroke();
      }
      beginGlow(ctx);
      glow(ctx, b.pts[b.pts.length - 2], b.pts[b.pts.length - 1], 30, '#9fd0ff', a);
      endGlow(ctx);
    }
    ctx.globalAlpha = 1;
    if (!this.numbers) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const n of fx.numbers) {
      const t = n.life / n.max;
      const age = n.max - n.life;
      // pop in with a little overshoot
      const pop = age < 0.12 ? 1 + 0.7 * (1 - age / 0.12) : 1;
      ctx.globalAlpha = Math.min(1, t * 2.5);
      ctx.save();
      ctx.translate(n.x, n.y);
      ctx.scale(pop, pop);
      ctx.font = n.crit ? CRIT_FONT : NUM_FONT;
      ctx.lineWidth = n.crit ? 5 : 4;
      ctx.strokeStyle = INK;
      ctx.strokeText(n.text, 0, 0);
      ctx.fillStyle = n.crit ? n.color : '#ffffff';
      ctx.fillText(n.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}
