import { hashSeed } from '../core/rng';
import { stageDef } from '../game/stage';
import type { WeaponId } from '../game/types';
import { heroStats, settleRun } from '../meta/economy';
import { loadSave, writeSave, type SaveData } from '../meta/save';
import { HomeScreen, type Tab } from './home';
import { RunScreen } from './run';
import { sfx } from './sfx';

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
    sfx.enabled = this.save.settings.sfx;
  }

  start(): void {
    this.showHome();
  }

  private persist(): void {
    writeSave(this.save);
  }

  private showHome(): void {
    this.run?.destroy();
    this.run = null;
    this.home?.destroy();
    const app = this;
    this.home = new HomeScreen(this.root, {
      save: this.save,
      persist: () => this.persist(),
      replaceSave: (save) => {
        this.save = save;
        sfx.enabled = save.settings.sfx;
        this.persist();
        // Rebuild so every screen sees the new save object.
        this.showHome();
      },
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
    this.home?.destroy();
    this.home = null;
    this.run = new RunScreen(
      this.root,
      {
        stage: stageDef(chapter, difficulty),
        hero: heroStats(save),
        loadout: [...save.loadout],
        levels,
        seed: hashSeed(Date.now(), Math.random()),
      },
      {
        settle: (world) => {
          const rewards = settleRun(save, world);
          this.persist();
          return rewards;
        },
        exit: () => this.showHome(),
        showNumbers: save.settings.numbers,
        fast: save.settings.fast,
        setFast: (on) => {
          save.settings.fast = on;
          this.persist();
        },
      },
    );
  }
}
