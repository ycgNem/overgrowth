// DOM heads-up display: compass, minimap, prompts, toasts, vitals, hotbar, the day/night
// strip, combat feedback (damage numbers, health bars, hit markers, the boss bar), the
// journal, and the overlays (satchel + crafting, boons, victory, game over).
import * as THREE from 'three';
import { ITEMS, RARITY, KIND, whereToFind } from '../items/ItemDB.js';
import { RECIPES } from '../items/Recipes.js';
import { HOTBAR } from '../items/Inventory.js';
import { POI_INFO, poisAround } from '../world/poi/POI.js';
import { terrainHeight, jungleDensity, CHUNK_SIZE } from '../world/WorldGen.js';
import { angleDelta } from '../utils/math.js';
import { describeWave } from '../defense/Waves.js';

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
      inv: $('#inventory'), grid: $('#inv-grid'), belt: $('#inv-belt'), detail: $('#inv-detail'), recipes: $('#inv-recipes'),
      slots: $('#inv-slots'), relics: $('#inv-relics'),
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
    this.fpsAcc = { t: 0, n: 0 };
    this.hurtT = 0;
    this.carry = null; // slot index picked up in the satchel
    this.onCraft = null;
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
  prompt(label, progress = 0, key = 'E', sub = '') {
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
  costHtml(needs) {
    return Object.entries(needs).map(([id, n]) => {
      const have = this.inv.count(id);
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
    t.innerHTML = `<div><div class="n">${text}</div></div>`;
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

  banner(title, sub, cls = '') {
    const b = this.el.banner;
    b.querySelector('b').textContent = title;
    b.querySelector('span').textContent = sub;
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
      `<small>${s.built} built · ${s.upgraded} upgraded · ${s.boons} boon${s.boons === 1 ? '' : 's'}${s.bosses ? ` · ${s.bosses} Thornback${s.bosses === 1 ? '' : 's'} slain` : ''}</small>`,
    ];
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
    const n = RECIPES.filter((r) => ITEMS[r.out].kind === 'build' && this.inv.canAfford(r.needs)).length;
    const html = n ? `<kbd>Tab</kbd><span>Satchel · <b>${n} defence${n > 1 ? 's' : ''} ready to craft</b></span>` : '<kbd>Tab</kbd><span>Satchel &amp; crafting</span>';
    if (html !== this.chipHtml) {
      this.chipHtml = html;
      el.innerHTML = html;
      el.classList.toggle('ready', n > 0);
    }
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
    const bar = (pos, frac, cls) => {
      if (!this.project(pos, camera, sp)) return;
      let el = this.bars[n];
      if (!el) {
        el = document.createElement('div');
        el.innerHTML = '<div></div>';
        this.el.floaters.appendChild(el);
        this.bars[n] = el;
      }
      n++;
      el.className = `ebar ${cls}`;
      el.style.display = '';
      el.style.transform = `translate(${sp.x}px, ${sp.y}px)`;
      el.firstChild.style.width = `${Math.max(0, frac) * 100}%`;
    };
    for (const e of enemies) {
      if (n >= 28) break;
      if (e.dying || e.barT <= 0 || e.def.boss) continue;
      if (Math.hypot(e.pos.x - player.x, e.pos.z - player.z) > 45) continue;
      _p.set(e.pos.x, e.pos.y + (e.def.chest * 2 + 0.35) * e.def.scale, e.pos.z);
      bar(_p.clone(), e.hp / e.maxHp, '');
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
    this.el.journal.innerHTML = lines.length ? `<div class="head">Journal</div>${lines.map((l) => `<div class="j${l.main ? ' main' : ''}${l.done ? ' done' : ''}">${l.html}</div>`).join('')}` : '';
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
    const hf = `${(s.base.hp / s.base.maxHp) * 100}%`;
    if (this.el.heartBar.style.width !== hf) {
      this.el.heartBar.style.width = hf;
      this.el.heartLag.style.width = hf;
    }
    this.el.heartText.textContent = `${Math.ceil(s.base.hp)} / ${s.base.maxHp}`;
    this.el.phase.classList.toggle('hurt', s.base.flash > 0.2);

    // boss
    const boss = s.boss;
    this.el.boss.classList.toggle('hidden', !boss);
    if (boss) {
      const f = `${Math.max(0, boss.hp / boss.maxHp) * 100}%`;
      if (this.el.bossFill.style.width !== f) {
        this.el.bossFill.style.width = f;
        this.el.bossLag.style.width = f;
      }
    }
    this.journal(s.journal);
    this.updateFloaters(dt, s.camera, s.enemies, s.buildings, s.player);

    this.fpsAcc.t += dt;
    this.fpsAcc.n++;
    if (this.fpsAcc.t > 0.5) {
      this.el.fps.textContent = `${Math.round(this.fpsAcc.n / this.fpsAcc.t)} fps`;
      this.fpsAcc.t = this.fpsAcc.n = 0;
    }
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

  toggleInventory(on = !this.inventoryOpen) {
    this.el.inv.classList.toggle('hidden', !on);
    this.carry = null;
    if (!on) this.hideTip();
    if (on) this.renderInventory();
  }

  buildSatchel() {
    this.slotEls = [];
    const make = (i, parent) => {
      const s = document.createElement('div');
      s.className = 'slot';
      s.innerHTML = '<img alt=""><span class="count"></span>';
      s.addEventListener('mouseenter', () => {
        const it = this.inv.slots[i];
        if (it) this.detail(it.id);
      });
      s.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        if (ev.button === 2) {
          // right-click: use a consumable / drop one of anything else
          const it = this.inv.slots[i];
          if (it && ITEMS[it.id].kind === 'use') this.onUse?.(i);
          else if (it) this.onDrop?.(i);
          return;
        }
        if (this.carry === null) {
          if (this.inv.slots[i]) this.carry = i;
        } else {
          this.inv.move(this.carry, i);
          this.carry = null;
        }
        this.renderInventory();
      });
      s.addEventListener('contextmenu', (ev) => ev.preventDefault());
      parent.appendChild(s);
      this.slotEls[i] = s;
    };
    for (let i = 0; i < HOTBAR; i++) make(i, this.el.belt);
    for (let i = HOTBAR; i < this.inv.slots.length; i++) make(i, this.el.grid);
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
      card.innerHTML = `<img class="out" alt=""><div class="body"><div class="name"></div><div class="needs"></div></div><button>Craft</button>`;
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
  }

  renderInventory() {
    this.inv.slots.forEach((s, i) => {
      const el = this.slotEls[i];
      el.classList.toggle('empty', !s);
      el.classList.toggle('carry', this.carry === i);
      el.classList.toggle('sel', i === this.inv.selected);
      const img = el.querySelector('img');
      const src = s ? this.icons[s.id] || '' : '';
      if (img.getAttribute('src') !== src) img.setAttribute('src', src);
      el.querySelector('.count').textContent = s && s.n > 1 ? s.n : '';
      el.style.setProperty('--rc', s ? RARITY[ITEMS[s.id].rarity].color : 'transparent');
    });
    for (const { r, card } of this.recipeEls) {
      const def = ITEMS[r.out];
      const ok = this.inv.canAfford(r.needs);
      card.classList.toggle('ok', ok);
      card.style.setProperty('--rc', RARITY[def.rarity].color);
      const img = card.querySelector('img.out');
      if (img.getAttribute('src') !== this.icons[r.out]) img.setAttribute('src', this.icons[r.out] || '');
      card.querySelector('.name').textContent = def.name + (r.n > 1 ? ` ×${r.n}` : '');
      card.querySelector('.needs').innerHTML = this.costHtml(r.needs);
      card.querySelector('button').disabled = !ok;
    }
    // the tooltip follows the satchel as things are crafted or moved
    if (this.tipRecipe) this.showTip(this.tipRecipe);
    this.el.slots.textContent = `${this.inv.used}/${this.inv.slots.length}`;
    this.el.relics.textContent = this.inv.relicValue;
  }

  detail(id) {
    const def = ITEMS[id];
    const r = RARITY[def.rarity];
    const have = this.inv.count(id);
    this.el.detail.innerHTML = `
      <img src="${this.icons[id] || ''}">
      <div><h3>${def.name}</h3>
      <div class="rar" style="color:${r.color}">${r.name} ${KIND[def.kind].name}${def.kind === 'relic' ? ` · offering ${def.value}` : ''}</div>
      <p>${def.desc}</p>
      <div class="val">Carrying <b>${have}</b></div>
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
    const rows = Object.entries(r.needs).map(([id, n]) => {
      const have = this.inv.count(id), ok = have >= n;
      if (!ok) missing.push(`${n - have} ${ITEMS[id].name}`);
      return `<div class="row ${ok ? 'have' : 'miss'}"><img src="${this.icons[id] || ''}"><span class="nm">${ITEMS[id].name}</span><b>${have}/${n}</b>
        ${ok ? '' : `<div class="from">Find: ${whereToFind(id)}</div>`}</div>`;
    }).join('');
    this.tipEl.innerHTML = `
      <div class="hd"><img src="${this.icons[r.out] || ''}"><div><h4>${out.name}${r.n > 1 ? ` ×${r.n}` : ''}</h4>
        <div class="k" style="color:${rar.color}">${rar.name} ${KIND[out.kind].name}</div></div></div>
      <p>${out.desc}</p>
      <div class="lbl">Needs</div>${rows}
      <div class="ft ${missing.length ? 'miss' : 'have'}">${missing.length ? `Missing: ${missing.join(' · ')}` : 'You have everything. Click Craft.'}</div>
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
