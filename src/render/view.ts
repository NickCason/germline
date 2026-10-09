import { PALETTES } from '../game/themes';
import type { RunEvent, World } from '../game/world';
import { Compositor, type Lens, type Ripple } from './compositor';
import { Renderer, type Viewport } from './renderer';

export type Gfx = 'auto' | 'high' | 'low';

interface LiveRipple {
  x: number;
  y: number;
  age: number;
  life: number;
  speed: number;
  strength: number;
}

/**
 * Everything between the simulation and the pixels for one run: the 2D
 * renderer, the WebGL compositor (when available and fast enough), and the
 * "juice" — hit-stop, zoom punches, shockwave ripples, flashes, aberration.
 */
export class BattleView {
  readonly el: HTMLDivElement;
  readonly renderer: Renderer;
  private compositor: Compositor | null = null;
  private glCanvas: HTMLCanvasElement | null = null;
  private readonly gfx: Gfx;
  private uploadedStatic = -1;
  private ripples: LiveRipple[] = [];
  private hitStop = 0;
  private slowMo = 0;
  private punch = 0;
  private aberration = 0;
  private flash = 0;
  private flashColor: [number, number, number] = [1, 1, 1];
  private time = 0;
  private viewport: Viewport = { top: 0, bottom: 0 };
  // adaptive quality
  private slowFor = 0;
  private dprCap = 2;

  constructor(gfx: Gfx) {
    this.gfx = gfx;
    this.el = document.createElement('div');
    this.el.className = 'stage';
    const scene = document.createElement('canvas');
    const under = document.createElement('canvas');
    if (gfx !== 'low') {
      const gl = document.createElement('canvas');
      this.compositor = Compositor.create(gl);
      if (this.compositor) this.glCanvas = gl;
    }
    this.renderer = new Renderer(scene, under, this.compositor ? 'gl' : '2d');
    this.mountCanvases();
  }

  get mode(): 'gl' | '2d' {
    return this.renderer.mode;
  }

  /** The canvas that receives touches. */
  get input(): HTMLElement {
    return this.el;
  }

  private mountCanvases(): void {
    this.el.replaceChildren();
    if (this.renderer.mode === 'gl' && this.glCanvas) this.el.append(this.glCanvas);
    else this.el.append(this.renderer.under, this.renderer.canvas);
  }

  resize(view: Viewport): void {
    this.viewport = view;
    this.renderer.resize(view, this.dprCap);
    if (this.compositor && this.glCanvas) {
      this.compositor.resize(this.renderer.canvas.width, this.renderer.canvas.height);
      this.glCanvas.style.width = `${window.innerWidth}px`;
      this.glCanvas.style.height = `${window.innerHeight}px`;
      this.uploadedStatic = -1;
    }
  }

  /** React to a game event with screen-level feedback. */
  event(e: RunEvent, world: World): void {
    switch (e.type) {
      case 'chest':
        this.ripple(e.x, e.y, e.elite ? 26 : 14, e.elite ? 1.1 : 0.7);
        if (e.elite) {
          this.hitStop = Math.max(this.hitStop, 0.07);
          this.punch = Math.max(this.punch, 0.035);
          this.flashOf([1, 0.85, 0.4], 0.18);
        }
        break;
      case 'boom':
        this.ripple(e.x, e.y, Math.min(30, 8 + e.r * 0.18), 0.8);
        world.fx.kick(Math.min(6, e.r / 20));
        break;
      case 'power':
        this.ripple(e.x, e.y, 24, 1);
        this.aberration = Math.max(this.aberration, 0.6);
        this.flashOf([0.7, 0.9, 1], 0.15);
        break;
      case 'ult':
        this.ripple(e.x, e.y, 40, 1.6);
        this.hitStop = Math.max(this.hitStop, 0.09);
        this.punch = Math.max(this.punch, 0.06);
        this.aberration = 1;
        this.flashOf([1, 0.9, 0.95], 0.35);
        break;
      case 'revive':
        for (const c of world.chains) this.ripple(c.head.x, c.head.y, 44, 1.8);
        this.aberration = 1;
        this.flashOf([1, 0.6, 0.7], 0.4);
        break;
      case 'mutation':
        this.aberration = 1;
        this.punch = Math.max(this.punch, 0.04);
        this.flashOf([1, 0.3, 0.4], 0.25);
        break;
      case 'won':
        this.slowMo = 1.4;
        for (const c of world.chains) this.ripple(c.head.x, c.head.y, 50, 2.2);
        this.flashOf([1, 1, 1], 0.5);
        break;
      case 'lost':
        this.aberration = 1;
        this.flashOf([1, 0.2, 0.3], 0.35);
        break;
      default:
        break;
    }
  }

  private ripple(fx: number, fy: number, strength: number, life: number): void {
    const p = this.renderer.toCanvasPx(fx, fy);
    if (this.ripples.length >= 8) this.ripples.shift();
    this.ripples.push({ x: p.x, y: p.y, age: 0, life, speed: 900 * this.renderer.pxPerUnit, strength: strength * this.renderer.dpr });
  }

  private flashOf(color: [number, number, number], amount: number): void {
    this.flashColor = color;
    this.flash = Math.max(this.flash, amount);
  }

  /**
   * Advance juice timers by real time. Returns how fast the simulation
   * should run this frame (0 during a hit-stop, slower during slow-mo).
   */
  tick(dt: number): number {
    this.time += dt;
    for (const r of this.ripples) r.age += dt;
    this.ripples = this.ripples.filter((r) => r.age < r.life);
    this.punch *= Math.exp(-dt * 10);
    this.aberration = Math.max(0, this.aberration - dt * 2.2);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.renderer.zoom = 1 + this.punch;
    this.slowMo = Math.max(0, this.slowMo - dt);
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      return 0;
    }
    return this.slowMo > 0 ? 0.35 : 1;
  }

  /** Feed actual frame timings in; steps quality down if the device can't keep up. */
  trackFrame(dt: number): void {
    if (this.gfx !== 'auto' || this.renderer.mode !== 'gl') return;
    if (dt > 1 / 42) this.slowFor += dt;
    else this.slowFor = Math.max(0, this.slowFor - dt * 0.5);
    if (this.slowFor < 3) return;
    this.slowFor = 0;
    if (this.compositor && this.compositor.quality > 1) {
      this.compositor.quality = 1;
      this.dprCap = 1.5;
      this.resize(this.viewport);
      return;
    }
    // Still struggling: drop to the plain 2D renderer.
    this.renderer.setMode('2d');
    this.mountCanvases();
    this.resize(this.viewport);
  }

  render(world: World): void {
    this.renderer.render(world);
    if (this.renderer.mode !== 'gl' || !this.compositor) return;
    if (this.uploadedStatic !== this.renderer.staticVersion) {
      this.compositor.setStatic(this.renderer.under);
      this.uploadedStatic = this.renderer.staticVersion;
    }
    const ripples: Ripple[] = this.ripples.map((r) => ({
      x: r.x,
      y: r.y,
      r: r.age * r.speed,
      s: r.strength * (1 - r.age / r.life),
    }));
    const lenses: Lens[] = [];
    for (const z of world.zones) {
      if (z.kind !== 'well' || lenses.length >= 4) continue;
      const p = this.renderer.toCanvasPx(z.x, z.y);
      const fade = Math.min(1, z.life / 0.5, (z.maxLife - z.life) / 0.3);
      lenses.push({ x: p.x, y: p.y, r: z.r * 2.2 * this.renderer.pxPerUnit, s: 18 * this.renderer.dpr * fade });
    }
    const stain = PALETTES[world.stage.theme].stain;
    const danger = world.danger;
    this.compositor.render(this.renderer.canvas, this.renderer.emissive, {
      time: this.time,
      stain: { deep: stain.deep, mid: stain.mid, glow: stain.glow },
      ripples,
      lenses,
      aberration: Math.min(1, this.aberration + world.fx.flash * 0.5),
      bloom: 0.95,
      flash: Math.max(this.flash, world.fx.flash * 0.4),
      flashColor: this.flashColor,
      danger: danger > 0.72 ? Math.min(1, (danger - 0.72) / 0.2) * 0.35 : 0,
    });
  }
}
