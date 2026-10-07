import { fmt } from '../core/format';
import { LOADOUT_SLOTS } from '../game/constants';
import { COSTUME_ORDER, COSTUMES, unlockText } from '../game/costumes';
import { stageDef, type Difficulty, type ThemeId } from '../game/stage';
import { PALETTES } from '../game/themes';
import type { WeaponId } from '../game/types';
import { ALL_CARDS } from '../game/upgrades';
import { WEAPON_UNLOCK_ORDER, WEAPONS } from '../game/weapons';
import {
  claimMilestone,
  combatPower,
  costumeUnlocked,
  endlessUnlocked,
  HERO_STAT_DEFS,
  MAX_WEAPON_LEVEL,
  MILESTONES,
  recommendedPower,
  weaponLevelPerks,
  weaponUpgradeCost,
} from '../meta/economy';
import { exportSave, freshSave, importSave, stageRecord, type SaveData } from '../meta/save';
import { costumeImg, iconImg } from '../render/icons';
import { drawSprite, ThemeSprites } from '../render/sprites';
import { clear, h, modal, toast } from './dom';
import { audio } from './audio';

export type Tab = 'hero' | 'battle' | 'weapons';

export interface HomeHooks {
  save: SaveData;
  persist(): void;
  replaceSave(save: SaveData): void;
  /** Push the save's audio settings to the audio engine. */
  applyAudio(): void;
  startRun(): void;
  tab: Tab;
  setTab(tab: Tab): void;
}

const LAYOUT_HINT = {
  rows: 'Winding rows down to the membrane',
  columns: 'Snaking columns down to the membrane',
  spiral: 'A spiral closing in on you',
} as const;

const ALL_WEAPONS: WeaponId[] = ['capsule', ...WEAPON_UNLOCK_ORDER];

export class HomeScreen {
  readonly el: HTMLDivElement;
  private readonly hooks: HomeHooks;
  private readonly body: HTMLDivElement;
  private readonly wallet: HTMLSpanElement;
  private readonly tabs: HTMLDivElement;
  private sheet: { el: HTMLDivElement; close: () => void } | null = null;

  constructor(parent: Element, hooks: HomeHooks) {
    this.hooks = hooks;
    this.wallet = h('span', { class: 'num' });
    this.body = h('div', { class: 'tab-body' });
    this.tabs = h('div', { class: 'tabs' });
    this.el = h(
      'div',
      { class: 'home' },
      h(
        'div',
        { class: 'topbar' },
        h('div', { class: 'wallet', title: 'Coins' }, iconImg('coin'), this.wallet),
        h('div', { class: 'spacer' }),
        h('button', { class: 'round-btn', ariaLabel: 'Settings', onclick: () => this.openSettings() }, iconImg('gear')),
      ),
      this.body,
      this.tabs,
    );
    parent.append(this.el);
    this.render();
  }

  destroy(): void {
    this.sheet?.close();
    this.el.remove();
  }

  private get save(): SaveData {
    return this.hooks.save;
  }

  render(): void {
    this.wallet.textContent = fmt(this.save.coins);
    clear(this.body);
    this.body.scrollTop = 0;
    const tab = this.hooks.tab;
    if (tab === 'battle') this.renderBattle();
    else if (tab === 'hero') this.renderHero();
    else this.renderWeapons();
    const btn = (id: Tab, label: string, icon: Parameters<typeof iconImg>[0]) =>
      h(
        'button',
        {
          class: `tab${tab === id ? ' active' : ''}`,
          onclick: () => {
            audio.unlock();
            audio.play('tap');
            this.hooks.setTab(id);
            this.render();
          },
        },
        iconImg(icon),
        label,
      );
    this.tabs.replaceChildren(btn('hero', 'Hero', 'heart'), btn('battle', 'Battle', 'virus'), btn('weapons', 'Weapons', 'capsule'));
  }

  // ---------------------------------------------------------------- battle

  private renderBattle(): void {
    const save = this.save;
    const canEndless = endlessUnlocked(save);
    if (!canEndless) save.mode = 'chapters';
    const modeBtn = (mode: SaveData['mode'], label: string) =>
      h('button', {
        class: save.mode === mode ? 'on' : '',
        text: label,
        disabled: mode === 'endless' && !canEndless,
        onclick: () => {
          audio.play('tap');
          save.mode = mode;
          this.hooks.persist();
          this.render();
        },
      });
    const modes = h('div', { class: 'segmented' }, modeBtn('chapters', 'Chapters'), modeBtn('endless', canEndless ? 'Endless' : 'Endless (clear ch. 2)'));
    if (save.mode === 'endless') {
      this.renderEndless(modes);
      return;
    }
    this.body.append(modes);
    const sel = save.selected;
    sel.chapter = Math.min(Math.max(1, sel.chapter), save.maxChapter);
    const normal = stageRecord(save, sel.chapter, 'normal');
    if (sel.difficulty === 'hard' && !normal.cleared) sel.difficulty = 'normal';
    const stage = stageDef(sel.chapter, sel.difficulty);
    const rec = stageRecord(save, sel.chapter, sel.difficulty);

    const lens = h('div', { class: 'lens', style: `background:${PALETTES[stage.theme].floor}` }, this.headCanvas(stage.theme));
    const go = (d: number) => {
      audio.play('tap');
      sel.chapter += d;
      sel.difficulty = 'normal';
      this.hooks.persist();
      this.render();
    };
    const slide = h(
      'div',
      { class: 'slide' },
      h(
        'div',
        { class: 'label' },
        h('div', { class: 'chap', text: `Chapter ${stage.chapter}` }),
        h('div', { class: 'vname', text: stage.name }),
        h('div', { class: 'chap', style: 'margin-top:auto', text: LAYOUT_HINT[stage.layout] }),
      ),
      h(
        'div',
        { class: 'specimen' },
        lens,
        h('button', { class: 'round-btn nav-arrow prev', text: '‹', ariaLabel: 'Previous chapter', disabled: sel.chapter <= 1, onclick: () => go(-1) }),
        h('button', { class: 'round-btn nav-arrow next', text: '›', ariaLabel: 'Next chapter', disabled: sel.chapter >= save.maxChapter, onclick: () => go(1) }),
      ),
    );

    const diffBtn = (d: Difficulty, label: string) =>
      h('button', {
        class: `${sel.difficulty === d ? 'on' : ''}${d === 'hard' ? ' hard' : ''}`,
        text: label,
        disabled: d === 'hard' && !normal.cleared,
        title: d === 'hard' && !normal.cleared ? 'Clear normal first' : '',
        onclick: () => {
          audio.play('tap');
          sel.difficulty = d;
          this.hooks.persist();
          this.render();
        },
      });

    const mine = combatPower(save);
    const want = recommendedPower(stage.chapter, stage.difficulty);
    const ratio = mine / want;
    const power = h(
      'div',
      { class: 'power' },
      h('div', {}, h('b', { class: 'num', text: fmt(mine) }), 'Your power'),
      h('div', { class: ratio >= 1 ? 'ok' : ratio >= 0.7 ? 'close' : 'low' }, h('b', { class: 'num', text: fmt(want) }), 'Recommended'),
    );

    const fill = Math.round(rec.best * 100);
    const chests = MILESTONES.map((m, i) => {
      const claimed = rec.claimed.includes(i);
      const ready = !claimed && rec.best >= m;
      return h(
        'button',
        {
          class: `mchest${ready ? ' ready' : claimed ? '' : ' locked'}`,
          style: `left:${4 + m * 92}%`,
          ariaLabel: `${m * 100}% reward`,
          onclick: () => {
            if (!ready) {
              toast(claimed ? 'Already claimed' : `Reach ${m * 100}% to open`);
              return;
            }
            const got = claimMilestone(save, stage.chapter, stage.difficulty, i);
            if (!got) return;
            audio.play('chest');
            this.hooks.persist();
            const shardCount = Object.values(got.shards).reduce((a, n) => a + (n ?? 0), 0);
            toast(`+${fmt(got.coins)} coins${shardCount ? ` and ${shardCount} shards` : ''}`);
            this.render();
          },
        },
        iconImg(claimed ? 'chestOpen' : 'chest'),
        `${m * 100}%`,
      );
    });
    const milestones = h(
      'div',
      { class: 'milestones' },
      h('div', { class: 'best', text: rec.best > 0 ? `Best run: ${fill}% cleared` : 'Not attempted yet' }),
      h('div', { class: 'mtrack' }, h('div', { class: 'line' }, h('div', { style: `width:${fill}%` })), ...chests),
    );

    const start = h(
      'button',
      {
        class: 'pill red start',
        onclick: () => {
          audio.unlock();
          audio.play('tap');
          this.hooks.startRun();
        },
      },
      'Start run',
    );

    this.body.append(slide, h('div', { class: 'segmented' }, diffBtn('normal', 'Normal'), diffBtn('hard', 'Hard')), power, milestones, start);
  }

  private renderEndless(modes: HTMLElement): void {
    const save = this.save;
    const slide = h(
      'div',
      { class: 'slide' },
      h(
        'div',
        { class: 'label' },
        h('div', { class: 'chap', text: 'Endless' }),
        h('div', { class: 'vname', text: 'Endless Mutation' }),
        h('div', { class: 'chap', style: 'margin-top:auto', text: 'The train never ends. Toughness follows your chapter progress.' }),
      ),
      h('div', { class: 'specimen' }, h('div', { class: 'lens', style: `background:${PALETTES.violet.floor}` }, this.headCanvas('violet'))),
    );
    const best = h(
      'div',
      { class: 'power' },
      h('div', {}, h('b', { class: 'num', text: fmt(save.endlessBest) }), 'Best score'),
      h('div', {}, h('b', { class: 'num', text: fmt(combatPower(save)) }), 'Your power'),
    );
    const note = h('p', { class: 'mode-note', text: 'Every 20 segments destroyed pays a shard; coins scale with your best chapter.' });
    const start = h(
      'button',
      {
        class: 'pill red start',
        onclick: () => {
          audio.unlock();
          audio.play('tap');
          this.hooks.startRun();
        },
      },
      'Start endless',
    );
    this.body.append(modes, slide, best, note, start);
  }

  private headCanvas(theme: ThemeId): HTMLCanvasElement {
    const css = 118;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const c = h('canvas');
    c.width = c.height = Math.round(css * dpr);
    const g = c.getContext('2d')!;
    const k = (css * dpr) / 120;
    const sprites = new ThemeSprites(theme, k * 1.1);
    g.scale(k, k);
    drawSprite(g, sprites.head, 60, 60, 1.0);
    return c;
  }

  // ------------------------------------------------------------------ hero

  private renderHero(): void {
    const save = this.save;
    const list = h(
      'div',
      { class: 'statlist' },
      ...HERO_STAT_DEFS.map((def) => {
        const level = save.hero[def.key];
        const maxed = level >= def.maxLevel;
        const cost = def.cost(level);
        return h(
          'div',
          { class: 'stat' },
          h('div', { class: 'sname', text: `${def.name}` }),
          h(
            'div',
            { class: 'sval' },
            h('b', { class: 'num', text: def.show(def.value(level)) }),
            maxed ? '  max level' : `  next ${def.show(def.value(level + 1))}`,
          ),
          h(
            'button',
            {
              class: 'pill gold',
              disabled: maxed || save.coins < cost,
              ariaLabel: `Upgrade ${def.name}`,
              onclick: () => {
                if (save.coins < cost || maxed) return;
                save.coins -= cost;
                save.hero[def.key]++;
                audio.play('tap');
                this.hooks.persist();
                this.render();
              },
            },
            iconImg('coin'),
            h('span', { class: 'num', text: maxed ? 'Max' : fmt(cost) }),
          ),
        );
      }),
    );
    const current = COSTUMES[save.costume];
    const costumes = h(
      'div',
      { class: 'costumes' },
      ...COSTUME_ORDER.map((id) => {
        const unlocked = costumeUnlocked(save, id);
        return h(
          'button',
          {
            class: `costume${save.costume === id ? ' on' : ''}${unlocked ? '' : ' locked'}`,
            ariaLabel: COSTUMES[id].name,
            onclick: () => {
              if (!unlocked) {
                toast(unlockText(COSTUMES[id]));
                return;
              }
              audio.play('tap');
              save.costume = id;
              this.hooks.persist();
              this.render();
            },
          },
          costumeImg(id),
          unlocked ? null : h('span', { class: 'lockdot' }, iconImg('lock')),
        );
      }),
    );
    const info = h(
      'div',
      { class: 'costume-info' },
      h('div', { class: 'cname', text: current.name }),
      h('div', { class: 'perk', text: current.perk }),
      h('div', { class: 'ultline' }, h('b', { text: current.ultName }), `: ${current.ultDesc}`),
    );
    this.body.append(
      h('div', { class: 'portrait' }, costumeImg(save.costume)),
      h('div', { class: 'power' }, h('div', {}, h('b', { class: 'num', text: fmt(combatPower(save)) }), 'Combat power')),
      h('div', { class: 'section-title', text: 'Costume: each has a perk and its own ultimate' }),
      costumes,
      info,
      h('div', { class: 'section-title', text: 'Upgrades' }),
      list,
    );
  }

  // --------------------------------------------------------------- weapons

  private renderWeapons(): void {
    const save = this.save;
    const slots: HTMLElement[] = [];
    for (let i = 0; i < LOADOUT_SLOTS; i++) {
      const id = save.loadout[i];
      if (!id) {
        slots.push(h('div', { class: 'wslot empty', attrs: { 'aria-label': 'Empty slot' } }));
        continue;
      }
      slots.push(
        h(
          'button',
          { class: 'wslot', ariaLabel: WEAPONS[id].name, onclick: () => this.openWeapon(id) },
          iconImg(id),
          i === 0 ? h('span', { class: 'starter', text: 'Starter' }) : null,
          h('span', { class: 'lv', text: `Lv ${save.weapons[id].level}` }),
          this.canUpgrade(id) ? h('span', { class: 'dot' }) : null,
        ),
      );
    }
    const collection = ALL_WEAPONS.map((id, idx) => {
      const unlocked = save.unlocked.includes(id);
      const equipped = id === 'capsule' || save.loadout.includes(id);
      if (!unlocked) {
        // WEAPON_UNLOCK_ORDER[n] unlocks on clearing chapter n-1.
        const chapter = idx - 2;
        return h('button', { class: 'wslot locked', ariaLabel: `${WEAPONS[id].name}, locked`, onclick: () => toast(`Clear chapter ${chapter} to unlock`) }, iconImg(id), h('span', { class: 'lv', text: `Ch ${chapter}` }));
      }
      return h(
        'button',
        { class: `wslot${equipped ? ' equipped' : ''}`, ariaLabel: WEAPONS[id].name, onclick: () => this.openWeapon(id) },
        iconImg(id),
        h('span', { class: 'lv', text: `Lv ${save.weapons[id].level}` }),
        this.canUpgrade(id) ? h('span', { class: 'dot' }) : null,
      );
    });
    this.body.append(
      h('div', { class: 'section-title', text: 'Equipped: the starter is active from the first second, the rest drop from chests' }),
      h('div', { class: 'loadout' }, ...slots),
      h('div', { class: 'section-title', text: 'Collection: the capsule is always on' }),
      h('div', { class: 'collection' }, ...collection),
    );
  }

  private canUpgrade(id: WeaponId): boolean {
    const w = this.save.weapons[id];
    if (w.level >= MAX_WEAPON_LEVEL) return false;
    const cost = weaponUpgradeCost(w.level);
    return w.shards >= cost.shards && this.save.coins >= cost.coins;
  }

  private openWeapon(id: WeaponId): void {
    audio.play('tap');
    const save = this.save;
    const def = WEAPONS[id];
    const state = save.weapons[id];
    const maxed = state.level >= MAX_WEAPON_LEVEL;
    const cost = weaponUpgradeCost(state.level);
    const specials = ALL_CARDS.filter((c) => c.weapon === id && c.minLevel);
    const inLoadout = save.loadout.indexOf(id);
    const close = () => {
      this.sheet?.close();
      this.sheet = null;
    };
    const refresh = () => {
      this.hooks.persist();
      close();
      this.render();
      this.openWeapon(id);
    };

    const buttons: HTMLElement[] = [
      h(
        'button',
        {
          class: 'pill gold',
          disabled: maxed || state.shards < cost.shards || save.coins < cost.coins,
          onclick: () => {
            if (maxed || state.shards < cost.shards || save.coins < cost.coins) return;
            state.shards -= cost.shards;
            save.coins -= cost.coins;
            state.level++;
            audio.play('chest');
            toast(`${def.name} is now level ${state.level}`);
            refresh();
          },
        },
        maxed ? 'Max level' : 'Upgrade',
        maxed ? null : iconImg('coin'),
        maxed ? null : h('span', { class: 'num', text: fmt(cost.coins) }),
      ),
    ];
    if (id !== 'capsule') {
      if (inLoadout >= 0) {
        if (inLoadout > 0) {
          buttons.push(
            h('button', {
              class: 'pill teal',
              text: 'Make starter',
              onclick: () => {
                save.loadout.splice(inLoadout, 1);
                save.loadout.unshift(id);
                refresh();
              },
            }),
          );
        }
        buttons.push(
          h('button', {
            class: 'pill ghost',
            text: 'Unequip',
            disabled: save.loadout.length <= 1,
            onclick: () => {
              save.loadout.splice(inLoadout, 1);
              refresh();
            },
          }),
        );
      } else {
        buttons.push(
          h('button', {
            class: 'pill teal',
            text: save.loadout.length >= LOADOUT_SLOTS ? 'Loadout full' : 'Equip',
            disabled: save.loadout.length >= LOADOUT_SLOTS,
            onclick: () => {
              save.loadout.push(id);
              refresh();
            },
          }),
        );
      }
    }
    buttons.push(h('button', { class: 'pill ghost', text: 'Close', onclick: close }));

    const shardPct = maxed ? 100 : Math.min(100, (state.shards / cost.shards) * 100);
    this.sheet = modal(
      this.el,
      h(
        'div',
        { class: 'panel sheet' },
        h('div', { class: 'whead' }, iconImg(id), h('div', {}, h('h2', { text: def.name }), h('p', { text: def.blurb }))),
        h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', { text: `Level ${state.level}` }), h('span', { style: 'color:var(--muted)', text: maxed ? '' : `Next: ${weaponLevelPerks(state.level + 1)}` })),
        h('div', { class: 'shardbar' }, h('div', { style: `width:${shardPct}%` }), h('span', { class: 'num', text: maxed ? 'Max level' : `${state.shards} / ${cost.shards} shards` })),
        h(
          'ul',
          { class: 'perks' },
          ...specials.map((c) =>
            h('li', { class: state.level >= (c.minLevel ?? 1) ? 'have' : '' }, h('b', { text: `Lv ${c.minLevel}` }), `${c.name}: ${c.desc(1)}`),
          ),
        ),
        h('div', { class: 'stack' }, ...buttons),
      ),
    );
    this.sheet.el.addEventListener('click', (e) => {
      if (e.target === this.sheet?.el) close();
    });
  }

  // -------------------------------------------------------------- settings

  private openSettings(): void {
    audio.play('tap');
    const save = this.save;
    const toggle = (label: string, get: () => boolean, set: (v: boolean) => void) => {
      const input = h('input', { attrs: { type: 'checkbox' } });
      input.checked = get();
      input.addEventListener('change', () => {
        set(input.checked);
        this.hooks.persist();
      });
      return h('label', { class: 'toggle' }, h('span', { text: label }), input);
    };
    /** On/off plus a volume slider on one row. */
    const audioRow = (label: string, getOn: () => boolean, setOn: (v: boolean) => void, getVol: () => number, setVol: (v: number) => void) => {
      const box = h('input', { attrs: { type: 'checkbox', 'aria-label': label } });
      box.checked = getOn();
      box.addEventListener('change', () => {
        setOn(box.checked);
        this.hooks.persist();
      });
      const range = h('input', { attrs: { type: 'range', min: '0', max: '1', step: '0.05', 'aria-label': `${label} volume` } });
      range.value = String(getVol());
      range.addEventListener('input', () => setVol(Number(range.value)));
      range.addEventListener('change', () => this.hooks.persist());
      return h('div', { class: 'toggle audio' }, h('span', { text: label }), range, box);
    };
    const code = h('textarea', { class: 'code', attrs: { placeholder: 'Paste a backup code here to restore it', spellcheck: 'false' } });
    const close = () => {
      this.sheet?.close();
      this.sheet = null;
    };
    this.sheet = modal(
      this.el,
      h(
        'div',
        { class: 'panel' },
        h('h2', { text: 'Settings' }),
        audioRow(
          'Music',
          () => save.settings.music,
          (v) => {
            save.settings.music = v;
            this.hooks.applyAudio();
            if (v) audio.music('menu');
          },
          () => save.settings.musicVol,
          (v) => {
            save.settings.musicVol = v;
            this.hooks.applyAudio();
          },
        ),
        audioRow(
          'Sound effects',
          () => save.settings.sfx,
          (v) => {
            save.settings.sfx = v;
            this.hooks.applyAudio();
          },
          () => save.settings.sfxVol,
          (v) => {
            save.settings.sfxVol = v;
            this.hooks.applyAudio();
            audio.play('pop');
          },
        ),
        toggle('Damage numbers', () => save.settings.numbers, (v) => (save.settings.numbers = v)),
        toggle('Start runs at 2× speed', () => save.settings.fast, (v) => (save.settings.fast = v)),
        toggle('Manual aim: touch the train to target', () => save.settings.aim === 'manual', (v) => (save.settings.aim = v ? 'manual' : 'auto')),
        h('h2', { style: 'margin-top:14px', text: 'Backup' }),
        h('p', { text: 'Your progress lives on this device. Copy the code somewhere safe, or paste one to move progress between devices.' }),
        h(
          'div',
          { class: 'stack' },
          h('button', {
            class: 'pill teal',
            text: 'Copy backup code',
            onclick: async () => {
              const text = exportSave(save);
              try {
                await navigator.clipboard.writeText(text);
                toast('Backup code copied');
              } catch {
                code.value = text;
                toast('Copy the code from the box');
              }
            },
          }),
          code,
          h('button', {
            class: 'pill ghost',
            text: 'Restore from code',
            onclick: () => {
              const restored = importSave(code.value);
              if (!restored) {
                toast('That code is not a Germline backup');
                return;
              }
              this.hooks.replaceSave(restored);
              toast('Progress restored');
              close();
              this.render();
            },
          }),
          h('button', {
            class: 'pill ghost',
            text: 'Reset all progress',
            onclick: () => {
              if (!confirm('Erase all coins, upgrades and chapters? This cannot be undone.')) return;
              this.hooks.replaceSave(freshSave());
              close();
              this.render();
            },
          }),
          h('button', { class: 'pill', text: 'Done', onclick: close }),
        ),
        h('div', { class: 'version', text: `Germline build ${__BUILD_SHA__}` }),
      ),
    );
  }
}
