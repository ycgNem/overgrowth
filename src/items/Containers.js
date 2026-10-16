// Containers you search: supply crates, packs, lockers, urns, root caches, altars, a lost
// satchel. What's inside is rolled the first time one is opened and kept (and saved), so you
// can leave things in a crate and come back for them. Opened by searching, the contents show
// as question marks and turn up one at a time, the rarer the slower; smashed open, they spill
// out onto the ground all at once, but fragile things may have broken.
import { Inventory } from './Inventory.js';
import { ITEMS, rollLoot, FRAGILE } from './ItemDB.js';

// seconds to turn up one item, by rarity
export const REVEAL = { common: 0.6, uncommon: 0.9, rare: 1.4, epic: 2.0, legendary: 2.6 };

const box = (n) => new Inventory({ hotbar: 0, pack: n, safe: 0, capacity: Infinity, packSize: n, safeSize: 0 });

export class Containers {
  constructor() {
    this.map = new Map(); // id -> { id, inv, hidden: Set, searching, prog }
    this.extra = null; // (interactable) => more item ids to put in (a torn page: core/Expedition.js)
  }

  has(id) {
    return this.map.has(id);
  }

  get(id) {
    return this.map.get(id);
  }

  // A container filled with these item ids (stacked), the slots hidden until searched.
  make(id, ids, size = 6, { hidden = true } = {}) {
    const inv = box(Math.max(size, 1));
    for (const item of ids) if (ITEMS[item]) inv.add(item, 1);
    const rec = { id, inv, hidden: new Set(), searching: null, prog: 0 };
    if (hidden) inv.slots.forEach((s, i) => { if (s) rec.hidden.add(i); });
    this.map.set(id, rec);
    return rec;
  }

  // Roll an interactable's loot table into a new container. smashed: everything shows at
  // once, and each fragile thing breaks half the time (returned as `broke`).
  roll(it, rand, { smashed = false, bonus = 0 } = {}) {
    let ids = rollLoot(it.loot, rand);
    if (this.extra) ids.push(...this.extra(it));
    if (bonus && rand() < bonus) ids.push(...rollLoot(it.loot, rand).slice(0, 1));
    // smashing it open shakes loose one more thing (the price is the noise and the breakage)
    if (smashed) ids.push(...rollLoot(it.loot, rand).slice(0, 1));
    const broke = [];
    if (smashed) {
      ids = ids.filter((id) => {
        if (FRAGILE.has(id) && rand() < 0.5) {
          broke.push(id);
          return false;
        }
        return true;
      });
    }
    // one empty slot past the finds, so there's room to leave something
    const size = Math.max(3, new Set(ids).size + 1);
    const rec = this.make(it.id, ids, size, { hidden: !smashed });
    rec.broke = broke;
    return rec;
  }

  // Search the open container for dt seconds: the next hidden slot fills in. Returns the slot
  // index that turned up this frame, or -1.
  search(rec, dt) {
    if (!rec.hidden.size) {
      rec.searching = null;
      return -1;
    }
    if (rec.searching === null || !rec.hidden.has(rec.searching)) {
      rec.searching = Math.min(...rec.hidden);
      rec.prog = 0;
    }
    const s = rec.inv.slots[rec.searching];
    const t = REVEAL[ITEMS[s?.id]?.rarity] ?? 0.3;
    rec.prog += dt / t;
    if (rec.prog < 1) return -1;
    const i = rec.searching;
    rec.hidden.delete(i);
    rec.searching = null;
    rec.prog = 0;
    return i;
  }

  empty(rec) {
    return rec.inv.slots.every((s) => !s);
  }

  // items left (counting the unsearched)
  left(rec) {
    return rec.inv.slots.filter(Boolean).length;
  }

  forget(id) {
    this.map.delete(id);
  }

  state() {
    const out = {};
    for (const [id, r] of this.map) out[id] = [r.inv.slots.length, r.inv.state(), [...r.hidden]];
    return out;
  }

  restore(d) {
    this.map.clear();
    for (const [id, [n, slots, hidden]] of Object.entries(d || {})) {
      const inv = box(n);
      inv.restore(slots);
      this.map.set(id, { id, inv, hidden: new Set(hidden), searching: null, prog: 0 });
    }
  }
}
