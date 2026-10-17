// What the player is carrying: 8 belt slots, the backpack's pack slots and its safe pouch, all
// stacks, plus a log of every item ever found (the collection page). Everything has a weight
// in kilograms and the backpack a capacity: past 70% of it you're laden, past 100% encumbered,
// and nothing more goes in past 130%. The safe pouch never drops when you fall.
//
// The Coffer at camp is the same class with no belt, no pouch and no weight limit.
import { ITEMS, stackOf, weightOf, PACKS } from './ItemDB.ts';

export const HOTBAR = 8;
export const PACK_MAX = 20; // the biggest backpack's pack slots
export const SAFE_MAX = 2;
export const LADEN = 0.7, HARD_CAP = 1.3;
// the things you use in the hand: they go on the belt first. Anything else can sit on the belt
// too (set there by hand, or when the pack is full), and only the pack drops when you fall;
// the safe pouch keeps one of anything.
export const BELT_KINDS = new Set(['build', 'use', 'tool', 'gear']);

export interface Stack { id: string; n: number }
export type Slot = Stack | null;
export type SavedSlot = [string, number] | null;
export type Burden = 'light' | 'laden' | 'encumbered';
export interface Recipe { out: string; n: number; needs: Record<string, number> }
interface InventoryOptions { hotbar?: number; pack?: number; safe?: number; capacity?: number; packSize?: number; safeSize?: number }

export class Inventory {
  hotbar: number;
  packMax: number;
  safeMax: number;
  slots: Slot[];
  packSize: number;
  safeSize: number;
  capacity: number;
  packId: string | null;
  selected: number;
  found: Set<string>;
  onChange: ((id?: string) => void) | null;
  onOverflow: ((id: string, n: number) => void) | null; // for anything that didn't fit after crafting

  // hotbar, pack, safe: slot counts (pack and safe are the most any backpack gives)
  constructor({ hotbar = HOTBAR, pack = PACK_MAX, safe = SAFE_MAX, capacity = 25, packSize = 16, safeSize = 1 }: InventoryOptions = {}) {
    this.hotbar = hotbar;
    this.packMax = pack;
    this.safeMax = safe;
    this.slots = Array.from({ length: hotbar + pack + safe }, (): Slot => null);
    this.packSize = Math.min(pack, packSize);
    this.safeSize = Math.min(safe, safeSize);
    this.capacity = capacity;
    this.packId = null;
    this.selected = 0;
    this.found = new Set<string>();
    this.onChange = null;
    this.onOverflow = null;
  }

  // ---- layout: [belt][pack ... packMax][safe ... safeMax]
  get packStart() {
    return this.hotbar;
  }

  get safeStart() {
    return this.hotbar + this.packMax;
  }

  isSafe(i: number) {
    return i >= this.safeStart;
  }

  // a slot the current backpack actually has
  usable(i: number) {
    if (i < this.hotbar) return true;
    if (i < this.safeStart) return i - this.hotbar < this.packSize;
    return i - this.safeStart < this.safeSize;
  }

  // Wear a backpack (ItemDB PACKS): its capacity, pack slots and safe pouch.
  setPack(id: string) {
    const p = PACKS[id];
    if (!p) return;
    this.packId = id;
    this.capacity = p.cap;
    this.packSize = Math.min(this.packMax, p.slots);
    this.safeSize = Math.min(this.safeMax, p.safe);
    this.changed();
  }

  changed(id?: string) {
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

  get burden(): Burden {
    const l = this.load;
    return l > 1 ? 'encumbered' : l > LADEN ? 'laden' : 'light';
  }

  // could n more of id be carried without passing the hard cap?
  canCarry(id: string, n = 1) {
    return this.capacity === Infinity || this.weight + weightOf(id) * n <= this.capacity * HARD_CAP + 1e-6;
  }

  // how many more of id the weight limit allows
  weightRoom(id: string) {
    if (this.capacity === Infinity) return Infinity;
    const w = weightOf(id);
    return w <= 0 ? Infinity : Math.max(0, Math.floor((this.capacity * HARD_CAP - this.weight + 1e-6) / w));
  }

  // how many of id would go in (slots and weight both)
  room(id: string, n = Infinity) {
    return Math.max(0, Math.min(n, this.slotRoom(id), this.weightRoom(id)));
  }

  takeable(id: string, n = 1) {
    return this.room(id, n) >= n;
  }

  // ---- stacks

  // the most of id slot i may hold: 1 in the safe pouch, a full stack anywhere else
  cap(i: number, id: string) {
    if (!this.usable(i)) return 0;
    if (this.isSafe(i)) return 1;
    return stackOf(id);
  }

  // slot order new stacks of an item go into: the belt first for things you use, the pack first
  // for everything else (the belt once the pack is full); never the safe pouch (that's placed
  // by hand)
  order(id: string): number[] {
    const pack: number[] = [];
    for (let i = this.packStart; i < this.packStart + this.packSize; i++) pack.push(i);
    const belt = [...Array(this.hotbar).keys()];
    return BELT_KINDS.has(ITEMS[id].kind) ? belt.concat(pack) : pack.concat(belt);
  }

  // Adds as many as fit (topping up stacks first). Returns how many did NOT fit.
  add(id: string, n = 1) {
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

  count(id: string) {
    let c = 0;
    for (const s of this.slots) if (s && s.id === id) c += s.n;
    return c;
  }

  // Removes up to n: pack first, then the belt from its end, the safe pouch last. Returns how
  // many were removed.
  remove(id: string, n = 1) {
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

  canAfford(needs: Record<string, number>) {
    return Object.entries(needs).every(([id, n]) => this.count(id) >= n);
  }

  // Crafts one recipe if affordable and the result fits. Returns true on success.
  craft(recipe: Recipe) {
    return craftFrom(recipe, [this], this);
  }

  // free slot room for id in the slots it may go in (the pouch is placed by hand), with
  // `freed` ingredients taken out first
  slotRoom(id: string, freed: Record<string, number> = {}) {
    const max = stackOf(id);
    const left: Record<string, number> = { ...freed };
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
  fits(id: string, n: number, freed: Record<string, number> = {}) {
    return this.slotRoom(id, freed) >= n;
  }

  swap(a: number, b: number) {
    [this.slots[a], this.slots[b]] = [this.slots[b], this.slots[a]];
    this.changed();
  }

  // Move a stack between two slots, merging when they hold the same item.
  move(from: number, to: number) {
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

  // Move up to n from slot i into these slots of the same inventory: topping up stacks of the
  // same item first, then the first empty one. Returns how many moved.
  shift(i: number, targets: number[], n = Infinity) {
    const s = this.slots[i];
    if (!s) return 0;
    let left = Math.min(n, s.n);
    const id = s.id;
    for (const j of targets) {
      const t = this.slots[j];
      if (left <= 0) break;
      if (j === i || !t || t.id !== id) continue;
      const k = Math.min(left, this.cap(j, id) - t.n);
      if (k > 0) { t.n += k; left -= k; }
    }
    for (const j of targets) {
      if (left <= 0) break;
      if (j === i || this.slots[j] || !this.cap(j, id)) continue;
      const k = Math.min(left, this.cap(j, id));
      this.slots[j] = { id, n: k };
      left -= k;
    }
    const moved = Math.min(n, s.n) - left;
    s.n -= moved;
    if (s.n <= 0) this.slots[i] = null;
    if (moved) this.changed(id);
    return moved;
  }

  // the pack slots the current backpack has
  packSlots() {
    const out: number[] = [];
    for (let i = this.packStart; i < this.packStart + this.packSize; i++) out.push(i);
    return out;
  }

  // Tidy slots [from, to): stacks of the same item merged, then grouped by kind and name.
  sort(from = this.packStart, to = this.packStart + this.packSize) {
    const items: Stack[] = [];
    for (let i = from; i < to; i++) {
      const s = this.slots[i];
      if (!s || !this.usable(i)) continue;
      const same = items.find((t) => t.id === s.id && t.n < stackOf(s.id));
      let n = s.n;
      if (same) {
        const k = Math.min(n, stackOf(s.id) - same.n);
        same.n += k;
        n -= k;
      }
      if (n > 0) items.push({ id: s.id, n });
      this.slots[i] = null;
    }
    const KIND = ['build', 'use', 'tool', 'gear', 'pack', 'material', 'scrap', 'relic'];
    const rank = (id: string) => { const k = KIND.indexOf(ITEMS[id].kind); return k < 0 ? KIND.length : k; };
    items.sort((a, b) => rank(a.id) - rank(b.id) || ITEMS[a.id].name.localeCompare(ITEMS[b.id].name) || b.n - a.n);
    let i = from;
    for (const it of items) {
      while (i < to && !this.usable(i)) i++;
      this.slots[i++] = it;
    }
    this.changed();
  }

  get held(): Slot {
    return this.slots[this.selected];
  }

  select(i: number) {
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
  state(): SavedSlot[] {
    return this.slots.map((s): SavedSlot => (s ? [s.id, s.n] : null));
  }

  // Put a saved layout back. Returns the stacks that had nowhere to go (an older, bigger
  // satchel), for the caller to stash.
  restore(list: SavedSlot[] | null | undefined): [string, number][] {
    this.slots.fill(null);
    const spill: [string, number][] = [];
    (list || []).forEach((s, i) => {
      if (!s || !ITEMS[s[0]]) return;
      if (i < this.slots.length && !this.slots[i] && s[1] <= this.cap(i, s[0])) this.slots[i] = { id: s[0], n: s[1] };
      else spill.push(s);
    });
    const out: [string, number][] = [];
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
  list: Inventory[];

  constructor(list: Inventory[]) {
    this.list = list;
  }

  count(id: string) {
    return this.list.reduce((s, inv) => s + inv.count(id), 0);
  }

  canAfford(needs: Record<string, number>) {
    return Object.entries(needs).every(([id, n]) => this.count(id) >= n);
  }

  remove(id: string, n: number) {
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
export function craftFrom(recipe: Recipe, sources: Sources | Inventory[], dest: Inventory) {
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

// Trade whole stacks between a.slots[i] and b.slots[j] (different inventories), if each slot
// takes the other's stack and neither side goes over its weight limit. Returns whether it did.
export function swapAcross(a: Inventory, i: number, b: Inventory, j: number) {
  const s = a.slots[i], t = b.slots[j];
  if (!s || !t || a === b) return false;
  if (b.cap(j, s.id) < s.n || a.cap(i, t.id) < t.n) return false;
  const ws = weightOf(s.id) * s.n, wt = weightOf(t.id) * t.n;
  if (b.capacity !== Infinity && b.weight - wt + ws > b.capacity * HARD_CAP + 1e-6) return false;
  if (a.capacity !== Infinity && a.weight - ws + wt > a.capacity * HARD_CAP + 1e-6) return false;
  a.slots[i] = t;
  b.slots[j] = s;
  a.found.add(t.id);
  b.found.add(s.id);
  a.changed(t.id);
  b.changed(s.id);
  return true;
}

// Move the stack in a.slots[i] (or n of it) into b: into slot j if it's free or holds the same
// item, otherwise wherever b puts it. Only as many as b has room for (slots and weight).
// Returns how many moved.
export function transfer(a: Inventory, i: number, b: Inventory, j: number | null = null, n = Infinity) {
  const s = a.slots[i];
  if (!s) return 0;
  if (a === b) {
    if (j !== null) a.move(i, j);
    return 0;
  }
  let k = Math.min(s.n, n, b.weightRoom(s.id));
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
