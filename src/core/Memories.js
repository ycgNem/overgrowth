// Memories of the Heartwood: permanent unlocks earned from lifetime records (core/Save.js).
// Each one adds an option to every vigil after it rather than locking away what's already
// there. They're listed on the title's Records page with what each one needs.
import { loadRecords, loadBest } from './Save.js';

export const MEMORIES = [
  {
    id: 'sling', glyph: '◎', name: 'The Old Sling', need: 'Hold through night 3',
    test: (r, best) => Math.max(best.nights, r.deepest || 0) >= 3,
    reward: 'Every vigil starts with a slingshot and a pouch of stones.',
    kit: [['slingshot', 1], ['stone', 12]],
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
  {
    id: 'paths', glyph: '⟡', name: 'Many Paths', need: 'Win a vigil on Warden or Blightborn',
    test: (r) => r.hardWins >= 1,
    reward: "Choose how a vigil starts: the difficulty's own kit, a builder's or a hunter's.",
  },
];

// the ids earned so far
export function unlocked(records = loadRecords(), best = loadBest()) {
  return new Set(MEMORIES.filter((m) => m.test(records, best)).map((m) => m.id));
}
