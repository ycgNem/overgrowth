// Item definitions and loot tables. Add a new item here + a model in
// ItemModels.js and it shows up everywhere (pickups, icons, inventory, recipes).
//
// kind: material (crafting), scrap (salvage, also crafting), relic (offer at the
//       Heartwood), build (placeable defence), use (consumable), tool (weapon), gear (kept
//       in the satchel for what it lets you do: the pry bar), pack (a backpack: crafting
//       one puts it on), note (a torn page: read the moment you pick it up), graft (a tower
//       attachment, fitted with G once the Workbench knows how).
// Every item weighs something (WEIGHT below, kilograms each); the backpack decides how much
// you can carry before you slow down.
import { weighted } from '../utils/rng.js';

export const RARITY = {
  common: { name: 'Common', color: '#cfc7b0', order: 0 },
  uncommon: { name: 'Uncommon', color: '#7ad66a', order: 1 },
  rare: { name: 'Rare', color: '#57a9ff', order: 2 },
  epic: { name: 'Epic', color: '#c77dff', order: 3 },
  legendary: { name: 'Legendary', color: '#ffbf3c', order: 4 },
};

export const KIND = {
  material: { name: 'Material', stack: 15 },
  scrap: { name: 'Salvage', stack: 10 },
  relic: { name: 'Relic', stack: 10 },
  build: { name: 'Defence', stack: 5 },
  use: { name: 'Consumable', stack: 10 },
  tool: { name: 'Weapon', stack: 1 },
  gear: { name: 'Gear', stack: 1 },
  pack: { name: 'Backpack', stack: 1 },
  note: { name: 'Page', stack: 5 },
  graft: { name: 'Graft', stack: 3 },
};

export const ITEMS = {
  // ------------------------------------------------------------- forest materials
  stick: { name: 'Stick', kind: 'material', rarity: 'common', value: 1, desc: 'A straight, dry branch. The start of nearly everything.' },
  log: { name: 'Log', kind: 'material', rarity: 'common', value: 3, stack: 8, desc: 'A length of trunk, hacked free with a lot of effort.' },
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
  // the drowned grove
  reed: { name: 'Reeds', kind: 'material', rarity: 'common', value: 1, desc: 'Hollow stems cut from the drowned grove. Light and tough; they thatch and lash into anything.' },
  eel: { name: 'Bog Eel', kind: 'material', rarity: 'uncommon', value: 4, desc: 'Slick, black and still twitching. Smoke it over a curl of bark and it will feed you well.' },
  bog_iron: { name: 'Bog Iron', kind: 'material', rarity: 'uncommon', value: 6, desc: 'Rust-red nodules that grow in the swamp mud. Crude iron, but iron: it binds walls and makes shot.' },
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
  ember_brazier: { name: 'Ember Brazier', kind: 'build', rarity: 'rare', value: 0, model: 'ember_brazier', desc: 'A clay fire bowl on lashed legs. Sets nearby Blight alight, wisps included, and lights the clearing. Rain dampens it.' },
  glow_lantern: { name: 'Glowcap Lantern', kind: 'build', rarity: 'rare', value: 0, model: 'glow_lantern', desc: 'A cage of glowcaps hung from a lashed pole. Its cold light shows up every weak seam in the Blight (they take more damage in it) and drags Burrowers up out of the ground.' },
  vine_snare: { name: 'Vine Snare', kind: 'build', rarity: 'uncommon', value: 0, model: 'vine_snare', desc: 'Coiled lianas under a mat of leaves. Whips up and binds whatever walks in, a few times over. Too weak to hold a Thornback, but it slows one.' },
  poultice: { name: 'Berry Poultice', kind: 'use', rarity: 'common', value: 0, heal: 45, desc: 'Mashed berries and moss bound in a leaf. Right-click to heal 45.' },
  smoked_eel: { name: 'Smoked Eel', kind: 'use', rarity: 'uncommon', value: 0, heal: 75, desc: 'A bog eel smoked black over bark. Rich, oily and filling. Right-click to heal 75.' },
  firepot: { name: 'Firepot', kind: 'use', rarity: 'uncommon', value: 0, throw: true, desc: 'An old bottle of resin with a fibre wick. Right-click to throw: it bursts into flame and sets the Blight alight.' },
  orchid_salve: { name: 'Orchid Salve', kind: 'use', rarity: 'rare', value: 0, salve: true, desc: 'Ghost orchid nectar worked into moss. Right-click near your defences: mends every building within 20 m and the Heartwood.' },
  slingshot: { name: 'Slingshot', kind: 'tool', rarity: 'uncommon', value: 0, desc: 'A forked branch and a vine sling. Hold LMB to draw, release to fire. Shoots stones, or scrap shot for a harder hit. Reaches wisps.' },
  pry_bar: { name: 'Pry Bar', kind: 'gear', rarity: 'uncommon', value: 0, desc: 'A bar of bog iron beaten flat at one end. Opens a locked chest in a moment, quietly. Without it, forcing a lock takes a while and carries a long way.' },
  rot_hide: { name: 'Rotboar Hide', kind: 'material', rarity: 'uncommon', value: 5, desc: 'A slab of tough, bristled hide. Scraped and dried, it makes a pack that carries a load.' },
  woven_satchel: { name: 'Woven Satchel', kind: 'pack', rarity: 'common', value: 0, desc: 'Plaited fibre over a frame of sticks. It carries 20 kg in 16 pockets, with one safe pouch sewn inside.' },
  hide_pack: { name: 'Hide Pack', kind: 'pack', rarity: 'uncommon', value: 0, desc: 'Rotboar hide over a bone frame. It carries 26 kg in 18 pockets, with one safe pouch.' },
  rucksack: { name: "Explorer's Rucksack", kind: 'pack', rarity: 'rare', value: 0, desc: "The expedition's own canvas rucksack, patched with hide and geared to sit high. It carries 32 kg in 20 pockets, with two safe pouches." },
  heartseed: { name: 'Heartseed Sapling', kind: 'build', rarity: 'rare', value: 0, model: 'heartseed', desc: 'A cutting of the Heartwood in a ring of stones. Where it stands the Rot pulls back (9 m) and cannot spread.' },
  // ------------------------------------------------------------- the expedition
  torn_page: { name: 'Torn Page', kind: 'note', rarity: 'uncommon', value: 0, desc: "A page torn out of someone's notebook. You read it the moment you pick it up (Satchel, Notes)." },
  thornback_heart: { name: "The Thornback's Heart", kind: 'relic', rarity: 'legendary', value: 40, desc: "Still warm, still beating, slowly. Set it into the Workbench and you'll learn to graft what the forest grows onto your towers. Or offer it, bury it, or set it in a seal." },
  glowcap_lens: { name: 'Glowcap Lens', kind: 'graft', rarity: 'rare', value: 0, graft: true, desc: 'A lens of fused glowcap. Graft it to a tower: +20% range.' },
  bog_heads: { name: 'Bog-iron Heads', kind: 'graft', rarity: 'uncommon', value: 0, graft: true, desc: 'Barbed heads of bog iron. Graft it to a tower: its hits ignore hide and armour (no resistances).' },
  resin_drip: { name: 'Resin Drip', kind: 'graft', rarity: 'uncommon', value: 0, graft: true, desc: 'A pot of hot resin that drips on every shot. Graft it to a tower: its hits set the Blight burning.' },
  coiled_spring: { name: 'Coiled Spring', kind: 'graft', rarity: 'rare', value: 0, graft: true, desc: 'A clock spring from the wreck. Graft it to a tower: it fires 20% faster.' },
  root_anchor: { name: 'Root Anchor', kind: 'graft', rarity: 'rare', value: 0, graft: true, desc: 'A knot of live root. Graft it to any building: +30% HP, and it slowly mends.' },
  scrap_shot: { name: 'Scrap Shot', kind: 'material', rarity: 'uncommon', value: 2, ammo: 1.6, desc: 'Jagged slugs hammered from tin and bolts. Slingshot ammo that hits much harder than stone.' },
};

export const ITEM_IDS = Object.keys(ITEMS);
export const stackOf = (id) => ITEMS[id].stack ?? KIND[ITEMS[id].kind].stack;

// kilograms each. Logs, stone, iron and built defences are what fill a pack; feathers, seeds
// and fibre weigh next to nothing.
const KIND_WEIGHT = { material: 0.3, scrap: 0.5, relic: 0.5, build: 4, use: 0.3, tool: 0.6, gear: 1, pack: 0 };
const WEIGHT = {
  stick: 0.3, log: 4, stone: 1, flint: 0.4, fiber: 0.1, vine: 0.3, bark: 0.2, resin: 0.3, thorns: 0.1,
  mushroom: 0.2, glowcap: 0.3, berries: 0.1, clay: 1.5, feather: 0.05, bone: 0.5, moss: 0.1, strange_seeds: 0.05,
  reed: 0.2, eel: 0.8, bog_iron: 2, ghost_orchid: 0.1, rot_hide: 1.5,
  scrap_metal: 1.5, rusty_bolts: 0.4, frayed_rope: 0.8, old_bottle: 0.6, tin_can: 0.3, copper_wire: 0.8,
  brass_gear: 1, battery: 1.5, vacuum_tube: 0.6,
  compass: 0.8, pocket_watch: 0.5, doubloon: 0.5, jade_figurine: 2, golden_idol: 6, sun_mask: 3,
  barricade: 2.5, spike_trap: 1, bow_tower: 3, spore_mortar: 4, tesla_totem: 3, ember_brazier: 3.5, glow_lantern: 2, vine_snare: 1,
  poultice: 0.3, smoked_eel: 0.6, firepot: 0.8, orchid_salve: 0.3, slingshot: 0.5, scrap_shot: 0.15, pry_bar: 1.5,
  heartseed: 2, torn_page: 0.02, thornback_heart: 2, glowcap_lens: 0.4, bog_heads: 0.8, resin_drip: 0.6, coiled_spring: 0.5, root_anchor: 1,
};
export const weightOf = (id) => ITEMS[id].wt ?? WEIGHT[id] ?? KIND_WEIGHT[ITEMS[id].kind] ?? 0.5;
// things that break when a container they're in is smashed open instead of searched
export const FRAGILE = new Set(['old_bottle', 'vacuum_tube', 'battery', 'pocket_watch', 'compass', 'jade_figurine', 'glowcap_lens']);
// the grafts, for loot tables
export const GRAFT_IDS = ['glowcap_lens', 'bog_heads', 'resin_drip', 'coiled_spring', 'root_anchor'];

// Backpacks: what each carries. Wearing one is the satchel's capacity, pack slots and safe pouch.
export const PACKS = {
  woven_satchel: { cap: 20, slots: 16, safe: 1 },
  hide_pack: { cap: 26, slots: 18, safe: 1 },
  rucksack: { cap: 32, slots: 20, safe: 2 },
};

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
  crate: { chance: 1, rolls: 3, table: [['tin_can', 20], ['frayed_rope', 20], ['old_bottle', 12], ['battery', 10], ['copper_wire', 12], ['flint', 10], ['compass', 3], ['vacuum_tube', 4], ['doubloon', 1.5], ['bog_heads', 1.2], ['resin_drip', 1.2], ['coiled_spring', 0.6]] },
  camp: { chance: 1, rolls: 3, table: [['frayed_rope', 20], ['tin_can', 18], ['feather', 10], ['bone', 8], ['battery', 10], ['compass', 6], ['pocket_watch', 4], ['copper_wire', 12], ['resin', 10]] },
  ruin: { chance: 1, rolls: 2, table: [['clay', 18], ['doubloon', 16], ['jade_figurine', 5], ['brass_gear', 10], ['strange_seeds', 15], ['bone', 12], ['sun_mask', 0.6]] },
  wreck: { chance: 1, rolls: 4, table: [['scrap_metal', 20], ['battery', 18], ['vacuum_tube', 14], ['compass', 8], ['copper_wire', 18], ['brass_gear', 12], ['pocket_watch', 4], ['coiled_spring', 3]] },
  temple: { chance: 1, rolls: 3, table: [['doubloon', 50], ['jade_figurine', 25]], guaranteed: ['golden_idol'] },
  templeChest: { chance: 1, rolls: 2, table: [['doubloon', 40], ['jade_figurine', 15], ['sun_mask', 3], ['glowcap_lens', 6], ['root_anchor', 6]] },
  // a root cache: something someone hid in the buttress roots and never came back for
  cache: { chance: 1, rolls: 3, table: [['flint', 16], ['resin', 14], ['feather', 12], ['copper_wire', 10], ['battery', 8], ['frayed_rope', 10], ['glowcap', 8], ['brass_gear', 6], ['vacuum_tube', 4], ['compass', 3], ['doubloon', 3], ['pocket_watch', 2], ['root_anchor', 1.5], ['glowcap_lens', 1.5]] },
  // a Blight Bloom cut down: what it was feeding on
  reeds: { chance: 0.85, rolls: 1, table: [['reed', 80], ['fiber', 14], ['eel', 3], ['strange_seeds', 3]] },
  shrine: { chance: 1, rolls: 3, table: [['bog_iron', 24], ['glowcap', 18], ['jade_figurine', 10], ['doubloon', 14], ['vacuum_tube', 8], ['ghost_orchid', 10], ['strange_seeds', 12], ['sun_mask', 1]], guaranteed: ['jade_figurine'] },
  bloom: { chance: 1, rolls: 3, table: [['strange_seeds', 26], ['glowcap', 20], ['resin', 12], ['bone', 10], ['battery', 7], ['vacuum_tube', 6], ['ghost_orchid', 6], ['doubloon', 7], ['jade_figurine', 2]] },
  // an elite's extra drop
  elite: { chance: 1, rolls: 1, table: [['glowcap', 18], ['brass_gear', 14], ['battery', 12], ['vacuum_tube', 9], ['bog_iron', 12], ['strange_seeds', 14], ['ghost_orchid', 8], ['doubloon', 8], ['rot_hide', 10], ['bog_heads', 4], ['resin_drip', 4], ['coiled_spring', 3], ['glowcap_lens', 3], ['root_anchor', 3]] },
  // a supply drop called down by the radio: the good stuff, and the Husks know it
  drop: { chance: 1, rolls: 4, table: [['firepot', 14], ['poultice', 14], ['scrap_shot', 12], ['battery', 10], ['vacuum_tube', 8], ['copper_wire', 10], ['brass_gear', 8], ['bog_heads', 7], ['resin_drip', 7], ['coiled_spring', 6], ['glowcap_lens', 6], ['root_anchor', 6], ['orchid_salve', 4]] },
  // what the Blight leaves behind
  blightling: { chance: 0.55, rolls: 1, table: [['bone', 28], ['thorns', 24], ['stone', 18], ['strange_seeds', 14], ['fiber', 12], ['glowcap', 4]] },
  rotboar: { chance: 1, rolls: 2, table: [['bone', 30], ['rot_hide', 24], ['moss', 16], ['mushroom', 20], ['log', 12], ['resin', 10], ['glowcap', 6]] },
  // a day-walking Husk: what the forest's dead were carrying
  husk: { chance: 1, rolls: 2, table: [['rusty_bolts', 18], ['scrap_metal', 14], ['frayed_rope', 12], ['copper_wire', 12], ['battery', 9], ['brass_gear', 8], ['bone', 12], ['vacuum_tube', 3], ['compass', 2]] },
  wisp: { chance: 0.7, rolls: 1, table: [['feather', 30], ['strange_seeds', 30], ['resin', 20], ['glowcap', 14], ['ghost_orchid', 3]] },
  spitter: { chance: 0.8, rolls: 1, table: [['mushroom', 30], ['resin', 22], ['clay', 18], ['strange_seeds', 16], ['glowcap', 9], ['old_bottle', 5]] },
  burrower: { chance: 1, rolls: 2, table: [['stone', 26], ['flint', 22], ['clay', 18], ['bone', 14], ['glowcap', 8], ['bog_iron', 6], ['brass_gear', 4], ['copper_wire', 4]] },
  thornback: { chance: 1, rolls: 6, table: [['glowcap', 20], ['bone', 20], ['strange_seeds', 15], ['brass_gear', 10], ['vacuum_tube', 8], ['ghost_orchid', 8], ['log', 10]], guaranteed: ['thornback_heart', 'glowcap'] },
  // the Rot Mother (night 10, and every fifth after)
  rot_mother: { chance: 1, rolls: 6, table: [['glowcap', 20], ['ghost_orchid', 12], ['strange_seeds', 16], ['vacuum_tube', 8], ['root_anchor', 6], ['glowcap_lens', 6]], guaranteed: ['sun_mask', 'thornback_heart'] },
  rot_egg: { chance: 0.5, rolls: 1, table: [['strange_seeds', 50], ['resin', 30], ['glowcap', 10]] },
};

// grafts don't turn up until the Workbench can set them (Expedition.grafting keeps this)
export const lootGate = { grafting: false };
const GRAFT_SET = new Set(GRAFT_IDS);
const ungrafted = new Map();

export function rollLoot(tableName, rand) {
  const t = LOOT[tableName];
  if (!t || rand() > t.chance) return [];
  let table = t.table;
  if (!lootGate.grafting) {
    if (!ungrafted.has(t)) ungrafted.set(t, t.table.filter(([id]) => !GRAFT_SET.has(id)));
    table = ungrafted.get(t);
  }
  const out = t.guaranteed ? [...t.guaranteed] : [];
  for (let i = 0; i < t.rolls; i++) out.push(weighted(rand, table));
  return out;
}

// ------------------------------------------------------------- where things come from

// lying loose on the floor (World.plan's forage), and in the drowned grove's shallows
const FLOOR = new Set(['stick', 'stone', 'flint', 'mushroom', 'glowcap', 'feather', 'bone', 'bark', 'fiber', 'moss', 'berries', 'vine', 'clay']);
const GROVE_FLOOR = new Set(['reed', 'eel', 'bog_iron', 'moss', 'clay']);
const SOURCE_NAMES = {
  grass: 'cutting grass', fern: 'cutting ferns', bush: 'cutting bushes', banana: 'cutting banana plants', flower: 'cutting flowers',
  mushrooms: 'mushroom clumps', seedling: 'cutting saplings', trunk: 'chopping tree trunks', rock: 'breaking rocks',
  scrap: 'scrap heaps', crate: 'supply crates', camp: 'the abandoned camp', ruin: 'ruins', wreck: 'the plane wreck',
  temple: 'the temple', templeChest: 'temple chests', reeds: 'reed beds', shrine: 'the sunken shrine', bloom: 'Blight Blooms',
  cache: 'root caches', husk: 'Husks', elite: 'elite Blight', drop: 'supply drops', rot_mother: 'the Rot Mother', rot_egg: 'Rot eggs', blightling: 'Blightlings', rotboar: 'Rotboars', wisp: 'Wisps', spitter: 'Spitters', burrower: 'Burrowers', thornback: 'the Thornback',
};

// Where to look for an item, in a few words ("on the forest floor · breaking rocks"): read
// from the forage lists and the loot tables, best odds first, so it stays true as they change.
export function whereToFind(id, max = 3) {
  // (a tree frees a log every third good blow: Game.hackTree, not a loot table)
  const out = id === 'log' ? ['chopping trees with the machete'] : [];
  if (FLOOR.has(id)) out.push('on the forest floor');
  if (GROVE_FLOOR.has(id) && !FLOOR.has(id)) out.push('in the drowned grove');
  const odds = [];
  for (const [name, t] of Object.entries(LOOT)) {
    const total = t.table.reduce((s, [, w]) => s + w, 0);
    const w = t.table.find(([i]) => i === id)?.[1] ?? 0;
    const p = (t.guaranteed?.includes(id) ? 1 : 0) + t.chance * t.rolls * (w / total);
    if (p > 0.02) odds.push([name, p]);
  }
  odds.sort((a, b) => b[1] - a[1]);
  for (const [name] of odds) {
    if (out.length >= max) break;
    out.push(SOURCE_NAMES[name] || name);
  }
  return out.join(' · ');
}
