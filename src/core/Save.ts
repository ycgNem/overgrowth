// Saving a run in localStorage. The world itself is a pure function of position, so a save
// only needs what the player changed: the night and the hour, the satchel, the buildings, the
// Heartwood, boons, the day's Blight Blooms, what has been foraged and cut, what lies on the
// ground, and a few counters. The game autosaves every half minute of day, right after a
// search or a bloom, and once more as the night falls (the dusk checkpoint): Continue puts you
// back at the same hour, or at nightfall if you quit during a night. Nothing is ever rewound
// to an earlier morning.
import { DAILY } from './Seed.js';

// a daily vigil keeps its own save, so it never touches the ordinary one
const KEY = DAILY ? `og.save.daily.${DAILY}` : 'og.save.v1';
const BEST = 'og.best';
const RECORDS = 'og.records';

/** a saved run (see writeSave for the fields) */
export type SaveData = Record<string, any>;

function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// a daily vigil's save more than a week old is never coming back: drop it (today's, and the
// last few days', stay: an ordinary vigil loading must not wipe the daily one in progress)
function pruneDailies() {
  const s = store();
  if (!s) return;
  try {
    const d = new Date(Date.now() - 7 * 864e5);
    const cutoff = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    const old: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      const m = k && /^og\.save\.daily\.(\d{8})$/.exec(k);
      if (m && k !== KEY && Number(m[1]) < cutoff) old.push(k);
    }
    for (const k of old) s.removeItem(k);
  } catch {
    // storage blocked
  }
}

export function loadSave(): SaveData | null {
  pruneDailies();
  try {
    const raw = store()?.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    store()?.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}

const r2 = (v: number) => +v.toFixed(2);

/**
 * Save the run. `dusk`: the checkpoint written as the night falls (loading it wakes you a
 * moment before the rifts open).
 */
export function writeSave(game: any, opts: { dusk?: boolean } = {}) {
  const g = game;
  const data: SaveData = {
    v: 3,
    at: Date.now(),
    difficulty: g.difficulty,
    night: g.waves.night,
    time: g.sky.time,
    dusk: !!opts.dusk,
    won: g.waves.won,
    slots: g.inventory.state(),
    pack: g.inventory.packId,
    coffer: g.coffer.state(),
    camp: g.camp.state(),
    containers: g.containers.state(),
    looted: [...g.world.looted],
    restock: [...g.restockable],
    lost: g.lost.map((it) => [it.id, r2(it.x), r2(it.z), it.expires]),
    lostN: g.lostN,
    selected: g.inventory.selected,
    found: [...g.inventory.found],
    base: { hp: g.base.hp, maxHp: g.base.maxHp },
    player: { hp: g.player.hp, maxHp: g.player.maxHp },
    buildings: g.buildings.list.filter((b) => !b.dead).map((b) => [b.id, r2(b.x), r2(b.z), +b.rot.toFixed(3), b.tier, Math.round(b.hp), b.scarred ? 1 : 0, b.grafts, b.charges ?? null]),
    // what's been packed up, and how worn it was when it was (Game.packed)
    packed: g.packed,
    rootBonus: g.rootBonus,
    perks: g.perks,
    favour: g.favour,
    boonsTaken: g.boonsTaken,
    pendingBoons: g.pendingBoons,
    stats: g.stats,
    kills: g.enemies.kills,
    discovered: [...g.hud.discovered],
    done: [...g.doneSet],
    journal: g.journal.state(),
    trample: g.trample?.state(),
    rot: g.rot?.state(),
    expedition: g.expedition?.state(),
    // the day's blooms, cut down or not (so a reload neither regrows nor rerolls them)
    blooms: g.bloomState?.(),
    // the day's foraging and cutting (dawn regrows it all anyway)
    foraged: [...g.world.foraged],
    cut: [...g.world.cut],
    // whatever lies on the ground: dropped piles and loot not yet picked up
    piles: g.pickups.items.filter((p) => !p.magnet).map((p) => [p.id, p.n, r2(p.root.position.x), r2(p.root.position.z), p.dropped ? 1 : 0]),
  };
  try {
    store()?.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadBest() {
  try {
    return JSON.parse(store()?.getItem(BEST) || 'null') || { nights: 0, kills: 0 };
  } catch {
    return { nights: 0, kills: 0 };
  }
}

export function recordBest(nights: number, kills: number, score = 0) {
  const b = loadBest();
  const out = { nights: Math.max(b.nights, nights), kills: Math.max(b.kills, kills), score: Math.max(b.score || 0, score) };
  try {
    store()?.setItem(BEST, JSON.stringify(out));
  } catch {
    // storage blocked
  }
  return out;
}

// Lifetime records across every run, for the title's Records page. Nights and kills are
// banked at each dawn (and when a run ends), so a run quit halfway still counts.
// (bosses: every boss slain; thornbacks and mothers, each kind on its own)
const EMPTY = {
  runs: 0, wins: 0, hardWins: 0, blightWins: 0, nights: 0, kills: 0, bosses: 0, thornbacks: 0, mothers: 0, blooms: 0, built: 0, deepest: 0,
  flights: 0, sealed: 0, pages: 0, elites: 0, grafts: 0, seals: 0, drops: 0, burns: 0, dailyBest: 0, hardDeepest: 0, seen: [] as string[],
};
export type Records = typeof EMPTY & Record<string, any>;

export function loadRecords(): Records {
  try {
    return { ...EMPTY, ...(JSON.parse(store()?.getItem(RECORDS) || 'null') || {}) };
  } catch {
    return { ...EMPTY };
  }
}

// delta: added to the totals; most: kept if higher (the deepest night reached)
export function addRecords(delta: Record<string, number>, seen: string[] = [], most: Record<string, number> = {}) {
  const r = loadRecords();
  for (const [k, v] of Object.entries(delta)) r[k] = (r[k] || 0) + v;
  for (const [k, v] of Object.entries(most)) r[k] = Math.max(r[k] || 0, v);
  r.seen = [...new Set([...r.seen, ...seen])];
  try {
    store()?.setItem(RECORDS, JSON.stringify(r));
  } catch {
    // storage blocked
  }
  return r;
}
