# Overgrowth: Gather, Craft, Defend

Overgrowth is becoming a **first-person tower defence**. By day you roam the jungle and gather
what the forest gives you. You craft that into towers, traps and tools. At dusk the Blight
crawls out of rifts in the forest and marches on the **Heartwood**, the shrine at your camp.
You hold the line with your towers and your machete until dawn.

## The loop

```
 DAY (gather, ~6 min)            DUSK                    NIGHT (defend)             DAWN
 explore, cut, forage   ──►  horn + rifts open   ──►  waves path to the Heart ──►  rewards,
 scavenge POIs               last-minute building     towers + machete fight       next day is harder
 craft in the satchel                                  Heart HP 0 = run over
```

- **Day.** The sky clock runs from dawn to dusk in about six real minutes. Hold **T** to skip
  ahead, or hold **E** at the Heartwood to call the night early.
- **Night.** The clock slows down while the wave runs. The wave ends once every Blight is dead,
  then the clock fast-forwards to dawn.
- **Losing.** When the Heartwood's HP reaches 0, the run is over. A summary shows how many nights
  you survived.
- **Dying.** You respawn at the Heartwood after 5 seconds and keep your inventory.

## Pillars

1. **Everything you build comes from what you found.** No shop and no currency. Every tower has a
   recipe made of forest materials. Rare scavenged items (copper wire, batteries, vacuum tubes)
   unlock the strongest builds.
2. **You are a tower too.** First-person melee and ranged combat matters. Towers thin the waves
   and you clean up what gets through.
3. **The forest is the map.** Enemies follow a flow field over the real terrain. Trees, rocks and
   rivers shape the lanes. Barricades let you re-route them (mazing).

## Systems

| System | File(s) | Notes |
| --- | --- | --- |
| Slot inventory | `items/Inventory.js` | 8-slot hotbar + 24-slot pack, stack limits, 1–8 / wheel select |
| Forest items | `items/ItemDB.js`, `items/ItemModels.js` | ~16 new materials alongside the old scavenge loot |
| Foraging | `world/World.js` (forage layer) | sticks, stones, flint, mushrooms, berries, clay, feathers, bones lying in the world: **E** to pick up |
| Harvesting | `core/Game.js` | machete on trunks → bark/resin/vines, on rocks → stone/flint, plants → fiber/thorns/berries |
| Crafting | `items/Recipes.js`, `ui/HUD.js` | Craft tab in the satchel; towers, traps, tools, consumables |
| Base | `defense/Base.js` | Heartwood shrine at spawn, cleared ring, build zone radius 42 m |
| Waves | `defense/Waves.js` | phase state machine tied to `Sky.time`; wave composition per night |
| Pathing | `defense/FlowField.js` | 2 m grid, Dijkstra from the Heart, costs from slope/water/colliders/barricades |
| Enemies | `defense/Enemies.js` | Blightling (fast swarm), Rotboar (tank, breaks barricades), Wisp (flying, ignores walls) |
| Towers | `defense/Towers.js` | placement ghost, targeting, projectiles, HP, repair |
| Assets | `assets/Models.js`, `public/models/*.glb` | Blender-made GLBs, procedural fallback if a file is missing |

## Content (first pass)

**Forest materials:** stick, log, stone, flint, plant fiber, vine, tree resin, bark, mushroom,
glowcap, berries, thorns, clay, feather, bone, moss. The old scavenge items stay as rare
components: scrap metal, bolts, copper wire, brass gear, battery, vacuum tube, and so on.
Relics (doubloon, idol, mask) can be **offered at the Heartwood** to heal it.

**Buildables**

| Build | Recipe | Role |
| --- | --- | --- |
| Thorn Barricade | 4 stick, 3 thorns, 1 vine | Wall. Blocks paths, hurts attackers |
| Bramble Bow Tower | 2 log, 3 stick, 2 vine, 2 flint, 2 feather | Single target, long range |
| Spore Mortar | 1 log, 3 stone, 4 mushroom, 2 clay, 1 resin | Splash damage, slows |
| Tesla Totem | 1 log, 2 copper wire, 1 battery, 1 vacuum tube, 2 scrap metal | Chain lightning |
| Spike Trap | 3 stick, 2 flint | Floor trap, a few uses |
| Berry Poultice | 4 berries, 1 fiber, 1 moss | Heal 45 |
| Glowcap Torch | 1 stick, 1 resin, 1 glowcap | Light (milestone 2) |

**Blender assets (in `public/models/`)**: Heartwood shrine, Bramble Bow Tower, Spore Mortar,
Tesla Totem, Thorn Barricade, Blightling, Rotboar. Each one is under about 6k triangles, with
named parts so the code can animate them (bow arm, mortar barrel, legs, jaw).

## Milestones

1. **Foundation: done (2026-10-13).** Jump/mouse fixes, the slot inventory with hotbar, forest items,
   foraging and harvesting, crafting, the Heartwood base, the day/night wave director, flow-field
   enemies (Blightling and Rotboar), three towers plus barricade and spike trap, player and Heart
   HP, game over, and the Blender asset pipeline.
2. **Fight feel.** A slingshot (stone ammo) for ranged play, hit reactions, enemy death VFX,
   tower upgrade tiers, a repair action, the wave preview on the compass, and Wisps.
3. **Depth.** Saves in `localStorage`, more towers (Ember Brazier, Vine Snare), boss nights every
   5th night, relic offerings that unlock perks, and weather (rain slows Blight and dims towers).
4. **Polish.** Critic passes (`indie-critic`, `design-critic`), audio for every combat event,
   tutorial prompts on the first day, and a balance pass.

## Balance starting points

- Day 1 is generous: you start with one Bramble Bow Tower, and it holds night 1 (9 Blightlings) on its own.
- Measured with a passive player: the starter tower alone loses the Heartwood on night 3; two bow
  towers, a mortar, barricades and traps hold night 6 with 187/500 HP left.
- Night *n*: Blightlings `6 + 3n`. Rotboars from night 2: `n − 1`. Wisps from night 4.
- Enemy HP grows by 12% per night. Tower damage only grows through upgrades.
- Heartwood: 500 HP. Blightling bite 8/s, Rotboar 20/s, barricade-breaking 30/s.

## Where things live (after milestone 1)

- `art/blender/*.py`: one script per model. They need Blender with the MCP add-on, and
  `export_all.py` rebuilds and re-exports all of them. `overgrowth_assets.blend` is the saved scene.
- `src/assets/Models.js` loads the GLBs. `src/art/merge.js` flattens each animated part into one
  draw call with per-vertex colour, emissive and roughness/metalness.
- `src/defense/`: `Base.js` (the Heartwood, site search, rifts), `FlowField.js`, `Enemies.js`,
  `Towers.js` (buildings, projectiles, placement ghost) and `Waves.js` (the day/night director).

## Handoff: state at the end of milestone 1 (2026-10-13)

**Live:** pushed to `main`; `.github/workflows/deploy.yml` publishes to GitHub Pages on every push.

**Verify a change:** with `npm run dev` running:
- `node e2e/loop.mjs`: six PASS lines (forage, craft, place, dusk, night → day 2, game over).
- `node e2e/balance.mjs 3 starter`: should lose. `node e2e/balance.mjs 6 mid`: should hold.
- `node e2e/shots.mjs <dir>` + `python e2e/sheet.py <dir> sheet.png` for the visual views.

**Known issues / loose ends**
- The Space "glitch" the user reported was never reproduced. The fixes were: no camera lag
  mid-jump, raw mouse input with spike filtering, jump buffer and coyote time, and a sensitivity
  slider. If the user still sees it, ask what it looks like.
- Night 1 is trivial: the starter bow tower kills everything before it reaches the Heart.
- `pickRifts` sometimes finds only 2 of 3 rifts (on the default seed the third direction is
  river). That's fine, but the third would add pressure.
- Barricades are easy to path around. Mazing needs more barricades or narrower terrain to matter.
- Teleporting or sprinting into new chunks still hitches (~50 ms) while chunks stream in. This
  predates the tower defence work.
- The GLBs are uncompressed (~5 MB total). Meshopt/Draco compression would cut load time.
- The new visuals have not been through the `indie-critic` / `design-critic` loop yet.

**Next up:** milestone 2 ("Fight feel"). Start with the slingshot and tower repair/upgrades,
then Wisps (flying, ignore barricades, from night 4).
