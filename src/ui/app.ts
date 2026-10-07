import { hashSeed } from '../core/rng';
import { endlessDef, stageDef } from '../game/stage';
import type { WeaponId } from '../game/types';
import { costumeUnlocked, endlessUnlocked, heroStats, settleRun } from '../meta/economy';
import { loadSave, writeSave, type SaveData } from '../meta/save';
import { audio } from './audio';
import { HomeScreen, type Tab } from './home';
import { RunScreen } from './run';

/** Switches between the home screen and a run, and owns the save. */
export class App {
  save: SaveData;
  private readonly root: HTMLElement;
  private home: HomeScreen | null = null;
  private run: RunScreen | null = null;
  private tab: Tab = 'battle';

  constructor(root: HTMLElement) {
    this.root = root;
    this.save = loadSave();
    this.applyAudio();
    // Any first tap anywhere starts the audio engine (iOS needs a gesture).
    window.addEventListener('pointerdown', () => audio.unlock(), { capture: true });
    document.addEventListener('visibilitychange', () => audio.suspend(document.hidden));
  }

  start(): void {
    this.showHome();
  }

  private persist(): void {
    writeSave(this.save);
  }

  private applyAudio(): void {
    const s = this.save.settings;
    audio.setSfx(s.sfx, s.sfxVol);
    audio.setMusic(s.music, s.musicVol);
  }

  private showHome(): void {
    this.run?.destroy();
    this.run = null;
    this.home?.destroy();
    audio.music('menu');
    const app = this;
    this.home = new HomeScreen(this.root, {
      save: this.save,
      persist: () => this.persist(),
      replaceSave: (save) => {
        this.save = save;
        this.applyAudio();
        this.persist();
        // Rebuild so every screen sees the new save object.
        this.showHome();
      },
      applyAudio: () => this.applyAudio(),
      startRun: () => this.startRun(),
      get tab() {
        return app.tab;
      },
      setTab: (tab) => {
        this.tab = tab;
      },
    });
  }

  private startRun(): void {
    const save = this.save;
    const { chapter, difficulty } = save.selected;
    const levels = Object.fromEntries(Object.entries(save.weapons).map(([id, w]) => [id, w.level])) as Record<WeaponId, number>;
    const seed = hashSeed(Date.now(), Math.random());
    const endless = save.mode === 'endless' && endlessUnlocked(save);
    if (!costumeUnlocked(save, save.costume)) save.costume = 'classic';
    this.home?.destroy();
    this.home = null;
    this.run = new RunScreen(
      this.root,
      {
        stage: endless ? endlessDef(save.maxChapter, seed) : stageDef(chapter, difficulty),
        hero: heroStats(save),
        loadout: [...save.loadout],
        levels,
        seed,
        costume: save.costume,
        aimMode: save.settings.aim,
      },
      {
        settle: (world) => {
          const rewards = settleRun(save, world);
          this.persist();
          return rewards;
        },
        exit: () => this.showHome(),
        settings: save.settings,
        persist: () => this.persist(),
        best: save.endlessBest,
      },
    );
  }
}
