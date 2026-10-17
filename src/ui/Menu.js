// The title screen and the pause menu.
//
// Boot: the sigil and a loading bar, then "Press any key" (the key press is also what lets the
// audio start). Title: a menu column on the left over the live cinematic, and pages that slide
// in on the right (the vigil you can continue, a new run on a chosen difficulty, the Field
// Guide, lifetime records, settings, controls, credits). Pause: the same frame over the frozen
// game, with Resume and a way back to the title.
import { version } from '../../package.json';
import { ENEMY_TYPES, DAMAGE_TYPES, AFFIXES } from '../defense/Enemies.js';
import { ROOTS, BUILD_DEFS, GRAFTS, PALETTE } from '../defense/Towers.ts';
import { BLIGHT_PALETTE } from '../defense/Enemies.js';
import { BINDABLE, keyName } from '../core/Input.js';
import { describeWave, SIGNS } from '../defense/Waves.js';
import { NOTES, SEALS, RADIO_PARTS, loadNotes } from '../core/Story.js';
import { ITEMS } from '../items/ItemDB.ts';
import { RECIPES } from '../items/Recipes.js';
import { PERKS } from '../core/Perks.js';
import { DIFFICULTIES, DIFFICULTY_IDS, difficulty, KITS, KIT_IDS, kitItems } from '../core/Difficulty.js';
import { loadBest, loadRecords } from '../core/Save.js';
import { MEMORIES, unlocked } from '../core/Memories.js';
import { renderPortraits } from './Portraits.js';
import { ACHIEVEMENTS, loadEarned } from '../core/Achievements.js';
import { DAILY, dailyLabel } from '../core/Seed.js';

const $ = (s, root = document) => root.querySelector(s);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function ago(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'saved just now';
  if (m < 60) return `saved ${plural(m, 'minute')} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `saved ${plural(h, 'hour')} ago`;
  return `saved ${plural(Math.round(h / 24), 'day')} ago`;
}

// ------------------------------------------------------------------ Field Guide entries

const BLIGHT = [
  {
    id: 'blightling', kind: 'Swarm', from: 1,
    lore: 'Rot given legs and a mouth. They pour out of the rifts in packs and leap the last few metres. One is a single cut of the machete; thirty strip a wall to splinters.',
    tip: 'Spike traps and a bow tower thin them before they reach you. Step aside when one crouches to pounce.',
  },
  {
    id: 'rotboar', kind: 'Brute', from: 2,
    lore: 'A boar the Blight hollowed out and packed with fungus. Slow, heavy and furious at anything built by hand. Walls are a meal to it, and towers are dessert.',
    tip: 'Spore mortars slow it to a crawl. It goes for your buildings first, so keep walls between it and the towers.',
  },
  {
    id: 'spitter', kind: 'Artillery', from: 3,
    lore: 'A squat thing carrying a sac of sick green bile on its back. It stops well out of reach, rears its tube of a mouth and lobs globs that burn where they land.',
    tip: 'It hangs back behind the pack and goes for your towers. Bow towers pick Spitters out first; run one down with the machete and it barely fights.',
  },
  {
    id: 'husk', kind: 'Day hunter', from: 3,
    lore: "What's left of the things the forest took and didn't finish with: bark grown over bone, walking the old camps and wrecks by day. Blind, but it hears a sprint, a heavy pack or a crate smashed open from far off.",
    tip: "Walk, don't run, near the places worth searching, and prise crates open instead of smashing them. They sink back into the soil at dusk, and they carry good salvage.",
  },
  {
    id: 'wisp', kind: 'Flyer', from: 4,
    lore: 'Drifting lights of spore and spite. They float over walls and traps alike, straight for the Heartwood, and keen as they come.',
    tip: 'Bow towers, Tesla totems and embers reach them. Mortars, walls and traps do nothing.',
  },
  {
    id: 'thornback', kind: 'Heart-eater', from: 5,
    lore: 'Something old and armoured that the Blight woke under the forest. It rises on the fifth night (and every fifth after the tenth), shakes the ground with its slams and calls Blightlings out of the soil.',
    tip: 'Its slams flatten buildings near it. Snares only slow it. Burn it, shoot it, and keep it moving.',
  },
  {
    id: 'burrower', kind: 'Tunneller', from: 6,
    lore: 'An armoured grub as long as a man, plated in crust and built to dig. Put a wall in its way and it simply goes under, a ridge of earth racing toward the Heart.',
    tip: "Nothing can touch it underground. A Glowcap Lantern's light drags it up, dazed, and everything hits it harder there.",
  },
  {
    id: 'rot_mother', kind: 'Brood queen', from: 10,
    lore: "Whatever Dr. Vane became, down in the soil under the old camp. Swollen, slow and endlessly hungry, she drags a belly full of eggs toward the Heart and lays as she walks.",
    tip: 'Her eggs hatch three Blightlings each in a few seconds. Burn them (fire hurts them most) or cut them as they fall, and let the towers work on her.',
  },
];
const DEFENCES = ['bow_tower', 'spore_mortar', 'tesla_totem', 'ember_brazier', 'glow_lantern', 'barricade', 'vine_snare', 'spike_trap', 'heartseed'];
const ROLES = {
  heartseed: 'Ward · pushes back the Rot',
  bow_tower: 'Long range · single target', spore_mortar: 'Artillery · splash & slow', tesla_totem: 'Chain lightning',
  ember_brazier: 'Close range · burning', glow_lantern: 'Light · exposes the Blight', barricade: 'Wall · reroutes the Blight', vine_snare: 'Trap · roots in place', spike_trap: 'Trap · hidden spikes',
};

const CONTROLS = [
  ['Movement', [['Move', '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>'], ['Sprint', '<kbd>Shift</kbd>'], ['Jump', '<kbd>Space</kbd>'], ['Look', 'Mouse']]],
  ['Fighting', [['Swing the machete', '<kbd>LMB</kbd>'], ['Draw and loose the sling', 'Hold <kbd>LMB</kbd>'], ['Use or throw what you hold', '<kbd>RMB</kbd>'], ['Choose from the belt', '<kbd>1</kbd>–<kbd>8</kbd> · wheel']]],
  ['Building', [['Place a defence', '<kbd>LMB</kbd>'], ['Rotate', '<kbd>R</kbd>'], ['Pack it up again', '<kbd>F</kbd>'], ['Upgrade or repair', 'Hold <kbd>E</kbd>'], ['Graft onto a tower', 'Hold <kbd>G</kbd>'], ["Fit the radio, set the heart", 'Hold <kbd>F</kbd> at the bench']]],
  ['The forest', [['Gather, offer, open the Coffer', '<kbd>E</kbd>'], ['Rake up forage', 'Hold <kbd>E</kbd>'], ['Search a crate or cache', 'Hold <kbd>E</kbd>'], ['Satchel and crafting', '<kbd>Tab</kbd>'], ['Hurry the day along', 'Hold <kbd>T</kbd>'], ['Sound on / off', '<kbd>M</kbd>'], ['Pause', '<kbd>Esc</kbd>']]],
  ['Capture', [['Free camera (fly with WASD, Space / C, wheel for speed, P holds time)', '<kbd>F8</kbd>'], ['Hide the HUD', '<kbd>F9</kbd>']]],
  ['Satchel and containers', [['Take a find', 'Click'], ['Take everything', '<kbd>R</kbd>'], ['Move a stack across', '<kbd>Shift</kbd>-click'], ['Salvage a defence', 'Right-click it'], ['Shut it again', '<kbd>E</kbd> · <kbd>Tab</kbd>']]],
];

// ------------------------------------------------------------------ settings, remembered

const SETTINGS = {
  quality: { key: 'og.quality', def: 'high' },
  bloom: { key: 'og.bloom', def: '1' },
  autores: { key: 'og.autores', def: '1' },
  // 60 a second unless asked: on a 144 Hz screen the GPU otherwise draws 144 frames a second
  fps: { key: 'og.fps', def: '60' },
  showFps: { key: 'og.showFps', def: '0' },
  sensitivity: { key: 'og.sensitivity', def: '1' },
  invertY: { key: 'og.invertY', def: '0' },
  volume: { key: 'og.volume', def: '1' },
  music: { key: 'og.music', def: '1' },
  captions: { key: 'og.captions', def: '0' },
  shake: { key: 'og.shake', def: '1' },
  bob: { key: 'og.bob', def: '1' },
  cb: { key: 'og.cb', def: '0' },
};
function readSetting(name) {
  try {
    return localStorage.getItem(SETTINGS[name].key) ?? SETTINGS[name].def;
  } catch {
    return SETTINGS[name].def;
  }
}
function writeSetting(name, v) {
  try {
    localStorage.setItem(SETTINGS[name].key, String(v));
  } catch {
    // storage blocked: the setting lasts this visit only
  }
}

export class Menu {
  constructor(game, { save, onNew, onContinue, onResume, onQuit }) {
    this.game = game;
    this.save = save;
    this.cb = { onNew, onContinue, onResume, onQuit };
    this.el = $('#menu');
    this.nav = $('#nav');
    this.panel = $('#panel');
    this.body = $('#panel-body');
    this.mode = 'boot';
    this.items = [];
    this.sel = -1;
    this.page = null; // the open page's name
    this.pinned = false; // opened by a click (stays) rather than by hovering Continue (follows the selection)
    // a first vigil starts on Verdant (with the guided first night); after that, Warden
    this.diff = save?.difficulty || (loadRecords().runs ? 'warden' : 'verdant');
    this.kit = 'starter';
    this.guideTab = 'blight';
    this.guidePick = { blight: 'blightling', defences: 'bow_tower' };
    $('#version').textContent = `v${version}`;
    this.spores();
    this.applySettings();
    this.keys();
    addEventListener('resize', () => this.crowd());
    $('#mute').addEventListener('click', () => {
      this.game.audio.toggleMute();
      this.syncMute();
    });
    this.syncMute();
  }

  get audio() {
    return this.game.audio;
  }

  // ---------------------------------------------------------------- boot

  progress(p, msg) {
    $('#loading-bar').style.width = `${Math.round(p * 100)}%`;
    $('#loading-text').textContent = msg;
  }

  // loaded: the cinematic fades up behind the splash, and any key wakes the title
  ready() {
    this.el.classList.add('ready');
    const wake = (e) => {
      if (e.type === 'keydown' && (e.repeat || e.code === 'Tab')) return;
      removeEventListener('keydown', wake, true);
      removeEventListener('pointerdown', wake, true);
      // the key that wakes the title mustn't also choose from it
      e.preventDefault?.();
      e.stopImmediatePropagation?.();
      this.wake();
    };
    addEventListener('keydown', wake, true);
    addEventListener('pointerdown', wake, true);
  }

  wake() {
    this.audio.start();
    this.audio.music(readSetting('music') === '1');
    this.syncMute();
    this.audio.choose();
    this.el.classList.remove('boot');
    this.showTitle();
  }

  // ---------------------------------------------------------------- the menu column

  showTitle() {
    this.mode = 'title';
    this.el.classList.remove('ingame');
    $('#brand-sub').textContent = DAILY ? `Daily vigil · ${dailyLabel()}` : 'Hold the Heartwood';
    $('.pause-info')?.remove();
    const s = this.save;
    const items = [];
    if (s) {
      items.push({ id: 'continue', label: 'Continue', sub: `Day ${s.night} · ${difficulty(s.difficulty).name} · ${ago(s.at)}`, primary: true, act: () => this.cb.onContinue(), preview: 'continue' });
    }
    items.push({ id: 'new', label: 'New Game', primary: !s, act: () => this.open('new') });
    // the daily vigil: today's forest, the same for everyone (a page load with its own seed)
    items.push(DAILY
      ? { id: 'daily', label: 'The usual forest', sub: 'Leave the daily vigil', act: () => { location.search = ''; } }
      : { id: 'daily', label: 'Daily vigil', sub: "Today's forest, the same for everyone: Warden, the starter kit, no Memories", act: () => { location.search = '?daily'; } });
    items.push({ id: 'guide', label: 'Field Guide', gap: true, act: () => this.open('guide') });
    items.push({ id: 'records', label: 'Records', act: () => this.open('records') });
    items.push({ id: 'settings', label: 'Settings', act: () => this.open('settings') });
    items.push({ id: 'controls', label: 'Controls', act: () => this.open('controls') });
    items.push({ id: 'credits', label: 'Credits', act: () => this.open('credits') });
    this.setItems(items);
    this.select(0, { quiet: true });
  }

  showPause() {
    this.mode = 'pause';
    this.el.classList.remove('hidden', 'boot', 'leaving');
    this.el.classList.add('ingame');
    this.audio.music(false);
    this.game.hud.show(false);
    $('#brand-sub').textContent = 'Paused';
    const g = this.game, w = g.waves;
    let info = $('.pause-info');
    if (!info) {
      info = document.createElement('div');
      info.className = 'pause-info';
      $('.brand').after(info);
    }
    const phase = w.phase === 'night' ? `Night <b>${w.night}</b> · ${plural(w.remaining, 'Blight')} still out` : `Day <b>${w.night}</b> · ${g.sky.clock}`;
    const tonight = w.phase === 'day' ? `<span class="tonight">Tonight: ${describeWave(w.preview.counts)}</span>` : '';
    info.innerHTML = `${phase} · ${difficulty(g.difficulty).name}${tonight}`;
    this.setItems([
      { id: 'resume', label: 'Resume', primary: true, act: () => this.cb.onResume() },
      { id: 'howto', label: 'How to Play', gap: true, act: () => this.howTo() },
      { id: 'guide', label: 'Field Guide', act: () => this.open('guide') },
      { id: 'settings', label: 'Settings', act: () => this.open('settings') },
      { id: 'controls', label: 'Controls', act: () => this.open('controls') },
      { id: 'quit', label: 'Quit to Title', gap: true, act: () => this.open('quit') },
    ]);
    this.close(true);
    this.select(0, { quiet: true });
  }

  // the opening card again, over the game; closing it resumes play
  howTo() {
    const g = this.game;
    this.hidePause();
    g.showIntro(() => {
      g.setPaused(false);
      if (!g.debug) g.input.lock();
    });
  }

  hidePause() {
    this.close(true);
    this.game.hud.show(true);
    this.el.classList.add('hidden');
    this.mode = 'play';
  }

  setItems(items) {
    this.items = items;
    this.nav.innerHTML = '';
    items.forEach((it, i) => {
      const b = document.createElement('button');
      b.className = `nav-item${it.primary ? ' primary' : ''}${it.gap ? ' gap' : ''}`;
      b.style.setProperty('--i', i);
      b.innerHTML = `${it.label}${it.sub ? `<small>${it.sub}</small>` : ''}`;
      b.addEventListener('mouseenter', () => this.select(i));
      b.addEventListener('click', () => this.activate(i));
      it.el = b;
      this.nav.append(b);
    });
  }

  select(i, { quiet = false } = {}) {
    if (i === this.sel && this.items[i]?.el.classList.contains('sel')) return;
    this.sel = i;
    this.items.forEach((it, k) => it.el.classList.toggle('sel', k === i));
    if (!quiet) this.audio.hover();
    // hovering Continue previews the saved vigil; moving on hides it again
    const it = this.items[i];
    if (!this.pinned) {
      if (it?.preview) this.open(it.preview, { pin: false, quiet: true });
      else if (this.page) this.close();
    }
  }

  activate(i) {
    const it = this.items[i];
    if (!it || it.el.disabled) return;
    this.audio.choose();
    it.act();
  }

  // ---------------------------------------------------------------- keyboard

  keys() {
    addEventListener('keydown', (e) => {
      if (this.mode !== 'title' && this.mode !== 'pause') return;
      if (this.el.classList.contains('leaving')) return;
      if (this.page === 'settings' && this.pinned && this.settingsKey(e)) return;
      const n = this.items.length;
      if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        e.preventDefault();
        this.select((this.sel + 1) % n);
      } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        this.select((this.sel - 1 + n) % n);
      } else if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        // in a page with its own action (Begin, Quit) Enter means that
        if (this.page && this.pinned && this.pageAction) this.pageAction();
        else this.activate(this.sel);
      } else if (e.code === 'Escape' || e.code === 'Backspace') {
        if (this.page && this.pinned) {
          this.audio.ui();
          this.close();
        }
      } else if (this.page === 'new' && this.pinned && (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyA' || e.code === 'KeyD')) {
        const k = DIFFICULTY_IDS.indexOf(this.diff) + (e.code === 'ArrowRight' || e.code === 'KeyD' ? 1 : -1);
        this.pickDiff(DIFFICULTY_IDS[(k + DIFFICULTY_IDS.length) % DIFFICULTY_IDS.length]);
      }
    });
  }

  // Settings with the arrow keys (and so the gamepad): up and down pick a row, left and right
  // change it (a slider steps, a choice moves along, a switch flips), Enter flips a switch
  settingsKey(e) {
    const rows = [...this.body.querySelectorAll('.set-row')].filter((r) => r.querySelector('button, input, select'));
    if (!rows.length || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Space'].includes(e.code)) return false;
    e.preventDefault();
    let i = rows.findIndex((r) => r.classList.contains('padfocus'));
    const mark = (k) => {
      for (const r of rows) r.classList.remove('padfocus');
      rows[k].classList.add('padfocus');
      rows[k].scrollIntoView({ block: 'nearest' });
    };
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      mark(i < 0 ? 0 : (i + (e.code === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length);
      this.audio.ui();
      return true;
    }
    if (i < 0) return true;
    const row = rows[i], dir = e.code === 'ArrowLeft' ? -1 : 1;
    const range = row.querySelector('input[type=range]'), sel = row.querySelector('select');
    const btns = [...row.querySelectorAll('button')];
    if (range && e.code !== 'Enter') {
      range.value = String(Number(range.value) + dir * Number(range.step || 1));
      range.dispatchEvent(new Event('input', { bubbles: true }));
      range.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (sel && e.code !== 'Enter') {
      sel.selectedIndex = Math.max(0, Math.min(sel.options.length - 1, sel.selectedIndex + dir));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (btns.length > 1 && e.code !== 'Enter') {
      const on = Math.max(0, btns.findIndex((b) => b.classList.contains('on') || b.classList.contains('sel') || b.classList.contains('active')));
      btns[Math.max(0, Math.min(btns.length - 1, on + dir))].click();
    } else if (btns.length) btns[0].click();
    return true;
  }

  // ---------------------------------------------------------------- pages

  open(name, { pin = true, quiet = false } = {}) {
    if (this.page === name) {
      this.pinned = this.pinned || pin;
      return;
    }
    if (!quiet && !pin) this.audio.ui();
    this.page = name;
    this.pinned = pin;
    this.pageAction = null;
    this.panel.classList.remove('hidden', 'out');
    // restart the slide-in
    this.panel.style.animation = 'none';
    void this.panel.offsetWidth;
    this.panel.style.animation = '';
    this.el.classList.add('panel-open');
    const pages = {
      continue: [560, () => this.pageContinue()], new: [760, () => this.pageNew()], guide: [880, () => this.pageGuide()],
      records: [700, () => this.pageRecords()], settings: [620, () => this.pageSettings()], controls: [720, () => this.pageControls()],
      credits: [560, () => this.pageCredits()], quit: [520, () => this.pageQuit()],
    };
    const [w, build] = pages[name];
    this.panel.style.setProperty('--w', `${w}px`);
    this.panel.dataset.page = name;
    this.body.innerHTML = '';
    this.body.scrollTop = 0;
    build();
    this.crowd();
  }

  // a wide page that reaches the logo dims it rather than sitting on top of it
  crowd() {
    const logo = $('.brand .logo');
    const over = !!this.page && !this.panel.classList.contains('hidden') && this.panel.offsetLeft < logo.getBoundingClientRect().right + 24;
    this.el.classList.toggle('crowded', over);
  }

  close(instant = false) {
    if (!this.page) return;
    this.page = null;
    this.pinned = false;
    this.pageAction = null;
    this.el.classList.remove('panel-open', 'crowded');
    if (instant) {
      this.panel.classList.add('hidden');
      return;
    }
    this.panel.classList.add('out');
    clearTimeout(this.closeT);
    this.closeT = setTimeout(() => {
      if (!this.page) this.panel.classList.add('hidden');
    }, 240);
  }

  html(s) {
    this.body.insertAdjacentHTML('beforeend', s);
  }

  head(eyebrow, title, lead) {
    this.html(`<div class="p-eyebrow">${eyebrow}</div><h2 class="p-title">${title}</h2>${lead ? `<p class="p-lead">${lead}</p>` : ''}`);
  }

  // the vigil saved at the last dawn (or half-minute of day)
  pageContinue() {
    const s = this.save;
    const d = difficulty(s.difficulty);
    const hp = s.base ? Math.round((s.base.hp / s.base.maxHp) * 100) : 100;
    const built = s.buildings?.length || 0;
    this.head('Your vigil', 'The Heartwood remembers');
    this.html(`
      <div class="vigil">
        <div class="day"><small>Day</small>${s.night}</div>
        <div class="diff">${d.glyph} ${d.name}${s.won ? ' · Bloomed' : ''}</div>
        <div class="when">${ago(s.at)} · ${s.night > 10 ? 'endless nights' : `${plural(Math.max(0, 11 - s.night), 'night')} to hold`}</div>
      </div>
      <div style="margin-top:22px;display:flex;justify-content:space-between;font-size:15px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-dim)">
        <span>Heartwood</span><span style="color:var(--ink)">${Math.round(s.base?.hp ?? 500)} / ${s.base?.maxHp ?? 500}</span>
      </div>
      <div class="hbar"><b style="width:${hp}%"></b></div>
      <div class="facts">
        <div class="fact"><b>${s.night - 1}</b><span>Nights held</span></div>
        <div class="fact"><b>${s.kills || 0}</b><span>Blight felled</span></div>
        <div class="fact"><b>${built}</b><span>Standing</span></div>
        <div class="fact"><b>${s.perks?.length || 0}</b><span>Boons</span></div>
      </div>
      ${s.perks?.length ? `<div class="boon-row">${s.perks.map((id) => PERKS.find((p) => p.id === id)).filter(Boolean).map((p) => `<span title="${p.name}">${p.glyph}</span>`).join('')}</div>` : ''}
      <div class="p-actions"><button class="btn gold" id="go-continue">Continue</button><span class="p-note calm">You wake at that morning's dawn.</span></div>`);
    $('#go-continue', this.body).addEventListener('click', () => {
      this.audio.choose();
      this.cb.onContinue();
    });
    this.pageAction = () => this.cb.onContinue();
  }

  pageNew() {
    this.head('A new vigil', 'Choose how the Blight comes', 'Ten nights stand between the Heartwood and the rot. How hard should they press?');
    const cards = DIFFICULTY_IDS.map((id) => {
      const d = DIFFICULTIES[id];
      const pct = (v) => `${Math.round(v * 100)}%`;
      return `<button class="diff-card" data-id="${id}">
        ${id === 'warden' ? '<span class="tag">Intended</span>' : id === 'verdant' && !loadRecords().runs ? '<span class="tag">Your first vigil</span>' : ''}
        <div class="g">${d.glyph}</div><h3>${d.name}</h3><p>${d.blurb}</p>
        <ul><li>Blight health <b>${pct(d.hp)}</b></li><li>Blight numbers <b>${pct(d.count)}</b></li><li>Heartwood <b>${Math.round(500 * d.heart)} HP</b></li></ul>
      </button>`;
    }).join('');
    this.html(`<div class="diffs">${cards}</div>`);
    const mem = unlocked();
    // Many Paths: the kit you wake up with
    if (mem.has('paths')) {
      this.html(`<div class="p-eyebrow kits-head">Wake up with</div><div class="kits">${KIT_IDS.map((id) => `<button class="kit-card" data-id="${id}"><span class="g">${KITS[id].glyph}</span><h4>${KITS[id].name}</h4><p class="items"></p></button>`).join('')}</div>`);
      for (const c of this.body.querySelectorAll('.kit-card')) {
        c.addEventListener('click', () => this.pickKit(c.dataset.id));
        c.addEventListener('mouseenter', () => this.audio.hover());
      }
    } else this.kit = 'starter';
    const carried = MEMORIES.filter((m) => mem.has(m.id));
    if (carried.length) this.html(`<div class="carried"><span class="p-eyebrow">Memories carried</span>${carried.map((m) => `<span class="mem-chip" title="${m.reward}">${m.glyph} ${m.name}</span>`).join('')}</div>`);
    this.html(`<div class="p-actions"><button class="btn gold" id="go-new">Begin</button>${this.save ? `<span class="p-note">This replaces your vigil on Day ${this.save.night}.</span>` : '<span class="p-note calm">You can change nothing once the first night falls. Choose well.</span>'}</div>`);
    for (const c of this.body.querySelectorAll('.diff-card')) {
      c.addEventListener('click', () => this.pickDiff(c.dataset.id));
      c.addEventListener('mouseenter', () => this.audio.hover());
    }
    this.pickDiff(this.diff, true);
    this.pickKit(this.kit, true);
    const go = () => this.cb.onNew(this.diff, this.kit);
    $('#go-new', this.body).addEventListener('click', () => {
      this.audio.choose();
      go();
    });
    this.pageAction = go;
  }

  pickDiff(id, quiet = false) {
    if (!quiet && id !== this.diff) this.audio.ui();
    this.diff = id;
    for (const c of this.body.querySelectorAll('.diff-card')) c.classList.toggle('sel', c.dataset.id === id);
    this.pickKit(this.kit, true);
  }

  pickKit(id, quiet = false) {
    if (!quiet && id !== this.kit) this.audio.ui();
    this.kit = id;
    const d = difficulty(this.diff);
    for (const c of this.body.querySelectorAll('.kit-card')) {
      c.classList.toggle('sel', c.dataset.id === id);
      c.title = KITS[c.dataset.id].blurb;
      if (c.dataset.id === 'starter') $('h4', c).textContent = `${d.name} Kit`;
      $('.items', c).innerHTML = kitItems(d, c.dataset.id).map(([item, n]) => `<span>${n > 1 ? `${n}× ` : ''}${ITEMS[item].name}</span>`).join('') || '<span>Nothing at all</span>';
    }
  }

  // portraits are rendered once, the first time they're wanted
  portraits() {
    if (this._portraits) return this._portraits;
    const list = [
      ...BLIGHT.map((b) => ({ name: b.id, rimColor: 0xc070ff, glow: 0.5, yaw: -0.7 })),
      ...DEFENCES.filter((id) => BUILD_DEFS[id].model).map((id) => ({ name: BUILD_DEFS[id].model, rimColor: 0xffc070, yaw: -0.55 })),
      { name: 'heartwood', rimColor: 0x8affb0, yaw: -0.4 },
    ];
    try {
      this._portraits = renderPortraits(this.game.renderer, list);
    } catch (err) {
      console.warn('portraits failed', err);
      this._portraits = {};
    }
    return this._portraits;
  }

  memories() {
    return unlocked();
  }

  // a Blight is known once you've felled one or held through the night it first comes
  seen() {
    const seen = new Set(loadRecords().seen), best = loadBest();
    for (const b of BLIGHT) if (b.id === 'blightling' || best.nights >= b.from) seen.add(b.id);
    return seen;
  }

  pageGuide() {
    this.head('Field Guide', 'What waits in the forest');
    this.html(`<div class="tabs">${[['blight', 'The Blight'], ['defences', 'Defences'], ['boons', 'Boons'], ['expedition', 'The Expedition']].map(([id, label]) => `<button class="tab${this.guideTab === id ? ' sel' : ''}" data-tab="${id}">${label}</button>`).join('')}</div><div id="guide-body"></div>`);
    for (const t of this.body.querySelectorAll('.tab')) {
      t.addEventListener('click', () => {
        this.audio.ui();
        this.guideTab = t.dataset.tab;
        for (const o of this.body.querySelectorAll('.tab')) o.classList.toggle('sel', o === t);
        this.guideBody();
      });
    }
    this.guideBody();
  }

  guideBody() {
    const root = $('#guide-body', this.body);
    const tab = this.guideTab;
    if (tab === 'boons') {
      root.innerHTML = `<p class="p-lead" style="margin-top:-4px">Offer relics at the Heartwood to earn its favour. Each time favour fills, choose one of three boons. They last the whole vigil.</p>
        <div class="boons-grid">${PERKS.map((p) => {
          const lock = p.memory && !this.memories().has(p.memory) ? MEMORIES.find((m) => m.id === p.memory) : null;
          return `<div class="boon-card${lock ? ' locked' : ''}"><div class="g">${p.glyph}</div><h4>${p.name}</h4><p>${p.desc}</p>${lock ? `<small>Memory: ${lock.name}</small>` : ''}</div>`;
        }).join('')}</div>`;
      return;
    }
    if (tab === 'expedition') {
      root.innerHTML = this.expeditionBody();
      for (const b of root.querySelectorAll('.page-entry')) {
        b.addEventListener('click', () => {
          this.audio.ui();
          const q = NOTES.find((n) => n.id === b.dataset.id);
          for (const o of root.querySelectorAll('.page-entry')) o.classList.toggle('sel', o === b);
          $('.page-read', root).innerHTML = `<h4>${q.title}</h4><p>${q.text}</p><div class="sign">· ${q.who} ·</div>`;
        });
      }
      return;
    }
    const pics = this.portraits();
    const icons = this.game.hud.icons || {};
    const seen = this.seen();
    const ids = tab === 'blight' ? BLIGHT.map((b) => b.id) : DEFENCES;
    const pic = (id) => (tab === 'blight' ? pics[id] : pics[BUILD_DEFS[id].model] || icons[id]) || '';
    const locked = (id) => tab === 'blight' && !seen.has(id);
    const name = (id) => (tab === 'blight' ? ENEMY_TYPES[id].name : ITEMS[id].name);
    root.innerHTML = `<div class="guide"><div class="g-list">${ids.map((id) => `<button class="g-entry${locked(id) ? ' locked' : ''}" data-id="${id}"><img src="${pic(id)}" alt="">${locked(id) ? 'Unknown' : name(id)}</button>`).join('')}</div><div class="g-detail"></div></div>`;
    const show = (id) => {
      this.guidePick[tab] = id;
      for (const e of root.querySelectorAll('.g-entry')) e.classList.toggle('sel', e.dataset.id === id);
      $('.g-detail', root).innerHTML = tab === 'blight' ? this.blightDetail(id, pic(id), locked(id)) : this.defenceDetail(id, pic(id));
    };
    for (const e of root.querySelectorAll('.g-entry')) {
      e.addEventListener('click', () => {
        this.audio.ui();
        show(e.dataset.id);
      });
    }
    show(this.guidePick[tab]);
  }

  // The Expedition: the pages found over every vigil, and the story's mechanics in brief
  expeditionBody() {
    const got = loadNotes();
    const icons = this.game.hud.icons || {};
    const ico = (id) => (icons[id] ? `<img src="${icons[id]}" alt="">` : '');
    const pages = NOTES.map((n) => got.has(n.id)
      ? `<button class="page-entry" data-id="${n.id}"><b>${n.who}</b>${n.title}</button>`
      : '<div class="page-entry locked"><b>?</b>A page not yet found</div>').join('');
    return `<p class="p-lead" style="margin-top:-4px">1931: the Vane Expedition came for the temple's golden idol. Their torn pages turn up in crates, packs and caches. Read them all and you'll know what happened here.</p>
      <div class="pages"><div class="page-list">${pages}</div><article class="page-read"><p class="dim">${got.size} of ${NOTES.length} pages found. Pick one to read it again.</p></article></div>
      <div class="exp-grid">
        <div class="exp-card"><div class="g">◈</div><h4>The seals</h4><p>${Object.values(SEALS).map((s) => s.name).join(', ')}: the temple's top altar, the drowned shrine, a standing stone in the ruins. Set a relic in one and the rift it held sleeps for two nights. The idol in the Sun Seal (or any gold mask) closes one for good.</p></div>
        <div class="exp-card"><div class="g">⚚</div><h4>Grafts</h4><p>Set the Thornback's heart into the Workbench and towers take grafts: one at tier 2, two at tier 3. Hold <kbd>G</kbd> on a tower. ${Object.entries(GRAFTS).map(([id, g]) => `<span class="chip">${ico(id)}${ITEMS[id].name}: ${g.say}</span>`).join(' ')}</p></div>
        <div class="exp-card"><div class="g">✺</div><h4>The Rot</h4><p>From the dawn after night 5 the ground round every rift starts to die, a little further each day. On it the Blight run faster and towers fire slower. Firepots and braziers burn it back; a Heartseed sapling pushes it out for good.</p></div>
        <div class="exp-card"><div class="g">✈</div><h4>Hollis's radio</h4><p>At the Tinker's Bench (hold <kbd>F</kbd>): ${RADIO_PARTS.map(([id, n]) => `${n > 1 ? `${n} × ` : ''}${ITEMS[id].name}`).join(', ')}. Each part calls a supply drop at noon, and the Husks come for it too. Mend it all and a plane comes after the tenth night.</p></div>
        <div class="exp-card"><div class="g">☾</div><h4>Signs</h4><p>Every other night from the fourth, the forest answers: ${Object.values(SIGNS).map((s) => `<b style="color:${s.color}">${s.glyph} ${s.name}</b> ${s.desc}`).join(' ')}</p></div>
      </div>`;
  }

  blightDetail(id, pic, locked) {
    const b = BLIGHT.find((x) => x.id === id), def = ENEMY_TYPES[id];
    const bar = (label, v, max, shown) => `<div class="stat foe"><span>${label}</span><div class="bar"><b style="width:${Math.max(6, Math.min(100, Math.sqrt(v / max) * 100))}%"></b></div><em>${shown}</em></div>`;
    if (locked) {
      return `<div class="g-portrait locked"><img src="${pic}" alt=""></div>
        <h3 class="g-name">Unknown</h3><div class="g-kind">Comes from night ${b.from}</div>
        <p class="g-lore">Something stirs in the rifts that you have not yet brought down. Fell one to learn its ways.</p>`;
    }
    return `<div class="g-portrait"><img src="${pic}" alt=""></div>
      <h3 class="g-name">${def.name}</h3><div class="g-kind">${b.kind} · from night ${b.from}${def.flying ? ' · flies' : ''}</div>
      <p class="g-lore">${b.lore}</p>
      <div class="g-stats">${bar('Health', def.hp, 1800, def.hp)}${bar('Bite', def.dmg, 40, def.dmg)}${bar('Speed', def.speed, 3.6, def.speed.toFixed(1))}${bar('Reach', def.reach, 3.7, `${def.reach} m`)}</div>
      ${this.resistLine(def)}
      <div class="g-tip"><b>Field note</b>${b.tip}</div>
      ${id === 'blightling' ? `<div class="g-tip elite"><b>Elites</b>From night 5 (night 2 on Blightborn, never on Verdant) some Blight come marked, with more health and one quirk: ${Object.values(AFFIXES).map((a) => `<span style="color:#${a.rim.toString(16).padStart(6, '0')}">${a.glyph} ${a.name}</span> ${a.desc}`).join(' · ')}.</div>` : ''}`;
  }

  // what hurts it and what it shrugs off (pierce: bows, spikes; blunt: mortar, sling; fire;
  // arc: the totem)
  resistLine(def) {
    const r = def.resist || {};
    const weak = Object.entries(r).filter(([, k]) => k > 1).map(([t, k]) => `${DAMAGE_TYPES[t]} +${Math.round((k - 1) * 100)}%`);
    const tough = Object.entries(r).filter(([, k]) => k < 1).map(([t, k]) => `${DAMAGE_TYPES[t]} −${Math.round((1 - k) * 100)}%`);
    if (!weak.length && !tough.length) return '';
    return `<div class="g-resist">${weak.length ? `<span class="w">Weak to ${weak.join(', ')}</span>` : ''}${tough.length ? `<span class="t">Shrugs off ${tough.join(', ')}</span>` : ''}</div>`;
  }

  defenceDetail(id, pic) {
    const d = BUILD_DEFS[id], it = ITEMS[id], rec = RECIPES.find((r) => r.out === id);
    const icons = this.game.hud.icons || {};
    const bar = (label, v, max, shown) => `<div class="stat"><span>${label}</span><div class="bar"><b style="width:${Math.max(6, Math.min(100, (v / max) * 100))}%"></b></div><em>${shown}</em></div>`;
    const stats = [];
    if (d.dmg) stats.push(bar('Damage', d.dmg + (d.burn || 0), 45, d.burn ? `${d.dmg}+${d.burn}` : d.dmg));
    if (d.range) stats.push(bar('Range', d.range, 30, `${d.range} m`));
    if (d.rate) stats.push(bar('Rate', 1 / d.rate, 1.8, `${(1 / d.rate).toFixed(1)}/s`));
    stats.push(bar('Toughness', d.hp, 320, d.hp));
    const dtype = { bow: 'Pierce', mortar: 'Blunt', tesla: 'Arc', fire: 'Fire', trap: 'Pierce', snare: 'Pierce', wall: 'Pierce' }[d.kind];
    const flags = [dtype && `${dtype} damage`, ROOTS[id] && `${ROOTS[id]} root${ROOTS[id] > 1 ? 's' : ''}`, d.expose && `Blight take +${Math.round((d.expose - 1) * 100)}% in its light`, d.expose && 'Unearths Burrowers', d.air && 'Hits flyers', d.splash && 'Splash', d.slow && 'Slows', d.chain && `Chains ×${d.chain}`, d.burn && 'Burns', d.root && 'Roots', d.blocks && d.kind === 'wall' && 'Blocks the path', d.thorns && 'Thorned'].filter(Boolean);
    return `<div class="g-portrait" style="--glow:rgba(214,169,74,0.2)"><img src="${pic}" alt=""></div>
      <h3 class="g-name">${it.name}</h3><div class="g-kind">${ROLES[id]}</div>
      <p class="g-lore">${it.desc}</p>
      ${flags.length ? `<div class="flags" style="grid-column:2">${flags.map((f) => `<span>${f}</span>`).join('')}</div>` : ''}
      <div class="g-stats">${stats.join('')}</div>
      ${rec ? `<div class="recipe-row">${Object.entries(rec.needs).map(([m, n]) => `<span class="chip">${icons[m] ? `<img src="${icons[m]}" alt="">` : ''}<b>${n}</b> ${ITEMS[m].name}</span>`).join('')}</div>` : ''}`;
  }

  pageRecords() {
    const r = loadRecords(), best = loadBest();
    const seen = this.seen();
    const pics = this.portraits();
    this.head('Records', 'Every vigil you have kept');
    const rec = (g, n, label, big = false) => `<div class="record${big ? ' big' : ''}"><div class="g">${g}</div><b>${n}</b><span>${label}</span></div>`;
    this.html(`<div class="records">
      ${rec('❦', best.nights, 'Most nights held', true)}
      ${rec('❀', r.wins, plural(r.wins, 'Heartwood bloomed', 'Heartwoods bloomed').replace(/^\d+ /, ''), true)}
      ${rec('☾', r.nights, 'Nights held')}
      ${rec('✶', r.kills, 'Blight felled')}
      ${rec('☠', r.bosses, 'Thornbacks slain')}
      ${rec('✺', r.blooms, 'Blooms burned')}
      ${rec('⚒', r.built, 'Built')}
      ${rec('⚔', best.kills, 'Most felled in a run')}
      ${rec('↻', r.runs, 'Vigils begun')}
      ${rec('★', (best.score || 0).toLocaleString(), 'Best score')}
      ${rec('☼', r.dailyBest, 'Best daily vigil (nights)')}
      ${rec('☣', `${BLIGHT.filter((b) => seen.has(b.id)).length}/${BLIGHT.length}`, 'Blight known')}
    </div>
    <div class="p-sep"></div>
    <div class="p-eyebrow">Bestiary</div>
    <div class="seen-row">${BLIGHT.map((b) => `<img class="${seen.has(b.id) ? '' : 'locked'}" src="${pics[b.id] || ''}" title="${seen.has(b.id) ? ENEMY_TYPES[b.id].name : 'Unknown'}" alt="">`).join('')}</div>
    <div class="p-sep"></div>
    <div class="p-eyebrow">Achievements · ${Object.keys(loadEarned()).length}/${ACHIEVEMENTS.length}</div>
    <div class="achievements">${(() => {
      const got = loadEarned();
      return ACHIEVEMENTS.map((a) => `<div class="ach${got[a.id] ? ' got' : ''}" title="${got[a.id] ? `Earned ${new Date(got[a.id]).toLocaleDateString()}` : 'Not yet'}"><div class="g">${a.glyph}</div><div><h4>${a.name}</h4><p>${a.desc}</p></div></div>`).join('');
    })()}</div>
    <div class="p-sep"></div>
    <div class="p-eyebrow">Memories of the Heartwood</div>
    <p class="p-lead" style="margin:6px 0 14px;font-size:18px">What you've lived through stays with you: each memory adds something to every vigil after it.</p>
    <div class="memories">${MEMORIES.map((m) => {
      const got = this.memories().has(m.id);
      return `<div class="memory${got ? ' got' : ''}"><div class="g">${m.glyph}</div><div><h4>${m.name}</h4><p>${got ? m.reward : `<b>${m.need}</b> · ${m.reward}`}</p></div><span class="state">${got ? 'Earned' : 'Locked'}</span></div>`;
    }).join('')}</div>`);
  }

  pageSettings() {
    this.head('Settings', 'Tune the forest');
    const g = this.game;
    const q = readSetting('quality'), fps = readSetting('fps');
    this.html(`
      <div class="set-group"><h4>Display</h4>
        <div class="set-row"><label>Quality<small>Shadows, distance, textures</small></label>
          <div class="seg" id="s-quality">${['low', 'medium', 'high'].map((v) => `<button data-v="${v}" class="${v === q ? 'sel' : ''}">${v}</button>`).join('')}</div></div>
        <div class="set-row"><label>Steady frame rate<small>Draws a little softer when frames run slow</small></label><button class="toggle${readSetting('autores') === '1' ? ' on' : ''}" id="s-autores" aria-label="Steady frame rate"></button></div>
        <div class="set-row"><label>Frame limit<small>Fewer frames run the graphics card cooler</small></label>
          <div class="seg" id="s-fps">${[['30', '30'], ['60', '60'], ['120', '120'], ['0', 'Off']].map(([v, l]) => `<button data-v="${v}" class="${v === fps ? 'sel' : ''}">${l}</button>`).join('')}</div></div>
        <div class="set-row"><label>Show FPS<small>Frames a second and frame time, top left</small></label><button class="toggle${readSetting('showFps') === '1' ? ' on' : ''}" id="s-showfps" aria-label="Show FPS"></button></div>
        <div class="set-row"><label>Glow<small>Bloom on fire, spores and the Heartwood</small></label><button class="toggle${readSetting('bloom') === '1' ? ' on' : ''}" id="s-bloom" aria-label="Glow"></button></div>
      </div>
      <div class="set-group"><h4>Controls</h4>
        <div class="set-row"><label>Mouse sensitivity</label><div class="slider"><input type="range" class="fancy" id="s-sens" min="0.2" max="3" step="0.05" value="${readSetting('sensitivity')}"><output></output></div></div>
        <div class="set-row"><label>Invert look</label><button class="toggle${readSetting('invertY') === '1' ? ' on' : ''}" id="s-invert" aria-label="Invert look"></button></div>
      </div>
      <div class="set-group"><h4>Accessibility</h4>
        <div class="set-row"><label>Captions<small>Sounds that matter, written out: the horn, a roar, the Heartwood bitten</small></label><button class="toggle${readSetting('captions') === '1' ? ' on' : ''}" id="s-captions" aria-label="Captions"></button></div>
        <div class="set-row"><label>Screen shake<small>Hits, slams and the machete biting</small></label><button class="toggle${readSetting('shake') === '1' ? ' on' : ''}" id="s-shake" aria-label="Screen shake"></button></div>
        <div class="set-row"><label>Head bob<small>The sway of walking and running</small></label><button class="toggle${readSetting('bob') === '1' ? ' on' : ''}" id="s-bob" aria-label="Head bob"></button></div>
        <div class="set-row"><label>Colour-blind Blight<small>Amber and blue outlines, and a blue/orange placement ghost</small></label><button class="toggle${readSetting('cb') === '1' ? ' on' : ''}" id="s-cb" aria-label="Colour-blind Blight"></button></div>
      </div>
      <div class="set-group"><h4>Sound</h4>
        <div class="set-row"><label>Volume</label><div class="slider"><input type="range" class="fancy" id="s-vol" min="0" max="1" step="0.01" value="${readSetting('volume')}"><output></output></div></div>
        <div class="set-row"><label>Title music</label><button class="toggle${readSetting('music') === '1' ? ' on' : ''}" id="s-music" aria-label="Title music"></button></div>
      </div>`);
    const segment = (sel, name, apply) => {
      const seg = $(sel, this.body);
      for (const b of seg.querySelectorAll('button')) {
        b.addEventListener('click', () => {
          this.audio.ui();
          for (const o of seg.querySelectorAll('button')) o.classList.toggle('sel', o === b);
          writeSetting(name, b.dataset.v);
          apply(b.dataset.v);
        });
      }
    };
    segment('#s-quality', 'quality', (v) => g.setQuality(v));
    segment('#s-fps', 'fps', (v) => { g.fpsCap = Number(v); });
    const toggle = (sel, name, apply) => {
      const t = $(sel, this.body);
      t.addEventListener('click', () => {
        const on = !t.classList.contains('on');
        t.classList.toggle('on', on);
        writeSetting(name, on ? '1' : '0');
        this.audio.ui();
        apply(on);
      });
    };
    toggle('#s-bloom', 'bloom', (on) => { g.bloom = on; });
    toggle('#s-autores', 'autores', (on) => { g.autoRes = on; g.applyRes(); });
    toggle('#s-showfps', 'showFps', (on) => g.hud.showFps(on || g.debug));
    toggle('#s-invert', 'invertY', (on) => { if (g.player) g.player.invertY = on; });
    toggle('#s-music', 'music', (on) => this.audio.music(on && this.mode === 'title'));
    toggle('#s-captions', 'captions', (on) => { g.captions = on; });
    toggle('#s-shake', 'shake', (on) => { if (g.player) g.player.shakeK = on ? 1 : 0; });
    toggle('#s-bob', 'bob', (on) => { if (g.player) g.player.motion = on ? 1 : 0; });
    toggle('#s-cb', 'cb', (on) => { PALETTE.cb = BLIGHT_PALETTE.cb = on; g.enemies?.repaint(); });
    const slider = (sel, name, fmt, apply) => {
      const s = $(sel, this.body), out = s.nextElementSibling;
      const sync = () => {
        const v = Number(s.value);
        out.textContent = fmt(v);
        s.style.setProperty('--p', `${((v - s.min) / (s.max - s.min)) * 100}%`);
        return v;
      };
      sync();
      s.addEventListener('input', () => {
        const v = sync();
        writeSetting(name, v);
        apply(v);
      });
    };
    slider('#s-sens', 'sensitivity', (v) => v.toFixed(2), (v) => { if (g.player) g.player.sensitivity = v; });
    slider('#s-vol', 'volume', (v) => `${Math.round(v * 100)}%`, (v) => this.audio.setVolume(v));
  }

  // settings that live outside the page, applied at boot
  applySettings() {
    const g = this.game;
    g.bloom = readSetting('bloom') === '1';
    g.autoRes = readSetting('autores') === '1';
    // (?debug runs keep every frame: the e2e timings measure frames flat out)
    g.fpsCap = g.debug ? 0 : Number(readSetting('fps'));
    g.hud.showFps(g.debug || readSetting('showFps') === '1');
    this.audio.volume = Number(readSetting('volume'));
    g.captions = readSetting('captions') === '1';
    PALETTE.cb = BLIGHT_PALETTE.cb = readSetting('cb') === '1';
  }

  applyLoaded() {
    const g = this.game;
    g.setQuality(readSetting('quality'));
    g.player.invertY = readSetting('invertY') === '1';
    g.player.sensitivity = Number(readSetting('sensitivity'));
    g.input.padLook = Number(readSetting('sensitivity'));
    g.player.shakeK = readSetting('shake') === '1' ? 1 : 0;
    g.player.motion = readSetting('bob') === '1' ? 1 : 0;
  }

  pageControls() {
    this.body.innerHTML = '';
    this.head('Controls', 'In the hand and underfoot');
    const inp = this.game.input;
    this.html(`<div class="p-eyebrow">Keys <small>click one, then press the key you want · <button class="linkish" id="keys-reset">reset all</button></small></div>
      <div class="rebind">${BINDABLE.map(([code, what]) => `<div class="key-row"><span>${what}</span><button class="bind${inp.bound(code) !== code ? ' moved' : ''}" data-code="${code}"><kbd>${keyName(inp.bound(code))}</kbd></button></div>`).join('')}</div>
      <div class="p-sep"></div>
      <div class="keys-grid">${CONTROLS.map(([group, rows]) => `<h4>${group}</h4>${rows.map(([what, keys]) => `<div class="key-row"><span>${what}</span><span>${this.game.hud.keys(keys)}</span></div>`).join('')}`).join('')}
      <h4>Gamepad <small>(partial: the satchel and crafting need a mouse)</small></h4>
      <div class="key-row"><span>Move · look</span><span>Left stick · right stick</span></div>
      <div class="key-row"><span>Swing · use</span><span>RT · LT</span></div>
      <div class="key-row"><span>Jump · gather · pack up · satchel</span><span>A · X · B · Y</span></div>
      <div class="key-row"><span>Belt · sprint · rotate · graft · hurry</span><span>LB/RB · L3 · R3 · d-pad up · down</span></div>
      <div class="key-row"><span>Pause</span><span>Start</span></div></div>`);
    for (const b of this.body.querySelectorAll('button.bind')) {
      b.addEventListener('click', () => {
        this.audio.ui();
        for (const o of this.body.querySelectorAll('button.bind')) o.classList.remove('wait');
        b.classList.add('wait');
        b.querySelector('kbd').textContent = '…';
        const take = (e) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          removeEventListener('keydown', take, true);
          if (e.code !== 'Escape') inp.rebind(b.dataset.code, e.code);
          this.pageControls();
        };
        addEventListener('keydown', take, true);
      });
    }
    $('#keys-reset', this.body)?.addEventListener('click', () => {
      inp.resetBinds();
      this.audio.ui();
      this.pageControls();
    });
  }

  pageCredits() {
    this.html(`<div class="credits">
      <svg class="sigil"><use href="#sigil" /></svg>
      <div class="logo">Overgrowth</div>
      <div class="rule" style="max-width:340px;margin:12px auto 0"><i></i><span>v${version}</span><i></i></div>
      <dl>
        <div><dt>A game by</dt><dd>ycgNem</dd></div>
        <div><dt>Engine</dt><dd>three.js</dd></div>
        <div><dt>Models</dt><dd>Blender, built from script</dd></div>
        <div><dt>Surfaces</dt><dd>Generated and hand-graded</dd></div>
        <div><dt>Sound &amp; music</dt><dd>Synthesised live in Web Audio</dd></div>
        <div><dt>Type</dt><dd>Cinzel · Cormorant · Barlow</dd></div>
      </dl>
      <p class="thanks">Thank you for keeping the vigil.</p>
    </div>`);
  }

  pageQuit() {
    const night = this.game.waves.phase === 'night';
    this.head('Leave the forest', 'Return to the title?', night
      ? 'The night isn\'t saved. Next time you will wake at this morning\'s dawn.'
      : 'Your vigil is saved as it stands. The Heartwood will wait for you.');
    this.html(`<div class="p-actions"><button class="btn danger" id="go-quit">Quit to title</button><button class="btn" id="go-stay">Stay</button></div>`);
    $('#go-quit', this.body).addEventListener('click', () => this.cb.onQuit());
    $('#go-stay', this.body).addEventListener('click', () => {
      this.audio.ui();
      this.close();
    });
    this.pageAction = () => this.cb.onQuit();
  }

  // ---------------------------------------------------------------- dressing

  spores() {
    const root = $('#spores');
    for (let i = 0; i < 28; i++) {
      const s = document.createElement('i');
      const r = Math.random();
      s.style.cssText = `left:${Math.random() * 100}%;--s:${2 + r * 5}px;--d:${16 + Math.random() * 18}s;--delay:${-Math.random() * 30}s;--dx:${(Math.random() - 0.5) * 120}px;--o:${0.25 + r * 0.6}`;
      root.append(s);
    }
  }

  syncMute() {
    $('#mute').classList.toggle('off', !this.audio.enabled);
  }

  // leaving for the game: the menu dissolves while the camera flies down
  leave() {
    this.mode = 'flying';
    this.close();
    this.audio.music(false);
    this.el.classList.add('leaving');
  }

  hide() {
    this.el.classList.add('hidden');
    this.el.classList.remove('leaving', 'panel-open');
    this.mode = 'play';
  }
}
