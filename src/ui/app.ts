import { hashSeed } from '../core/rng';
import { endlessDef, stageDef, type ThemeId } from '../game/stage';
import { PALETTES } from '../game/themes';
import type { WeaponId } from '../game/types';
import { costumeUnlocked, endlessUnlocked, heroStats, settleRun } from '../meta/economy';
import { loadSave, writeSave, type SaveData } from '../meta/save';
import { audio } from './audio';
import { Backdrop } from './backdrop';
import { HomeScreen, type Tab } from './home';
import { RunScreen } from './run';

/** Switches between the home screen and a run, and owns the save. */
export class App {
  save: SaveData;
  private readonly root: HTMLElement;
  private home: HomeScreen | null = null;
  private run: RunScreen | null = null;
  private tab: Tab = 'battle';
  private backdrop: Backdrop | null = null;
  private theme: ThemeId = 'slate';

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

  /** The live specimen behind the menus, unless graphics are set to low. */
  private applyGfx(): void {
    const want = this.save.settings.gfx !== 'low' && !this.run;
    if (want && !this.backdrop) this.backdrop = Backdrop.create(PALETTES[this.theme].stain);
    if (want && this.backdrop?.alive) {
      if (!this.backdrop.el.isConnected) this.backdrop.show(this.root);
    } else {
      this.backdrop?.hide();
    }
    this.home?.el.classList.toggle('live', !!this.backdrop?.el.isConnected);
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
      applyGfx: () => this.applyGfx(),
      setTheme: (theme) => {
        this.theme = theme;
        this.backdrop?.setStain(PALETTES[theme].stain);
      },
      startRun: () => this.startRun(),
      get tab() {
        return app.tab;
      },
      setTab: (tab) => {
        this.tab = tab;
      },
    });
    this.applyGfx();
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
    this.backdrop?.hide();
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
