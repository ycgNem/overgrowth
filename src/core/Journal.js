// The journal: what to do next. On a first run it walks you through day one (forage, cut,
// place the tower, craft, set traps, call the night); after that it keeps a few optional
// goals that point at systems you haven't touched yet (upgrades, the slingshot, boons).
// Systems report what happened through `event(name, detail)`.
const TUTORIAL = [
  { id: 'forage', need: 3, text: (n) => `Pick up things from the forest floor: look down and tap <kbd>E</kbd> (${n}/3)` },
  { id: 'cut', need: 6, text: (n) => `Hack through plants with the machete <kbd>LMB</kbd> (${n}/6)` },
  { id: 'tower', need: 1, text: () => 'Place your <b>Bow Tower</b> in the clearing: pick it on the belt <kbd>1</kbd>–<kbd>8</kbd>, then <kbd>LMB</kbd>' },
  { id: 'trap', need: 1, text: () => 'Set a <b>Spike Trap</b> on the path from a rift <span class="rift">✶</span>' },
  { id: 'craft', need: 1, text: () => 'Open the satchel <kbd>Tab</kbd> and craft something' },
  { id: 'night', need: 1, text: () => 'Ready? Hold <kbd>E</kbd> at the Heartwood to call the night, or wait for dusk' },
];

const GOALS = [
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
    this.tutorial = true;
    this.dirty = true;
  }

  state() {
    return { step: this.step, count: this.count, goals: [...this.goals], tutorial: this.tutorial };
  }

  restore(s) {
    if (!s) return;
    this.step = s.step ?? this.step;
    this.count = s.count ?? 0;
    this.goals = new Set(s.goals || []);
    this.tutorial = s.tutorial ?? false;
    this.dirty = true;
  }

  skipTutorial() {
    this.tutorial = false;
    this.step = TUTORIAL.length;
    this.dirty = true;
  }

  event(name, detail) {
    // optional goals tick off whenever they happen
    const map = { craft: detail === 'slingshot' ? 'sling' : null, upgrade: 'upgrade', offer: 'offer', bloom: 'bloom', place: detail === 'ember_brazier' ? 'brazier' : detail === 'spore_mortar' ? 'mortar' : null };
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
    return GOALS.filter((g) => !this.goals.has(g.id)).slice(0, 2).map((g) => ({ html: g.text }));
  }
}
