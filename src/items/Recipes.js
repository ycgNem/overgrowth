// Crafting recipes. Everything here is made in the satchel (Tab): no workbench needed, the
// forest is the workshop. `group` sorts them into the satchel's sections.
export const RECIPES = [
  { id: 'barricade', out: 'barricade', n: 1, group: 'Defences', needs: { stick: 4, thorns: 3, vine: 1 } },
  { id: 'spike_trap', out: 'spike_trap', n: 1, group: 'Defences', needs: { stick: 3, flint: 2 } },
  { id: 'vine_snare', out: 'vine_snare', n: 1, group: 'Defences', needs: { vine: 4, fiber: 3, stick: 2, thorns: 2 } },
  { id: 'bow_tower', out: 'bow_tower', n: 1, group: 'Defences', needs: { log: 2, stick: 3, vine: 2, flint: 2, feather: 2 } },
  { id: 'ember_brazier', out: 'ember_brazier', n: 1, group: 'Defences', needs: { stone: 4, clay: 2, log: 1, resin: 2 } },
  { id: 'spore_mortar', out: 'spore_mortar', n: 1, group: 'Defences', needs: { log: 1, stone: 3, mushroom: 4, clay: 2, resin: 1 } },
  { id: 'glow_lantern', out: 'glow_lantern', n: 1, group: 'Defences', needs: { glowcap: 2, stick: 4, resin: 1, fiber: 2 } },
  { id: 'tesla_totem', out: 'tesla_totem', n: 1, group: 'Defences', needs: { log: 1, copper_wire: 2, battery: 1, vacuum_tube: 1, scrap_metal: 2 } },
  { id: 'slingshot', out: 'slingshot', n: 1, group: 'Weapons', needs: { stick: 2, vine: 1, fiber: 3 } },
  { id: 'scrap_shot', out: 'scrap_shot', n: 6, group: 'Weapons', needs: { tin_can: 1, rusty_bolts: 2 } },
  { id: 'firepot', out: 'firepot', n: 2, group: 'Weapons', needs: { old_bottle: 1, resin: 2, fiber: 1 } },
  { id: 'poultice', out: 'poultice', n: 1, group: 'Supplies', needs: { berries: 4, fiber: 1, moss: 1 } },
  { id: 'orchid_salve', out: 'orchid_salve', n: 1, group: 'Supplies', needs: { ghost_orchid: 1, moss: 2, resin: 1 } },
];
