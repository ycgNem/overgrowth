// Boons of the Heartwood. Offering relics earns favour; each time favour crosses the next
// threshold the Heartwood offers three boons and you keep one. Boons are permanent for the
// run and work through `mods`, a bag of multipliers the other systems read.
export const PERKS = [
  { id: 'edge', glyph: '⚔', name: 'Whetted Edge', desc: 'Machete hits deal 40% more damage.', apply: (m) => { m.macheteDmg *= 1.4; } },
  { id: 'reach', glyph: '➶', name: 'Long Sight', desc: 'Towers reach 15% further.', apply: (m) => { m.towerRange *= 1.15; } },
  { id: 'hands', glyph: '⟳', name: 'Steady Hands', desc: 'Towers fire 15% faster.', apply: (m) => { m.towerRate *= 0.85; } },
  { id: 'bite', glyph: '✦', name: 'Sharpened Heads', desc: 'Towers hit 20% harder.', apply: (m) => { m.towerDmg *= 1.2; } },
  { id: 'bark', glyph: '❦', name: 'Heartwood Bark', desc: 'The Heartwood gains 200 max HP and heals fully.', apply: (m, g) => { g.base.maxHp += 200; g.base.hp = g.base.maxHp; } },
  { id: 'thorns', glyph: '✶', name: 'Thorned Roots', desc: 'Blight that bites the Heartwood takes 10 damage back.', apply: (m) => { m.heartThorns += 10; } },
  { id: 'luck', glyph: '☘', name: "Forager's Luck", desc: 'Plants, trunks, rocks and Blight drop more.', apply: (m) => { m.lootBonus += 0.3; } },
  { id: 'feet', glyph: '»', name: 'Swift Feet', desc: 'Move 12% faster; stamina recovers 40% faster.', apply: (m) => { m.moveSpeed *= 1.12; m.staminaRegen *= 1.4; } },
  { id: 'regrowth', glyph: '♣', name: 'Living Wood', desc: 'Your buildings slowly mend themselves (1% a second).', apply: (m) => { m.buildRegen += 0.01; } },
  { id: 'spores', glyph: '✺', name: 'Potent Spores', desc: 'Mortar splash is 30% wider and slows harder.', apply: (m) => { m.mortarSplash *= 1.3; m.sporeSlow *= 0.75; } },
  { id: 'sling', glyph: '◎', name: 'Sling Mastery', desc: 'The slingshot draws 40% faster and hits 30% harder.', apply: (m) => { m.slingDraw *= 1.4; m.slingDmg *= 1.3; } },
  { id: 'blood', glyph: '♥', name: 'Bloodroot', desc: 'Every Blight you kill heals you for 4.', apply: (m) => { m.killHeal += 4; } },
  { id: 'hide', glyph: '⛨', name: 'Barkskin', desc: 'You take 25% less damage and have 30 more max HP.', apply: (m, g) => { m.playerArmor *= 0.75; g.player.maxHp += 30; g.player.hp += 30; } },
  // boons that change a rule rather than a number
  { id: 'split', glyph: '⋔', name: 'Splitting Shafts', desc: 'Bow bolts split on impact: a second bolt seeks the nearest other Blight for 60% damage.', apply: (m) => { m.boltSplit = 0.6; } },
  { id: 'lastbloom', glyph: '❀', name: 'Last Bloom', desc: 'Once a night, when the Heartwood falls below 30%, it bursts: heals 25% and blasts Blight within 12 m for 60.', apply: (m) => { m.lastBloom = true; } },
  { id: 'roots', glyph: '⌇', name: 'Grasping Roots', desc: 'At night, every 12 s roots seize the four Blight nearest the Heartwood (within 18 m) for 2.5 s.', apply: (m) => { m.rootPulse = true; } },
  { id: 'harvest', glyph: '⚘', name: 'Harvest Dawn', desc: 'Every dawn each of your towers brings in two building materials.', apply: (m) => { m.harvest = true; } },
  // earned with the Memory "The Thornback's Hide" (core/Memories.js)
  { id: 'emberheart', memory: 'trophy', glyph: '♨', name: 'Ember Heart', desc: 'Blight that bite the Heartwood catch fire: 8 a second for 3 s.', apply: (m) => { m.heartBurn = true; } },
  { id: 'deeproots', memory: 'trophy', glyph: '⚚', name: 'Deep Roots', desc: 'Every dawn, all your buildings mend completely.', apply: (m) => { m.dawnMend = true; } },
  { id: 'lanterns', memory: 'trophy', glyph: '❂', name: 'Lantern Bearer', desc: 'Glowcap Lanterns shine 40% further, and Blight in their light take another 15% more.', apply: (m) => { m.lanternRange *= 1.4; m.lanternExpose += 0.15; } },
  { id: 'rot', glyph: '☣', name: 'Rotting Bloom', desc: 'Blight that die while slowed burst into spores: everything within 4 m is slowed by half for 3 s.', apply: (m) => { m.sporeBurst = true; } },
];

// favour needed for the 1st, 2nd, 3rd ... boon
export const thresholds = (k) => Math.round(50 + k * 70 + k * k * 15);

export function baseMods() {
  return {
    macheteDmg: 1, towerRange: 1, towerRate: 1, towerDmg: 1, heartThorns: 0, lootBonus: 0, moveSpeed: 1, staminaRegen: 1,
    buildRegen: 0, mortarSplash: 1, sporeSlow: 1, slingDraw: 1, slingDmg: 1, killHeal: 0, playerArmor: 1,
    boltSplit: 0, lastBloom: false, rootPulse: false, harvest: false, sporeBurst: false,
    heartBurn: false, dawnMend: false, lanternRange: 1, lanternExpose: 0,
  };
}

// n boons the player doesn't have yet, picked at random from those their Memories allow
export function offerPerks(owned, rand = Math.random, n = 3, memories = new Set()) {
  const pool = PERKS.filter((p) => !owned.includes(p.id) && (!p.memory || memories.has(p.memory)));
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}
