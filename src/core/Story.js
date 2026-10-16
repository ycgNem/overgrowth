// The Lost Expedition: what happened here, told in torn pages found in containers, and the
// story's pieces of the game (the seals, the radio, the endings).
//
// In 1931 the Vane Expedition flew in for the temple's golden idol: Dr. Iris Vane, who led it;
// Teo Ruiz, the guide; Hollis, the pilot; and you, the cartographer. At 4:17 one morning Vane
// lifted the idol and the Heartwood's seals broke. The plane went down in the storm that
// followed. Ruiz carried the idol back up the stair and set it on the altar, but set wrong it
// closes nothing. The Heartwood took you in, the one of them who never touched the gold. The
// Blight is the forest's own defence gone septic: it marches on the Heartwood because the
// Heartwood is the last thing still holding the doors.
//
// (Names and lines are placeholders for the developer to rewrite.)

// from: the night a page can turn up from; map: it marks a root cache on the compass
export const NOTES = [
  {
    id: 'vane1', from: 1, who: 'Dr. Iris Vane', title: 'Field diary, 3rd March 1931',
    text: "We set down on the river flats at noon. Hollis swears the strip will take us out again if we leave the heavy crates. Ruiz will not walk past the standing stones by the big tree; he says this forest keeps a ledger. I told him gold doesn't read ledgers.",
  },
  {
    id: 'hollis1', from: 1, who: 'Hollis', title: 'Pilot\'s log',
    text: "Fuel for one flight out, with a margin if we lighten her. The radio set hates the damp: the valves fog and the batteries sweat. I've packed spares in the tinker's crate. If it ever comes to it, a good valve, two batteries, some copper wire and a gear for the tuning drum will get a signal over the ridge. They listen on 4217 kilocycles.",
  },
  {
    id: 'ruiz1', from: 1, who: 'Teo Ruiz', title: 'A page in Spanish, translated in pencil',
    text: "The tree in the clearing is not a tree. My grandmother called it the Keeper. Under its roots it holds three doors shut. Take nothing from the old places, she said, or the doors remember that they are doors.",
  },
  {
    id: 'map1', from: 2, who: 'You', title: 'A torn map, in your own hand', map: true,
    text: "My own handwriting, from before. A ring drawn round the foot of a giant, and in the margin: 'stores, kept dry, for the walk out'. I don't remember drawing it. I've marked it on the compass.",
  },
  {
    id: 'vane2', from: 2, who: 'Dr. Iris Vane', title: 'Field diary, the temple',
    text: "Four tiers, the idol on the top altar, exactly as the old sketch had it. First light tomorrow. The cartographer keeps asking what the lines cut into the altar mean. Locks, I said. Old locks with no keys left in the world.",
  },
  {
    id: 'ruiz2', from: 3, who: 'Teo Ruiz', title: 'Scrawled on the back of a map',
    text: "I followed the boar tracks into the drowned grove. There is a second ring of stone under the black water and its altar is still warm to the hand. Two doors, then, and a third somewhere in the old ruins. The Keeper holds all three with its roots, and it is tiring.",
  },
  {
    id: 'vane3', from: 3, who: 'Dr. Iris Vane', title: 'Field diary, 4:17 a.m.',
    text: "It came free with no resistance at all. Lighter than I expected. Ruiz screamed at me from the stair and the ground answered him. Every watch in the camp stopped at the same minute. The cartographer's compass spins and will not settle.",
  },
  {
    id: 'hollis2', from: 4, who: 'Hollis', title: 'Pilot\'s log, last entry',
    text: "Storm out of a clear sky. Taking her up regardless; the gold is aboard and Vane won't wait. If anyone reads this, the radio set is in the tinker's crate at the camp. It only needs parts. Fit them and call on 4217. Someone will come.",
  },
  {
    id: 'map2', from: 4, who: 'Hollis', title: 'A sketch on a cigarette card', map: true,
    text: "'Spare valve and the good wire, wrapped in oilcloth, under the roots where the big tree splits. Don't tell Vane.' I've marked the tree on the compass.",
  },
  {
    id: 'ruiz3', from: 5, who: 'Teo Ruiz', title: 'A page pinned under a stone',
    text: "I carried it back up the stair and set it on the altar, but the lines did not close. It needs someone who can read them. Cartographer, if you find this: keep the Keeper alive. Set the gold back properly, in the seal and not on the stone. I am going down to the roots to hold the door. I do not think I will come back as myself.",
  },
  {
    id: 'vane4', from: 6, who: 'Dr. Iris Vane', title: 'Field diary, undated',
    text: "The plane is gone. The paths close behind us and open again somewhere else. The ground near the doors has gone soft and purple and it hums. Nothing grows there that I want to touch.",
  },
  {
    id: 'vane5', from: 8, who: 'Dr. Iris Vane', title: 'Field diary, the last page',
    text: "Something is laying in the soil under the old camp. I hear it at night, turning over. I am so hungry. I think it is me.",
  },
];
export const NOTE_IDS = NOTES.map((n) => n.id);
export const noteById = (id) => NOTES.find((n) => n.id === id);

// The seals: shrines that once held the doors shut. Set a relic in one and the rift nearest to
// it goes quiet; the idol, set back where it belongs, closes it for good.
export const SEALS = {
  temple: { name: 'The Sun Seal', poi: 'temple' },
  shrine: { name: 'The Water Seal', poi: 'shrine' },
  ruins: { name: 'The Stone Seal', poi: 'ruins' },
};

// what fixing the radio takes, one part at a time (Hollis's list)
export const RADIO_PARTS = [['vacuum_tube', 1], ['battery', 2], ['copper_wire', 2], ['brass_gear', 1]];

// the lifetime collection of pages (for the Field Guide), kept outside any one run
const KEY = 'og.notes';
export function loadNotes() {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) || '[]'));
  } catch {
    return new Set();
  }
}
export function saveNote(id) {
  const s = loadNotes();
  s.add(id);
  try {
    localStorage.setItem(KEY, JSON.stringify([...s]));
  } catch {
    // storage blocked
  }
}
