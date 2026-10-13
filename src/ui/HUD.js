// DOM heads-up display: compass, minimap, prompts, toasts, inventory.
import { ITEMS, ITEM_IDS, RARITY } from '../items/ItemDB.js';
import { POI_INFO, poisAround } from '../world/poi/POI.js';
import { terrainHeight, jungleDensity, CHUNK_SIZE } from '../world/WorldGen.js';
import { angleDelta } from '../utils/math.js';

const $ = (s) => document.querySelector(s);
const DEG = Math.PI / 180;

export class HUD {
  constructor(inventory) {
    this.inv = inventory;
    this.icons = {};
    this.el = {
      hud: $('#hud'), strip: $('#compass-strip'), compass: $('#compass'), map: $('#minimap'),
      clock: $('#clock'), prompt: $('#prompt'), promptLabel: $('#prompt .label'), promptFill: $('#prompt .fill'),
      cross: $('#crosshair'), toasts: $('#toasts'), count: $('#stat-count'), value: $('#stat-value'),
      stamina: $('#stamina'), staminaBar: $('#stamina div'), discover: $('#discover'), fps: $('#fps'),
      inv: $('#inventory'), grid: $('#inv-grid'), detail: $('#inv-detail'), total: $('#inv-total'),
      coll: $('#inv-collection'), underwater: $('#underwater'), hint: $('#hint'),
    };
    this.mapCtx = this.el.map.getContext('2d');
    this.mapBase = document.createElement('canvas');
    this.mapBase.width = this.mapBase.height = 120;
    this.mapCenter = { x: NaN, z: NaN };
    this.mapRange = 260; // metres across the minimap
    this.buildCompass();
    this.poiEls = new Map();
    this.discovered = new Set();
    this.fpsAcc = { t: 0, n: 0 };
    setTimeout(() => this.el.hint.classList.add('hidden'), 30000);
  }

  setIcons(icons) {
    this.icons = icons;
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

    // Points of interest within ~600m, including undiscovered temples.
    const cx = Math.floor(player.x / CHUNK_SIZE), cz = Math.floor(player.z / CHUNK_SIZE);
    const ck = `${cx},${cz}`;
    if (this.poiListKey !== ck) {
      // Scan outward gradually: specs are cached once computed.
      this.poiListKey = ck;
      this.poiList = poisAround(cx, cz, 9);
    }
    const seen = new Set();
    for (const s of this.poiList) {
      const dx = s.x - player.x, dz = s.z - player.z;
      const dist = Math.hypot(dx, dz);
      const isTemple = s.type === 'temple';
      if (!isTemple && dist > 220) continue;
      if (dist < 6) continue;
      seen.add(s.key);
      let e = this.poiEls.get(s.key);
      if (!e) {
        e = document.createElement('div');
        e.className = 'poi';
        this.el.strip.appendChild(e);
        this.poiEls.set(s.key, e);
      }
      const known = this.discovered.has(s.key);
      const label = known || isTemple ? POI_INFO[s.type].label : '?';
      e.innerHTML = `${POI_INFO[s.type].icon}<small>${label} ${Math.round(dist)}m</small>`;
      e.classList.toggle('done', done.has(s.key));
      const d = place(e, Math.atan2(dx, -dz));
      e.classList.toggle('side', Math.abs(d) > 0.3);
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

  updateMinimap(player, heading, force) {
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
    // POIs
    const cx = Math.floor(player.x / CHUNK_SIZE), cz = Math.floor(player.z / CHUNK_SIZE);
    c.font = 'bold 26px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const s of poisAround(cx, cz, 3)) {
      const px = S / 2 + (s.x - player.x) * k, pz = S / 2 + (s.z - player.z) * k;
      if ((px - S / 2) ** 2 + (pz - S / 2) ** 2 > (S / 2 - 12) ** 2) continue;
      const known = this.discovered.has(s.key);
      c.fillStyle = known ? '#f3d27a' : 'rgba(243,234,210,0.75)';
      c.shadowColor = 'rgba(0,0,0,0.9)';
      c.shadowBlur = 6;
      c.fillText(known ? POI_INFO[s.type].icon : '?', px, pz);
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

  prompt(label, progress = 0) {
    const p = this.el.prompt;
    if (!label) {
      p.classList.remove('show');
      this.el.cross.classList.remove('hot');
      return;
    }
    p.classList.add('show');
    this.el.cross.classList.add('hot');
    if (this.el.promptLabel.textContent !== label) this.el.promptLabel.textContent = label;
    this.el.promptFill.style.strokeDashoffset = String(100.5 * (1 - progress));
  }

  toast(id) {
    const def = ITEMS[id];
    const r = RARITY[def.rarity];
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.setProperty('--rc', r.color);
    t.innerHTML = `<img src="${this.icons[id] || ''}"><div><div class="n">${def.name}</div><div class="r">${r.name} · ${def.value} value</div></div>`;
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

  stats() {
    this.el.count.textContent = this.inv.total;
    this.el.value.textContent = this.inv.value;
  }

  frame(dt, { player, heading, stamina, clock, underwater, done }) {
    this.updateCompass(heading, player, done);
    this.updateMinimap(player, heading);
    this.el.clock.textContent = clock;
    this.el.staminaBar.style.width = `${stamina * 100}%`;
    this.el.stamina.classList.toggle('low', stamina < 0.25);
    this.el.stamina.style.opacity = stamina > 0.99 ? '0.35' : '1';
    this.el.underwater.style.opacity = underwater ? '1' : '0';
    this.fpsAcc.t += dt;
    this.fpsAcc.n++;
    if (this.fpsAcc.t > 0.5) {
      this.el.fps.textContent = `${Math.round(this.fpsAcc.n / this.fpsAcc.t)} fps`;
      this.fpsAcc.t = this.fpsAcc.n = 0;
    }
  }

  // ------------------------------------------------------------ inventory

  get inventoryOpen() {
    return !this.el.inv.classList.contains('hidden');
  }

  toggleInventory(on = !this.inventoryOpen) {
    this.el.inv.classList.toggle('hidden', !on);
    if (on) this.renderInventory();
  }

  renderInventory() {
    const g = this.el.grid;
    g.innerHTML = '';
    const ids = [...ITEM_IDS].sort((a, b) => {
      const ka = this.inv.counts.has(a) ? 0 : 1, kb = this.inv.counts.has(b) ? 0 : 1;
      return ka - kb || RARITY[ITEMS[b].rarity].order - RARITY[ITEMS[a].rarity].order;
    });
    for (const id of ids) {
      const def = ITEMS[id];
      const have = this.inv.counts.get(id) || 0;
      const s = document.createElement('div');
      s.className = `slot${have ? '' : ' unknown'}`;
      s.style.setProperty('--rc', RARITY[def.rarity].color);
      s.innerHTML = `<img src="${this.icons[id] || ''}">${have ? `<span class="count">${have}</span>` : ''}`;
      s.addEventListener('mouseenter', () => this.detail(id, have));
      g.appendChild(s);
    }
    this.el.total.textContent = this.inv.value;
    this.el.coll.textContent = `${this.inv.discovered}/${ITEM_IDS.length}`;
  }

  detail(id, have) {
    const def = ITEMS[id];
    const r = RARITY[def.rarity];
    if (!have) {
      this.el.detail.innerHTML = `<div class="detail-empty">Undiscovered ${r.name.toLowerCase()} item.<br>Keep exploring…</div>`;
      return;
    }
    this.el.detail.innerHTML = `
      <img src="${this.icons[id]}">
      <h3>${def.name}</h3>
      <div class="rar" style="color:${r.color}">${r.name}</div>
      <p>${def.desc}</p>
      <div class="val">Value <b>${def.value}</b> · Owned <b>${have}</b> · Total <b>${def.value * have}</b></div>`;
  }
}
