// Crafting recipes. `at` says where a recipe is made:
//   field   anywhere, in the satchel (Tab): traps, ammo, firepots, healing
//   bench   the Workbench at camp: towers, walls, lanterns, packs, the pry bar
//   kiln    the Fire Pit at camp: fired clay and smoke (the brazier, the mortar, smoked eel)
//   tinker  the Tinker's Bench at camp: wire and scrap (the totem, iron shot)
// Camp recipes can be made from anywhere inside the camp once that bench is built, and they
// draw on the Coffer as well as the satchel. `lvl` is the bench level a recipe needs (1 if
// unset). `group` sorts them into the satchel's sections.
export type Station = 'field' | 'bench' | 'kiln' | 'tinker';
export interface CampRecipe {
  id: string;
  out: string;
  n: number;
  group: string;
  at: Station;
  lvl?: number;
  needs: Record<string, number>;
}
export interface Bench {
  name: string;
  glyph: string;
  model: string;
  blurb: string;
  levels: (Record<string, number> | null)[];
}

export const RECIPES: CampRecipe[] = [
  { id: 'barricade', out: 'barricade', n: 1, group: 'Defences', at: 'bench', needs: { stick: 4, thorns: 3, vine: 1 } },
  { id: 'spike_trap', out: 'spike_trap', n: 1, group: 'Defences', at: 'field', needs: { stick: 3, flint: 2 } },
  { id: 'vine_snare', out: 'vine_snare', n: 1, group: 'Defences', at: 'bench', needs: { vine: 4, fiber: 3, stick: 2, thorns: 2 } },
  { id: 'bow_tower', out: 'bow_tower', n: 1, group: 'Defences', at: 'bench', needs: { log: 2, stick: 3, vine: 2, flint: 2, feather: 2 } },
  { id: 'ember_brazier', out: 'ember_brazier', n: 1, group: 'Defences', at: 'kiln', needs: { stone: 4, clay: 2, log: 1, resin: 2 } },
  { id: 'spore_mortar', out: 'spore_mortar', n: 1, group: 'Defences', at: 'kiln', needs: { log: 1, stone: 3, mushroom: 4, clay: 2, resin: 1 } },
  { id: 'glow_lantern', out: 'glow_lantern', n: 1, group: 'Defences', at: 'bench', needs: { glowcap: 2, stick: 4, resin: 1, fiber: 2 } },
  { id: 'heartseed', out: 'heartseed', n: 1, group: 'Defences', at: 'bench', lvl: 2, needs: { strange_seeds: 5, glowcap: 2, stone: 4, resin: 2 } },
  { id: 'tesla_totem', out: 'tesla_totem', n: 1, group: 'Defences', at: 'tinker', needs: { log: 1, copper_wire: 2, battery: 1, vacuum_tube: 1, scrap_metal: 2 } },
  { id: 'slingshot', out: 'slingshot', n: 1, group: 'Weapons', at: 'field', needs: { stick: 2, vine: 1, fiber: 3 } },
  { id: 'scrap_shot', out: 'scrap_shot', n: 6, group: 'Weapons', at: 'field', needs: { tin_can: 1, rusty_bolts: 2 } },
  { id: 'iron_shot', out: 'scrap_shot', n: 5, group: 'Weapons', at: 'tinker', needs: { bog_iron: 1 } },
  { id: 'firepot', out: 'firepot', n: 2, group: 'Weapons', at: 'field', needs: { old_bottle: 1, resin: 2, fiber: 1 } },
  { id: 'poultice', out: 'poultice', n: 1, group: 'Supplies', at: 'field', needs: { berries: 4, fiber: 1, moss: 1 } },
  { id: 'smoked_eel', out: 'smoked_eel', n: 1, group: 'Supplies', at: 'kiln', needs: { eel: 1, bark: 1 } },
  { id: 'orchid_salve', out: 'orchid_salve', n: 1, group: 'Supplies', at: 'field', needs: { ghost_orchid: 1, moss: 2, resin: 1 } },
  { id: 'pry_bar', out: 'pry_bar', n: 1, group: 'Gear', at: 'bench', needs: { bog_iron: 1, stick: 2 } },
  { id: 'pry_bar_scrap', out: 'pry_bar', n: 1, group: 'Gear', at: 'tinker', needs: { scrap_metal: 2, rusty_bolts: 2 } },
  { id: 'hide_pack', out: 'hide_pack', n: 1, group: 'Gear', at: 'bench', needs: { rot_hide: 3, bone: 3, vine: 4 } },
  { id: 'rucksack', out: 'rucksack', n: 1, group: 'Gear', at: 'bench', lvl: 2, needs: { rot_hide: 2, frayed_rope: 3, brass_gear: 1, bone: 2 } },
];

// The camp's benches. Level 0 is not built yet (the Workbench starts at 1). `levels[k]` is
// what it takes to reach level k + 1, and the level gates the best recipes and the tower
// upgrades of what's made there (tier t needs level t).
export const BENCHES: Record<'bench' | 'kiln' | 'tinker', Bench> = {
  bench: {
    name: 'Workbench', glyph: '⚒', model: 'workbench',
    blurb: "Towers, walls, lanterns, packs, Heartseed saplings. Set the Thornback's heart in it to learn grafting.",
    levels: [null, { log: 3, rusty_bolts: 3, frayed_rope: 2 }, { brass_gear: 2, bog_iron: 3, bone: 4 }],
  },
  kiln: {
    name: 'Fire Pit', glyph: '♨', model: 'firepit',
    blurb: 'Fired clay and smoke: the brazier, the mortar, smoked eel.',
    levels: [{ stone: 6, clay: 3, log: 1 }, { clay: 4, resin: 3, old_bottle: 1 }, { bog_iron: 3, glowcap: 2, clay: 4 }],
  },
  tinker: {
    name: "Tinker's Bench", glyph: '⚙', model: 'tinker',
    blurb: 'Wire and scrap: the Tesla totem, iron shot, salvage at full yield.',
    levels: [{ log: 2, scrap_metal: 4, rusty_bolts: 3 }, { copper_wire: 2, battery: 1, brass_gear: 2 }, { vacuum_tube: 1, battery: 2, pocket_watch: 1 }],
  },
};
// The Coffer's levels: clad in iron, then bound in brass, each holds more. `levels[k]` is what
// it takes to reach level k + 2 (it starts at 1); upgraded from its own pane at camp.
export const COFFER: { names: string[]; slots: number[]; levels: Record<string, number>[] } = {
  names: ['The Coffer', 'The Iron Coffer', 'The Brassbound Coffer'],
  slots: [60, 90, 120],
  // (no brass gears: the radio, the rucksack and the tier-3 towers want every one of those)
  levels: [{ scrap_metal: 4, rusty_bolts: 4, bog_iron: 2 }, { copper_wire: 3, scrap_metal: 6, rusty_bolts: 4, bog_iron: 3 }],
};
export const BENCH_IDS = Object.keys(BENCHES) as (keyof typeof BENCHES)[];
export const AT_NAMES: Record<Station, string> = { field: 'Anywhere', bench: 'Workbench', kiln: 'Fire Pit', tinker: "Tinker's Bench" };

// which bench a defence is made at (and so which bench's level its upgrades need)
export const benchOf = (id: string): Station => RECIPES.find((r) => r.out === id)?.at ?? 'field';
export const recipeFor = (id: string) => RECIPES.find((r) => r.out === id);
