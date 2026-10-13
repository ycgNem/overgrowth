// What the player is carrying, plus which items they've ever found.
import { ITEMS } from './ItemDB.js';

export class Inventory {
  constructor() {
    this.counts = new Map();
    this.onChange = null;
  }

  add(id, n = 1) {
    this.counts.set(id, (this.counts.get(id) || 0) + n);
    this.onChange?.(id);
  }

  get total() {
    let n = 0;
    for (const c of this.counts.values()) n += c;
    return n;
  }

  get value() {
    let v = 0;
    for (const [id, c] of this.counts) v += ITEMS[id].value * c;
    return v;
  }

  get discovered() {
    return this.counts.size;
  }
}
