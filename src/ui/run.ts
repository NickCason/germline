import { fmt, pct } from '../core/format';
import { SIM_DT } from '../game/constants';
import { COSTUMES } from '../game/costumes';
import type { AimMode, WeaponId } from '../game/types';
import type { OfferedCard } from '../game/upgrades';
import { WEAPONS } from '../game/weapons';
import { World, type RunSetup } from '../game/world';
import type { RunRewards } from '../meta/economy';
import type { SaveData } from '../meta/save';
import { costumeImg, hasIcon, iconImg, type IconId } from '../render/icons';
import { BattleView, type Gfx } from '../render/view';
import { audio } from './audio';
import { confetti } from './confetti';
import { h, modal } from './dom';

const RARITY_NAME = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', mythic: 'Mythic' } as const;
const RARITY_RANK = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 } as const;

export interface RunHooks {
  /** Bank the finished run; returns what was earned. */
  settle(world: World): RunRewards;
  /** Leave the run screen. */
  exit(): void;
  /** Live settings object; the run screen edits it and calls persist(). */
  settings: SaveData['settings'];
  persist(): void;
  /** Endless best score before this run. */
  best: number;
}

function cardIcon(card: OfferedCard): IconId {
  if (card.def.bargain) return 'p_bomb';
  if (card.def.weapon) return card.def.weapon;
  return hasIcon(card.def.id) ? card.def.id : 'virus';
}

function cardTag(card: OfferedCard): string | null {
  if (card.def.grants) return 'New weapon';
  if (card.def.evo) return 'Evolution';
  if (card.def.bargain) return "Devil's bargain";
  return null;
}

/** One run: canvas, HUD, the game loop and the in-run modals. */
export class RunScreen {
  readonly el: HTMLDivElement;
  readonly world: World;
  private readonly view: BattleView;
  private readonly hooks: RunHooks;
  private readonly hudTop: HTMLDivElement;
  private readonly hudBottom: HTMLDivElement;
  private readonly slots: HTMLDivElement;
  private readonly liquid: HTMLDivElement;
  private readonly pctEl: HTMLDivElement;
  private readonly speedBtn: HTMLButtonElement;
  private readonly aimBtn: HTMLButtonElement;
  private readonly ultBtn: HTMLButtonElement;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private paused = false;
  private overlay: { close: () => void } | null = null;
  private shownState: string = 'playing';
  private endTimer = 0;
  private slotKey = '';
  private hudKey = '';
  private ultKey = '';
  /** `?perf` in the URL shows frame cost, for checking on a real phone. */
  private readonly perfEl: HTMLDivElement | null = new URLSearchParams(location.search).has('perf')
    ? h('div', { class: 'perf num' })
    : null;
  private perfTimes: number[] = [];
  private perfFrames = 0;
  private perfSince = 0;
  private readonly onResize = () => this.layout();
  private readonly onVisibility = () => {
    if (document.hidden && this.world.state === 'playing') this.pause();
  };

  constructor(parent: Element, setup: RunSetup, hooks: RunHooks) {
    this.hooks = hooks;
    this.world = new World(setup);
    const gfxParam = new URLSearchParams(location.search).get('gfx');
    const gfx = (gfxParam === 'low' || gfxParam === 'high' || gfxParam === 'auto' ? gfxParam : hooks.settings.gfx) as Gfx;
    this.view = new BattleView(gfx);
    const stage = this.world.stage;
    const settings = hooks.settings;
    this.liquid = h('div', { class: 'liquid' });
    this.pctEl = h('div', { class: 'pct num', text: '0%' });
    this.speedBtn = h('button', { class: 'round-btn speed', ariaLabel: 'Game speed', onclick: () => this.toggleSpeed() });
    this.aimBtn = h('button', { class: 'round-btn aim', ariaLabel: 'Aim mode', onclick: () => this.toggleAim() });
    this.ultBtn = h(
      'button',
      { class: 'ult', ariaLabel: this.world.costume.ultName, title: `${this.world.costume.ultName}: ${this.world.costume.ultDesc}`, onclick: () => this.fireUlt() },
      costumeImg(this.world.costume.id),
    );
    this.hudTop = h(
      'div',
      { class: 'hud-top' },
      h('button', { class: 'round-btn', text: 'II', ariaLabel: 'Pause', onclick: () => this.pause() }),
      h(
        'div',
        { class: 'hud-title' },
        h('div', { class: 'name', text: stage.endless ? stage.name : `${stage.chapter}. ${stage.name}` }),
        h('div', {
          class: `diff${stage.difficulty === 'hard' ? ' hard' : ''}`,
          text: stage.endless ? `Best ${fmt(hooks.best)}` : stage.difficulty === 'hard' ? 'Hard' : 'Normal',
        }),
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
    this.slots = h('div', { class: 'slots' });
    this.hudBottom = h('div', { class: 'hud-bottom' }, this.aimBtn, this.slots, this.ultBtn);
    this.el = h('div', { class: 'run' }, this.view.el, this.hudTop, this.hudBottom, this.perfEl);
    parent.append(this.el);

    // `?debug` exposes the live world for browser automation and poking around.
    if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __world: this.world, __renderer: this.view.renderer, __view: this.view });
    this.view.renderer.setShowNumbers(settings.numbers);
    this.syncSpeed();
    this.syncAim();
    this.bindInput();
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.updateSlots();
    this.layout();
    audio.music('battle');
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.endTimer);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    audio.intensity = 0;
    this.el.remove();
  }

  private layout(): void {
    const top = this.hudTop.getBoundingClientRect().bottom;
    const bottom = window.innerHeight - this.hudBottom.getBoundingClientRect().top;
    this.view.resize({ top, bottom });
  }

  private bindInput(): void {
    const c = this.view.input;
    let active: number | null = null;
    const send = (e: PointerEvent, phase: 'down' | 'move' | 'up') => {
      const p = this.view.renderer.toField(e.clientX, e.clientY);
      this.world.pointer(p.x, p.y, phase);
    };
    c.addEventListener('pointerdown', (e) => {
      audio.unlock();
      // iOS fills in safe-area insets late in standalone mode; re-measure on first touch.
      this.layout();
      active = e.pointerId;
      c.setPointerCapture(e.pointerId);
      send(e, 'down');
    });
    c.addEventListener('pointermove', (e) => {
      if (active === e.pointerId) send(e, 'move');
    });
    const up = (e: PointerEvent) => {
      if (active !== e.pointerId) return;
      active = null;
      send(e, 'up');
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
  }

  private readonly frame = (now: number): void => {
    const t0 = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const w = this.world;
    const timeScale = this.paused ? 1 : this.view.tick(dt);
    this.view.trackFrame(dt);
    if (!this.paused && w.state === 'playing') {
      this.acc += dt * this.hooks.settings.speed * timeScale;
      let steps = 0;
      while (this.acc >= SIM_DT && steps < 20) {
        w.step(SIM_DT);
        this.acc -= SIM_DT;
        steps++;
        if (w.state !== 'playing') break;
      }
      if (steps === 20 || w.state !== 'playing') this.acc = 0;
    } else if (w.state === 'won' || w.state === 'lost') {
      // keep effects animating on the end screen (in slow motion right after a win)
      w.fx.update(dt * timeScale);
    }
    audio.intensity = w.danger;
    this.drainEvents();
    this.syncState();
    this.view.render(w);
    this.updateHud();
    if (this.perfEl) this.trackPerf(now, performance.now() - t0);
    this.raf = requestAnimationFrame(this.frame);
  };

  private trackPerf(now: number, ms: number): void {
    this.perfTimes.push(ms);
    this.perfFrames++;
    if (now - this.perfSince < 1000) return;
    const sorted = [...this.perfTimes].sort((a, b) => a - b);
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? avg;
    const fps = (this.perfFrames * 1000) / (now - this.perfSince);
    const w = this.world;
    this.perfEl!.textContent = `${fps.toFixed(0)} fps  ${avg.toFixed(1)}ms avg  ${p95.toFixed(1)}ms p95  ${w.projectiles.length} proj  ${w.visible().length} segs`;
    (window as unknown as { __perf?: unknown }).__perf = { fps, avg, p95, proj: w.projectiles.length, segs: w.visible().length };
    this.perfTimes = [];
    this.perfFrames = 0;
    this.perfSince = now;
  }

  private drainEvents(): void {
    for (const e of this.world.events) {
      this.view.event(e, this.world);
      switch (e.type) {
        case 'kill':
          audio.play('pop');
          break;
        case 'chest':
          audio.play(e.elite ? 'elite' : 'chest');
          break;
        case 'boom':
          audio.play('boom');
          break;
        case 'revive':
          audio.play('revive');
          break;
        case 'power':
          audio.play('power');
          break;
        case 'power-spawn':
          audio.play('spawn');
          break;
        case 'ult':
          audio.play('ult');
          break;
        case 'won':
          audio.play('win');
          break;
        case 'lost':
          audio.play('lose');
          break;
        case 'mutation':
          this.banner(
            `Mutation ${roman(e.tier)}`,
            e.tier === 2
              ? 'Tougher and faster. Chests now offer four cards.'
              : e.tier === 3
                ? 'Tougher and faster. You can carry one more weapon.'
                : 'The virus grows tougher and faster',
          );
          audio.play('elite');
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
    const w = this.world;
    if (w.stage.endless) {
      const key = `e${w.score}`;
      if (key !== this.hudKey) {
        this.hudKey = key;
        // Fill toward your best: the syringe tops out when you beat it.
        this.liquid.style.width = `${Math.min(100, (w.score / Math.max(this.hooks.best, 40)) * 100)}%`;
        this.pctEl.textContent = w.score > this.hooks.best && this.hooks.best > 0 ? `${w.score} new best!` : `${w.score} destroyed`;
      }
    } else {
      const p = Math.floor(w.progress * 100);
      const key = `p${p}`;
      if (key !== this.hudKey) {
        this.hudKey = key;
        this.liquid.style.width = `${p}%`;
        this.pctEl.textContent = `${p}%`;
      }
    }
    const charge = Math.floor((w.ultCharge / w.ultNeed) * 100);
    const ultKey = `${charge}`;
    if (ultKey !== this.ultKey) {
      this.ultKey = ultKey;
      this.ultBtn.style.setProperty('--charge', `${charge}%`);
      this.ultBtn.classList.toggle('ready', w.ultReady);
    }
  }

  /** A short-lived announcement across the middle of the screen. */
  private banner(title: string, sub: string): void {
    const el = h('div', { class: 'announce' }, h('div', { class: 'announce-title', text: title }), h('div', { class: 'announce-sub', text: sub }));
    this.el.append(el);
    setTimeout(() => el.remove(), 2600);
  }

  private updateSlots(): void {
    const key = this.world.weapons.map((w) => w.def.id).join(',');
    if (key === this.slotKey) return;
    this.slotKey = key;
    this.slots.replaceChildren(...this.world.weapons.map((w) => h('div', { class: 'slot', title: w.def.name }, iconImg(w.def.id))));
  }

  /** Cycle 1x → 2x → 3x → 4x. */
  private toggleSpeed(): void {
    audio.play('tap');
    this.hooks.settings.speed = (this.hooks.settings.speed % 4) + 1;
    this.hooks.persist();
    this.syncSpeed();
  }

  private syncSpeed(): void {
    const speed = this.hooks.settings.speed;
    this.speedBtn.textContent = `${speed}×`;
    this.speedBtn.classList.toggle('on', speed > 1);
    this.speedBtn.dataset.speed = String(speed);
  }

  private toggleAim(mode?: AimMode): void {
    audio.play('tap');
    const next = mode ?? (this.world.aimMode === 'auto' ? 'manual' : 'auto');
    this.world.setAimMode(next);
    this.hooks.settings.aim = next;
    this.hooks.persist();
    this.syncAim();
  }

  private syncAim(): void {
    const manual = this.world.aimMode === 'manual';
    this.aimBtn.replaceChildren(iconImg(manual ? 'crosshair' : 'auto'));
    this.aimBtn.classList.toggle('on', manual);
    this.aimBtn.title = manual ? 'Aim: touch the train to target it' : 'Aim: auto-tracks the front';
  }

  private fireUlt(): void {
    audio.unlock();
    if (this.world.useUlt()) this.ultKey = '';
  }

  // ---------------------------------------------------------------- modals

  private showPick(): void {
    const w = this.world;
    const offer = w.offer;
    if (!offer) return;
    audio.play('pick');
    const cards = h(
      'div',
      { class: `cards${offer.length > 3 ? ' four' : ''}` },
      ...offer.map((card, i) => {
        const tag = cardTag(card);
        const el = h(
          'button',
          {
            class: `card ${card.rarity}${card.def.evo ? ' evo' : ''}${card.def.bargain ? ' bargain' : ''}`,
            onclick: () => {
              audio.play('tap');
              w.choose(i);
              this.shownState = '';
            },
          },
          h('div', { class: 'bubble' }, iconImg(cardIcon(card))),
          tag ? h('div', { class: 'tag-new', text: tag }) : null,
          h('div', { class: 'cname', text: card.def.name }),
          h('div', { class: 'cdesc', text: card.def.desc(card.value) }),
          h('div', { class: 'crarity', text: RARITY_NAME[card.rarity] }),
        );
        tilt(el);
        return el;
      }),
    );
    const reroll = h('button', {
      class: `pill ghost${w.freeReroll ? ' free' : ''}`,
      text: w.freeReroll ? 'Free reroll' : w.rerolls > 0 ? `Reroll (${w.rerolls})` : 'No rerolls',
      disabled: !w.canReroll,
      onclick: () => {
        if (w.reroll()) {
          audio.play('tap');
          this.overlay?.close();
          this.showPick();
        }
      },
    });
    const takeAll = h('button', {
      class: 'pill gold',
      text: w.takeAlls > 0 ? `Take all ${offer.length} (${w.takeAlls})` : 'No take-alls',
      disabled: w.takeAlls <= 0,
      onclick: () => {
        if (w.takeAll()) {
          audio.play('elite');
          this.shownState = '';
        }
      },
    });
    const title = w.offerElite ? 'Golden chest: choose one' : 'Choose an upgrade';
    const hint =
      w.offerRerolls > 0
        ? `Reroll ${w.offerRerolls}: rarer cards are more likely now`
        : 'The first reroll of every chest is free, and each reroll makes rarer cards more likely';
    const overlay = modal(
      this.el,
      h('div', { class: 'banner', text: title }),
      cards,
      h('p', { class: 'pick-hint', text: hint }),
      h('div', { class: 'row center pick-actions' }, reroll, takeAll),
    );
    this.overlay = overlay;
    overlay.el.classList.add('pick', 'arming');
    // Taps that were meant for the battlefield shouldn't pick a card nobody has seen yet.
    setTimeout(() => overlay.el.classList.remove('arming'), 480);
    if (w.offerElite) overlay.el.classList.add('elite');
    // the best card in the hand sets the mood of the light behind it
    const best = offer.reduce((m, c) => Math.max(m, RARITY_RANK[c.rarity]), 0);
    overlay.el.dataset.best = (['common', 'rare', 'epic', 'legendary', 'mythic'] as const)[best];
  }

  private showRevive(): void {
    const w = this.world;
    const body = w.stage.endless
      ? `You destroyed ${w.score} segments. Revive to knock the train far back down the track.`
      : `You cleared ${pct(w.progress)} of the train. Revive to knock it far back down the track.`;
    this.overlay = modal(
      this.el,
      h(
        'div',
        { class: 'panel' },
        h('h2', { text: 'The virus broke through!' }),
        h('p', { text: body }),
        h(
          'div',
          { class: 'stack' },
          h('button', { class: 'pill red', text: `Revive (${w.revives} left)`, onclick: () => w.revive() }),
          h('button', { class: 'pill ghost', text: 'Give up', onclick: () => w.giveUp() }),
        ),
      ),
    );
  }

  private pause(): void {
    if (this.paused || this.world.state !== 'playing') return;
    this.paused = true;
    const settings = this.hooks.settings;
    const resume = () => {
      this.paused = false;
      this.last = performance.now();
      this.overlay?.close();
      this.overlay = null;
    };
    const toggle = (label: string, icon: IconId, get: () => boolean, set: (v: boolean) => void) => {
      const input = h('input', { attrs: { type: 'checkbox' } });
      input.checked = get();
      input.addEventListener('change', () => {
        set(input.checked);
        this.hooks.persist();
      });
      return h('label', { class: 'toggle' }, h('span', { class: 'row' }, iconImg(icon), label), input);
    };
    const w = this.world;
    this.overlay = modal(
      this.el,
      h(
        'div',
        { class: 'panel' },
        h('h2', { text: 'Paused' }),
        h('p', { text: w.stage.endless ? `${w.score} segments destroyed` : `${pct(w.progress)} of the train cleared` }),
        toggle('Music', 'music', () => settings.music, (v) => {
          settings.music = v;
          audio.setMusic(v, settings.musicVol);
        }),
        toggle('Sound effects', 'speaker', () => settings.sfx, (v) => {
          settings.sfx = v;
          audio.setSfx(v, settings.sfxVol);
        }),
        toggle('Damage numbers', 'g_crit', () => settings.numbers, (v) => {
          settings.numbers = v;
          this.view.renderer.setShowNumbers(v);
        }),
        toggle('Manual aim: touch the train to target', 'crosshair', () => w.aimMode === 'manual', (v) => this.toggleAim(v ? 'manual' : 'auto')),
        h(
          'div',
          { class: 'stack', style: 'margin-top:12px' },
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
    const rows: { icon: HTMLImageElement; dealt: number }[] = w.weapons.map((x) => ({ icon: iconImg(x.def.id), dealt: x.dealt }));
    if (w.ultDealt > 0) rows.push({ icon: costumeImg(w.costume.id), dealt: w.ultDealt });
    if (w.powerDealt > 0) rows.push({ icon: iconImg('p_bomb'), dealt: w.powerDealt });
    rows.sort((a, b) => b.dealt - a.dealt);
    const total = rows.reduce((a, r) => a + r.dealt, 0) || 1;
    const coinsEl = h('span', { class: 'num', text: '+0' });
    countUp(coinsEl, rewards.coins);
    const loot: HTMLElement[] = [h('div', { class: 'item' }, iconImg('coin'), coinsEl)];
    for (const [id, n] of Object.entries(rewards.shards) as [WeaponId, number][]) {
      loot.push(h('div', { class: 'item', title: `${WEAPONS[id].name} shards` }, iconImg(id), h('span', { class: 'num', text: `+${n}` })));
    }
    const notes: string[] = [];
    for (const id of rewards.unlocked) notes.push(`New weapon unlocked: ${WEAPONS[id].name}`);
    for (const id of rewards.costumes) notes.push(`New costume unlocked: ${COSTUMES[id].name}`);
    if (rewards.newChapter) notes.push(`Chapter ${w.stage.chapter + 1} is open`);
    if (rewards.firstClear && w.stage.difficulty === 'normal') notes.push('Hard mode unlocked for this chapter');
    if (rewards.newBest) notes.push('New endless best!');
    const endless = w.stage.endless;
    const head = endless ? `${rewards.score} destroyed` : rewards.won ? 'Cleared!' : 'Overrun';
    const sub = endless
      ? `Best: ${fmt(Math.max(this.hooks.best, rewards.score ?? 0))}`
      : rewards.won
        ? `${w.stage.name} wiped out in ${Math.round(w.time)}s`
        : `You cleared ${pct(rewards.progress)} of the train`;
    const great = rewards.won || !!rewards.newBest;
    if (great) setTimeout(() => confetti(), 250);
    this.overlay = modal(
      this.el,
      h(
        'div',
        { class: 'panel results' },
        h('p', { class: `result-head ${great ? 'win' : 'lose'}`, text: head }),
        h('p', { text: sub }),
        ...notes.map((n) => h('p', { style: 'color: var(--lime); font-weight: 600', text: n })),
        h('div', { class: 'loot' }, ...loot),
        h(
          'div',
          { class: 'dmg-list' },
          ...rows.map((r) =>
            h(
              'div',
              { class: 'dmg-row' },
              r.icon,
              h('div', { class: 'dmg-bar' }, h('div', { style: `width:${((r.dealt / total) * 100).toFixed(1)}%` })),
              h('span', { class: 'num', text: fmt(r.dealt) }),
            ),
          ),
        ),
        h('button', { class: 'pill', style: 'width:100%', text: 'Continue', onclick: () => this.hooks.exit() }),
      ),
    );
  }
}

/** Cards lean toward the pointer and their foil catches the light. */
function tilt(card: HTMLElement): void {
  card.addEventListener('pointermove', (e) => {
    const r = card.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    card.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
    card.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
    const dx = x - 0.5;
    const dy = y - 0.5;
    const mag = Math.hypot(dx, dy);
    card.style.rotate = mag > 0.01 ? `${(-dy).toFixed(3)} ${dx.toFixed(3)} 0 ${(mag * 24).toFixed(1)}deg` : '';
    card.classList.add('lit');
  });
  card.addEventListener('pointerleave', () => {
    card.style.rotate = '';
    card.classList.remove('lit');
  });
}

/** Tick a number up from zero, easing out. */
function countUp(el: HTMLElement, to: number, ms = 1100): void {
  if (to <= 0 || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = `+${fmt(to)}`;
    return;
  }
  const t0 = performance.now() + 300;
  const step = (now: number) => {
    const k = Math.min(1, Math.max(0, (now - t0) / ms));
    el.textContent = `+${fmt(Math.round(to * (1 - Math.pow(1 - k, 3))))}`;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function roman(n: number): string {
  const table: [number, string][] = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let out = '';
  for (const [v, sym] of table) {
    while (n >= v) {
      out += sym;
      n -= v;
    }
  }
  return out;
}
