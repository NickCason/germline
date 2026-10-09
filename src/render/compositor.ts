/**
 * WebGL2 post-processing for the battlefield: a living fluorescence-microscopy
 * background, bloom on everything bright, shockwave ripples and gravity-well
 * lensing that warp the whole scene, chromatic aberration on big moments, a
 * danger pulse at the edges, vignette and a touch of grain.
 *
 * The game itself is still drawn with Canvas 2D onto transparent canvases;
 * this layer takes those as textures and composites the final frame.
 */

export interface Stain {
  /** Deep and mid background tones, and the glow colour of the stain. */
  deep: [number, number, number];
  mid: [number, number, number];
  glow: [number, number, number];
}

export interface Ripple {
  /** Centre in output pixels (top-left origin), radius in pixels, strength in pixels of displacement. */
  x: number;
  y: number;
  r: number;
  s: number;
}

export interface Lens {
  x: number;
  y: number;
  r: number;
  s: number;
}

export interface FrameParams {
  time: number;
  stain: Stain;
  ripples: Ripple[];
  lenses: Lens[];
  /** 0..1 */
  aberration: number;
  bloom: number;
  flash: number;
  flashColor: [number, number, number];
  danger: number;
  /** Background only (menus): skip the scene, static layer and bloom. */
  backdropOnly?: boolean;
}

const MAX_RIPPLES = 8;
const MAX_LENSES = 4;

const VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const NOISE = `
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
vec2 hash2(vec2 p) {
  float n = hash(p);
  return vec2(n, hash(p + n * 17.17));
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}`;

/** Procedural specimen: drifting cells with glowing membranes and nuclei, caustic light, motes. */
const FS_BG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uGlow;
${NOISE}
vec2 voronoi(vec2 p, float t) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 h = hash2(n + g);
      vec2 c = g + 0.5 + 0.38 * sin(t * 0.35 + 6.2831 * h);
      float d = length(c - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  return vec2(d1, d2);
}
void main() {
  vec2 px = vUv * uRes;
  vec2 p = px / uRes.y * 7.0;
  p.y -= uTime * 0.025;
  vec2 warp = vec2(noise(p * 0.45 + uTime * 0.05), noise(p * 0.45 + 9.1 - uTime * 0.04));
  vec2 v = voronoi(p + warp * 0.9, uTime);
  float wall = smoothstep(0.11, 0.0, v.y - v.x);
  float nucleus = smoothstep(0.22, 0.02, v.x);
  float n = noise(p * 1.3 - uTime * 0.06);
  vec3 col = mix(uDeep, uMid, clamp(vUv.y * 0.9 + n * 0.25, 0.0, 1.0));
  col += uGlow * wall * (0.11 + 0.07 * n);
  col += uGlow * nucleus * 0.07;
  float c = sin(p.x * 1.9 + uTime * 0.5 + sin(p.y * 1.6 - uTime * 0.35)) * sin(p.y * 2.1 - uTime * 0.45 + sin(p.x * 1.2));
  col += uGlow * pow(max(c, 0.0), 7.0) * 0.07;
  // floating motes, two parallax layers
  for (int k = 0; k < 2; k++) {
    float s = k == 0 ? 26.0 : 15.0;
    vec2 q = px / s + vec2(0.0, uTime * (k == 0 ? 0.4 : 0.7));
    vec2 cell = floor(q);
    vec2 h = hash2(cell);
    float d = length(fract(q) - h);
    float tw = 0.5 + 0.5 * sin(uTime * 2.0 + h.x * 40.0);
    col += uGlow * smoothstep(0.09, 0.0, d) * step(0.9, hash(cell + 3.7)) * (0.35 + 0.4 * tw) * (k == 0 ? 0.6 : 1.0);
  }
  o = vec4(col, 1.0);
}`;

/** Downsample to quarter size, keeping only the bright parts of the scene. */
const FS_BRIGHT = `#version 300 es
precision mediump float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uThreshold;
void main() {
  vec3 c = texture(uTex, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture(uTex, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture(uTex, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture(uTex, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  o = vec4(uThreshold > 0.0 ? c * smoothstep(uThreshold, uThreshold + 0.3, l) : c, 1.0);
}`;

/** 9-tap Gaussian using linear filtering (5 fetches). */
const FS_BLUR = `#version 300 es
precision mediump float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uTex;
uniform vec2 uDir;
void main() {
  vec3 c = texture(uTex, vUv).rgb * 0.2270270270;
  c += texture(uTex, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture(uTex, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture(uTex, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
  c += texture(uTex, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
  o = vec4(c, 1.0);
}`;

const FS_COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uBg;
uniform sampler2D uStatic;
uniform sampler2D uScene;
uniform sampler2D uBloomA;
uniform sampler2D uBloomB;
uniform sampler2D uLight;
uniform vec2 uRes;
uniform float uTime;
uniform vec4 uRipples[${MAX_RIPPLES}];
uniform int uRippleCount;
uniform vec4 uLens[${MAX_LENSES}];
uniform int uLensCount;
uniform float uAberr;
uniform float uBloom;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uDanger;
uniform float uSceneOn;
${NOISE}
void main() {
  vec2 px = vUv * uRes;
  vec2 off = vec2(0.0);
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    if (i >= uRippleCount) break;
    vec4 r = uRipples[i];
    vec2 d = px - r.xy;
    float dist = length(d);
    float band = exp(-pow((dist - r.z) / 22.0, 2.0));
    off += d / max(dist, 1.0) * band * r.w;
  }
  for (int i = 0; i < ${MAX_LENSES}; i++) {
    if (i >= uLensCount) break;
    vec4 l = uLens[i];
    vec2 d = px - l.xy;
    float dist = length(d);
    float f = smoothstep(l.z, 0.0, dist);
    vec2 dir = d / max(dist, 1.0);
    // pinch toward the singularity, with a swirl
    off -= dir * f * f * l.w;
    off += vec2(-dir.y, dir.x) * f * f * l.w * 0.6;
  }
  vec2 uv = (px + off) / uRes;
  vec3 col = texture(uBg, uv).rgb;
  if (uSceneOn > 0.5) {
    vec4 st = texture(uStatic, uv);
    col = col * (1.0 - st.a) + st.rgb;
    vec2 ca = (uv - 0.5) * uAberr * 0.014;
    vec4 sc = texture(uScene, uv);
    float r = texture(uScene, uv + ca).r;
    float b = texture(uScene, uv - ca).b;
    col = col * (1.0 - sc.a) + vec3(r, sc.g, b);
    // light: the crisp glow layer itself, plus two sizes of bloom around it
    col += texture(uLight, uv).rgb * 0.85;
    col += texture(uBloomA, uv).rgb * uBloom + texture(uBloomB, uv).rgb * uBloom * 1.1;
  }
  vec2 q = vUv - 0.5;
  float v = dot(q, q);
  col *= 1.0 - v * 0.9;
  col += vec3(1.0, 0.12, 0.25) * uDanger * smoothstep(0.1, 0.32, v) * (0.55 + 0.45 * sin(uTime * 9.0));
  col += uFlashColor * uFlash;
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, 1.1);
  col += (hash(px + fract(uTime) * 91.0) - 0.5) * 0.022;
  o = vec4(col, 1.0);
}`;

interface Target {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;
  w: number;
  h: number;
}

export class Compositor {
  readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly progBg: WebGLProgram;
  private readonly progBright: WebGLProgram;
  private readonly progBlur: WebGLProgram;
  private readonly progComp: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly sceneTex: WebGLTexture;
  private readonly staticTex: WebGLTexture;
  private readonly lightTex: WebGLTexture;
  private bg: Target | null = null;
  private brightA: Target | null = null;
  private blurA: Target | null = null;
  private brightB: Target | null = null;
  private blurB: Target | null = null;
  private w = 0;
  private h = 0;
  private uniforms = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
  /** Bloom detail: 2 = two glow sizes, 1 = one (cheaper). */
  quality = 2;
  lost = false;

  /** Returns null when WebGL2 is unavailable. */
  static create(canvas: HTMLCanvasElement): Compositor | null {
    try {
      const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
      if (!gl) return null;
      return new Compositor(canvas, gl);
    } catch {
      return null;
    }
  }

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.canvas = canvas;
    this.gl = gl;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    this.progBg = this.program(FS_BG);
    this.progBright = this.program(FS_BRIGHT);
    this.progBlur = this.program(FS_BLUR);
    this.progComp = this.program(FS_COMPOSITE);
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    for (const prog of [this.progBg, this.progBright, this.progBlur, this.progComp]) {
      const loc = gl.getAttribLocation(prog, 'aPos');
      if (loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      }
    }
    this.vao = vao;
    this.sceneTex = this.texture();
    this.staticTex = this.texture();
    this.lightTex = this.texture();
    // Layers start transparent until a run provides them.
    for (const tex of [this.sceneTex, this.staticTex, this.lightTex]) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    }
  }

  resize(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    const half = (n: number) => Math.max(1, Math.round(n / 2));
    const quarter = (n: number) => Math.max(1, Math.round(n / 4));
    const eighth = (n: number) => Math.max(1, Math.round(n / 8));
    for (const t of [this.bg, this.brightA, this.blurA, this.brightB, this.blurB]) this.dispose(t);
    this.bg = this.target(half(w), half(h));
    this.brightA = this.target(quarter(w), quarter(h));
    this.blurA = this.target(quarter(w), quarter(h));
    this.brightB = this.target(eighth(w), eighth(h));
    this.blurB = this.target(eighth(w), eighth(h));
  }

  /** Upload the static layer (track groove, defence line). Call when it changes. */
  setStatic(source: HTMLCanvasElement): void {
    this.upload(this.staticTex, source);
  }

  /**
   * `scene` is the full-resolution game layer; `light` is the half-resolution
   * emissive layer (glows, beams) that feeds the bloom.
   */
  render(scene: HTMLCanvasElement | null, light: HTMLCanvasElement | null, f: FrameParams): void {
    const gl = this.gl;
    if (this.lost || !this.bg) return;
    gl.bindVertexArray(this.vao);
    gl.disable(gl.BLEND);

    // 1. background at half resolution
    this.use(this.progBg, this.bg);
    this.set2(this.progBg, 'uRes', this.w, this.h);
    this.set1(this.progBg, 'uTime', f.time);
    this.set3(this.progBg, 'uDeep', ...f.stain.deep);
    this.set3(this.progBg, 'uMid', ...f.stain.mid);
    this.set3(this.progBg, 'uGlow', ...f.stain.glow);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const sceneOn = !!scene && !!light && !f.backdropOnly;
    if (sceneOn) {
      this.upload(this.sceneTex, scene!);
      this.upload(this.lightTex, light!);
      // 2. downsample the light layer to quarter res and blur it
      this.use(this.progBright, this.brightA!);
      this.bind(this.progBright, 'uTex', this.lightTex, 0);
      this.set2(this.progBright, 'uTexel', 0.5 / light!.width, 0.5 / light!.height);
      this.set1(this.progBright, 'uThreshold', 0.0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.blur(this.brightA!, this.blurA!);
      // 3. a wider, softer glow at eighth res
      if (this.quality > 1) {
        this.use(this.progBright, this.brightB!);
        this.bind(this.progBright, 'uTex', this.brightA!.tex, 0);
        this.set2(this.progBright, 'uTexel', 1 / this.brightA!.w, 1 / this.brightA!.h);
        this.set1(this.progBright, 'uThreshold', 0.0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        this.blur(this.brightB!, this.blurB!);
      }
    }

    // 4. composite to the screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    const p = this.progComp;
    gl.useProgram(p);
    this.bind(p, 'uBg', this.bg.tex, 0);
    this.bind(p, 'uStatic', this.staticTex, 1);
    this.bind(p, 'uScene', this.sceneTex, 2);
    this.bind(p, 'uBloomA', this.brightA!.tex, 3);
    this.bind(p, 'uBloomB', (this.quality > 1 ? this.brightB! : this.brightA!).tex, 4);
    this.bind(p, 'uLight', this.lightTex, 5);
    this.set2(p, 'uRes', this.w, this.h);
    this.set1(p, 'uTime', f.time);
    this.set1(p, 'uSceneOn', sceneOn ? 1 : 0);
    const ripples = new Float32Array(MAX_RIPPLES * 4);
    const rc = Math.min(MAX_RIPPLES, f.ripples.length);
    for (let i = 0; i < rc; i++) {
      const r = f.ripples[i];
      ripples.set([r.x, this.h - r.y, r.r, r.s], i * 4);
    }
    gl.uniform4fv(this.loc(p, 'uRipples'), ripples);
    gl.uniform1i(this.loc(p, 'uRippleCount'), rc);
    const lenses = new Float32Array(MAX_LENSES * 4);
    const lc = Math.min(MAX_LENSES, f.lenses.length);
    for (let i = 0; i < lc; i++) {
      const l = f.lenses[i];
      lenses.set([l.x, this.h - l.y, l.r, l.s], i * 4);
    }
    gl.uniform4fv(this.loc(p, 'uLens'), lenses);
    gl.uniform1i(this.loc(p, 'uLensCount'), lc);
    this.set1(p, 'uAberr', f.aberration);
    this.set1(p, 'uBloom', f.bloom);
    this.set1(p, 'uFlash', f.flash);
    this.set3(p, 'uFlashColor', ...f.flashColor);
    this.set1(p, 'uDanger', f.danger);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // ------------------------------------------------------------ plumbing

  private blur(src: Target, tmp: Target): void {
    const gl = this.gl;
    this.use(this.progBlur, tmp);
    this.bind(this.progBlur, 'uTex', src.tex, 0);
    this.set2(this.progBlur, 'uDir', 1 / src.w, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.use(this.progBlur, src);
    this.bind(this.progBlur, 'uTex', tmp.tex, 0);
    this.set2(this.progBlur, 'uDir', 0, 1 / src.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private use(prog: WebGLProgram, target: Target): void {
    const gl = this.gl;
    gl.useProgram(prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.viewport(0, 0, target.w, target.h);
  }

  private upload(tex: WebGLTexture, source: HTMLCanvasElement): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }

  private texture(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  private target(w: number, h: number): Target {
    const gl = this.gl;
    const tex = this.texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { fb, tex, w, h };
  }

  private dispose(t: Target | null): void {
    if (!t) return;
    this.gl.deleteFramebuffer(t.fb);
    this.gl.deleteTexture(t.tex);
  }

  private program(fs: string): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader');
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
    return prog;
  }

  private loc(prog: WebGLProgram, name: string): WebGLUniformLocation | null {
    let m = this.uniforms.get(prog);
    if (!m) this.uniforms.set(prog, (m = new Map()));
    if (!m.has(name)) m.set(name, this.gl.getUniformLocation(prog, name));
    return m.get(name)!;
  }

  private bind(prog: WebGLProgram, name: string, tex: WebGLTexture, unit: number): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(this.loc(prog, name), unit);
  }

  private set1(prog: WebGLProgram, name: string, a: number): void {
    this.gl.uniform1f(this.loc(prog, name), a);
  }

  private set2(prog: WebGLProgram, name: string, a: number, b: number): void {
    this.gl.uniform2f(this.loc(prog, name), a, b);
  }

  private set3(prog: WebGLProgram, name: string, a: number, b: number, c: number): void {
    this.gl.uniform3f(this.loc(prog, name), a, b, c);
  }
}
