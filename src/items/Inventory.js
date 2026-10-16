// What the player is carrying: 8 belt slots, the backpack's pack slots and its safe pouch, all
// stacks, plus a log of every item ever found (the collection page). Everything has a weight
// in kilograms and the backpack a capacity: past 70% of it you're laden, past 100% encumbered,
// and nothing more goes in past 130%. The safe pouch never drops when you fall.
//
// The Coffer at camp is the same class with no belt, no pouch and no weight limit.
import { ITEMS, stackOf, weightOf, PACKS } from './ItemDB.js';

export const HOTBAR = 8;
export const PACK_MAX = 20; // the biggest backpack's pack slots
export const SAFE_MAX = 2;
export const LADEN = 0.7, HARD_CAP = 1.3;
// what the belt holds: things you use in the hand. Materials, salvage and relics ride in the
// pack (and drop with it); the safe pouch keeps one of anything.
export const BELT_KINDS = new Set(['build', 'use', 'tool', 'gear']);

export class Inventory {
  // hotbar, pack, safe: slot counts (pack and safe are the most any backpack gives)
  constructor({ hotbar = HOTBAR, pack = PACK_MAX, safe = SAFE_MAX, capacity = 20, packSize = 16, safeSize = 1 } = {}) {
    this.hotbar = hotbar;
    this.packMax = pack;
    this.safeMax = safe;
    this.slots = Array.from({ length: hotbar + pack + safe }, () => null); // { id, n }
    this.packSize = Math.min(pack, packSize);
    this.safeSize = Math.min(safe, safeSize);
    this.capacity = capacity;
    this.packId = null;
    this.selected = 0;
    this.found = new Set();
    this.onChange = null;
    this.onOverflow = null; // (id, n) for anything that didn't fit after crafting
  }

  // ---- layout: [belt][pack ... packMax][safe ... safeMax]
  get packStart() {
    return this.hotbar;
  }

  get safeStart() {
    return this.hotbar + this.packMax;
  }

  isSafe(i) {
    return i >= this.safeStart;
  }

  // a slot the current backpack actually has
  usable(i) {
    if (i < this.hotbar) return true;
    if (i < this.safeStart) return i - this.hotbar < this.packSize;
    return i - this.safeStart < this.safeSize;
  }

  // Wear a backpack (ItemDB PACKS): its capacity, pack slots and safe pouch.
  setPack(id) {
    const p = PACKS[id];
    if (!p) return;
    this.packId = id;
    this.capacity = p.cap;
    this.packSize = Math.min(this.packMax, p.slots);
    this.safeSize = Math.min(this.safeMax, p.safe);
    this.changed();
  }

  changed(id) {
    this.onChange?.(id);
  }

  // ---- weight
  get weight() {
    let w = 0;
    for (const s of this.slots) if (s) w += weightOf(s.id) * s.n;
    return w;
  }

  get load() {
    return this.capacity === Infinity ? 0 : this.weight / this.capacity;
  }

  // 'light' | 'laden' | 'encumbered'
  get burden() {
    const l = this.load;
    return l > 1 ? 'encumbered' : l > LADEN ? 'laden' : 'light';
  }

  // could n more of id be carried without passing the hard cap?
  canCarry(id, n = 1) {
    return this.capacity === Infinity || this.weight + weightOf(id) * n <= this.capacity * HARD_CAP + 1e-6;
  }

  // how many more of id the weight limit allows
  weightRoom(id) {
    if (this.capacity === Infinity) return Infinity;
    const w = weightOf(id);
    return w <= 0 ? Infinity : Math.max(0, Math.floor((this.capacity * HARD_CAP - this.weight + 1e-6) / w));
  }

  // how many of id would go in (slots and weight both)
  room(id, n = Infinity) {
    return Math.max(0, Math.min(n, this.slotRoom(id), this.weightRoom(id)));
  }

  takeable(id, n = 1) {
    return this.room(id, n) >= n;
  }

  // ---- stacks

  // the most of id slot i may hold: 0 on the belt for anything not used in the hand, 1 in the
  // safe pouch, a full stack anywhere else
  cap(i, id) {
    if (!this.usable(i)) return 0;
    if (i < this.hotbar) return BELT_KINDS.has(ITEMS[id].kind) ? stackOf(id) : 0;
    if (this.isSafe(i)) return 1;
    return stackOf(id);
  }

  // slot order new stacks of an item go into: the belt first for things you use, then the pack;
  // never the safe pouch (that's placed by hand)
  order(id) {
    const pack = [];
    for (let i = this.packStart; i < this.packStart + this.packSize; i++) pack.push(i);
    if (!BELT_KINDS.has(ITEMS[id].kind)) return pack;
    return [...Array(this.hotbar).keys()].concat(pack);
  }

  // Adds as many as fit (topping up stacks first). Returns how many did NOT fit.
  add(id, n = 1) {
    this.found.add(id);
    const max = stackOf(id);
    this.slots.forEach((s, i) => {
      if (n <= 0 || !s || s.id !== id || this.isSafe(i) || s.n >= this.cap(i, id)) return;
      const k = Math.min(n, this.cap(i, id) - s.n);
      s.n += k;
      n -= k;
    });
    for (const i of this.order(id)) {
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

  // Removes up to n: pack first, then the belt from its end, the safe pouch last. Returns how
  // many were removed.
  remove(id, n = 1) {
    let left = n;
    const idx = [...this.slots.keys()];
    const order = idx.slice(this.packStart, this.safeStart)
      .concat(idx.slice(0, this.hotbar).reverse(), idx.slice(this.safeStart));
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
    return craftFrom(recipe, [this], this);
  }

  // free slot room for id in the slots it may go in (the pouch is placed by hand), with
  // `freed` ingredients taken out first
  slotRoom(id, freed = {}) {
    const max = stackOf(id);
    const left = { ...freed };
    let room = 0;
    for (const i of this.order(id)) {
      const s = this.slots[i];
      if (!s) {
        room += max;
        continue;
      }
      let n = s.n;
      if (left[s.id] > 0) {
        const k = Math.min(n, left[s.id]);
        n -= k;
        left[s.id] -= k;
      }
      if (n <= 0) room += max;
      else if (s.id === id) room += Math.max(0, max - n);
    }
    return room;
  }

  // Would n of id fit (slots only), assuming `freed` ingredients are taken out first?
  fits(id, n, freed = {}) {
    return this.slotRoom(id, freed) >= n;
  }

  swap(a, b) {
    [this.slots[a], this.slots[b]] = [this.slots[b], this.slots[a]];
    this.changed();
  }

  // Move a stack between two slots, merging when they hold the same item.
  move(from, to) {
    const a = this.slots[from], b = this.slots[to];
    if (!a || from === to || !this.cap(to, a.id)) return;
    // into the safe pouch goes one, the rest stays where it was
    if (this.isSafe(to) && !b && a.n > 1) {
      this.slots[to] = { id: a.id, n: 1 };
      a.n--;
      this.changed();
      return;
    }
    if (b && b.id === a.id) {
      const k = Math.min(a.n, this.cap(to, a.id) - b.n);
      if (k <= 0) return;
      b.n += k;
      a.n -= k;
      if (a.n <= 0) this.slots[from] = null;
      this.changed();
      return;
    }
    // a swap must suit both slots
    if (b && (b.n > this.cap(from, b.id) || a.n > this.cap(to, a.id))) return;
    this.swap(from, to);
  }

  get held() {
    return this.slots[this.selected];
  }

  select(i) {
    this.selected = ((i % this.hotbar) + this.hotbar) % this.hotbar;
    this.changed();
  }

  // Total value of relics carried (offered at the Heartwood).
  get relicValue() {
    let v = 0;
    for (const s of this.slots) if (s && ITEMS[s.id].kind === 'relic') v += ITEMS[s.id].value * s.n;
    return v;
  }

  get used() {
    return this.slots.filter((s, i) => s && this.usable(i) && !this.isSafe(i)).length;
  }

  get size() {
    return this.hotbar + this.packSize;
  }

  // the stacks as [id, n] pairs (or null) for a save
  state() {
    return this.slots.map((s) => (s ? [s.id, s.n] : null));
  }

  // Put a saved layout back. Returns the stacks that had nowhere to go (an older, bigger
  // satchel), for the caller to stash.
  restore(list) {
    this.slots.fill(null);
    const spill = [];
    (list || []).forEach((s, i) => {
      if (!s || !ITEMS[s[0]]) return;
      if (i < this.slots.length && !this.slots[i] && s[1] <= this.cap(i, s[0])) this.slots[i] = { id: s[0], n: s[1] };
      else spill.push(s);
    });
    const out = [];
    for (const [id, n] of spill) {
      const left = this.add(id, n);
      if (left) out.push([id, left]);
    }
    this.changed();
    return out;
  }
}

// Several inventories read as one for crafting (at camp: the Coffer, then the satchel).
export class Sources {
  constructor(list) {
    this.list = list;
  }

  count(id) {
    return this.list.reduce((s, inv) => s + inv.count(id), 0);
  }

  canAfford(needs) {
    return Object.entries(needs).every(([id, n]) => this.count(id) >= n);
  }

  remove(id, n) {
    let left = n;
    for (const inv of this.list) {
      if (left <= 0) break;
      left -= inv.remove(id, left);
    }
    return n - left;
  }
}

// Craft one recipe from these sources into dest. A result that won't fit (slots or weight)
// goes to dest.onOverflow. Returns true on success.
export function craftFrom(recipe, sources, dest) {
  const src = sources instanceof Sources ? sources : new Sources(sources);
  if (!src.canAfford(recipe.needs)) return false;
  // crafting from the satchel alone must leave room for the result
  if (src.list.length === 1 && src.list[0] === dest && !dest.fits(recipe.out, recipe.n, recipe.needs)) return false;
  for (const [id, n] of Object.entries(recipe.needs)) src.remove(id, n);
  const k = dest.room(recipe.out, recipe.n);
  const left = recipe.n - k + dest.add(recipe.out, k);
  if (left > 0) dest.onOverflow?.(recipe.out, left);
  return true;
}

// Move the stack in a.slots[i] into b: into slot j if it's free or holds the same item,
// otherwise wherever b puts it. Only as many as b has room for (slots and weight). Returns how
// many moved.
export function transfer(a, i, b, j = null) {
  const s = a.slots[i];
  if (!s) return 0;
  if (a === b) {
    if (j !== null) a.move(i, j);
    return 0;
  }
  let k = Math.min(s.n, b.weightRoom(s.id));
  if (k <= 0) return 0;
  const t = j !== null && b.cap(j, s.id) ? b.slots[j] : undefined;
  if (j !== null && b.cap(j, s.id) && (!t || t.id === s.id)) {
    const max = b.cap(j, s.id);
    k = Math.min(k, t ? max - t.n : max);
    if (k <= 0) return 0;
    if (t) t.n += k;
    else b.slots[j] = { id: s.id, n: k };
    b.found.add(s.id);
    b.changed(s.id);
  } else {
    k = Math.min(k, b.slotRoom(s.id));
    if (k <= 0) return 0;
    k -= b.add(s.id, k);
  }
  s.n -= k;
  if (s.n <= 0) a.slots[i] = null;
  a.changed(s.id);
  return k;
}
