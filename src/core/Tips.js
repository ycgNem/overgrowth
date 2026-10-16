// Tips told once, ever: the guided first night, and a word the first time something new turns up
// (an elite, a heavy pack, the Heartwood bitten). Remembered across runs.
const KEY = 'og.tips';

export class Tips {
  constructor(hud) {
    this.hud = hud;
    try {
      this.seen = new Set(JSON.parse(localStorage.getItem(KEY) || '[]'));
    } catch {
      this.seen = new Set();
    }
    this.off = false; // (?debug runs and e2e: no tips)
  }

  // has this never been told?
  fresh(id) {
    return !this.off && !this.seen.has(id);
  }

  // tell it (after `delay` ms), once
  show(id, text, color = '#bfe8ff', delay = 0) {
    if (!this.fresh(id)) return false;
    this.seen.add(id);
    try {
      localStorage.setItem(KEY, JSON.stringify([...this.seen]));
    } catch {
      // storage blocked
    }
    setTimeout(() => this.hud.message(text, color), delay);
    return true;
  }
}
