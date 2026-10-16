// How hard the Blight comes. Chosen on the title screen when a run starts and kept in the save.
// hp scales every Blight's health, count scales how many come, heart scales the Heartwood's
// HP, and starter is the kit you wake up with. keepOnDeath: what you keep when you fall out in
// the forest ('all'; 'pack': the belt and the safe pouch, the pack drops; 'hotbar': only your
// weapons and the pouch).
export const DIFFICULTIES = {
  verdant: {
    name: 'Verdant', glyph: '❀', hp: 0.7, count: 0.75, heart: 1.4, keepOnDeath: 'all', elites: 0, roots: 1.15,
    starter: [['bow_tower', 2], ['spike_trap', 3], ['poultice', 4]],
    blurb: 'For roaming and building. Fewer, frailer Blight, and a hardier Heartwood. Two towers to start.',
  },
  warden: {
    name: 'Warden', glyph: '❦', hp: 1, count: 1, heart: 1, keepOnDeath: 'pack', elites: 1, eliteFrom: 5, roots: 1,
    starter: [['bow_tower', 1], ['spike_trap', 2], ['poultice', 2]],
    blurb: 'The intended challenge. Every night pushes a little harder than the last. Ten nights to hold.',
  },
  blightborn: {
    name: 'Blightborn', glyph: '☣', hp: 1.2, count: 1.25, heart: 0.8, keepOnDeath: 'hotbar', elites: 1.5, eliteFrom: 2, roots: 0.9,
    starter: [['bow_tower', 1], ['spike_trap', 1]],
    blurb: 'The forest has turned. Tougher Blight in greater packs, a frailer Heartwood, and no poultices.',
  },
};

export const DIFFICULTY_IDS = Object.keys(DIFFICULTIES);
export const difficulty = (id) => DIFFICULTIES[id] || DIFFICULTIES.warden;

// Kits: what you wake up with, picked under the difficulty once the Many Paths Memory is
// earned. 'starter' is the difficulty's own; the other two trade its tower for a plan.
export const KITS = {
  starter: { name: 'Usual Kit', glyph: '❦', blurb: "The difficulty's own: a Bramble Bow Tower, traps and poultices." },
  builder: {
    name: "Builder's Kit", glyph: '▦', items: [['barricade', 3], ['spore_mortar', 1], ['log', 8]],
    blurb: 'Three thorn barricades, a Spore Mortar and a stack of logs. Shape the lanes from the first night.',
  },
  hunter: {
    name: "Hunter's Kit", glyph: '➹', items: [['slingshot', 1], ['stone', 20], ['firepot', 2], ['poultice', 3]],
    blurb: 'A slingshot and twenty stones, two firepots and three poultices. No tower: you are the defence.',
  },
};
export const KIT_IDS = Object.keys(KITS);
// the items a run starts with on difficulty d with kit k
export const kitItems = (d, k) => (KITS[k]?.items || d.starter);
