// Achievements: local, read from the lifetime records (core/Save.js) the way the Memories are,
// with the day each one was earned. Listed on the title's Records page; a toast when one lands.
import { loadRecords, loadBest } from './Save.js';

export const ACHIEVEMENTS = [
  { id: 'first', glyph: '☾', name: 'First Light', desc: 'Hold through the first night', test: (r) => r.deepest >= 1 },
  { id: 'five', glyph: '☽', name: 'The Long Week', desc: 'Hold through night 5', test: (r) => r.deepest >= 5 },
  { id: 'thornback', glyph: '☠', name: 'Heart-eater, Eaten', desc: 'Slay a Thornback', test: (r) => r.seen.includes('thornback') },
  { id: 'bloom', glyph: '❀', name: 'The Heartwood Blooms', desc: 'Hold ten nights', test: (r) => r.wins >= 1 },
  { id: 'blightborn', glyph: '☣', name: 'Blightborn', desc: 'Hold ten nights on Blightborn', test: (r) => r.blightWins >= 1 },
  { id: 'fifteen', glyph: '✶', name: 'Past the Rescue', desc: 'Reach night 15', test: (r) => r.deepest >= 15 },
  { id: 'mother', glyph: '⬮', name: 'Matricide', desc: 'Slay the Rot Mother', test: (r) => r.seen.includes('rot_mother') },
  { id: 'slayer', glyph: '⚔', name: 'A Thousand Cuts', desc: 'Fell 1,000 Blight', test: (r) => r.kills >= 1000 },
  { id: 'elites', glyph: '◆', name: 'Marked for Death', desc: 'Fell 25 elite Blight', test: (r) => r.elites >= 25 },
  { id: 'builder', glyph: '⚒', name: 'Palisade', desc: 'Build 100 defences', test: (r) => r.built >= 100 },
  { id: 'gardener', glyph: '✺', name: 'Weeding', desc: 'Burn 20 Blight Blooms', test: (r) => r.blooms >= 20 },
  { id: 'pages', glyph: '✎', name: 'The Whole Story', desc: 'Read every page of the lost expedition', test: (r) => r.pages >= 12 },
  { id: 'graft', glyph: '⚚', name: 'Grafter', desc: 'Graft something onto a tower', test: (r) => r.grafts >= 1 },
  { id: 'seal', glyph: '◈', name: 'Doorkeeper', desc: 'Set a relic in a seal', test: (r) => r.seals >= 1 },
  { id: 'drop', glyph: '⚑', name: 'Special Delivery', desc: 'Loot a supply drop', test: (r) => r.drops >= 1 },
  { id: 'rot', glyph: '♨', name: 'Scorched Earth', desc: 'Burn back the Rot', test: (r) => r.burns >= 1 },
  { id: 'flight', glyph: '✈', name: 'The Last Flight', desc: 'Fly out (the escape ending)', test: (r) => r.flights >= 1 },
  { id: 'sealed', glyph: '☀', name: 'The Seals Hold', desc: 'Set the idol home and hold ten nights (the true ending)', test: (r) => r.sealed >= 1 },
  { id: 'daily', glyph: '☼', name: 'Every Day', desc: 'Hold five nights in a daily vigil', test: (r) => r.dailyBest >= 5 },
  // a full ten-night Warden vigil scores about 2,800: this one wants Blightborn, or endless
  { id: 'score', glyph: '★', name: 'Legend of the Grove', desc: 'Score 4,000 in one vigil', test: (r, b) => (b.score || 0) >= 4000 },
];

const KEY = 'og.ach';

// { id: earned-at (ms) }
export function loadEarned() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
}

// Check the records: returns the achievements earned just now (and remembers them)
export function checkAchievements(records = loadRecords(), best = loadBest()) {
  const got = loadEarned();
  const fresh = ACHIEVEMENTS.filter((a) => !got[a.id] && a.test(records, best));
  if (!fresh.length) return [];
  for (const a of fresh) got[a.id] = Date.now();
  try {
    localStorage.setItem(KEY, JSON.stringify(got));
  } catch {
    // storage blocked
  }
  return fresh;
}

// A vigil's score: nights held, Blight felled and bosses slain, by the difficulty
const DIFF_K = { verdant: 0.6, warden: 1, blightborn: 1.6 };
export function scoreOf({ nights = 0, kills = 0, bosses = 0 }, difficulty = 'warden') {
  return Math.round((nights * 100 + kills * 4 + bosses * 150) * (DIFF_K[difficulty] ?? 1));
}
