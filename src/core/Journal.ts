// The journal: what to do next. On a first run it walks you through day one (forage, cut,
// chop a trunk, place the tower, set a trap, craft, store the haul, call the night); after that
// it keeps a few optional goals that point at systems you haven't touched yet (upgrades, the
// slingshot, boons). Every tutorial step counts whenever it happens, not only while it is the
// current one: do something early and its step is already ticked when the journal gets there.
// Systems report what happened through `event(name, detail)`. A goal with `after` waits until
// that kind of Blight has come (`meet`), then goes to the top: it's the answer to it.
interface Step { id: string; need: number; text: (n: number, has: (id: string) => boolean) => string }
interface Goal {
  id: string;
  text: string;
  when?: (flags: Set<string>) => boolean; // shown once the story has pointed at it
  after?: string; // shown once this kind of Blight has come
  owned?: string; // met by having one of this item
}
export interface JournalLine { html: string; done?: boolean; main?: boolean }
export interface JournalState { step: number; count: number; goals: string[]; met: string[]; flags: string[]; tutorial: boolean; tally?: Record<string, number> }
// what the journal needs from the HUD
interface JournalHud { journalTick?: () => void }

const TOWERS = ['bow_tower', 'spore_mortar', 'ember_brazier', 'tesla_totem'];
const TUTORIAL: Step[] = [
  { id: 'forage', need: 3, text: (n) => `Pick up things from the forest floor: look down and tap <kbd>E</kbd> (${n}/3)` },
  { id: 'cut', need: 6, text: (n) => `Hack through plants with the machete <kbd>LMB</kbd> (${n}/6)` },
  { id: 'trunk', need: 2, text: (n) => `Chop at a tree trunk or a rock for logs, bark and stone <kbd>LMB</kbd> (${n}/2)` },
  {
    id: 'tower', need: 1,
    text: (_n, has) => TOWERS.some(has)
      ? 'Place your <b>Bow Tower</b> near the Heartwood: it shoots the Blight at night. Pick it on the belt <kbd>1</kbd>–<kbd>8</kbd>, then <kbd>LMB</kbd>'
      : 'Craft a <b>Bramble Bow Tower</b> at camp (<kbd>Tab</kbd>) and place it near the Heartwood: it shoots the Blight at night',
  },
  { id: 'trap', need: 1, text: () => 'Set a <b>Spike Trap</b> on a path from a rift <span class="rift">✶</span>: the dotted lines on the map are where they will walk tonight' },
  { id: 'craft', need: 1, text: () => 'Open the satchel <kbd>Tab</kbd> and craft a defence. In camp the Workbench and the Coffer count; hover a recipe to see what you still need' },
  { id: 'store', need: 1, text: () => 'Store your haul in the <b>Coffer</b> by the Heartwood (tap <kbd>E</kbd>): a heavy pack slows you, and the Husks hear it' },
  { id: 'night', need: 1, text: () => 'Ready? Hold <kbd>E</kbd> at the Heartwood to call the night, or wait for dusk' },
];

const GOALS: Goal[] = [
  // the true ending's thread: the idol, the moon, the Sun Seal
  { id: 'idol_home', when: (f) => f.has('moon') && !f.has('home'), text: 'The idol has answered the Blood Moon: set it in the <b>Sun Seal</b> on the temple’s top altar, then hold to the tenth night' },
  { id: 'idol_moon', when: (f) => f.has('idol') && !f.has('moon') && !f.has('home'), text: 'Keep the <b>golden idol</b> on you (or in the Coffer) through a <b>Blood Moon</b> <span class="rift">◐</span>: then the temple will take it home' },
  // the expedition's threads, once something has pointed at them (`when` reads the flags)
  { id: 'radio', when: (f) => f.has('page:hollis1') || f.has('page:hollis2'), text: "Fit Hollis's radio at the <b>Tinker's Bench</b> (hold <kbd>F</kbd> there): every part but the last calls a supply drop at noon, and the last calls a plane" },
  { id: 'graft', when: (f) => f.has('heart'), text: "Set the Thornback's heart into the <b>Workbench</b> (hold <kbd>F</kbd>), then graft a tower (hold <kbd>G</kbd> on it)" },
  { id: 'seal', when: (f) => f.has('page:ruiz1') || f.has('page:ruiz2') || f.has('seals') || f.has('night4'), text: 'Set a relic in one of the three <b>seals</b> <span class="rift">◈</span>: the rift it holds sleeps' },
  { id: 'rot', when: (f) => f.has('rot'), text: 'The <b>Rot</b> creeps out from the rifts: burn it back with firepots or a brazier, or plant a <b>Heartseed sapling</b>' },
  { id: 'lantern', after: 'burrower', text: 'Raise a <b>Glowcap Lantern</b> by your walls: its light drags Burrowers up' },
  { id: 'spitter', after: 'spitter', text: 'Fell a <b>Spitter</b> with the machete: they burst up close' },
  { id: 'bloom', text: 'Cut down a <b>Blight Bloom</b> <span class="rift">✺</span> before dusk, or the Blight comes through it' },
  { id: 'coffer', text: 'Store your haul in the <b>Coffer</b> by the Heartwood (tap <kbd>E</kbd>): a heavy pack slows you and carries a long way' },
  { id: 'cache', text: 'Search a <b>supply crate</b> or a <b>root cache</b> at the foot of a giant tree (hold <kbd>E</kbd>)' },
  { id: 'kiln', text: 'Build the <b>Fire Pit</b> at camp: the brazier and the mortar are fired there' },
  // (owned: met by having one, however you came by it: a Memory's kit starts you with one)
  { id: 'sling', owned: 'slingshot', text: 'Craft a <b>Slingshot</b> (sticks, a vine, fibre): stones are its ammo' },
  { id: 'upgrade', text: 'Upgrade a tower: hold <kbd>E</kbd> on it' },
  { id: 'offer', text: 'Offer a relic at the Heartwood to earn a <b>boon</b>' },
  { id: 'brazier', text: 'Build an <b>Ember Brazier</b>: fire lights the night and burns wisps' },
  { id: 'mortar', text: 'Build a <b>Spore Mortar</b> for the packs (mushrooms, clay, resin)' },
];

export class Journal {
  hud: JournalHud;
  step: number;
  count: number;
  goals: Set<string>;
  met: Set<string>;
  flags: Set<string>;
  tutorial: boolean;
  dirty: boolean;
  /** how often each tutorial step's action has happened, whatever step was showing */
  tally: Record<string, number>;

  constructor(hud: object) {
    this.hud = hud as JournalHud;
    this.step = 0;
    this.count = 0;
    this.goals = new Set<string>();
    this.met = new Set<string>(); // kinds of Blight that have come at least once
    this.flags = new Set<string>(); // what the story has shown you (pages read, the heart, the Rot)
    this.tutorial = true;
    this.dirty = true;
    this.tally = {};
  }

  state(): JournalState {
    return { step: this.step, count: this.count, goals: [...this.goals], met: [...this.met], flags: [...this.flags], tutorial: this.tutorial, tally: this.tally };
  }

  restore(s: Partial<JournalState> | null | undefined) {
    if (!s) return;
    this.step = s.step ?? this.step;
    this.count = s.count ?? 0;
    this.goals = new Set(s.goals || []);
    this.met = new Set(s.met || []);
    this.flags = new Set(s.flags || []);
    this.tutorial = s.tutorial ?? false;
    this.tally = { ...(s.tally || {}) };
    // an older save's step list was shorter: start again from the first step not yet done
    if (this.tutorial) this.step = 0;
    this.advance();
    this.dirty = true;
  }

  // move past every step whose action has already happened enough times
  advance() {
    let moved = false;
    while (this.tutorial && this.step < TUTORIAL.length) {
      const s = TUTORIAL[this.step];
      if (s.id === 'night' || (this.tally[s.id] || 0) < s.need) break;
      this.step++;
      moved = true;
    }
    this.count = this.step < TUTORIAL.length ? Math.min(this.tally[TUTORIAL[this.step].id] || 0, TUTORIAL[this.step].need) : 0;
    if (moved) this.hud.journalTick?.();
    return moved;
  }

  skipTutorial() {
    this.tutorial = false;
    this.step = TUTORIAL.length;
    this.dirty = true;
  }

  // the kinds of Blight in tonight's wave
  meet(types: Iterable<string>) {
    for (const t of types) if (!this.met.has(t)) {
      this.met.add(t);
      this.dirty = true;
    }
  }

  // the story points at something new
  flag(f: string) {
    if (this.flags.has(f)) return;
    this.flags.add(f);
    this.dirty = true;
  }

  event(name: string, detail?: string) {
    if (name === 'page') this.flag(`page:${detail}`);
    // optional goals tick off whenever they happen
    const place: Record<string, string> = { ember_brazier: 'brazier', spore_mortar: 'mortar', glow_lantern: 'lantern' };
    const map: Record<string, string | null | undefined> = {
      craft: detail === 'slingshot' ? 'sling' : null, upgrade: 'upgrade', offer: 'offer', bloom: 'bloom', place: place[detail],
      melee: detail === 'spitter' ? 'spitter' : null, store: 'coffer', search: 'cache', bench: detail === 'kiln' ? 'kiln' : null,
      radio: 'radio', graft: 'graft', seal: 'seal', burnrot: 'rot',
    };
    const g = map[name];
    if (g && !this.goals.has(g)) {
      this.goals.add(g);
      this.dirty = true;
    }
    if (!this.tutorial) return;
    // which tutorial step this counts toward, whatever step is showing
    let id: string | null = null;
    if (name === 'forage' || name === 'cut' || name === 'trunk' || name === 'craft' || name === 'store') id = name;
    else if (name === 'place' && /tower|mortar|totem|brazier/.test(detail || '')) id = 'tower';
    else if (name === 'place' && /trap|snare|barricade/.test(detail || '')) id = 'trap';
    // starting the night ends the tutorial whatever step you were on
    if (name === 'night') {
      this.tutorial = false;
      this.step = TUTORIAL.length;
      this.dirty = true;
      return;
    }
    if (!id) return;
    this.tally[id] = (this.tally[id] || 0) + 1;
    this.advance();
    this.dirty = true;
  }

  // lines for the HUD: [{ html, done, main }]. has(id): whether you carry or store one
  lines(phase: string, has: (id: string) => boolean = () => false): JournalLine[] {
    if (phase === 'night' || phase === 'over') return [];
    if (this.tutorial && this.step < TUTORIAL.length) {
      const s = TUTORIAL[this.step];
      const prev = TUTORIAL[this.step - 1];
      const out: JournalLine[] = [];
      if (prev) out.push({ html: prev.text(prev.need, has), done: true });
      out.push({ html: s.text(this.count, has), main: true });
      return out;
    }
    return GOALS.filter((g) => !this.goals.has(g.id) && !(g.owned && has(g.owned)) && (!g.after || this.met.has(g.after)) && (!g.when || g.when(this.flags))).slice(0, 2).map((g) => ({ html: g.text }));
  }
}
