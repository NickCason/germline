/**
 * Tiny synthesized sound effects — no audio files to download or cache.
 * The AudioContext is created on the first user gesture (iOS requires it).
 */
type SoundId = 'pop' | 'chest' | 'elite' | 'pick' | 'boom' | 'win' | 'lose' | 'tap' | 'revive';

class Sfx {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private last = new Map<SoundId, number>();

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
  }

  play(id: SoundId): void {
    if (!this.enabled || !this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const minGap = id === 'pop' ? 0.045 : id === 'boom' ? 0.08 : 0.02;
    if (now - (this.last.get(id) ?? -1) < minGap) return;
    this.last.set(id, now);
    switch (id) {
      case 'pop':
        this.tone(520 + Math.random() * 380, 0.07, 'sine', 0.25, 1.8);
        break;
      case 'chest':
        [660, 880, 1100].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.3, 1, i * 0.06));
        break;
      case 'elite':
        [660, 880, 1100, 1320].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.35, 1, i * 0.06));
        break;
      case 'pick':
        this.tone(440, 0.18, 'triangle', 0.3, 2);
        break;
      case 'boom':
        this.noise(0.25, 0.4);
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.35, 1, i * 0.11));
        break;
      case 'lose':
        [392, 330, 262].forEach((f, i) => this.tone(f, 0.28, 'sawtooth', 0.15, 0.8, i * 0.16));
        break;
      case 'tap':
        this.tone(880, 0.04, 'sine', 0.15);
        break;
      case 'revive':
        this.tone(330, 0.5, 'triangle', 0.35, 3);
        break;
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, glide = 1, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glide !== 1) osc.frequency.exponentialRampToValueAtTime(freq * glide, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start(t);
  }
}

export const sfx = new Sfx();
