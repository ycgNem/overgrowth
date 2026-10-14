// What the player is carrying: 8 hotbar slots + 24 pack slots of stacks, plus a log of
// every item ever found (the collection page).
import { ITEMS, stackOf } from './ItemDB.js';

export const HOTBAR = 8;
export const PACK = 24;

export class Inventory {
  constructor() {
    this.slots = Array.from({ length: HOTBAR + PACK }, () => null); // { id, n }
    this.selected = 0;
    this.found = new Set();
    this.onChange = null;
    this.onOverflow = null; // (id, n) for anything that didn't fit after crafting
  }

  changed(id) {
    this.onChange?.(id);
  }

  // Adds as many as fit (topping up stacks first). Returns how many did NOT fit.
  add(id, n = 1) {
    this.found.add(id);
    const max = stackOf(id);
    for (const s of this.slots) {
      if (n <= 0) break;
      if (s && s.id === id && s.n < max) {
        const k = Math.min(n, max - s.n);
        s.n += k;
        n -= k;
      }
    }
    // new stacks: buildables, consumables and weapons prefer the hotbar, materials the pack
    const preferHotbar = ['build', 'use', 'tool'].includes(ITEMS[id].kind);
    const order = preferHotbar
      ? [...this.slots.keys()]
      : [...this.slots.keys()].slice(HOTBAR).concat([...this.slots.keys()].slice(0, HOTBAR));
    for (const i of order) {
      if (n <= 0) break;
      if (!this.slots[i]) {
        const k = Math.min(n, max);
        this.slots[i] = { id, n: k };
        n -= k;
      }
    }
    this.changed(id);
    return n;
  }

  count(id) {
    let c = 0;
    for (const s of this.slots) if (s && s.id === id) c += s.n;
    return c;
  }

  // Removes up to n (pack first, so the hotbar keeps its stacks). Returns how many were removed.
  remove(id, n = 1) {
    let left = n;
    const order = [...this.slots.keys()].slice(HOTBAR).concat([...this.slots.keys()].slice(0, HOTBAR).reverse());
    for (const i of order) {
      const s = this.slots[i];
      if (left <= 0) break;
      if (s && s.id === id) {
        const k = Math.min(left, s.n);
        s.n -= k;
        left -= k;
        if (s.n <= 0) this.slots[i] = null;
      }
    }
    if (left !== n) this.changed(id);
    return n - left;
  }

  canAfford(needs) {
    return Object.entries(needs).every(([id, n]) => this.count(id) >= n);
  }

  // Crafts one recipe if affordable and the result fits. Returns true on success.
  craft(recipe) {
    if (!this.canAfford(recipe.needs)) return false;
    if (!this.fits(recipe.out, recipe.n, recipe.needs)) return false;
    for (const [id, n] of Object.entries(recipe.needs)) this.remove(id, n);
    const left = this.add(recipe.out, recipe.n);
    if (left > 0) this.onOverflow?.(recipe.out, left);
    return true;
  }

  // Would n of id fit, assuming `freed` ingredients are taken out first?
  fits(id, n, freed = {}) {
    const max = stackOf(id);
    let room = 0;
    const counts = new Map();
    for (const s of this.slots) if (s) counts.set(s.id, (counts.get(s.id) || 0) + s.n);
    for (const [fid, fn] of Object.entries(freed)) counts.set(fid, (counts.get(fid) || 0) - fn);
    // slots needed after removal, per id
    let used = 0;
    for (const [cid, c] of counts) if (c > 0) used += Math.ceil(c / stackOf(cid));
    const have = counts.get(id) || 0;
    const slotsForId = have > 0 ? Math.ceil(have / max) : 0;
    room += slotsForId * max - Math.max(0, have);
    room += (this.slots.length - used) * max;
    return room >= n;
  }

  swap(a, b) {
    [this.slots[a], this.slots[b]] = [this.slots[b], this.slots[a]];
    this.changed();
  }

  // Move a stack between two slots, merging when they hold the same item.
  move(from, to) {
    const a = this.slots[from], b = this.slots[to];
    if (!a || from === to) return;
    if (b && b.id === a.id) {
      const k = Math.min(a.n, stackOf(a.id) - b.n);
      b.n += k;
      a.n -= k;
      if (a.n <= 0) this.slots[from] = null;
      this.changed();
      return;
    }
    this.swap(from, to);
  }

  get held() {
    return this.slots[this.selected];
  }

  select(i) {
    this.selected = ((i % HOTBAR) + HOTBAR) % HOTBAR;
    this.changed();
  }

  // Total value of relics carried (offered at the Heartwood).
  get relicValue() {
    let v = 0;
    for (const s of this.slots) if (s && ITEMS[s.id].kind === 'relic') v += ITEMS[s.id].value * s.n;
    return v;
  }

  get used() {
    return this.slots.filter(Boolean).length;
  }
}
