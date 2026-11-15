// Memories of the Heartwood: permanent unlocks earned from lifetime records (core/Save.js).
// Each one adds an option to every vigil after it rather than locking away what's already
// there. They're listed on the title's Records page with what each one needs.
import { loadRecords, loadBest } from './Save.ts';

export const MEMORIES = [
  {
    id: 'sling', glyph: '◎', name: 'The Old Sling', need: 'Hold through night 3',
    test: (r, best) => Math.max(best.nights, r.deepest || 0) >= 3,
    reward: 'Every vigil starts with a slingshot and a pouch of stones.',
    kit: [['slingshot', 1], ['stone', 12]],
  },
  // (an early one for a second vigil: you know the forest now, so the day's first decision,
  // where to go, is a real one from the first minute)
  {
    id: 'wayfinder', glyph: '⌖', name: 'The Wayfinder', need: 'Read 4 pages of the lost expedition',
    test: (r) => (r.pages || 0) >= 4,
    reward: 'Every vigil starts with the camps, wrecks, shrines and the temple named on the map and compass, with how far a walk each one is.',
  },
  {
    id: 'lore', glyph: '❂', name: 'Glowcap Lore', need: 'Burn 5 Blight Blooms',
    test: (r) => r.blooms >= 5,
    reward: 'Every vigil starts with a Glowcap Lantern.',
    kit: [['glow_lantern', 1]],
  },
  {
    id: 'fourth', glyph: '✦', name: 'A Fourth Card', need: 'Fell 150 Blight',
    test: (r) => r.kills >= 150,
    reward: 'The Heartwood offers four boons to choose from instead of three.',
  },
  {
    id: 'trophy', glyph: '☠', name: "The Thornback's Hide", need: 'Slay a Thornback',
    test: (r) => r.bosses >= 1,
    reward: 'Three new boons join the pool: Ember Heart, Deep Roots and Lantern Bearer.',
  },
  {
    id: 'bloom', glyph: '❀', name: 'The Heartwood in Bloom', need: 'Win a vigil on any difficulty',
    test: (r) => r.wins >= 1,
    reward: 'Every vigil starts with an Orchid Salve and two more poultices.',
    kit: [['orchid_salve', 1], ['poultice', 2]],
  },
  // (a second run should already have a choice to make: this came only after a hard win)
  {
    id: 'paths', glyph: '⟡', name: 'Many Paths', need: 'Hold through night 5 on Warden or Blightborn',
    test: (r) => r.hardWins >= 1 || (r.hardDeepest || 0) >= 5,
    reward: "Choose how a vigil starts: the difficulty's own kit, a builder's or a hunter's.",
  },
  // the expedition's endings, and its pages
  {
    id: 'cartographer', glyph: '✎', name: 'The Cartographer', need: 'Read every page of the lost expedition',
    test: (r) => r.pages >= 12,
    reward: 'Every vigil starts with a Glowcap Lens to graft.',
    kit: [['glowcap_lens', 1]],
  },
  {
    id: 'flight', glyph: '✈', name: 'The Last Flight', need: 'Mend the radio and fly out (the escape ending)',
    test: (r) => r.flights >= 1,
    reward: 'Every vigil starts with a pry bar and a coiled spring from the wreck.',
    kit: [['pry_bar', 1], ['coiled_spring', 1]],
  },
  {
    id: 'sealed', glyph: '◈', name: 'The Seals Hold', need: 'Set the golden idol in the Sun Seal and hold ten nights (the true ending)',
    test: (r) => r.sealed >= 1,
    reward: 'Every vigil starts knowing how to graft.',
  },
];

// the ids earned so far
export function unlocked(records = loadRecords(), best = loadBest()) {
  return new Set(MEMORIES.filter((m) => m.test(records, best)).map((m) => m.id));
}
