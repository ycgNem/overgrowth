// Saving a run in localStorage. The world itself is a pure function of position, so a save
// only needs what the player changed: the night, the satchel, the buildings, the Heartwood,
// boons, and a few counters. The game autosaves at every dawn and every half minute of day;
// it never saves during a night, so quitting mid-fight sends you back to that morning.
const KEY = 'og.save.v1';
const BEST = 'og.best';

function store() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadSave() {
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

export function writeSave(game) {
  const g = game;
  const data = {
    v: 1,
    at: Date.now(),
    night: g.waves.night,
    time: g.sky.time,
    won: g.waves.won,
    slots: g.inventory.slots.map((s) => (s ? [s.id, s.n] : null)),
    selected: g.inventory.selected,
    found: [...g.inventory.found],
    base: { hp: g.base.hp, maxHp: g.base.maxHp },
    player: { hp: g.player.hp, maxHp: g.player.maxHp },
    buildings: g.buildings.list.filter((b) => !b.dead).map((b) => [b.id, +b.x.toFixed(2), +b.z.toFixed(2), +b.rot.toFixed(3), b.tier, Math.round(b.hp)]),
    perks: g.perks,
    favour: g.favour,
    boonsTaken: g.boonsTaken,
    stats: g.stats,
    kills: g.enemies.kills,
    discovered: [...g.hud.discovered],
    done: [...g.doneSet],
    journal: g.journal.state(),
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

export function recordBest(nights, kills) {
  const b = loadBest();
  const out = { nights: Math.max(b.nights, nights), kills: Math.max(b.kills, kills) };
  try {
    store()?.setItem(BEST, JSON.stringify(out));
  } catch {
    // storage blocked
  }
  return out;
}
