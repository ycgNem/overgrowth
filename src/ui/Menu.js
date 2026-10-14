// The title screen and the pause menu.
//
// Boot: the sigil and a loading bar, then "Press any key" (the key press is also what lets the
// audio start). Title: a menu column on the left over the live cinematic, and pages that slide
// in on the right (the vigil you can continue, a new run on a chosen difficulty, the Field
// Guide, lifetime records, settings, controls, credits). Pause: the same frame over the frozen
// game, with Resume and a way back to the title.
import { version } from '../../package.json';
import { ENEMY_TYPES } from '../defense/Enemies.js';
import { BUILD_DEFS } from '../defense/Towers.js';
import { describeWave } from '../defense/Waves.js';
import { ITEMS } from '../items/ItemDB.js';
import { RECIPES } from '../items/Recipes.js';
import { PERKS } from '../core/Perks.js';
import { DIFFICULTIES, DIFFICULTY_IDS, difficulty } from '../core/Difficulty.js';
import { loadBest, loadRecords } from '../core/Save.js';
import { renderPortraits } from './Portraits.js';

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
    id: 'wisp', kind: 'Flyer', from: 4,
    lore: 'Drifting lights of spore and spite. They float over walls and traps alike, straight for the Heartwood, and keen as they come.',
    tip: 'Bow towers, Tesla totems and embers reach them. Mortars, walls and traps do nothing.',
  },
  {
    id: 'thornback', kind: 'Heart-eater', from: 5,
    lore: 'Something old and armoured that the Blight woke under the forest. It rises every fifth night, shakes the ground with its slams and calls Blightlings out of the soil.',
    tip: 'Its slams flatten buildings near it. Snares only slow it. Burn it, shoot it, and keep it moving.',
  },
];
const DEFENCES = ['bow_tower', 'spore_mortar', 'tesla_totem', 'ember_brazier', 'barricade', 'vine_snare', 'spike_trap'];
const ROLES = {
  bow_tower: 'Long range · single target', spore_mortar: 'Artillery · splash & slow', tesla_totem: 'Chain lightning',
  ember_brazier: 'Close range · burning', barricade: 'Wall · reroutes the Blight', vine_snare: 'Trap · roots in place', spike_trap: 'Trap · hidden spikes',
};

const CONTROLS = [
  ['Movement', [['Move', '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>'], ['Sprint', '<kbd>Shift</kbd>'], ['Jump', '<kbd>Space</kbd>'], ['Look', 'Mouse']]],
  ['Fighting', [['Swing the machete', '<kbd>LMB</kbd>'], ['Draw and loose the sling', 'Hold <kbd>LMB</kbd>'], ['Use or throw what you hold', '<kbd>RMB</kbd>'], ['Choose from the belt', '<kbd>1</kbd>–<kbd>8</kbd> · wheel']]],
  ['Building', [['Place a defence', '<kbd>LMB</kbd>'], ['Rotate', '<kbd>R</kbd>'], ['Pack it up again', '<kbd>F</kbd>'], ['Upgrade or repair', 'Hold <kbd>E</kbd>']]],
  ['The forest', [['Gather, search, offer', '<kbd>E</kbd>'], ['Rake up forage', 'Hold <kbd>E</kbd>'], ['Satchel and crafting', '<kbd>Tab</kbd>'], ['Hurry the day along', 'Hold <kbd>T</kbd>'], ['Sound on / off', '<kbd>M</kbd>'], ['Pause', '<kbd>Esc</kbd>']]],
];

// ------------------------------------------------------------------ settings, remembered

const SETTINGS = {
  quality: { key: 'og.quality', def: 'high' },
  bloom: { key: 'og.bloom', def: '1' },
  sensitivity: { key: 'og.sensitivity', def: '1' },
  invertY: { key: 'og.invertY', def: '0' },
  volume: { key: 'og.volume', def: '1' },
  music: { key: 'og.music', def: '1' },
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
    this.diff = save?.difficulty || 'warden';
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
    $('#brand-sub').textContent = 'Hold the Heartwood';
    $('.pause-info')?.remove();
    const s = this.save;
    const items = [];
    if (s) {
      items.push({ id: 'continue', label: 'Continue', sub: `Day ${s.night} · ${difficulty(s.difficulty).name} · ${ago(s.at)}`, primary: true, act: () => this.cb.onContinue(), preview: 'continue' });
    }
    items.push({ id: 'new', label: 'New Game', primary: !s, act: () => this.open('new') });
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
      { id: 'guide', label: 'Field Guide', gap: true, act: () => this.open('guide') },
      { id: 'settings', label: 'Settings', act: () => this.open('settings') },
      { id: 'controls', label: 'Controls', act: () => this.open('controls') },
      { id: 'quit', label: 'Quit to Title', gap: true, act: () => this.open('quit') },
    ]);
    this.close(true);
    this.select(0, { quiet: true });
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
        ${id === 'warden' ? '<span class="tag">Intended</span>' : ''}
        <div class="g">${d.glyph}</div><h3>${d.name}</h3><p>${d.blurb}</p>
        <ul><li>Blight health <b>${pct(d.hp)}</b></li><li>Blight numbers <b>${pct(d.count)}</b></li><li>Heartwood <b>${Math.round(500 * d.heart)} HP</b></li></ul>
      </button>`;
    }).join('');
    this.html(`<div class="diffs">${cards}</div>`);
    this.html(`<div class="p-actions"><button class="btn gold" id="go-new">Begin</button>${this.save ? `<span class="p-note">This replaces your vigil on Day ${this.save.night}.</span>` : '<span class="p-note calm">You can change nothing once the first night falls. Choose well.</span>'}</div>`);
    for (const c of this.body.querySelectorAll('.diff-card')) {
      c.addEventListener('click', () => this.pickDiff(c.dataset.id));
      c.addEventListener('mouseenter', () => this.audio.hover());
    }
    this.pickDiff(this.diff, true);
    const go = () => this.cb.onNew(this.diff);
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

  // a Blight is known once you've felled one or held through the night it first comes
  seen() {
    const seen = new Set(loadRecords().seen), best = loadBest();
    for (const b of BLIGHT) if (b.id === 'blightling' || best.nights >= b.from) seen.add(b.id);
    return seen;
  }

  pageGuide() {
    this.head('Field Guide', 'What waits in the forest');
    this.html(`<div class="tabs">${[['blight', 'The Blight'], ['defences', 'Defences'], ['boons', 'Boons']].map(([id, label]) => `<button class="tab${this.guideTab === id ? ' sel' : ''}" data-tab="${id}">${label}</button>`).join('')}</div><div id="guide-body"></div>`);
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
        <div class="boons-grid">${PERKS.map((p) => `<div class="boon-card"><div class="g">${p.glyph}</div><h4>${p.name}</h4><p>${p.desc}</p></div>`).join('')}</div>`;
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
      <div class="g-tip"><b>Field note</b>${b.tip}</div>`;
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
    const flags = [d.air && 'Hits flyers', d.splash && 'Splash', d.slow && 'Slows', d.chain && `Chains ×${d.chain}`, d.burn && 'Burns', d.root && 'Roots', d.blocks && d.kind === 'wall' && 'Blocks the path', d.thorns && 'Thorned'].filter(Boolean);
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
      ${rec('☣', `${BLIGHT.filter((b) => seen.has(b.id)).length}/${BLIGHT.length}`, 'Blight known')}
    </div>
    <div class="p-sep"></div>
    <div class="p-eyebrow">Bestiary</div>
    <div class="seen-row">${BLIGHT.map((b) => `<img class="${seen.has(b.id) ? '' : 'locked'}" src="${pics[b.id] || ''}" title="${seen.has(b.id) ? ENEMY_TYPES[b.id].name : 'Unknown'}" alt="">`).join('')}</div>`);
  }

  pageSettings() {
    this.head('Settings', 'Tune the forest');
    const g = this.game;
    const q = readSetting('quality');
    this.html(`
      <div class="set-group"><h4>Display</h4>
        <div class="set-row"><label>Quality<small>Shadows, grass density and effects</small></label>
          <div class="seg" id="s-quality">${['low', 'medium', 'high'].map((v) => `<button data-v="${v}" class="${v === q ? 'sel' : ''}">${v}</button>`).join('')}</div></div>
        <div class="set-row"><label>Glow<small>Bloom on fire, spores and the Heartwood</small></label><button class="toggle${readSetting('bloom') === '1' ? ' on' : ''}" id="s-bloom" aria-label="Glow"></button></div>
      </div>
      <div class="set-group"><h4>Controls</h4>
        <div class="set-row"><label>Mouse sensitivity</label><div class="slider"><input type="range" class="fancy" id="s-sens" min="0.2" max="3" step="0.05" value="${readSetting('sensitivity')}"><output></output></div></div>
        <div class="set-row"><label>Invert look</label><button class="toggle${readSetting('invertY') === '1' ? ' on' : ''}" id="s-invert" aria-label="Invert look"></button></div>
      </div>
      <div class="set-group"><h4>Sound</h4>
        <div class="set-row"><label>Volume</label><div class="slider"><input type="range" class="fancy" id="s-vol" min="0" max="1" step="0.01" value="${readSetting('volume')}"><output></output></div></div>
        <div class="set-row"><label>Title music</label><button class="toggle${readSetting('music') === '1' ? ' on' : ''}" id="s-music" aria-label="Title music"></button></div>
      </div>`);
    const seg = $('#s-quality', this.body);
    for (const b of seg.querySelectorAll('button')) {
      b.addEventListener('click', () => {
        this.audio.ui();
        for (const o of seg.querySelectorAll('button')) o.classList.toggle('sel', o === b);
        writeSetting('quality', b.dataset.v);
        g.setQuality(b.dataset.v);
      });
    }
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
    toggle('#s-invert', 'invertY', (on) => { if (g.player) g.player.invertY = on; });
    toggle('#s-music', 'music', (on) => this.audio.music(on && this.mode === 'title'));
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
    this.audio.volume = Number(readSetting('volume'));
  }

  applyLoaded() {
    const g = this.game;
    g.setQuality(readSetting('quality'));
    g.player.invertY = readSetting('invertY') === '1';
    g.player.sensitivity = Number(readSetting('sensitivity'));
  }

  pageControls() {
    this.head('Controls', 'In the hand and underfoot');
    this.html(`<div class="keys-grid">${CONTROLS.map(([group, rows]) => `<h4>${group}</h4>${rows.map(([what, keys]) => `<div class="key-row"><span>${what}</span><span>${keys}</span></div>`).join('')}`).join('')}</div>`);
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
