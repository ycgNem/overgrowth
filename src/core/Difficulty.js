// How hard the Blight comes. Chosen on the title screen when a run starts and kept in the save.
// hp scales every Blight's health, count scales how many come, heart scales the Heartwood's
// HP, and starter is the kit you wake up with.
export const DIFFICULTIES = {
  verdant: {
    name: 'Verdant', glyph: '❀', hp: 0.75, count: 0.75, heart: 1.4,
    starter: [['bow_tower', 2], ['spike_trap', 3], ['poultice', 4]],
    blurb: 'For roaming and building. Fewer, frailer Blight, and a hardier Heartwood. Two towers to start.',
  },
  warden: {
    name: 'Warden', glyph: '❦', hp: 1, count: 1, heart: 1,
    starter: [['bow_tower', 1], ['spike_trap', 2], ['poultice', 2]],
    blurb: 'The intended challenge. Every night pushes a little harder than the last. Ten nights to hold.',
  },
  blightborn: {
    name: 'Blightborn', glyph: '☣', hp: 1.3, count: 1.25, heart: 0.8,
    starter: [['bow_tower', 1], ['spike_trap', 1]],
    blurb: 'The forest has turned. Tougher Blight in greater packs, a frailer Heartwood, and no poultices.',
  },
};

export const DIFFICULTY_IDS = Object.keys(DIFFICULTIES);
export const difficulty = (id) => DIFFICULTIES[id] || DIFFICULTIES.warden;
