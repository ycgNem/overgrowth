// The journal: what to do next. On a first run it walks you through day one (forage, cut,
// place the tower, craft, set traps, call the night); after that it keeps a few optional
// goals that point at systems you haven't touched yet (upgrades, the slingshot, boons).
// Systems report what happened through `event(name, detail)`. A goal with `after` waits until
// that kind of Blight has come (`meet`), then goes to the top: it's the answer to it.
const TUTORIAL = [
  { id: 'forage', need: 3, text: (n) => `Pick up things from the forest floor: look down and tap <kbd>E</kbd> (${n}/3)` },
  { id: 'cut', need: 6, text: (n) => `Hack through plants with the machete <kbd>LMB</kbd> (${n}/6)` },
  { id: 'tower', need: 1, text: () => 'Place your <b>Bow Tower</b> in the clearing: pick it on the belt <kbd>1</kbd>–<kbd>8</kbd>, then <kbd>LMB</kbd>' },
  { id: 'trap', need: 1, text: () => 'Set a <b>Spike Trap</b> on the path from a rift <span class="rift">✶</span>' },
  { id: 'craft', need: 1, text: () => 'Open the satchel <kbd>Tab</kbd> and craft something' },
  { id: 'night', need: 1, text: () => 'Ready? Hold <kbd>E</kbd> at the Heartwood to call the night, or wait for dusk' },
];

const GOALS = [
  { id: 'lantern', after: 'burrower', text: 'Raise a <b>Glowcap Lantern</b> by your walls: its light drags Burrowers up' },
  { id: 'spitter', after: 'spitter', text: 'Fell a <b>Spitter</b> with the machete: they burst up close' },
  { id: 'bloom', text: 'Cut down a <b>Blight Bloom</b> <span class="rift">✺</span> before dusk, or the Blight comes through it' },
  { id: 'sling', text: 'Craft a <b>Slingshot</b> (sticks, a vine, fibre): stones are its ammo' },
  { id: 'upgrade', text: 'Upgrade a tower: hold <kbd>E</kbd> on it' },
  { id: 'offer', text: 'Offer a relic at the Heartwood to earn a <b>boon</b>' },
  { id: 'brazier', text: 'Build an <b>Ember Brazier</b>: fire lights the night and burns wisps' },
  { id: 'mortar', text: 'Build a <b>Spore Mortar</b> for the packs (mushrooms, clay, resin)' },
];

export class Journal {
  constructor(hud) {
    this.hud = hud;
    this.step = 0;
    this.count = 0;
    this.goals = new Set();
    this.met = new Set(); // kinds of Blight that have come at least once
    this.tutorial = true;
    this.dirty = true;
  }

  state() {
    return { step: this.step, count: this.count, goals: [...this.goals], met: [...this.met], tutorial: this.tutorial };
  }

  restore(s) {
    if (!s) return;
    this.step = s.step ?? this.step;
    this.count = s.count ?? 0;
    this.goals = new Set(s.goals || []);
    this.met = new Set(s.met || []);
    this.tutorial = s.tutorial ?? false;
    this.dirty = true;
  }

  skipTutorial() {
    this.tutorial = false;
    this.step = TUTORIAL.length;
    this.dirty = true;
  }

  // the kinds of Blight in tonight's wave
  meet(types) {
    for (const t of types) if (!this.met.has(t)) {
      this.met.add(t);
      this.dirty = true;
    }
  }

  event(name, detail) {
    // optional goals tick off whenever they happen
    const place = { ember_brazier: 'brazier', spore_mortar: 'mortar', glow_lantern: 'lantern' };
    const map = { craft: detail === 'slingshot' ? 'sling' : null, upgrade: 'upgrade', offer: 'offer', bloom: 'bloom', place: place[detail], melee: detail === 'spitter' ? 'spitter' : null };
    const g = map[name];
    if (g && !this.goals.has(g)) {
      this.goals.add(g);
      this.dirty = true;
    }
    if (!this.tutorial) return;
    const s = TUTORIAL[this.step];
    if (!s) return;
    let hit = false;
    if (s.id === 'forage' && name === 'forage') hit = true;
    if (s.id === 'cut' && name === 'cut') hit = true;
    if (s.id === 'tower' && name === 'place' && /tower|mortar|totem|brazier/.test(detail)) hit = true;
    if (s.id === 'trap' && name === 'place' && /trap|snare|barricade/.test(detail)) hit = true;
    if (s.id === 'craft' && name === 'craft') hit = true;
    if (s.id === 'night' && name === 'night') hit = true;
    // starting the night ends the tutorial whatever step you were on
    if (name === 'night') {
      this.tutorial = false;
      this.step = TUTORIAL.length;
      this.dirty = true;
      return;
    }
    if (!hit) return;
    this.count += typeof hit === 'number' ? hit : 1;
    if (this.count >= s.need) {
      this.step++;
      this.count = 0;
      this.hud.journalTick?.();
    }
    this.dirty = true;
  }

  // lines for the HUD: [{ html, done, main }]
  lines(phase) {
    if (phase === 'night' || phase === 'over') return [];
    if (this.tutorial && this.step < TUTORIAL.length) {
      const s = TUTORIAL[this.step];
      const prev = TUTORIAL[this.step - 1];
      const out = [];
      if (prev) out.push({ html: prev.text(prev.need), done: true });
      out.push({ html: s.text(this.count), main: true });
      return out;
    }
    return GOALS.filter((g) => !this.goals.has(g.id) && (!g.after || this.met.has(g.after))).slice(0, 2).map((g) => ({ html: g.text }));
  }
}
