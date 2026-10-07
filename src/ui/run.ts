import { fmt, pct } from '../core/format';
import { SIM_DT } from '../game/constants';
import type { WeaponId } from '../game/types';
import type { OfferedCard } from '../game/upgrades';
import { WEAPONS } from '../game/weapons';
import { World, type RunSetup } from '../game/world';
import type { RunRewards } from '../meta/economy';
import { iconImg, type IconId } from '../render/icons';
import { Renderer } from '../render/renderer';
import { h, modal } from './dom';
import { sfx } from './sfx';

const RARITY_NAME = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' } as const;

export interface RunHooks {
  /** Bank the finished run; returns what was earned. */
  settle(world: World): RunRewards;
  /** Leave the run screen. */
  exit(): void;
  showNumbers: boolean;
  fast: boolean;
  setFast(on: boolean): void;
}

function cardIcon(card: OfferedCard): IconId {
  if (card.def.weapon) return card.def.weapon;
  return card.def.id as IconId;
}

/** One run: canvas, HUD, the game loop and the in-run modals. */
export class RunScreen {
  readonly el: HTMLDivElement;
  readonly world: World;
  private readonly renderer: Renderer;
  private readonly hooks: RunHooks;
  private readonly canvas: HTMLCanvasElement;
  private readonly hudTop: HTMLDivElement;
  private readonly hudBottom: HTMLDivElement;
  private readonly liquid: HTMLDivElement;
  private readonly pctEl: HTMLDivElement;
  private readonly speedBtn: HTMLButtonElement;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private paused = false;
  private fast: boolean;
  private overlay: { close: () => void } | null = null;
  private shownState: string = 'playing';
  private endTimer = 0;
  private slotKey = '';
  private lastPct = -1;
  private readonly onResize = () => this.layout();
  private readonly onVisibility = () => {
    if (document.hidden && this.world.state === 'playing') this.pause();
  };

  constructor(parent: Element, setup: RunSetup, hooks: RunHooks) {
    this.hooks = hooks;
    this.fast = hooks.fast;
    this.world = new World(setup);
    this.canvas = h('canvas');
    const stage = this.world.stage;
    this.liquid = h('div', { class: 'liquid' });
    this.pctEl = h('div', { class: 'pct num', text: '0%' });
    this.speedBtn = h('button', { class: `round-btn speed${this.fast ? ' on' : ''}`, text: this.fast ? '2×' : '1×', ariaLabel: 'Game speed', onclick: () => this.toggleSpeed() });
    this.hudTop = h(
      'div',
      { class: 'hud-top' },
      h('button', { class: 'round-btn', text: 'II', ariaLabel: 'Pause', onclick: () => this.pause() }),
      h(
        'div',
        { class: 'hud-title' },
        h('div', { class: 'name', text: `${stage.chapter}. ${stage.name}` }),
        h('div', { class: `diff${stage.difficulty === 'hard' ? ' hard' : ''}`, text: stage.difficulty === 'hard' ? 'Hard' : 'Normal' }),
      ),
      this.speedBtn,
      h(
        'div',
        { class: 'syringe' },
        h('div', { class: 'plunger' }),
        h('div', { class: 'rod' }),
        h('div', { class: 'barrel' }, this.liquid, h('div', { class: 'ticks' }), this.pctEl),
        h('div', { class: 'hub' }),
        h('div', { class: 'tip' }),
      ),
    );
    this.hudBottom = h('div', { class: 'hud-bottom' });
    this.el = h('div', { class: 'run' }, this.canvas, this.hudTop, this.hudBottom);
    parent.append(this.el);

    this.renderer = new Renderer(this.canvas);
    this.renderer.setShowNumbers(hooks.showNumbers);
    this.bindInput();
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.updateSlots();
    this.layout();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.endTimer);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.el.remove();
  }

  private layout(): void {
    const top = this.hudTop.getBoundingClientRect().bottom;
    const bottom = window.innerHeight - this.hudBottom.getBoundingClientRect().top;
    this.renderer.resize({ top, bottom });
  }

  private bindInput(): void {
    const c = this.canvas;
    let active: number | null = null;
    const move = (e: PointerEvent) => {
      if (active !== e.pointerId || !this.world.hero.mobile) return;
      this.world.hero.pointerX = this.renderer.toField(e.clientX, e.clientY).x;
    };
    c.addEventListener('pointerdown', (e) => {
      sfx.unlock();
      // iOS fills in safe-area insets late in standalone mode; re-measure on first touch.
      this.layout();
      active = e.pointerId;
      c.setPointerCapture(e.pointerId);
      move(e);
    });
    c.addEventListener('pointermove', move);
    const up = (e: PointerEvent) => {
      if (active !== e.pointerId) return;
      active = null;
      this.world.hero.pointerX = null;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
  }

  private readonly frame = (now: number): void => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const w = this.world;
    if (!this.paused && w.state === 'playing') {
      this.acc += dt * (this.fast ? 2 : 1);
      let steps = 0;
      while (this.acc >= SIM_DT && steps < 12) {
        w.step(SIM_DT);
        this.acc -= SIM_DT;
        steps++;
        if (w.state !== 'playing') break;
      }
      if (steps === 12 || w.state !== 'playing') this.acc = 0;
    } else if (w.state === 'won' || w.state === 'lost') {
      // keep effects animating on the end screen
      w.fx.update(dt);
    }
    this.drainEvents();
    this.syncState();
    this.renderer.render(w);
    this.updateHud();
    this.raf = requestAnimationFrame(this.frame);
  };

  private drainEvents(): void {
    for (const e of this.world.events) {
      switch (e.type) {
        case 'kill':
          sfx.play('pop');
          break;
        case 'chest':
          sfx.play(e.elite ? 'elite' : 'chest');
          break;
        case 'boom':
          sfx.play('boom');
          break;
        case 'revive':
          sfx.play('revive');
          break;
        case 'won':
          sfx.play('win');
          break;
        case 'lost':
          sfx.play('lose');
          break;
        case 'offer':
          break;
      }
    }
    this.world.events.length = 0;
  }

  private syncState(): void {
    const state = this.world.state;
    if (state === this.shownState) return;
    this.shownState = state;
    this.overlay?.close();
    this.overlay = null;
    if (state === 'picking') this.showPick();
    else if (state === 'revive') this.showRevive();
    else if (state === 'won' || state === 'lost') {
      this.endTimer = window.setTimeout(() => this.showResults(), state === 'won' ? 900 : 600);
    } else if (state === 'playing') this.updateSlots();
  }

  private updateHud(): void {
    const p = Math.floor(this.world.progress * 100);
    if (p !== this.lastPct) {
      this.lastPct = p;
      this.liquid.style.width = `${p}%`;
      this.pctEl.textContent = `${p}%`;
    }
  }

  private updateSlots(): void {
    const key = this.world.weapons.map((w) => w.def.id).join(',');
    if (key === this.slotKey) return;
    this.slotKey = key;
    this.hudBottom.replaceChildren(...this.world.weapons.map((w) => h('div', { class: 'slot', title: w.def.name }, iconImg(w.def.id))));
  }

  private toggleSpeed(): void {
    sfx.play('tap');
    this.fast = !this.fast;
    this.hooks.setFast(this.fast);
    this.speedBtn.textContent = this.fast ? '2×' : '1×';
    this.speedBtn.classList.toggle('on', this.fast);
  }

  // ---------------------------------------------------------------- modals

  private showPick(): void {
    const w = this.world;
    const offer = w.offer;
    if (!offer) return;
    sfx.play('pick');
    const cards = h(
      'div',
      { class: 'cards' },
      ...offer.map((card, i) =>
        h(
          'button',
          {
            class: `card ${card.rarity}`,
            onclick: () => {
              sfx.play('tap');
              w.choose(i);
              this.shownState = '';
            },
          },
          h('div', { class: 'bubble' }, iconImg(cardIcon(card))),
          card.def.grants ? h('div', { class: 'tag-new', text: 'New weapon' }) : null,
          h('div', { class: 'cname', text: card.def.name }),
          h('div', { class: 'cdesc', text: card.def.desc(card.value) }),
          h('div', { class: 'crarity', text: RARITY_NAME[card.rarity] }),
        ),
      ),
    );
    const reroll = h('button', {
      class: 'pill ghost',
      text: w.rerolls > 0 ? `Reroll (${w.rerolls} left)` : 'No rerolls left',
      disabled: w.rerolls <= 0,
      onclick: () => {
        if (w.reroll()) {
          sfx.play('tap');
          this.overlay?.close();
          this.showPick();
        }
      },
    });
    const title = w.offerElite ? 'Golden chest: choose one' : 'Choose an upgrade';
    this.overlay = modal(this.el, h('div', { class: 'banner', text: title }), cards, h('div', { class: 'row center', style: 'margin-top:18px' }, reroll));
  }

  private showRevive(): void {
    const w = this.world;
    this.overlay = modal(
      this.el,
      h(
        'div',
        { class: 'panel' },
        h('h2', { text: 'The virus broke through!' }),
        h('p', { text: `You cleared ${pct(w.progress)} of the train. Revive to knock it far back down the track.` }),
        h(
          'div',
          { class: 'stack' },
          h('button', {
            class: 'pill red',
            text: `Revive (${w.revives} left)`,
            onclick: () => {
              w.revive();
            },
          }),
          h('button', { class: 'pill ghost', text: 'Give up', onclick: () => w.giveUp() }),
        ),
      ),
    );
  }

  private pause(): void {
    if (this.paused || this.world.state !== 'playing') return;
    this.paused = true;
    const resume = () => {
      this.paused = false;
      this.last = performance.now();
      this.overlay?.close();
      this.overlay = null;
    };
    this.overlay = modal(
      this.el,
      h(
        'div',
        { class: 'panel' },
        h('h2', { text: 'Paused' }),
        h('p', { text: `${pct(this.world.progress)} of the train cleared` }),
        h(
          'div',
          { class: 'stack' },
          h('button', { class: 'pill', text: 'Resume', onclick: resume }),
          h('button', {
            class: 'pill ghost',
            text: 'Abandon run',
            onclick: () => {
              this.paused = false;
              this.overlay?.close();
              this.overlay = null;
              this.world.giveUp();
            },
          }),
        ),
      ),
    );
  }

  private showResults(): void {
    const w = this.world;
    const rewards = this.hooks.settle(w);
    const total = w.weapons.reduce((a, x) => a + x.dealt, 0) || 1;
    const top = [...w.weapons].sort((a, b) => b.dealt - a.dealt);
    const loot: HTMLElement[] = [h('div', { class: 'item' }, iconImg('coin'), h('span', { class: 'num', text: `+${fmt(rewards.coins)}` }))];
    for (const [id, n] of Object.entries(rewards.shards) as [WeaponId, number][]) {
      loot.push(h('div', { class: 'item', title: `${WEAPONS[id].name} shards` }, iconImg(id), h('span', { class: 'num', text: `+${n}` })));
    }
    const notes: string[] = [];
    for (const id of rewards.unlocked) notes.push(`New weapon unlocked: ${WEAPONS[id].name}`);
    if (rewards.newChapter) notes.push(`Chapter ${w.stage.chapter + 1} is open`);
    if (rewards.firstClear && w.stage.difficulty === 'normal') notes.push('Hard mode unlocked for this chapter');
    this.overlay = modal(
      this.el,
      h(
        'div',
        { class: 'panel' },
        h('p', { class: `result-head ${rewards.won ? 'win' : 'lose'}`, text: rewards.won ? 'Cleared!' : 'Overrun' }),
        h('p', { text: rewards.won ? `${w.stage.name} wiped out in ${Math.round(w.time)}s` : `You cleared ${pct(rewards.progress)} of the train` }),
        ...notes.map((n) => h('p', { style: 'color: var(--lime); font-weight: 600', text: n })),
        h('div', { class: 'loot' }, ...loot),
        h(
          'div',
          { class: 'dmg-list' },
          ...top.map((x) =>
            h(
              'div',
              { class: 'dmg-row' },
              iconImg(x.def.id),
              h('div', { class: 'dmg-bar' }, h('div', { style: `width:${((x.dealt / total) * 100).toFixed(1)}%` })),
              h('span', { class: 'num', text: fmt(x.dealt) }),
            ),
          ),
        ),
        h('button', { class: 'pill', style: 'width:100%', text: 'Continue', onclick: () => this.hooks.exit() }),
      ),
    );
  }
}
