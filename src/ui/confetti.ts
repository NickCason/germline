/**
 * A one-shot burst of confetti over everything: little capsules and dots in
 * the game's colours, thrown up from below and drifting down. Removes itself.
 */
const COLORS = ['#b8f04a', '#ffc93c', '#ff9db0', '#38e8d2', '#b45cff', '#43b6ff', '#fff8f3'];

interface Bit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  va: number;
  w: number;
  h: number;
  color: string;
  round: boolean;
}

export function confetti(count = 140): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  document.body.append(canvas);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const bits: Bit[] = [];
  for (let i = 0; i < count; i++) {
    // two cannons in the lower corners, aimed up and inward
    const left = i % 2 === 0;
    const ang = (left ? -Math.PI / 2 + 0.15 : -Math.PI / 2 - 0.15) + (left ? 1 : -1) * Math.random() * 0.55;
    const speed = H * (1.1 + Math.random() * 0.9);
    bits.push({
      x: left ? -10 : W + 10,
      y: H * 0.92,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      a: Math.random() * Math.PI * 2,
      va: (Math.random() - 0.5) * 18,
      w: 6 + Math.random() * 6,
      h: 3 + Math.random() * 3,
      color: COLORS[i % COLORS.length],
      round: Math.random() < 0.3,
    });
  }
  let last = performance.now();
  let age = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    age += dt;
    ctx.clearRect(0, 0, W, H);
    const fade = Math.min(1, (3.2 - age) / 0.8);
    for (const b of bits) {
      b.vy += H * 1.4 * dt;
      b.vx *= Math.exp(-dt * 1.6);
      b.vy *= Math.exp(-dt * 1.6);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.a += b.va * dt;
      ctx.globalAlpha = fade;
      ctx.fillStyle = b.color;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.a);
      // flutter: the strip turns edge-on and back as it spins
      ctx.scale(1, Math.cos(b.a * 1.7));
      if (b.round) {
        ctx.beginPath();
        ctx.arc(0, 0, b.h, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.roundRect(-b.w / 2, -b.h / 2, b.w, b.h, b.h / 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (age < 3.2) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
