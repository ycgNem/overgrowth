// DOM heads-up display: compass, minimap, prompts, toasts, vitals, hotbar, the day/night
// strip, combat feedback (damage numbers, health bars, hit markers, the boss bar), the
// journal, and the overlays (satchel + crafting, boons, victory, game over).
import * as THREE from 'three';
import { ITEMS, RARITY, KIND, whereToFind, weightOf, PACKS } from '../items/ItemDB.ts';
import { RECIPES, BENCHES, BENCH_IDS, AT_NAMES } from '../items/Recipes.js';
import { HOTBAR, LADEN, HARD_CAP, transfer } from '../items/Inventory.ts';
import { POI_INFO, poisAround } from '../world/poi/POI.js';
import { terrainHeight, jungleDensity, CHUNK_SIZE } from '../world/WorldGen.js';
import { angleDelta } from '../utils/math.js';
import { describeWave } from '../defense/Waves.js';
import { AFFIXES, affixRim } from '../defense/Enemies.js';
import { ROOTS, BUILD_DEFS } from '../defense/Towers.ts';

// the kind of damage a defence does, on its craft card (the Blight resist some, fear others)
const DTYPE = { bow: 'Pierce', mortar: 'Blunt', tesla: 'Arc', fire: 'Fire', trap: 'Pierce', snare: 'Pierce' };

const $ = (s) => document.querySelector(s);
const DEG = Math.PI / 180;
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const _p = new THREE.Vector3();

const MOUSE_SVG = '<svg class="mouse" viewBox="0 0 16 22"><rect x="1.5" y="1.5" width="13" height="19" rx="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 1.5v7.5H1.5V8A6.5 6.5 0 0 1 8 1.5z" fill="currentColor"/></svg>';

export class HUD {
  constructor(inventory) {
    this.inv = inventory;
    this.icons = {};
    this.el = {
      hud: $('#hud'), strip: $('#compass-strip'), compass: $('#compass'), map: $('#minimap'),
      clock: $('#clock'), prompt: $('#prompt'), promptLabel: $('#prompt .label'), promptSub: $('#prompt .sub'), promptFill: $('#prompt .fill'),
      promptKey: $('#prompt .key'),
      cross: $('#crosshair'), toasts: $('#toasts'),
      stamina: $('#stamina'), staminaBar: $('#stamina div'), health: $('#health'), healthBar: $('#health div'), healthText: $('#health span'),
      discover: $('#discover'), fps: $('#fps'),
      inv: $('#inventory'), grid: $('#inv-grid'), belt: $('#inv-belt'), safe: $('#inv-safe'), detail: $('#inv-detail'), recipes: $('#inv-recipes'),
      slots: $('#inv-slots'), relics: $('#inv-relics'), packName: $('#inv-pack'), weight: $('#inv-weight'),
      tabs: $('#inv-tabs'), other: $('#inv-other'), otherGrid: $('#other-grid'), craft: $('#inv-craft'), benchRow: $('#bench-row'),
      notes: $('#inv-notes'),
      underwater: $('#underwater'), hint: $('#hint'), hotbar: $('#hotbar'), held: $('#held'), ammo: $('#ammo'),
      phase: $('#phase'), phaseTitle: $('#phase .title'), phaseSub: $('#phase .sub'),
      heartBar: $('#heart-bar .fill'), heartLag: $('#heart-bar .lag'), heartText: $('#heart-bar span'),
      banner: $('#banner'), buildHint: $('#build-hint'), hurt: $('#hurt'), dead: $('#dead'), deadT: $('#dead span'),
      over: $('#gameover'), overStats: $('#gameover .stats'),
      victory: $('#victory'), victoryStats: $('#victory .stats'),
      floaters: $('#floaters'), hitmark: $('#hitmark'), charge: $('#charge'), chargeArc: $('#charge circle'),
      boss: $('#boss'), bossName: $('#boss .name'), bossFill: $('#boss .fill'), bossLag: $('#boss .lag'),
      journal: $('#journal'), perks: $('#perks'), perkCards: $('#perks .cards'), boons: $('#boons'), flash: $('#flashfx'),
    };
    this.mapCtx = this.el.map.getContext('2d');
    this.mapBase = document.createElement('canvas');
    this.mapBase.width = this.mapBase.height = 120;
    this.mapCenter = { x: NaN, z: NaN };
    this.mapRange = 260; // metres across the minimap
    this.buildCompass();
    this.poiEls = new Map();
    this.discovered = new Set();
    this.markers = []; // { key, x, z, icon, label, cls }
    this.keyLabel = null; // (code) => the key it's bound to, for prompts (Game sets it)
    this.fpsAcc = { t: 0, n: 0 };
    this.hurtT = 0;
    this.carry = null; // { inv, i }: the stack picked up in the satchel (or the other pane)
    this.otherPane = null; // { title, sub, inv, hidden, kind, actions } while a container or the Coffer is open
    this.tab = 'craft';
    this.notes = []; // the pages read this run (core/Story.js NOTES), newest last
    this.noteSel = null;
    // what crafting can see: () => { atCamp, benches: {id: level}, src } (Game sets it)
    this.craftCtx = () => ({ atCamp: false, benches: {}, src: this.inv });
    this.onCraft = null;
    this.onSalvage = null;
    this.onFull = null;
    this.onCloseOther = null;
    this.onUse = null;
    this.onDrop = null;
    this.floats = []; // damage numbers
    this.bars = []; // health bar elements (pooled)
    this.journalKey = '';
    this.buildHotbar();
    this.buildSatchel();
    // (the satchel chip by the belt stays; this line of keys goes once you're under way)
    setTimeout(() => this.el.hint.classList.add('hidden'), 90000);
  }

  setIcons(icons) {
    this.icons = icons;
    this.renderHotbar();
  }

  show(on) {
    this.el.hud.classList.toggle('hidden', !on);
  }

  // ---------------------------------------------------------------- compass

  buildCompass() {
    const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    this.marks = [];
    for (let d = 0; d < 360; d += 15) {
      const e = document.createElement('div');
      if (names[d]) {
        e.className = `c ${names[d]}`;
        e.textContent = names[d];
        if (names[d].length === 2) e.style.fontSize = '12px';
      } else {
        e.className = d % 45 === 0 ? 't big' : 't';
      }
      this.el.strip.appendChild(e);
      this.marks.push({ e, a: d * DEG });
    }
  }

  // heading: radians clockwise from north (-z)
  updateCompass(heading, player, done) {
    // the strip's width is read now and then, not every frame (a read after last frame's
    // writes forces a layout), and styles are only written when they change
    if (!this.compassW || --this.compassWT <= 0) {
      this.compassW = this.el.compass.clientWidth;
      this.compassWT = 60;
    }
    const w = this.compassW;
    const span = 100 * DEG;
    const place = (e, a) => {
      const d = angleDelta(heading, a);
      const x = Math.abs(d) > span ? null : Math.round((w / 2 + (d / span) * (w / 2)) * 2) / 2;
      if (e._x !== x) {
        if (x === null) e.style.display = 'none';
        else {
          if (e._x === null || e._x === undefined) e.style.display = '';
          e.style.left = `${x}px`;
        }
        e._x = x;
      }
      return d;
    };
    for (const m of this.marks) place(m.e, m.a);

    const cx = Math.floor(player.x / CHUNK_SIZE), cz = Math.floor(player.z / CHUNK_SIZE);
    const ck = `${cx},${cz}`;
    if (this.poiListKey !== ck) {
      this.poiListKey = ck;
      this.poiList = poisAround(cx, cz, 9);
    }
    const seen = new Set();
    let focus = null, focusD = 8 * DEG; // only the marker nearest the centre gets a label
    const show = (key, x, z, icon, label, cls = '') => {
      const dx = x - player.x, dz = z - player.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 6) return null;
      seen.add(key);
      let e = this.poiEls.get(key);
      if (!e) {
        e = document.createElement('div');
        this.el.strip.appendChild(e);
        this.poiEls.set(key, e);
      }
      if (e._cls !== cls) {
        e.className = `poi ${cls}`;
        e._cls = cls;
      }
      const html = `${icon}<small>${label} ${Math.round(dist)}m</small>`;
      if (e.dataset.html !== html) {
        e.innerHTML = html;
        e.dataset.html = html;
      }
      const d = place(e, Math.atan2(dx, -dz));
      if (Math.abs(d) < focusD) {
        focusD = Math.abs(d);
        focus = e;
      }
      return e;
    };
    for (const m of this.markers) show(m.key, m.x, m.z, m.icon, m.label, m.cls + (m.alert ? ' alert' : ''));
    for (const s of this.poiList) {
      const isTemple = s.type === 'temple';
      if (!isTemple && Math.hypot(s.x - player.x, s.z - player.z) > 220) continue;
      const known = this.discovered.has(s.key);
      const e = show(s.key, s.x, s.z, POI_INFO[s.type].icon, known || isTemple ? POI_INFO[s.type].label : '?');
      e?.classList.toggle('done', done.has(s.key));
    }
    for (const [k, e] of this.poiEls) {
      if (!seen.has(k)) {
        e.remove();
        this.poiEls.delete(k);
      } else e.classList.toggle('side', e !== focus);
    }
  }

  // ---------------------------------------------------------------- minimap

  // The map image is rebuilt a few rows per frame so it never hitches.
  mapJob(cx, cz) {
    const N = this.mapBase.width;
    return { cx, cz, row: 0, N, img: new ImageData(N, N), prev: new Float32Array(N + 1) };
  }

  stepMapJob(rows) {
    const job = this.job;
    const { N, img } = job;
    const R = this.mapRange;
    const end = Math.min(N, job.row + rows);
    const line = new Float32Array(N + 1);
    for (let j = job.row; j < end; j++) {
      const wz = job.cz + (j / N - 0.5) * R;
      for (let i = 0; i <= N; i++) line[i] = terrainHeight(job.cx + (i / N - 0.5) * R, wz);
      for (let i = 0; i < N; i++) {
        const wx = job.cx + (i / N - 0.5) * R;
        const h = line[i];
        let r, g, b;
        if (h < 0) {
          const d = Math.min(1, -h / 3);
          r = 40 - d * 20; g = 90 - d * 30; b = 100 + d * 10;
        } else if (h > 22) {
          const t = Math.min(1, (h - 22) / 20);
          r = 90 + t * 60; g = 96 + t * 50; b = 74 + t * 50;
        } else if (h < 0.9) {
          r = 120; g = 108; b = 70;
        } else {
          const dens = jungleDensity(wx, wz);
          const l = 0.75 + h / 40;
          r = (52 - dens * 22) * l; g = (92 - dens * 28) * l; b = (36 - dens * 12) * l;
        }
        const slope = (line[i + 1] - h) + (j > 0 ? h - job.prev[i] : 0);
        const shade = Math.max(0.6, Math.min(1.4, 1 - slope * 0.12));
        const o = (j * N + i) * 4;
        img.data[o] = r * shade; img.data[o + 1] = g * shade; img.data[o + 2] = b * shade; img.data[o + 3] = 255;
      }
      job.prev.set(line);
    }
    job.row = end;
    if (end >= N) {
      this.mapBase.getContext('2d').putImageData(img, 0, 0);
      this.mapCenter = { x: job.cx, z: job.cz };
      this.job = null;
    }
  }

  updateMinimap(player, heading, force, extra = {}) {
    const R = this.mapRange;
    const snap = 24;
    const sx = Math.round(player.x / snap) * snap, sz = Math.round(player.z / snap) * snap;
    if (!this.job && (sx !== this.mapCenter.x || sz !== this.mapCenter.z)) this.job = this.mapJob(sx, sz);
    if (this.job) this.stepMapJob(force ? this.job.N : 10);
    const c = this.mapCtx, S = this.el.map.width;
    c.save();
    c.clearRect(0, 0, S, S);
    c.beginPath();
    c.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    c.clip();
    const k = S / R;
    c.imageSmoothingEnabled = true;
    c.drawImage(this.mapBase, (this.mapCenter.x - player.x) * k, (this.mapCenter.z - player.z) * k, S, S);
    const toMap = (x, z) => [S / 2 + (x - player.x) * k, S / 2 + (z - player.z) * k];
    const inside = (px, pz, pad = 12) => (px - S / 2) ** 2 + (pz - S / 2) ** 2 <= (S / 2 - pad) ** 2;
    // build radius ring
    if (extra.base) {
      const [bx, bz] = toMap(extra.base.x, extra.base.z);
      c.strokeStyle = 'rgba(140,255,180,0.35)';
      c.lineWidth = 3;
      c.setLineDash([10, 8]);
      c.beginPath();
      c.arc(bx, bz, extra.buildRadius * k, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
    }
    // buildings and enemies
    for (const b of extra.buildings || []) {
      const [px, pz] = toMap(b.x, b.z);
      if (!inside(px, pz, 4)) continue;
      c.fillStyle = b.def.kind === 'wall' ? '#c8a060' : b.def.range ? '#f0d070' : '#a08860';
      c.fillRect(px - 5, pz - 5, 10, 10);
    }
    for (const e of extra.enemies || []) {
      if (e.dying) continue;
      const [px, pz] = toMap(e.pos.x, e.pos.z);
      if (!inside(px, pz, 4)) continue;
      c.fillStyle = e.def.boss ? '#ff5ab0' : e.def.flying ? '#f0a0ff' : '#d070ff';
      c.beginPath();
      c.arc(px, pz, e.def.boss ? 12 : e.type === 'rotboar' ? 8 : 5, 0, Math.PI * 2);
      c.fill();
    }
    // POIs and markers
    const cx = Math.floor(player.x / CHUNK_SIZE), cz = Math.floor(player.z / CHUNK_SIZE);
    c.font = 'bold 26px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.shadowColor = 'rgba(0,0,0,0.9)';
    c.shadowBlur = 6;
    for (const s of poisAround(cx, cz, 3)) {
      const [px, pz] = toMap(s.x, s.z);
      if (!inside(px, pz)) continue;
      const known = this.discovered.has(s.key);
      c.fillStyle = known ? '#f3d27a' : 'rgba(243,234,210,0.75)';
      c.fillText(known ? POI_INFO[s.type].icon : '?', px, pz);
    }
    for (const m of this.markers) {
      let [px, pz] = toMap(m.x, m.z);
      if (!inside(px, pz)) {
        // pin to the rim so the Heartwood is always findable
        const a = Math.atan2(pz - S / 2, px - S / 2);
        px = S / 2 + Math.cos(a) * (S / 2 - 16);
        pz = S / 2 + Math.sin(a) * (S / 2 - 16);
      }
      const blink = m.alert && Math.floor(performance.now() / 250) % 2;
      c.fillStyle = m.cls === 'rift' ? '#d070ff' : blink ? '#ff6050' : '#8affb0';
      c.fillText(m.icon, px, pz);
    }
    // player arrow
    c.translate(S / 2, S / 2);
    c.rotate(heading);
    c.shadowBlur = 8;
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(0, -16);
    c.lineTo(11, 12);
    c.lineTo(0, 6);
    c.lineTo(-11, 12);
    c.closePath();
    c.fill();
    c.restore();
  }

  // ------------------------------------------------------------- feedback

  // label: main line; sub: a second, smaller line (costs, alternatives)
  // the keys named in a hint, as the player has bound them (Settings > Controls): Game sets
  // keyLabel(code)
  keys(html) {
    if (!this.keyLabel || !html) return html;
    return html.replace(/<kbd>([A-Z]|Tab|Space|Shift)<\/kbd>/g, (m, k) => `<kbd>${this.keyLabel(k.length === 1 ? `Key${k}` : k === 'Shift' ? 'ShiftLeft' : k)}</kbd>`);
  }

  prompt(label, progress = 0, key = 'E', sub = '') {
    if (this.keyLabel && /^[A-Z]$/.test(key)) key = this.keyLabel(`Key${key}`);
    sub = this.keys(sub);
    const p = this.el.prompt;
    if (!label) {
      p.classList.remove('show');
      this.el.cross.classList.remove('hot');
      return;
    }
    p.classList.add('show');
    this.el.cross.classList.add('hot');
    if (this.el.promptLabel.textContent !== label) this.el.promptLabel.textContent = label;
    if (this.el.promptSub.innerHTML !== sub) this.el.promptSub.innerHTML = sub;
    if (this.el.promptKey.dataset.key !== key) {
      this.el.promptKey.dataset.key = key;
      // LMB: a little mouse with its left button lit (an attack, not a key)
      if (key === 'LMB') this.el.promptKey.innerHTML = MOUSE_SVG;
      else this.el.promptKey.textContent = key;
    }
    this.el.promptFill.style.strokeDashoffset = String(100.5 * (1 - progress));
  }

  // "10/2 [icon] 0/1 [icon]" for a recipe-like cost: what you carry over what it takes
  costHtml(needs, src = this.craftCtx().src) {
    return Object.entries(needs).map(([id, n]) => {
      const have = src.count(id);
      return `<span class="${have >= n ? 'have' : 'miss'}"><img src="${this.icons[id] || ''}">${have}/${n}</span>`;
    }).join(' ');
  }

  toast(id, n = 1, note) {
    const def = ITEMS[id];
    const r = RARITY[def.rarity];
    // stack repeats of the same pickup into one toast
    const last = this.el.toasts.lastElementChild;
    if (!note && last && last.dataset.id === id && Date.now() - Number(last.dataset.t) < 2500) {
      const total = Number(last.dataset.n) + n;
      last.dataset.n = total;
      last.dataset.t = Date.now();
      last.querySelector('.n').textContent = `${def.name} ×${total}`;
      last.style.animation = 'none';
      void last.offsetWidth;
      last.style.animation = '';
      return;
    }
    const t = document.createElement('div');
    t.className = 'toast';
    t.dataset.id = id;
    t.dataset.n = n;
    t.dataset.t = Date.now();
    t.style.setProperty('--rc', r.color);
    const sub = note || `${r.name} · ${KIND[def.kind].name}`;
    t.innerHTML = `<img src="${this.icons[id] || ''}"><div><div class="n">${def.name}${n > 1 ? ` ×${n}` : ''}</div><div class="r">${sub}</div></div>`;
    this.el.toasts.appendChild(t);
    while (this.el.toasts.children.length > 6) this.el.toasts.firstChild.remove();
    setTimeout(() => t.remove(), 4100);
  }

  message(text, color = '#f3ead2') {
    const t = document.createElement('div');
    t.className = 'toast msg';
    t.style.setProperty('--rc', color);
    t.innerHTML = `<div><div class="n">${this.keys(text)}</div></div>`;
    this.el.toasts.appendChild(t);
    while (this.el.toasts.children.length > 6) this.el.toasts.firstChild.remove();
    setTimeout(() => t.remove(), 4100);
  }

  discover(name) {
    const d = this.el.discover;
    d.querySelector('span').textContent = name;
    d.classList.remove('show');
    void d.offsetWidth;
    d.classList.add('show');
  }

  // line2: { text, color }, a second line in its own colour (tonight's Sign under a boss)
  banner(title, sub, cls = '', line2 = null) {
    const b = this.el.banner;
    b.querySelector('b').textContent = title;
    b.querySelector('span').textContent = sub;
    let l2 = b.querySelector('i.line2');
    if (!l2) {
      l2 = document.createElement('i');
      l2.className = 'line2';
      b.appendChild(l2);
    }
    l2.textContent = line2?.text || '';
    l2.style.color = line2?.color || '';
    l2.style.display = line2 ? '' : 'none';
    b.className = cls;
    void b.offsetWidth;
    b.classList.add('show');
  }

  hurt(amount) {
    this.hurtT = Math.min(1, this.hurtT + amount);
  }

  buildHint(text, ok) {
    const e = this.el.buildHint;
    if (!text) {
      e.classList.remove('show');
      return;
    }
    e.classList.add('show');
    e.classList.toggle('bad', !ok);
    if (e.innerHTML !== text) e.innerHTML = text;
  }

  setDead(seconds) {
    this.el.dead.classList.toggle('show', seconds > 0);
    if (seconds > 0) this.el.deadT.textContent = Math.ceil(seconds);
  }

  hitmarker(kill, crit) {
    const h = this.el.hitmark;
    h.className = '';
    void h.offsetWidth;
    h.className = `show${kill ? ' kill' : ''}${crit ? ' crit' : ''}`;
  }

  // a number that pops out of whatever was hit and floats up
  damageNumber(pos, n, cls = '') {
    if (this.floats.length > 40) this.floats.shift().el.remove();
    const el = document.createElement('div');
    el.className = `dmg ${cls}`;
    el.textContent = typeof n === 'number' ? Math.max(1, Math.round(n)) : n;
    this.el.floaters.appendChild(el);
    // fan out a little so a burst of hits stays readable
    const p = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * 0.4, (Math.random() - 0.5) * 0.8));
    this.floats.push({ el, pos: p, vx: (Math.random() - 0.5) * 0.8, vy: 1.6 + Math.random() * 0.6, t: 0, life: cls.includes('crit') ? 1.1 : 0.85 });
  }

  // slingshot draw: 0 hides it
  charge(k) {
    const c = this.el.charge;
    c.classList.toggle('show', k > 0.02);
    c.classList.toggle('full', k >= 0.98);
    this.el.chargeArc.style.strokeDashoffset = String(150.8 * (1 - k));
  }

  lightning(f) {
    this.el.flash.style.opacity = String(f * 0.35);
  }

  boons(perks) {
    this.el.boons.innerHTML = perks.map((p) => `<span title="${p.name}: ${p.desc}">${p.glyph}</span>`).join('');
  }

  // Three boon cards; resolves with the one clicked.
  pickPerk(options, onPick) {
    const el = this.el.perks;
    this.el.perkCards.innerHTML = '';
    options.forEach((p, i) => {
      const c = document.createElement('div');
      c.className = 'perk';
      c.innerHTML = `<div class="glyph">${p.glyph}</div><h3>${p.name}</h3><p>${p.desc}</p><kbd>${i + 1}</kbd>`;
      c.addEventListener('click', () => done(p));
      this.el.perkCards.appendChild(c);
    });
    // captured before the game's input sees it, so the 1-3 that picks a boon doesn't also
    // switch the belt slot
    const key = (e) => {
      const i = Number(e.key) - 1;
      if (!options[i]) return;
      e.stopImmediatePropagation();
      done(options[i]);
    };
    const done = (p) => {
      removeEventListener('keydown', key, true);
      el.classList.add('hidden');
      onPick(p);
    };
    addEventListener('keydown', key, true);
    el.classList.remove('hidden');
  }

  get perksOpen() {
    return !this.el.perks.classList.contains('hidden');
  }

  statsHtml(s) {
    const lines = [
      s.nights ? `You held the Heartwood for <b>${s.nights}</b> night${s.nights === 1 ? '' : 's'} and felled <b>${s.kills}</b> Blight.` : `The Blight took the Heartwood on the first night. You felled <b>${s.kills}</b> of them.`,
      `<small>${s.built} built · ${s.upgraded} upgraded · ${s.boons} boon${s.boons === 1 ? '' : 's'}${s.bosses ? ` · ${s.bosses} boss${s.bosses === 1 ? '' : 'es'} slain` : ''}</small>`,
    ];
    if (s.score != null) lines.push(`<small>${s.daily ? 'Daily vigil · ' : ''}Score <b>${s.score.toLocaleString()}</b>${s.best?.score ? ` · best ${s.best.score.toLocaleString()}` : ''}</small>`);
    if (s.best) lines.push(`<small>Best: ${s.best.nights} night${s.best.nights === 1 ? '' : 's'}</small>`);
    return lines.join('');
  }

  gameOver(s) {
    this.el.overStats.innerHTML = this.statsHtml(s);
    this.el.over.classList.remove('hidden');
  }

  victory(s) {
    this.el.victoryStats.innerHTML = this.statsHtml(s);
    this.el.victory.classList.remove('hidden');
  }

  hideVictory() {
    this.el.victory.classList.add('hidden');
  }

  stats() {
    this.renderHotbar();
    if (this.inventoryOpen) this.renderInventory();
    this.satchelChip();
  }

  // the key to the satchel, always beside the belt; when a defence can be crafted it says so
  satchelChip() {
    const el = this.chipEl ??= document.getElementById('satchel-chip');
    if (!el) return;
    const ctx = this.craftCtx();
    const n = RECIPES.filter((r) => ITEMS[r.out].kind === 'build' && this.recipeState(r, ctx).ok).length;
    const html = n ? `<kbd>Tab</kbd><span>Satchel · <b>${n} defence${n > 1 ? 's' : ''} ready to craft</b></span>` : '<kbd>Tab</kbd><span>Satchel &amp; crafting</span>';
    if (html !== this.chipHtml) {
      this.chipHtml = html;
      el.innerHTML = html;
      el.classList.toggle('ready', n > 0);
    }
  }

  // A torn page, read: the paper card over the game. done() when it's put away.
  showNote(n, done) {
    const el = document.getElementById('note');
    el.querySelector('.eyebrow').textContent = n.map ? 'A map' : 'A torn page';
    el.querySelector('h2').textContent = n.title;
    el.querySelector('.text').textContent = n.text;
    el.querySelector('.sign').textContent = `· ${n.who} ·`;
    el.classList.toggle('map', !!n.map);
    el.classList.remove('hidden');
    const go = el.querySelector('button');
    const close = () => {
      el.classList.add('hidden');
      go.removeEventListener('click', close);
      removeEventListener('keydown', key, true);
      done?.();
    };
    const key = (e) => {
      if (['Enter', 'Space', 'Escape', 'KeyE'].includes(e.code)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        close();
      }
    };
    go.addEventListener('click', close);
    addEventListener('keydown', key, true);
  }

  // An ending: { eyebrow, title, lead, stats, buttons: [{ label, primary, fn }] }
  showEnding(o) {
    const el = document.getElementById('ending');
    el.querySelector('.eyebrow').textContent = o.eyebrow || '';
    el.querySelector('h1').textContent = o.title;
    el.querySelector('.lead').innerHTML = o.lead || '';
    el.querySelector('.stats').innerHTML = o.stats ? this.statsHtml(o.stats) : '';
    el.dataset.kind = o.kind || '';
    const bt = el.querySelector('.buttons');
    bt.innerHTML = '';
    for (const b of o.buttons) {
      const e = document.createElement('button');
      e.textContent = b.label;
      if (b.primary) e.className = 'primary';
      e.addEventListener('click', () => {
        el.classList.add('hidden');
        b.fn();
      });
      bt.appendChild(e);
    }
    el.classList.remove('hidden');
  }

  // The opening card of a new run: what the vigil is and how a day goes. done() when closed.
  showIntro(done) {
    const el = document.getElementById('intro'), go = document.getElementById('intro-go');
    el.classList.remove('hidden');
    const close = () => {
      el.classList.add('hidden');
      go.removeEventListener('click', close);
      removeEventListener('keydown', key);
      done?.();
    };
    const key = (e) => { if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape') { e.preventDefault(); close(); } };
    go.addEventListener('click', close);
    addEventListener('keydown', key);
  }

  // a cheap screen projection: returns false if behind the camera or off screen
  project(pos, camera, out) {
    _p.copy(pos).project(camera);
    if (_p.z > 1) return false;
    const w = innerWidth, h = innerHeight;
    out.x = (_p.x * 0.5 + 0.5) * w;
    out.y = (-_p.y * 0.5 + 0.5) * h;
    return out.x > -60 && out.x < w + 60 && out.y > -60 && out.y < h + 60;
  }

  updateFloaters(dt, camera, enemies, buildings, player) {
    const sp = { x: 0, y: 0 };
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt;
      f.pos.y += f.vy * dt;
      f.pos.x += f.vx * dt;
      f.vy *= Math.exp(-dt * 2);
      const k = f.t / f.life;
      if (k >= 1 || !this.project(f.pos, camera, sp)) {
        if (k >= 1) {
          f.el.remove();
          this.floats.splice(i, 1);
        } else f.el.style.opacity = '0';
        continue;
      }
      const pop = f.t < 0.1 ? 1.5 - f.t * 5 : 1;
      f.el.style.opacity = String(Math.min(1, (1 - k) * 2.5));
      f.el.style.transform = `translate(${sp.x}px, ${sp.y}px) translate(-50%, -50%) scale(${pop})`;
    }
    // health bars over hurt enemies and damaged buildings nearby
    let n = 0;
    // glyph: an elite's affix over its bar; shield: what's left of a Shielded elite's crust
    const bar = (pos, frac, cls, glyph = '', shield = 0, color = '') => {
      if (!this.project(pos, camera, sp)) return;
      let el = this.bars[n];
      if (!el) {
        el = document.createElement('div');
        el.innerHTML = '<div></div><i></i><b></b>';
        this.el.floaters.appendChild(el);
        this.bars[n] = el;
      }
      n++;
      const c = `ebar ${cls}`;
      if (el.className !== c) el.className = c;
      el.style.display = '';
      el.style.transform = `translate(${sp.x}px, ${sp.y}px)`;
      el.firstChild.style.width = `${Math.max(0, frac) * 100}%`;
      el.children[1].style.width = `${Math.max(0, shield) * 100}%`;
      if (el.children[2].textContent !== glyph) el.children[2].textContent = glyph;
      if (glyph) el.children[2].style.color = color;
    };
    for (const e of enemies) {
      if (n >= 28) break;
      if (e.dying || e.def.boss || (e.barT <= 0 && !e.affix)) continue;
      if (Math.hypot(e.pos.x - player.x, e.pos.z - player.z) > (e.affix ? 30 : 45)) continue;
      _p.set(e.pos.x, e.pos.y + (e.def.chest * 2 + 0.35) * e.def.scale, e.pos.z);
      const af = e.affix && AFFIXES[e.affix];
      bar(_p.clone(), e.hp / e.maxHp, af ? 'elite' : '', af ? af.glyph : '', e.shield > 0 ? e.shield / e.maxShield : 0, af ? `#${affixRim(e.affix).toString(16).padStart(6, '0')}` : '');
    }
    for (const b of buildings) {
      if (n >= 36) break;
      if (b.dead || (b.barT <= 0 && (b.hp >= b.maxHp || Math.hypot(b.x - player.x, b.z - player.z) > 12))) continue;
      if (b.def.kind === 'trap' || b.def.kind === 'snare') {
        if (b.barT <= 0) continue;
      }
      _p.set(b.x, b.y + (b.def.muzzle || 1.4) + 0.9, b.z);
      bar(_p.clone(), b.hp / b.maxHp, 'build');
    }
    for (let i = n; i < this.bars.length; i++) this.bars[i].style.display = 'none';
  }

  journal(lines) {
    const key = lines.map((l) => l.html + l.done + l.main).join('|');
    if (key === this.journalKey) return;
    this.journalKey = key;
    this.el.journal.innerHTML = lines.length ? `<div class="head">Journal</div>${lines.map((l) => `<div class="j${l.main ? ' main' : ''}${l.done ? ' done' : ''}">${this.keys(l.html)}</div>`).join('')}` : '';
  }

  frame(dt, s) {
    this.updateCompass(s.heading, s.player, s.done);
    this.updateMinimap(s.player, s.heading, false, s);
    this.el.clock.textContent = s.clock;
    this.el.staminaBar.style.width = `${s.stamina * 100}%`;
    this.el.stamina.classList.toggle('low', s.stamina < 0.25);
    this.el.healthBar.style.width = `${(s.hp / s.maxHp) * 100}%`;
    this.el.health.classList.toggle('low', s.hp / s.maxHp < 0.3);
    this.el.healthText.textContent = Math.ceil(s.hp);
    // laden or encumbered: say so under the stamina bar, with the weight
    const bd = this.inv.burden, bel = (this.el.burden ??= $('#burden'));
    const bt = bd === 'light' ? '' : `${bd === 'laden' ? 'Laden' : 'Encumbered'} · ${this.inv.weight.toFixed(1)}/${this.inv.capacity} kg`;
    if (bel && bel.textContent !== bt) {
      bel.textContent = bt;
      bel.className = bd;
    }
    this.el.underwater.style.opacity = s.underwater ? '1' : '0';
    this.hurtT = Math.max(0, this.hurtT - dt * 1.6);
    this.el.hurt.style.opacity = String(Math.max(this.hurtT, s.hp / s.maxHp < 0.3 ? 0.35 + Math.sin(performance.now() / 300) * 0.1 : 0));

    // day / night strip
    const w = s.waves;
    let title, sub;
    if (w.phase === 'day') {
      title = `Day ${w.night}`;
      sub = w.skipping ? 'Night is falling…' : `Dusk in ${fmtTime(w.dayLeft)} · tonight ${describeWave(w.preview.counts)}${w.rainTonight ? ' · rain' : ''}`;
    } else if (w.phase === 'night') {
      title = `Night ${w.night}`;
      sub = `${w.remaining} Blight left`;
    } else if (w.phase === 'dawn') {
      title = 'Dawn';
      sub = 'The Blight retreats';
    } else {
      title = 'The Heartwood has fallen';
      sub = '';
    }
    this.el.phase.classList.toggle('night', w.phase === 'night');
    if (this.el.phaseTitle.textContent !== title) this.el.phaseTitle.textContent = title;
    if (this.el.phaseSub.textContent !== sub) this.el.phaseSub.textContent = sub;
    // tonight's Sign, in its colour, under the line
    const S = w.signTonight, st = S ? `${S.glyph} ${S.name}` : '';
    if (!this.el.phaseSign) {
      this.el.phaseSign = document.createElement('div');
      this.el.phaseSign.className = 'phase-sign';
      this.el.phaseSub.after(this.el.phaseSign);
    }
    if (this.el.phaseSign.textContent !== st) {
      this.el.phaseSign.textContent = st;
      this.el.phaseSign.style.color = S?.color || '';
      this.el.phaseSign.title = S?.desc || '';
    }
    const hf = `${(s.base.hp / s.base.maxHp) * 100}%`;
    if (this.el.heartBar.style.width !== hf) {
      this.el.heartBar.style.width = hf;
      this.el.heartLag.style.width = hf;
    }
    this.el.heartText.textContent = `${Math.ceil(s.base.hp)} / ${s.base.maxHp}`;
    this.el.phase.classList.toggle('hurt', s.base.flash > 0.2);

    // boss
    const boss = s.boss;
    this.el.boss.classList.toggle('hidden', !boss || s.waves.phase === 'over');
    if (boss) {
      const n = boss.def.name.startsWith('The') ? boss.def.name : `The ${boss.def.name}`;
      if (this.el.bossName.textContent !== n) this.el.bossName.textContent = n;
      const f = `${Math.max(0, boss.hp / boss.maxHp) * 100}%`;
      if (this.el.bossFill.style.width !== f) {
        this.el.bossFill.style.width = f;
        this.el.bossLag.style.width = f;
      }
    }
    this.journal(s.journal);
    this.updateFloaters(dt, s.camera, s.enemies, s.buildings, s.player);

    if (this.fpsOn) {
      // frames drawn a second (the frame limit caps it) and the average frame time, twice a second
      this.fpsAcc.t += dt;
      this.fpsAcc.n++;
      if (this.fpsAcc.t > 0.5) {
        const fps = this.fpsAcc.n / this.fpsAcc.t;
        this.el.fps.textContent = `${Math.round(fps)} FPS · ${(1000 / fps).toFixed(1)} ms`;
        this.el.fps.className = fps >= 50 ? 'good' : fps >= 30 ? 'ok' : 'slow';
        this.fpsAcc.t = this.fpsAcc.n = 0;
      }
    }
  }

  // the frame counter (Settings > Show FPS)
  showFps(on) {
    this.fpsOn = on;
    this.el.fps.style.display = on ? '' : 'none';
    this.fpsAcc.t = this.fpsAcc.n = 0;
    if (on) this.el.fps.textContent = '… FPS';
  }

  // ---------------------------------------------------------------- hotbar

  buildHotbar() {
    this.hotEls = [];
    for (let i = 0; i < HOTBAR; i++) {
      const s = document.createElement('div');
      s.className = 'hslot';
      s.innerHTML = `<i>${i + 1}</i><img alt=""><span class="count"></span>`;
      this.el.hotbar.appendChild(s);
      this.hotEls.push(s);
    }
  }

  renderHotbar() {
    for (let i = 0; i < HOTBAR; i++) {
      const s = this.inv.slots[i];
      const el = this.hotEls[i];
      el.classList.toggle('sel', i === this.inv.selected);
      el.classList.toggle('empty', !s);
      const img = el.querySelector('img');
      const src = s ? this.icons[s.id] || '' : '';
      if (img.getAttribute('src') !== src) img.setAttribute('src', src);
      el.querySelector('.count').textContent = s && s.n > 1 ? s.n : '';
      el.style.setProperty('--rc', s ? RARITY[ITEMS[s.id].rarity].color : 'transparent');
    }
    const h = this.inv.held;
    const kind = h && ITEMS[h.id].kind;
    const hint = { build: ' · LMB to place', use: ITEMS[h?.id]?.throw ? ' · RMB to throw' : ' · RMB to use', tool: ' · hold LMB to draw' };
    const label = h ? ITEMS[h.id].name + (hint[kind] || '') : 'Machete';
    if (this.el.held.textContent !== label) {
      this.el.held.textContent = label;
      this.el.held.classList.remove('flash');
      void this.el.held.offsetWidth;
      this.el.held.classList.add('flash');
    }
    // ammo count under the slingshot
    if (h?.id === 'slingshot') {
      const st = this.inv.count('stone'), sc = this.inv.count('scrap_shot');
      const html = sc ? `<b>${sc}</b> scrap shot · ${st} stones` : `<b>${st}</b> stones`;
      if (this.el.ammo.innerHTML !== html) this.el.ammo.innerHTML = html;
      this.el.ammo.classList.toggle('out', st + sc === 0);
    } else if (this.el.ammo.innerHTML) this.el.ammo.innerHTML = '';
  }

  // ------------------------------------------------------------- satchel

  get inventoryOpen() {
    return !this.el.inv.classList.contains('hidden');
  }

  // other: a container or the Coffer shown beside the satchel ({ title, sub, inv, hidden, kind,
  // actions: [{ label, key, fn }] }), or null for the satchel alone
  toggleInventory(on = !this.inventoryOpen, other = null) {
    this.el.inv.classList.toggle('hidden', !on);
    this.carry = null;
    const had = this.otherPane;
    this.otherPane = on ? other : null;
    if (had && had !== this.otherPane) this.onCloseOther?.(had);
    this.tab = this.otherPane ? 'other' : 'craft';
    if (!on) this.hideTip();
    if (on) this.renderInventory();
  }

  makeSlot(parent, inv, i) {
    const s = document.createElement('div');
    s.className = 'slot';
    s.innerHTML = '<img alt=""><span class="count"></span><svg class="search" viewBox="0 0 40 40"><circle cx="20" cy="20" r="15"/></svg>';
    s.addEventListener('mouseenter', () => {
      const it = inv().slots[i];
      if (it && !this.isHidden(inv(), i)) this.detail(it.id);
    });
    s.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      this.slotClick(inv(), i, ev);
    });
    s.addEventListener('contextmenu', (ev) => ev.preventDefault());
    parent.appendChild(s);
    return s;
  }

  isHidden(inv, i) {
    const o = this.otherPane;
    return !!(o && o.inv === inv && o.hidden?.has(i));
  }

  slotClick(inv, i, ev) {
    const o = this.otherPane;
    const mine = inv === this.inv;
    if (this.isHidden(inv, i)) return;
    const s = inv.slots[i];
    if (ev.button === 2) {
      if (!mine || !s) return;
      // right-click: use a consumable, salvage a defence, drop one of anything else
      if (ITEMS[s.id].kind === 'use') this.onUse?.(i);
      else if (ITEMS[s.id].kind === 'build') this.onSalvage?.(i);
      else this.onDrop?.(i);
      return;
    }
    if (this.carry === null) {
      if (!s) return;
      // shift-click (or a click in the container) sends the whole stack across
      if (o && (ev.shiftKey || !mine)) {
        const n = transfer(inv, i, mine ? o.inv : this.inv);
        if (!n) this.onFull?.(mine ? o : null);
        this.renderInventory();
        return;
      }
      this.carry = { inv, i };
    } else {
      const c = this.carry;
      this.carry = null;
      if (c.inv === inv) inv.move(c.i, i);
      else if (!transfer(c.inv, c.i, inv, i)) this.onFull?.(mine ? null : o);
    }
    this.renderInventory();
  }

  buildSatchel() {
    this.slotEls = [];
    const inv = () => this.inv;
    for (let i = 0; i < HOTBAR; i++) this.slotEls[i] = this.makeSlot(this.el.belt, inv, i);
    for (let i = this.inv.packStart; i < this.inv.safeStart; i++) this.slotEls[i] = this.makeSlot(this.el.grid, inv, i);
    for (let i = this.inv.safeStart; i < this.inv.slots.length; i++) this.slotEls[i] = this.makeSlot(this.el.safe, inv, i);
    this.otherEls = [];
    this.otherInv = null;
    // recipes, in groups
    let group = null;
    this.recipeEls = [];
    for (const r of RECIPES) {
      if (r.group !== group) {
        group = r.group;
        const h = document.createElement('div');
        h.className = 'recipe-group';
        h.textContent = group;
        this.el.recipes.appendChild(h);
      }
      const card = document.createElement('div');
      card.className = 'recipe';
      card.innerHTML = '<img class="out" alt=""><div class="body"><div class="name"></div><div class="needs"></div><div class="meta"></div><div class="at"></div></div><button>Craft</button>';
      card.querySelector('button').addEventListener('click', () => this.onCraft?.(r));
      card.addEventListener('mouseenter', (ev) => {
        this.detail(r.out);
        this.showTip(r, ev);
      });
      card.addEventListener('mousemove', (ev) => this.placeTip(ev));
      card.addEventListener('mouseleave', () => this.hideTip());
      this.el.recipes.appendChild(card);
      this.recipeEls.push({ r, card });
    }
    this.el.tabs.addEventListener('mousedown', (ev) => {
      const t = ev.target.closest('[data-tab]');
      if (!t) return;
      this.tab = t.dataset.tab;
      this.renderInventory();
    });
    this.el.other.querySelector('.acts').addEventListener('mousedown', (ev) => {
      const b = ev.target.closest('button[data-i]');
      if (!b) return;
      this.otherPane?.actions?.[+b.dataset.i]?.fn();
      this.renderInventory();
    });
  }

  // Can recipe r be made here and now? { ok, where, afford, note }
  recipeState(r, ctx = this.craftCtx()) {
    const lvl = r.lvl || 1;
    let where = true, note = '';
    if (r.at !== 'field') {
      const have = ctx.benches?.[r.at] ?? 0;
      const name = AT_NAMES[r.at];
      if (!ctx.atCamp) {
        where = false;
        note = `At camp · ${name}`;
      } else if (have < 1) {
        where = false;
        note = `Build the ${name} first`;
      } else if (have < lvl) {
        where = false;
        note = `Needs the ${name} at level ${lvl}`;
      } else note = name;
    }
    const afford = ctx.src.canAfford(r.needs);
    return { ok: where && afford, where, afford, note };
  }

  setSlot(el, s, hidden = false, locked = false) {
    el.classList.toggle('empty', !s || hidden);
    el.classList.toggle('hidden-item', hidden);
    el.classList.toggle('locked', locked);
    const img = el.querySelector('img');
    const src = s && !hidden ? this.icons[s.id] || '' : '';
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    el.querySelector('.count').textContent = s && !hidden && s.n > 1 ? s.n : '';
    el.style.setProperty('--rc', s && !hidden ? RARITY[ITEMS[s.id].rarity].color : 'transparent');
  }

  renderWeight() {
    const inv = this.inv, w = inv.weight, cap = inv.capacity;
    const el = this.el.weight;
    const k = Math.min(1, w / (cap * HARD_CAP));
    el.querySelector('i').style.width = `${(k * 100).toFixed(1)}%`;
    el.querySelector('.mark.laden').style.left = `${(LADEN / HARD_CAP) * 100}%`;
    el.querySelector('.mark.full').style.left = `${(1 / HARD_CAP) * 100}%`;
    const b = inv.burden;
    el.dataset.burden = b;
    const txt = b === 'encumbered' ? 'Encumbered: no sprint, slow and loud' : b === 'laden' ? 'Laden: a little slower, tires faster' : 'Light';
    el.querySelector('.txt').innerHTML = `<b>${w.toFixed(1)}</b> / ${cap} kg · ${txt}`;
  }

  renderInventory() {
    const inv = this.inv;
    inv.slots.forEach((s, i) => {
      const el = this.slotEls[i];
      if (!el) return;
      const ok = inv.usable(i);
      el.style.display = ok ? '' : 'none';
      this.setSlot(el, s, false, !ok);
      el.classList.toggle('carry', this.carry?.inv === inv && this.carry.i === i);
      el.classList.toggle('sel', i === inv.selected);
    });
    this.renderWeight();
    // the right side: the open container / Coffer, or crafting
    const o = this.otherPane;
    const tabs = [];
    if (o) tabs.push(['other', o.title]);
    tabs.push(['craft', 'Craft']);
    if (this.notes.length) tabs.push(['notes', `Notes <small>${this.notes.length}</small>`]);
    const th = tabs.map(([k, t]) => `<button data-tab="${k}" class="${this.tab === k ? 'on' : ''}">${t}</button>`).join('');
    if (this.el.tabs.innerHTML !== th) this.el.tabs.innerHTML = th;
    this.el.other.classList.toggle('hidden', this.tab !== 'other' || !o);
    this.el.craft.classList.toggle('hidden', this.tab !== 'craft');
    this.el.notes.classList.toggle('hidden', this.tab !== 'notes');
    if (o && this.tab === 'other') this.renderOther();
    if (this.tab === 'notes') this.renderNotes();
    const ctx = this.craftCtx();
    if (this.tab === 'craft') {
      // the camp's benches, and whether they count from here
      const benches = BENCH_IDS.map((id) => {
        const b = BENCHES[id], lv = ctx.benches?.[id] ?? 0;
        return `<span class="${lv ? 'built' : ''}">${b.glyph} ${b.name} ${lv ? `<b>${'●'.repeat(lv)}${'○'.repeat(3 - lv)}</b>` : '<i>not built</i>'}</span>`;
      }).join('');
      const where = ctx.atCamp ? '<em class="camp">In camp: the benches and the Coffer count</em>' : '<em>Away from camp: only recipes marked Anywhere</em>';
      const bh = `${benches}${where}`;
      if (this.el.benchRow.innerHTML !== bh) this.el.benchRow.innerHTML = bh;
      for (const { r, card } of this.recipeEls) {
        const def = ITEMS[r.out];
        const st = this.recipeState(r, ctx);
        card.classList.toggle('ok', st.ok);
        card.classList.toggle('away', !st.where);
        card.style.setProperty('--rc', RARITY[def.rarity].color);
        const img = card.querySelector('img.out');
        if (img.getAttribute('src') !== this.icons[r.out]) img.setAttribute('src', this.icons[r.out] || '');
        card.querySelector('.name').textContent = def.name + (r.n > 1 ? ` ×${r.n}` : '');
        card.querySelector('.needs').innerHTML = this.costHtml(r.needs, ctx.src);
        // a defence: what it draws from the roots against what's free, and its damage type
        const bd = def.kind === 'build' && BUILD_DEFS[r.out];
        let meta = '';
        if (bd && ctx.roots) {
          const k = ROOTS[r.out] || 1, over = ctx.roots.used + k > ctx.roots.cap;
          meta = `<span class="roots${over ? ' over' : ''}">❦ ${k} root${k > 1 ? 's' : ''} · ${ctx.roots.used}/${ctx.roots.cap}</span>${DTYPE[bd.kind] ? `<span class="dtype t-${DTYPE[bd.kind].toLowerCase()}">${DTYPE[bd.kind]}</span>` : ''}`;
        }
        const me = card.querySelector('.meta');
        if (me.innerHTML !== meta) me.innerHTML = meta;
        const at = card.querySelector('.at');
        at.textContent = r.at === 'field' ? 'Anywhere' : st.note;
        at.classList.toggle('bad', !st.where);
        card.querySelector('button').disabled = !st.ok;
      }
    }
    // the tooltip follows the satchel as things are crafted or moved
    if (this.tipRecipe) this.showTip(this.tipRecipe);
    this.el.slots.textContent = `${inv.used}/${inv.size}`;
    this.el.relics.textContent = inv.relicValue;
    this.el.packName.textContent = ITEMS[inv.packId]?.name ?? 'Satchel';
  }

  // the pages read this run: a list down the side, the chosen one on the right
  renderNotes() {
    const el = this.el.notes;
    if (!this.noteSel || !this.notes.includes(this.noteSel)) this.noteSel = this.notes[this.notes.length - 1];
    const list = this.notes.map((n, i) => `<button data-n="${i}" class="${n === this.noteSel ? 'on' : ''}${n.map ? ' map' : ''}"><b>${n.who}</b><span>${n.title}</span></button>`).join('');
    const L = el.querySelector('.note-list');
    if (L.innerHTML !== list) {
      L.innerHTML = list;
      L.onmousedown = (ev) => {
        const b = ev.target.closest('[data-n]');
        if (!b) return;
        this.noteSel = this.notes[+b.dataset.n];
        this.renderNotes();
      };
    }
    const n = this.noteSel;
    const page = n ? `<h4>${n.title}</h4><p>${n.text}</p><div class="sign">· ${n.who} ·</div>` : '';
    const P = el.querySelector('.note-page');
    if (P.innerHTML !== page) P.innerHTML = page;
  }

  // the open container or Coffer: its slots, the unsearched ones as question marks
  renderOther() {
    const o = this.otherPane;
    if (this.otherInv !== o.inv) {
      this.otherInv = o.inv;
      this.el.otherGrid.innerHTML = '';
      this.otherEls = [];
      o.inv.slots.forEach((_, i) => { this.otherEls[i] = this.makeSlot(this.el.otherGrid, () => this.otherPane?.inv ?? o.inv, i); });
    }
    this.el.otherGrid.classList.toggle('big', o.inv.slots.length > 24);
    const head = this.el.other.querySelector('.t');
    if (head.textContent !== o.title) head.textContent = o.title;
    const sub = this.el.other.querySelector('.other-sub');
    if (sub.innerHTML !== (o.sub || '')) sub.innerHTML = o.sub || '';
    const acts = (o.actions || []).map((a, i) => `<button data-i="${i}">${a.key ? `<kbd>${a.key}</kbd> ` : ''}${a.label}</button>`).join('');
    const ae = this.el.other.querySelector('.acts');
    if (ae.innerHTML !== acts) ae.innerHTML = acts;
    o.inv.slots.forEach((s, i) => {
      const el = this.otherEls[i];
      const hidden = !!o.hidden?.has(i);
      this.setSlot(el, s, hidden, !o.inv.usable(i));
      el.classList.toggle('searching', o.searching === i);
      el.classList.toggle('carry', this.carry?.inv === o.inv && this.carry.i === i);
      if (o.searching === i) el.querySelector('.search circle').style.strokeDashoffset = String(94.2 * (1 - (o.prog || 0)));
    });
  }

  // a sound written out (Settings > Captions): a line at the foot of the screen, a few at most
  caption(text) {
    const box = (this.capBox ??= (() => {
      const d = document.createElement('div');
      d.id = 'captions';
      document.getElementById('hud').appendChild(d);
      return d;
    })());
    const line = document.createElement('div');
    line.textContent = `[ ${text} ]`;
    box.appendChild(line);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => line.classList.add('out'), 2600);
    setTimeout(() => line.remove(), 3200);
  }

  // a day walker heard you: an ear on the crosshair, for a moment
  heard() {
    const el = (this.el.heard ??= (() => {
      const d = document.createElement('div');
      d.id = 'heard';
      d.innerHTML = '<span>◉</span> Heard';
      this.el.hud.appendChild(d);
      return d;
    })());
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
  }

  // a slot in the open container was just searched: flash it in its rarity's colour
  revealFlash(i) {
    const el = this.otherEls?.[i];
    if (!el) return;
    el.classList.remove('reveal');
    void el.offsetWidth;
    el.classList.add('reveal');
  }

  detail(id) {
    const def = ITEMS[id];
    const r = RARITY[def.rarity];
    const have = this.inv.count(id);
    const pack = PACKS[id];
    const extra = def.kind === 'relic' ? ` · offering ${def.value}` : '';
    this.el.detail.innerHTML = `
      <img src="${this.icons[id] || ''}">
      <div><h3>${def.name}</h3>
      <div class="rar" style="color:${r.color}">${r.name} ${KIND[def.kind].name}${extra} · ${weightOf(id)} kg</div>
      <p>${def.desc}</p>
      <div class="val">Carrying <b>${have}</b>${have > 1 ? ` · ${(have * weightOf(id)).toFixed(1)} kg` : ''}${pack ? ` · carries ${pack.cap} kg` : ''}</div>
      ${def.kind === 'build' ? '<div class="where">Right-click in the satchel to salvage it for parts.</div>' : ''}
      ${def.kind === 'material' || def.kind === 'scrap' ? `<div class="where">Found ${whereToFind(id)}</div>` : ''}</div>`;
  }

  // ------------------------------------------------------------- recipe tooltip

  // Hovering a recipe: every ingredient with what you carry against what it takes, what's
  // still missing, and where to look for it.
  showTip(r, ev) {
    if (!this.tipEl) {
      this.tipEl = document.createElement('div');
      this.tipEl.id = 'craft-tip';
      document.body.appendChild(this.tipEl);
    }
    this.tipRecipe = r;
    const out = ITEMS[r.out], rar = RARITY[out.rarity];
    const missing = [];
    const ctx = this.craftCtx(), st = this.recipeState(r, ctx);
    const rows = Object.entries(r.needs).map(([id, n]) => {
      const have = ctx.src.count(id), ok = have >= n;
      if (!ok) missing.push(`${n - have} ${ITEMS[id].name}`);
      return `<div class="row ${ok ? 'have' : 'miss'}"><img src="${this.icons[id] || ''}"><span class="nm">${ITEMS[id].name}</span><b>${have}/${n}</b>
        ${ok ? '' : `<div class="from">Find: ${whereToFind(id)}</div>`}</div>`;
    }).join('');
    this.tipEl.innerHTML = `
      <div class="hd"><img src="${this.icons[r.out] || ''}"><div><h4>${out.name}${r.n > 1 ? ` ×${r.n}` : ''}</h4>
        <div class="k" style="color:${rar.color}">${rar.name} ${KIND[out.kind].name}</div></div></div>
      <p>${out.desc}</p>
      <div class="lbl">Needs</div>${rows}
      <div class="ft ${missing.length || !st.where ? 'miss' : 'have'}">${missing.length ? `Missing: ${missing.join(' · ')}` : !st.where ? st.note : 'You have everything. Click Craft.'}</div>
      ${r.at === 'field' ? '' : `<div class="hint">Made at the ${AT_NAMES[r.at]}${(r.lvl || 1) > 1 ? ` (level ${r.lvl})` : ''}, anywhere in camp. Draws on the Coffer too.</div>`}
      ${out.kind === 'build' ? '<div class="hint">Select it on your belt, then left-click near the Heartwood to place it.</div>' : ''}`;
    this.tipEl.classList.add('on');
    if (ev) this.placeTip(ev);
  }

  placeTip(ev) {
    const t = this.tipEl;
    if (!t) return;
    const w = t.offsetWidth, h = t.offsetHeight;
    // beside the cursor, flipped to the other side near the screen's edges
    let x = ev.clientX + 18, y = ev.clientY + 14;
    if (x + w > innerWidth - 8) x = ev.clientX - w - 18;
    if (y + h > innerHeight - 8) y = Math.max(8, innerHeight - h - 8);
    t.style.transform = `translate(${x}px, ${y}px)`;
  }

  hideTip() {
    this.tipRecipe = null;
    this.tipEl?.classList.remove('on');
  }
}
