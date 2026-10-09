import { Compositor, type Stain } from '../render/compositor';

/**
 * The living specimen behind the menus: the battlefield's procedural
 * microscope background with no scene on top. It only animates while it is
 * on screen, at a modest frame rate, and eases between stain colours when
 * the selected chapter changes.
 */
export class Backdrop {
  readonly el: HTMLCanvasElement;
  private readonly compositor: Compositor;
  private readonly still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private raf = 0;
  private last = 0;
  private time = 40 + Math.random() * 60;
  private from: Stain;
  private to: Stain;
  private blend = 1;

  /** Null when WebGL2 is unavailable. */
  static create(stain: Stain): Backdrop | null {
    const canvas = document.createElement('canvas');
    const compositor = Compositor.create(canvas);
    return compositor ? new Backdrop(canvas, compositor, stain) : null;
  }

  private constructor(canvas: HTMLCanvasElement, compositor: Compositor, stain: Stain) {
    this.el = canvas;
    this.el.className = 'backdrop';
    this.compositor = compositor;
    this.from = stain;
    this.to = stain;
  }

  get alive(): boolean {
    return !this.compositor.lost;
  }

  setStain(stain: Stain): void {
    if (stain === this.to) return;
    this.from = this.current();
    this.to = stain;
    this.blend = 0;
    if (this.el.isConnected && !this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  show(parent: Element): void {
    parent.prepend(this.el);
    this.resize();
    window.addEventListener('resize', this.resize);
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.frame);
  }

  hide(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    window.removeEventListener('resize', this.resize);
    this.el.remove();
  }

  private readonly resize = (): void => {
    // The specimen is soft by nature, so it never needs full retina resolution.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.compositor.resize(Math.round(window.innerWidth * dpr), Math.round(window.innerHeight * dpr));
    this.draw();
  };

  private readonly frame = (now: number): void => {
    this.raf = 0;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    // ~30 fps is plenty for something this slow, and kind to batteries.
    if (dt < 1 / 32) {
      this.raf = requestAnimationFrame(this.frame);
      return;
    }
    this.last = now;
    if (!this.still) this.time += dt;
    this.blend = Math.min(1, this.blend + dt / 0.7);
    this.draw();
    if (!this.still || this.blend < 1) this.raf = requestAnimationFrame(this.frame);
  };

  private draw(): void {
    if (!this.alive) return;
    this.compositor.render(null, null, {
      time: this.time,
      stain: this.current(),
      ripples: [],
      lenses: [],
      aberration: 0,
      bloom: 0,
      flash: 0,
      flashColor: [0, 0, 0],
      danger: 0,
      backdropOnly: true,
    });
  }

  private current(): Stain {
    const k = this.blend * this.blend * (3 - 2 * this.blend);
    const mix = (a: [number, number, number], b: [number, number, number]): [number, number, number] => [
      a[0] + (b[0] - a[0]) * k,
      a[1] + (b[1] - a[1]) * k,
      a[2] + (b[2] - a[2]) * k,
    ];
    return { deep: mix(this.from.deep, this.to.deep), mid: mix(this.from.mid, this.to.mid), glow: mix(this.from.glow, this.to.glow) };
  }
}
