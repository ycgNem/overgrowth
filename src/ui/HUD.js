// DOM heads-up display: compass, minimap, prompts, toasts, vitals, hotbar, the
// day/night banner, and the satchel (inventory + crafting).
import { ITEMS, RARITY, KIND } from '../items/ItemDB.js';
import { RECIPES } from '../items/Recipes.js';
import { HOTBAR } from '../items/Inventory.js';
import { POI_INFO, poisAround } from '../world/poi/POI.js';
import { terrainHeight, jungleDensity, CHUNK_SIZE } from '../world/WorldGen.js';
import { angleDelta } from '../utils/math.js';

const $ = (s) => document.querySelector(s);
const DEG = Math.PI / 180;
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class HUD {
  constructor(inventory) {
    this.inv = inventory;
    this.icons = {};
    this.el = {
      hud: $('#hud'), strip: $('#compass-strip'), compass: $('#compass'), map: $('#minimap'),
      clock: $('#clock'), prompt: $('#prompt'), promptLabel: $('#prompt .label'), promptFill: $('#prompt .fill'),
      promptKey: $('#prompt .key'),
      cross: $('#crosshair'), toasts: $('#toasts'),
      stamina: $('#stamina'), staminaBar: $('#stamina div'), health: $('#health'), healthBar: $('#health div'), healthText: $('#health span'),
      discover: $('#discover'), fps: $('#fps'),
      inv: $('#inventory'), grid: $('#inv-grid'), belt: $('#inv-belt'), detail: $('#inv-detail'), recipes: $('#inv-recipes'),
      slots: $('#inv-slots'), relics: $('#inv-relics'),
      underwater: $('#underwater'), hint: $('#hint'), hotbar: $('#hotbar'), held: $('#held'),
      phase: $('#phase'), phaseTitle: $('#phase .title'), phaseSub: $('#phase .sub'), heartBar: $('#heart-bar div'), heartText: $('#heart-bar span'),
      banner: $('#banner'), buildHint: $('#build-hint'), hurt: $('#hurt'), dead: $('#dead'), deadT: $('#dead span'),
      over: $('#gameover'), overStats: $('#gameover .stats'),
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
    this.buildHotbar();
    this.buildSatchel();
    setTimeout(() => this.el.hint.classList.add('hidden'), 45000);
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
    const w = this.el.compass.clientWidth;
    const span = 100 * DEG;
    const place = (e, a) => {
      const d = angleDelta(heading, a);
      if (Math.abs(d) > span) {
        e.style.display = 'none';
        return d;
      }
      e.style.display = '';
      e.style.left = `${w / 2 + (d / span) * (w / 2)}px`;
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
    const show = (key, x, z, icon, label, cls = '') => {
      const dx = x - player.x, dz = z - player.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 6) return;
      seen.add(key);
      let e = this.poiEls.get(key);
      if (!e) {
        e = document.createElement('div');
        this.el.strip.appendChild(e);
        this.poiEls.set(key, e);
      }
      e.className = `poi ${cls}`;
      e.innerHTML = `${icon}<small>${label} ${Math.round(dist)}m</small>`;
      const d = place(e, Math.atan2(dx, -dz));
      e.classList.toggle('side', Math.abs(d) > 0.3);
      return e;
    };
    for (const m of this.markers) show(m.key, m.x, m.z, m.icon, m.label, m.cls);
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
      }
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
      c.fillStyle = b.def.kind === 'wall' ? '#c8a060' : '#f0d070';
      c.fillRect(px - 5, pz - 5, 10, 10);
    }
    for (const e of extra.enemies || []) {
      if (e.dying) continue;
      const [px, pz] = toMap(e.pos.x, e.pos.z);
      if (!inside(px, pz, 4)) continue;
      c.fillStyle = '#d070ff';
      c.beginPath();
      c.arc(px, pz, e.type === 'rotboar' ? 8 : 5, 0, Math.PI * 2);
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
      c.fillStyle = m.cls === 'rift' ? '#d070ff' : '#8affb0';
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

  prompt(label, progress = 0, key = 'E') {
    const p = this.el.prompt;
    if (!label) {
      p.classList.remove('show');
      this.el.cross.classList.remove('hot');
      return;
    }
    p.classList.add('show');
    this.el.cross.classList.add('hot');
    if (this.el.promptLabel.textContent !== label) this.el.promptLabel.textContent = label;
    if (this.el.promptKey.textContent !== key) this.el.promptKey.textContent = key;
    this.el.promptFill.style.strokeDashoffset = String(100.5 * (1 - progress));
  }

  toast(id, n = 1, note) {
    const def = ITEMS[id];
    const r = RARITY[def.rarity];
    const t = document.createElement('div');
    t.className = 'toast';
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

  banner(title, sub) {
    const b = this.el.banner;
    b.querySelector('b').textContent = title;
    b.querySelector('span').textContent = sub;
    b.classList.remove('show');
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

  gameOver({ nights, kills }) {
    this.el.overStats.innerHTML = `You held the Heartwood for <b>${nights}</b> night${nights === 1 ? '' : 's'} and felled <b>${kills}</b> Blight.`;
    this.el.over.classList.remove('hidden');
  }

  stats() {
    this.renderHotbar();
    if (this.inventoryOpen) this.renderInventory();
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
      sub = w.skipping ? 'Night is falling…' : `Gather & build · dusk in ${fmtTime(w.dayLeft)}`;
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
    this.el.heartBar.style.width = `${(s.base.hp / s.base.maxHp) * 100}%`;
    this.el.heartText.textContent = `${Math.ceil(s.base.hp)} / ${s.base.maxHp}`;
    this.el.phase.classList.toggle('hurt', s.base.flash > 0.2);

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
    const label = h ? ITEMS[h.id].name + (ITEMS[h.id].kind === 'build' ? ' · LMB to place' : ITEMS[h.id].kind === 'use' ? ' · RMB to use' : '') : 'Machete';
    if (this.el.held.textContent !== label) {
      this.el.held.textContent = label;
      this.el.held.classList.remove('flash');
      void this.el.held.offsetWidth;
      this.el.held.classList.add('flash');
    }
  }

  // ------------------------------------------------------------- satchel

  get inventoryOpen() {
    return !this.el.inv.classList.contains('hidden');
  }

  toggleInventory(on = !this.inventoryOpen) {
    this.el.inv.classList.toggle('hidden', !on);
    this.carry = null;
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
    // recipes
    this.recipeEls = RECIPES.map((r) => {
      const card = document.createElement('div');
      card.className = 'recipe';
      card.innerHTML = `<img class="out" alt=""><div class="body"><div class="name"></div><div class="needs"></div></div><button>Craft</button>`;
      card.querySelector('button').addEventListener('click', () => this.onCraft?.(r));
      card.addEventListener('mouseenter', () => this.detail(r.out));
      this.el.recipes.appendChild(card);
      return { r, card };
    });
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
      card.querySelector('.name').textContent = def.name;
      card.querySelector('.needs').innerHTML = Object.entries(r.needs).map(([id, n]) => {
        const have = this.inv.count(id);
        return `<span class="${have >= n ? 'have' : 'miss'}" title="${ITEMS[id].name}"><img src="${this.icons[id] || ''}">${Math.min(have, n)}/${n}</span>`;
      }).join('');
      card.querySelector('button').disabled = !ok;
    }
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
      <div class="val">Carrying <b>${have}</b></div></div>`;
  }
}
