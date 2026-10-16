// Which world this is. The forest is a pure function of the seed: 4217 (the watch stopped at
// 4:17) for every ordinary vigil, or, for the daily vigil (?daily), one made from today's date,
// the same for everyone that day. ?seed=<n> picks any other. Read once, at load.
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
};

// the daily vigil's date (YYYYMMDD), or null
export const DAILY = params.has('daily') ? (params.get('daily') || today()) : null;

function seedOf(s) {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) % 100000;
}

export const WORLD_SEED = DAILY ? seedOf(`daily:${DAILY}`) : params.has('seed') ? seedOf(params.get('seed')) : 4217;
// mixed into every chunk's random stream (0 for the ordinary world, so it stays as it was)
export const WORLD_SALT = WORLD_SEED === 4217 ? 0 : seedOf(`salt:${WORLD_SEED}`);

// "15 October" for the title
export function dailyLabel(d = DAILY) {
  if (!d) return '';
  const date = new Date(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8));
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
}
