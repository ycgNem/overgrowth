// Item definitions and loot tables. Add a new item here + a model in
// ItemModels.js and it shows up everywhere (pickups, icons, inventory, recipes).
//
// kind: material (crafting), scrap (salvage, also crafting), relic (offer at the
//       Heartwood), build (placeable defence), use (consumable).
import { weighted } from '../utils/rng.js';

export const RARITY = {
  common: { name: 'Common', color: '#cfc7b0', order: 0 },
  uncommon: { name: 'Uncommon', color: '#7ad66a', order: 1 },
  rare: { name: 'Rare', color: '#57a9ff', order: 2 },
  epic: { name: 'Epic', color: '#c77dff', order: 3 },
  legendary: { name: 'Legendary', color: '#ffbf3c', order: 4 },
};

export const KIND = {
  material: { name: 'Material', stack: 40 },
  scrap: { name: 'Salvage', stack: 20 },
  relic: { name: 'Relic', stack: 10 },
  build: { name: 'Defence', stack: 5 },
  use: { name: 'Consumable', stack: 10 },
};

export const ITEMS = {
  // ------------------------------------------------------------- forest materials
  stick: { name: 'Stick', kind: 'material', rarity: 'common', value: 1, desc: 'A straight, dry branch. The start of nearly everything.' },
  log: { name: 'Log', kind: 'material', rarity: 'common', value: 3, stack: 20, desc: 'A length of trunk, hacked free with a lot of effort.' },
  stone: { name: 'Stone', kind: 'material', rarity: 'common', value: 1, desc: 'A fist-sized river stone. Heavy and honest.' },
  flint: { name: 'Flint', kind: 'material', rarity: 'uncommon', value: 4, desc: 'Knaps to a wicked edge. Arrowheads, spikes, sparks.' },
  fiber: { name: 'Plant Fiber', kind: 'material', rarity: 'common', value: 1, desc: 'Tough strands stripped from jungle leaves. Good for lashing.' },
  vine: { name: 'Vine', kind: 'material', rarity: 'common', value: 2, desc: 'Springy liana. Ties things together better than rope.' },
  bark: { name: 'Bark Strip', kind: 'material', rarity: 'common', value: 1, desc: 'A curl of bark peeled off a trunk. Burns well, binds well.' },
  resin: { name: 'Tree Resin', kind: 'material', rarity: 'uncommon', value: 4, desc: 'Sticky amber sap. Seals joints and burns hot.' },
  thorns: { name: 'Thorns', kind: 'material', rarity: 'common', value: 1, desc: 'A fistful of bramble thorns. Handle with respect.' },
  mushroom: { name: 'Spotted Mushroom', kind: 'material', rarity: 'common', value: 2, desc: "Red cap, white spots. Don't eat it. Do load it into a mortar." },
  glowcap: { name: 'Glowcap', kind: 'material', rarity: 'rare', value: 10, desc: 'A mushroom that glows a faint cold blue. The Blight hates its light.' },
  berries: { name: 'Wild Berries', kind: 'material', rarity: 'common', value: 1, desc: 'Sweet, sharp and only slightly poisonous.' },
  clay: { name: 'River Clay', kind: 'material', rarity: 'uncommon', value: 3, desc: 'Cool grey clay dug from the riverbank.' },
  feather: { name: 'Feather', kind: 'material', rarity: 'uncommon', value: 3, desc: 'A long flight feather. Perfect fletching.' },
  bone: { name: 'Bone', kind: 'material', rarity: 'uncommon', value: 3, desc: 'Picked clean. Something big ate well out here.' },
  moss: { name: 'Moss', kind: 'material', rarity: 'common', value: 1, desc: 'Damp and springy. Soaks up blood and packs wounds.' },
  strange_seeds: { name: 'Strange Seeds', kind: 'material', rarity: 'uncommon', value: 5, desc: 'Iridescent seeds that feel faintly warm.' },
  ghost_orchid: { name: 'Ghost Orchid', kind: 'material', rarity: 'rare', value: 20, desc: 'A pale, rare orchid. Its nectar knits wood back together.' },

  // ------------------------------------------------------------- salvage
  scrap_metal: { name: 'Scrap Metal', kind: 'scrap', rarity: 'common', value: 2, desc: 'A bent sheet of rusted steel. Someone hauled this out here once.' },
  rusty_bolts: { name: 'Rusty Bolts', kind: 'scrap', rarity: 'common', value: 2, desc: 'A handful of corroded bolts and nuts.' },
  frayed_rope: { name: 'Frayed Rope', kind: 'scrap', rarity: 'common', value: 3, desc: 'Hemp rope, half rotten but still useful.' },
  old_bottle: { name: 'Old Bottle', kind: 'scrap', rarity: 'common', value: 3, desc: 'Thick green glass. Empty, sadly.' },
  tin_can: { name: 'Tin Can', kind: 'scrap', rarity: 'common', value: 2, desc: 'The label has long since washed away. Beans? Peaches? Mystery.' },
  copper_wire: { name: 'Copper Wire', kind: 'scrap', rarity: 'uncommon', value: 6, desc: 'A coil of copper wire. It carries a spark beautifully.' },
  brass_gear: { name: 'Brass Gear', kind: 'scrap', rarity: 'uncommon', value: 8, desc: 'A toothed brass gear from some forgotten machine.' },
  battery: { name: 'Corroded Battery', kind: 'scrap', rarity: 'uncommon', value: 7, desc: 'Might still hold a charge. Might not.' },
  vacuum_tube: { name: 'Vacuum Tube', kind: 'scrap', rarity: 'rare', value: 16, desc: 'A delicate radio valve, miraculously intact.' },

  // ------------------------------------------------------------- relics
  compass: { name: "Explorer's Compass", kind: 'relic', rarity: 'rare', value: 18, desc: 'The needle still swings true. Mostly.' },
  pocket_watch: { name: 'Pocket Watch', kind: 'relic', rarity: 'rare', value: 22, desc: 'Engraved silver case. Stopped at 4:17.' },
  doubloon: { name: 'Gold Doubloon', kind: 'relic', rarity: 'epic', value: 45, desc: 'A Spanish gold coin, stamped with a cross.' },
  jade_figurine: { name: 'Jade Figurine', kind: 'relic', rarity: 'epic', value: 60, desc: 'A small carved jaguar in deep green jade.' },
  golden_idol: { name: 'Golden Idol', kind: 'relic', rarity: 'legendary', value: 250, desc: 'The temple’s heart. Heavy, gleaming and probably cursed.' },
  sun_mask: { name: 'Sun Mask', kind: 'relic', rarity: 'legendary', value: 200, desc: 'A ceremonial gold mask with turquoise eyes.' },

  // ------------------------------------------------------------- crafted
  barricade: { name: 'Thorn Barricade', kind: 'build', rarity: 'common', value: 0, model: 'barricade', desc: 'A wall of sharpened stakes and bramble. Blocks the path; the Blight must go round or chew through.' },
  spike_trap: { name: 'Spike Trap', kind: 'build', rarity: 'common', value: 0, desc: 'Flint-tipped stakes hidden in the leaf litter. Stabs whatever steps on it, a few times.' },
  bow_tower: { name: 'Bramble Bow Tower', kind: 'build', rarity: 'uncommon', value: 0, model: 'bow_tower', desc: 'A lashed watchtower with a heavy crossbow. Long range, picks off single targets.' },
  spore_mortar: { name: 'Spore Mortar', kind: 'build', rarity: 'rare', value: 0, model: 'spore_mortar', desc: 'Lobs bursting spore pods in a high arc. Splash damage, and the spores slow whatever they touch.' },
  tesla_totem: { name: 'Tesla Totem', kind: 'build', rarity: 'epic', value: 0, model: 'tesla_totem', desc: 'Salvaged wire and a vacuum tube on a carved pole. Lightning that jumps between enemies.' },
  poultice: { name: 'Berry Poultice', kind: 'use', rarity: 'common', value: 0, heal: 45, desc: 'Mashed berries and moss bound in a leaf. Right-click to heal 45.' },
};

export const ITEM_IDS = Object.keys(ITEMS);
export const stackOf = (id) => ITEMS[id].stack ?? KIND[ITEMS[id].kind].stack;

// chance: probability of any drop at all; rolls: number of draws.
export const LOOT = {
  grass: { chance: 0.35, rolls: 1, table: [['fiber', 80], ['strange_seeds', 4], ['thorns', 6]] },
  fern: { chance: 0.45, rolls: 1, table: [['fiber', 50], ['moss', 20], ['strange_seeds', 6], ['rusty_bolts', 3], ['feather', 3]] },
  bush: { chance: 0.7, rolls: 2, table: [['stick', 34], ['thorns', 22], ['berries', 22], ['fiber', 14], ['scrap_metal', 3], ['tin_can', 2], ['copper_wire', 1.5], ['feather', 2]] },
  banana: { chance: 0.6, rolls: 2, table: [['fiber', 40], ['vine', 35], ['old_bottle', 4], ['frayed_rope', 4], ['ghost_orchid', 1]] },
  flower: { chance: 0.4, rolls: 1, table: [['strange_seeds', 40], ['ghost_orchid', 6], ['fiber', 30], ['berries', 15]] },
  mushrooms: { chance: 1, rolls: 2, table: [['mushroom', 70], ['glowcap', 9]] },
  seedling: { chance: 0.45, rolls: 1, table: [['stick', 70], ['fiber', 30]] },
  trunk: { chance: 0.7, rolls: 1, table: [['bark', 40], ['resin', 22], ['vine', 18], ['stick', 20]] },
  rock: { chance: 0.6, rolls: 1, table: [['stone', 60], ['flint', 30], ['moss', 10]] },
  scrap: { chance: 1, rolls: 3, table: [['scrap_metal', 30], ['rusty_bolts', 25], ['copper_wire', 16], ['tin_can', 12], ['battery', 8], ['brass_gear', 8], ['vacuum_tube', 2.5], ['pocket_watch', 1]] },
  crate: { chance: 1, rolls: 2, table: [['tin_can', 20], ['frayed_rope', 20], ['old_bottle', 12], ['battery', 10], ['copper_wire', 12], ['flint', 10], ['compass', 3], ['vacuum_tube', 4], ['doubloon', 1.5]] },
  camp: { chance: 1, rolls: 3, table: [['frayed_rope', 20], ['tin_can', 18], ['feather', 10], ['bone', 8], ['battery', 10], ['compass', 6], ['pocket_watch', 4], ['copper_wire', 12], ['resin', 10]] },
  ruin: { chance: 1, rolls: 2, table: [['clay', 18], ['doubloon', 16], ['jade_figurine', 5], ['brass_gear', 10], ['strange_seeds', 15], ['bone', 12], ['sun_mask', 0.6]] },
  wreck: { chance: 1, rolls: 4, table: [['scrap_metal', 20], ['battery', 18], ['vacuum_tube', 14], ['compass', 8], ['copper_wire', 18], ['brass_gear', 12], ['pocket_watch', 4]] },
  temple: { chance: 1, rolls: 3, table: [['doubloon', 50], ['jade_figurine', 25]], guaranteed: ['golden_idol'] },
  templeChest: { chance: 1, rolls: 2, table: [['doubloon', 40], ['jade_figurine', 15], ['sun_mask', 3]] },
  // what the Blight leaves behind
  blightling: { chance: 0.45, rolls: 1, table: [['bone', 35], ['thorns', 30], ['strange_seeds', 15], ['glowcap', 4]] },
  rotboar: { chance: 1, rolls: 2, table: [['bone', 30], ['moss', 20], ['mushroom', 25], ['log', 15], ['glowcap', 6]] },
};

export function rollLoot(tableName, rand) {
  const t = LOOT[tableName];
  if (!t || rand() > t.chance) return [];
  const out = t.guaranteed ? [...t.guaranteed] : [];
  for (let i = 0; i < t.rolls; i++) out.push(weighted(rand, t.table));
  return out;
}
