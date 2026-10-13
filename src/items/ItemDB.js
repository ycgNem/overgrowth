// Item definitions and loot tables. Add a new item here + a model in
// ItemModels.js and it shows up everywhere (pickups, icons, inventory).
import { weighted } from '../utils/rng.js';

export const RARITY = {
  common: { name: 'Common', color: '#cfc7b0', order: 0 },
  uncommon: { name: 'Uncommon', color: '#7ad66a', order: 1 },
  rare: { name: 'Rare', color: '#57a9ff', order: 2 },
  epic: { name: 'Epic', color: '#c77dff', order: 3 },
  legendary: { name: 'Legendary', color: '#ffbf3c', order: 4 },
};

export const ITEMS = {
  fiber: { name: 'Plant Fiber', rarity: 'common', value: 1, desc: 'Tough strands stripped from jungle leaves. Good for lashing.' },
  scrap_metal: { name: 'Scrap Metal', rarity: 'common', value: 2, desc: 'A bent sheet of rusted steel. Someone hauled this out here once.' },
  rusty_bolts: { name: 'Rusty Bolts', rarity: 'common', value: 2, desc: 'A handful of corroded bolts and nuts.' },
  frayed_rope: { name: 'Frayed Rope', rarity: 'common', value: 3, desc: 'Hemp rope, half rotten but still useful.' },
  old_bottle: { name: 'Old Bottle', rarity: 'common', value: 3, desc: 'Thick green glass. Empty, sadly.' },
  tin_can: { name: 'Tin Can', rarity: 'common', value: 2, desc: 'The label has long since washed away. Beans? Peaches? Mystery.' },
  copper_wire: { name: 'Copper Wire', rarity: 'uncommon', value: 6, desc: 'A coil of copper wire. Valuable to tinkerers.' },
  strange_seeds: { name: 'Strange Seeds', rarity: 'uncommon', value: 5, desc: 'Iridescent seeds that feel faintly warm.' },
  brass_gear: { name: 'Brass Gear', rarity: 'uncommon', value: 8, desc: 'A toothed brass gear from some forgotten machine.' },
  battery: { name: 'Corroded Battery', rarity: 'uncommon', value: 7, desc: 'Might still hold a charge. Might not.' },
  compass: { name: "Explorer's Compass", rarity: 'rare', value: 18, desc: 'The needle still swings true. Mostly.' },
  pocket_watch: { name: 'Pocket Watch', rarity: 'rare', value: 22, desc: 'Engraved silver case. Stopped at 4:17.' },
  vacuum_tube: { name: 'Vacuum Tube', rarity: 'rare', value: 16, desc: 'A delicate radio valve, miraculously intact.' },
  ghost_orchid: { name: 'Ghost Orchid', rarity: 'rare', value: 20, desc: 'A pale, rare orchid. Botanists would pay well.' },
  doubloon: { name: 'Gold Doubloon', rarity: 'epic', value: 45, desc: 'A Spanish gold coin, stamped with a cross.' },
  jade_figurine: { name: 'Jade Figurine', rarity: 'epic', value: 60, desc: 'A small carved jaguar in deep green jade.' },
  golden_idol: { name: 'Golden Idol', rarity: 'legendary', value: 250, desc: 'The temple’s heart. Heavy, gleaming and probably cursed.' },
  sun_mask: { name: 'Sun Mask', rarity: 'legendary', value: 200, desc: 'A ceremonial gold mask with turquoise eyes.' },
};

export const ITEM_IDS = Object.keys(ITEMS);

// chance: probability of any drop at all; rolls: number of draws.
export const LOOT = {
  grass: { chance: 0.06, rolls: 1, table: [['fiber', 80], ['strange_seeds', 8], ['rusty_bolts', 6], ['doubloon', 0.4]] },
  fern: { chance: 0.14, rolls: 1, table: [['fiber', 60], ['strange_seeds', 14], ['rusty_bolts', 8], ['tin_can', 6], ['copper_wire', 4], ['doubloon', 0.8]] },
  bush: { chance: 0.24, rolls: 1, table: [['fiber', 35], ['strange_seeds', 12], ['scrap_metal', 12], ['rusty_bolts', 10], ['tin_can', 8], ['old_bottle', 8], ['copper_wire', 5], ['brass_gear', 3], ['compass', 1], ['doubloon', 1]] },
  banana: { chance: 0.22, rolls: 1, table: [['fiber', 50], ['strange_seeds', 15], ['old_bottle', 10], ['frayed_rope', 8], ['ghost_orchid', 1.5]] },
  flower: { chance: 0.15, rolls: 1, table: [['strange_seeds', 50], ['ghost_orchid', 8], ['fiber', 30]] },
  scrap: { chance: 1, rolls: 3, table: [['scrap_metal', 30], ['rusty_bolts', 25], ['copper_wire', 16], ['tin_can', 12], ['battery', 8], ['brass_gear', 8], ['vacuum_tube', 2.5], ['pocket_watch', 1]] },
  crate: { chance: 1, rolls: 2, table: [['tin_can', 25], ['frayed_rope', 20], ['old_bottle', 15], ['battery', 10], ['copper_wire', 10], ['compass', 4], ['vacuum_tube', 4], ['doubloon', 1.5]] },
  camp: { chance: 1, rolls: 3, table: [['frayed_rope', 22], ['tin_can', 22], ['old_bottle', 15], ['battery', 10], ['compass', 7], ['pocket_watch', 5], ['copper_wire', 10]] },
  ruin: { chance: 1, rolls: 2, table: [['old_bottle', 15], ['doubloon', 18], ['jade_figurine', 6], ['brass_gear', 10], ['strange_seeds', 15], ['sun_mask', 0.6]] },
  wreck: { chance: 1, rolls: 4, table: [['scrap_metal', 20], ['battery', 18], ['vacuum_tube', 14], ['compass', 12], ['copper_wire', 16], ['brass_gear', 12], ['pocket_watch', 6]] },
  temple: { chance: 1, rolls: 3, table: [['doubloon', 50], ['jade_figurine', 25]], guaranteed: ['golden_idol'] },
  templeChest: { chance: 1, rolls: 2, table: [['doubloon', 40], ['jade_figurine', 15], ['sun_mask', 3]] },
};

export function rollLoot(tableName, rand) {
  const t = LOOT[tableName];
  if (!t || rand() > t.chance) return [];
  const out = t.guaranteed ? [...t.guaranteed] : [];
  for (let i = 0; i < t.rolls; i++) out.push(weighted(rand, t.table));
  return out;
}
