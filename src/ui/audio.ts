/**
 * All game audio is synthesized with Web Audio — no files to download or cache.
 * Two channels (music, effects), each with its own toggle and volume. The
 * AudioContext starts on the first user gesture, as iOS requires.
 */
type SoundId =
  | 'pop'
  | 'chest'
  | 'elite'
  | 'pick'
  | 'boom'
  | 'win'
  | 'lose'
  | 'tap'
  | 'revive'
  | 'power'
  | 'ult'
  | 'spawn';

type TrackId = 'menu' | 'battle';

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

class Audio {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private last = new Map<SoundId, number>();
  private sfxOn = true;
  private sfxVol = 0.8;
  private musicOn = true;
  private musicVol = 0.5;

  // music sequencer
  private track: TrackId | null = null;
  private wanted: TrackId | null = null;
  private timer = 0;
  private step = 0;
  private next = 0;
  /** 0..1; the battle loop adds hats and a higher arp as danger rises. */
  intensity = 0;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    // Mix with other apps' audio and respect the silent switch on iOS.
    const nav = navigator as unknown as { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = 'ambient';
    const ctx = (this.ctx = new Ctor());
    this.sfxGain = ctx.createGain();
    this.musicGain = ctx.createGain();
    this.sfxGain.connect(ctx.destination);
    this.musicGain.connect(ctx.destination);
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this.applyLevels();
    if (this.wanted) this.startTrack(this.wanted);
  }

  setSfx(on: boolean, vol: number): void {
    this.sfxOn = on;
    this.sfxVol = vol;
    this.applyLevels();
  }

  setMusic(on: boolean, vol: number): void {
    this.musicOn = on;
    this.musicVol = vol;
    this.applyLevels();
    if (!on) this.stopSequencer();
    else if (this.wanted) this.startTrack(this.wanted);
  }

  private applyLevels(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxGain!.gain.setTargetAtTime(this.sfxOn ? this.sfxVol * 0.45 : 0, t, 0.02);
    this.musicGain!.gain.setTargetAtTime(this.musicOn ? this.musicVol * 0.3 : 0, t, 0.05);
  }

  // ----------------------------------------------------------------- music

  music(track: TrackId | null): void {
    this.wanted = track;
    if (!track) {
      this.stopSequencer();
      return;
    }
    this.startTrack(track);
  }

  /** Pause the sequencer while the page is hidden; resume where the game wants. */
  suspend(hidden: boolean): void {
    if (hidden) this.stopSequencer();
    else if (this.wanted) this.startTrack(this.wanted);
  }

  private startTrack(track: TrackId): void {
    if (!this.ctx || !this.musicOn) return;
    if (this.track === track && this.timer) return;
    this.stopSequencer();
    this.track = track;
    this.step = 0;
    this.next = this.ctx.currentTime + 0.08;
    this.timer = window.setInterval(this.tick, 25);
  }

  private stopSequencer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = 0;
    this.track = null;
  }

  private readonly tick = (): void => {
    const ctx = this.ctx;
    if (!ctx || !this.track) return;
    const bpm = this.track === 'battle' ? 122 : 90;
    const sixteenth = 60 / bpm / 4;
    while (this.next < ctx.currentTime + 0.15) {
      if (this.track === 'battle') this.battleStep(this.step, this.next);
      else this.menuStep(this.step, this.next);
      this.next += sixteenth;
      this.step = (this.step + 1) % 64;
    }
  };

  /** A minor: Am F C G, syncopated bass, square arp, light drums. */
  private battleStep(step: number, t: number): void {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const chords = [
      [57, 60, 64],
      [53, 57, 60],
      [48, 52, 55],
      [55, 59, 62],
    ];
    const roots = [45, 41, 48, 43];
    const chord = chords[bar];
    if ([0, 3, 6, 8, 11, 14].includes(s)) this.note(midi(roots[bar] + (s === 8 ? 12 : 0)), t, 0.16, 'triangle', 0.5, 900);
    if (s % 2 === 0) {
      const lift = this.intensity > 0.6 ? 24 : 12;
      this.note(midi(chord[(s / 2) % 3] + lift), t, 0.09, 'square', 0.07, 2400);
    }
    // a little pentatonic hook every other bar
    const hook: (number | null)[] = [76, null, 74, null, 72, null, 69, null, 72, null, 74, 76, null, null, 79, null];
    if (bar % 2 === 1 && hook[s] !== null) this.note(midi(hook[s]!), t, 0.14, 'triangle', 0.16, 3000);
    if (s === 0 || s === 8) this.kick(t);
    if (s === 4 || s === 12) this.snare(t);
    if (s % 2 === 1 || this.intensity > 0.75) this.hat(t, s % 4 === 2 ? 0.05 : 0.03);
  }

  /** C major lullaby: C Am F G, soft triangle arpeggio, no drums. */
  private menuStep(step: number, t: number): void {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const chords = [
      [60, 64, 67, 72],
      [57, 60, 64, 69],
      [53, 57, 60, 65],
      [55, 59, 62, 67],
    ];
    const roots = [48, 45, 41, 43];
    if (s === 0 || s === 8) this.note(midi(roots[bar]), t, 0.6, 'triangle', 0.35, 700);
    if (s % 2 === 0) this.note(midi(chords[bar][(s / 2) % 4]), t, 0.35, 'triangle', 0.12, 2200);
    if (s === 14 && bar % 2 === 1) this.note(midi(84), t, 0.25, 'sine', 0.06, 5000);
  }

  private note(freq: number, t: number, dur: number, type: OscillatorType, vol: number, cutoff: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(filter).connect(gain).connect(this.musicGain!);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private kick(t: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(gain).connect(this.musicGain!);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  private snare(t: number): void {
    this.noise(t, 0.12, 0.18, 'bandpass', 1800, this.musicGain!);
  }

  private hat(t: number, vol: number): void {
    this.noise(t, 0.035, vol, 'highpass', 7000, this.musicGain!);
  }

  private noise(t: number, dur: number, vol: number, type: BiquadFilterType, freq: number, dest: AudioNode): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  // --------------------------------------------------------------- effects

  play(id: SoundId): void {
    if (!this.sfxOn || !this.ctx) return;
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
        this.noise(now, 0.25, 0.4, 'lowpass', 700, this.sfxGain!);
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
      case 'power':
        [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.1, 'square', 0.12, 1, i * 0.04));
        break;
      case 'ult':
        this.tone(180, 0.6, 'sawtooth', 0.25, 4);
        this.noise(now, 0.5, 0.25, 'bandpass', 1200, this.sfxGain!);
        break;
      case 'spawn':
        this.tone(1320, 0.08, 'sine', 0.12, 1.3);
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
    osc.connect(gain).connect(this.sfxGain!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
}

export const audio = new Audio();
