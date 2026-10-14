# Overgrowth: Gather, Craft, Defend

Overgrowth is becoming a **first-person tower defence**. By day you roam the jungle and gather
what the forest gives you. You craft that into towers, traps and tools. At dusk the Blight
crawls out of rifts in the forest and marches on the **Heartwood**, the shrine at your camp.
You hold the line with your towers and your machete until dawn.

## The loop

```
 DAY (gather, ~4.5 min)          DUSK                    NIGHT (defend)             DAWN
 explore, cut, forage   ──►  horn + rifts open   ──►  waves path to the Heart ──►  rewards,
 scavenge POIs               last-minute building     towers + machete fight       next day is harder
 craft in the satchel                                  Heart HP 0 = run over
```

- **Day.** The sky clock runs from dawn to dusk in 270 real seconds. Hold **T** to skip
  ahead, or hold **E** at the Heartwood to call the night early. The day banner and the compass
  preview tonight's wave (and warn of a boss or rain).
- **Night.** The clock slows down while the wave runs. A wave comes in three packs, each favouring
  a different rift. The wave ends once every Blight is dead, then the clock fast-forwards to dawn.
- **Winning.** Hold through night 10. A victory screen shows the run's stats, and you can carry on
  in endless mode.
- **Losing.** When the Heartwood's HP reaches 0 it collapses in slow motion and the run is over.
  A summary shows how many nights you survived; the best run is kept.
- **Dying.** You respawn at the Heartwood after 5 seconds and keep your inventory.
- **Saving.** The run autosaves at every dawn and every 30 s by day. **Continue** on the menu
  picks it up.

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
| Base | `defense/Base.js` | Heartwood shrine at spawn, 30 m clearing with a soft 10 m edge, build zone radius 40 m, rifts ~50 m out |
| Waves | `defense/Waves.js` | phase state machine tied to `Sky.time`; three packs per night; boss every 5th night; rain nights |
| Pathing | `defense/FlowField.js` | 2 m grid, Dijkstra from the Heart, costs from slope/water/colliders/barricades |
| Enemies | `defense/Enemies.js` | Blightling (swarm, pounces), Rotboar (tank, breaks walls), Wisp (flying), Thornback (boss: slams, summons) |
| Towers | `defense/Towers.js` | placement ghost, targeting, projectiles, HP, three tiers, repair |
| Slingshot, firepots | `combat/Projectiles.js` | swept-sphere stones with gravity; firepots burst into a burning patch |
| Boons | `core/Perks.js` | offer relics at the Heartwood → favour → pick 1 of 3 boons |
| Saves | `core/Save.js` | `localStorage`, autosave at dawn and every 30 s by day, best-run record |
| Tutorial | `core/Journal.js` | first-day steps, then two rolling optional goals |
| Weather | `fx/Weather.js` | rain nights: streaks, lightning, heavier fog, dimmer light |
| Lights | `fx/LightPool.js` | six pooled point lights for fire, arcs, mortar bursts and rifts |
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
| Ember Brazier | 4 stone, 2 clay, 1 log, 2 resin | Short range, sets the Blight burning (hits flyers) |
| Vine Snare | 4 vine, 3 fiber, 2 stick, 2 thorns | Roots up to 3 Blight for 2.6 s, 6 charges |
| Slingshot | 2 stick, 1 vine, 3 fiber | Ranged weapon; fires stones, or scrap shot for 1.6× |
| Scrap Shot ×6 | 1 tin can, 2 rusty bolts | Heavy sling ammo |
| Firepot ×2 | 1 old bottle, 2 resin, 1 fiber | Thrown: burst + 5 s burning patch |
| Berry Poultice | 4 berries, 1 fiber, 1 moss | Heal 45 |
| Orchid Salve | 1 ghost orchid, 2 moss, 1 resin | Mends every building within 20 m and the Heartwood |

**Upgrades.** Hold **E** on a building to raise it to *Overgrown* (tier 2) and *Heartbound*
(tier 3). Each tier costs forest materials plus a scavenged part (`UPGRADES` in `Towers.js`) and
raises damage, rate, range and HP. Tier 3 bow towers fire a second bolt. Damaged buildings are
repaired the same way (towers: 2 bark, 1 resin; walls: 2 stick, 2 thorns).

**Boons** (13, in `core/Perks.js`): machete damage, tower range, rate and damage, Heartwood HP,
thorns on the Heart, extra loot, move speed, building regrowth, wider mortar splash, sling
mastery, heal on kill, armour. Relics give favour, and favour thresholds grow
`50 + 70k + 15k²`.

**Blender assets (in `public/models/`)**: Heartwood shrine, Bramble Bow Tower, Spore Mortar,
Tesla Totem, Ember Brazier, Vine Snare, Thorn Barricade, Blightling, Rotboar, Wisp and the
Thornback boss. The towers and small Blight are under about 6k triangles and the Thornback is
about 8.6k. Each has named parts so the code can animate it (bow arm, mortar barrel, flame,
snare grabs, wings, legs, jaw).

## Milestones

1. **Foundation: done (2026-10-13).** Jump/mouse fixes, the slot inventory with hotbar, forest items,
   foraging and harvesting, crafting, the Heartwood base, the day/night wave director, flow-field
   enemies (Blightling and Rotboar), three towers plus barricade and spike trap, player and Heart
   HP, game over, and the Blender asset pipeline.
2. **Fight feel: done (2026-10-13).** Slingshot (charge draw, crits at full draw, scrap shot),
   attack wind-ups, pounces, stagger and knockback, hit-stop, combo crits, damage numbers and HP
   bars, dissolve deaths with ash, rising spawns, tower tiers 2–3 with visible decor, repair,
   the wave preview, and Wisps.
3. **Depth: done (2026-10-13).** Autosave and Continue, the Ember Brazier and Vine Snare,
   firepots and orchid salve, the Thornback on every 5th night (slam, summons, boss bar),
   relic offerings → boons, rain nights with lightning, and a win at night 10 with endless mode.
4. **Polish: done (2026-10-13).** Bloom and emissive pass, rim-lit Blight at night, the
   Heartwood light and beam, rift portals, a translucent placement ghost with range rings,
   recoloured mortar/totem/Blight, cliff facets broken up, audio for every combat event, the
   Journal tutorial, and a balance pass with the critics run against the build.

## Balance

- Day 1 is generous: you start with one Bramble Bow Tower, two spike traps and two poultices.
  The tower holds night 1 (9 Blightlings) on its own.
- Night *n*: Blightlings `6 + 3n`; Rotboars from night 2, `n − 1` (at most 8); Wisps from
  night 4, `floor((n − 2) × 1.3)`; the Thornback on nights 5 and 10. A wave arrives in three packs.
- Enemy HP: +12% a night up to night 6, then +7% a night. The Thornback (1800 HP) scales at half
  that rate. Tower damage only grows through upgrades and boons.
- Heartwood: 500 HP. Blightling bite 8 per 1 s, Wisp 7, Rotboar 22 per 1.5 s, Thornback 40 per
  2.2 s plus a slam every 6.5–8.5 s (30 to the Heart, 110 to buildings, 26 to you).
- Measured with a passive player (`e2e/balance.mjs`, Heartwood HP left out of 500):

  | Night | starter | mid | late |
  | --- | --- | --- | --- |
  | 1 | 500 | | |
  | 2 | 413 | | |
  | 3 | lost | | |
  | 4 | | 500 | |
  | 5 (boss) | | 94–141 | |
  | 6 | | 391 | |
  | 8 | | lost | 500 |
  | 10 (boss) | | lost | 500 |

  *starter* is the one bow tower. *mid* is two bow towers, a mortar, a brazier, and a barricade
  plus spike trap per rift. *late* adds a third bow, a totem, a second brazier and a snare per
  rift, everything upgraded to tier 2. So the curve asks you to keep building and upgrading after
  night 6. A *late* base takes no damage on night 10 with nobody fighting, which leaves room to
  push nights 8–10 harder once real players have tried it.

## Where things live

- `art/blender/*.py`: one script per model, built on `oglib.py`. Headless:
  `blender -b --factory-startup -P art/blender/export_new.py -- <names>` (no names = all;
  `OG_OUT=<dir>` exports somewhere else first, to compare before replacing the live GLBs).
- `src/assets/Models.js` loads the GLBs. `src/art/merge.js` flattens each animated part into one
  draw call with per-vertex colour, emissive and roughness/metalness, plus the flash, tint, rim,
  dissolve and emissive-scale uniforms.
- `src/defense/`: `Base.js` (the Heartwood, site search, rifts), `FlowField.js`, `Enemies.js`,
  `Towers.js` (buildings, tiers, projectiles, placement ghost) and `Waves.js` (the director).
- `src/combat/Projectiles.js` (stones, firepots), `src/core/{Save,Perks,Journal}.js`,
  `src/fx/{LightPool,Weather}.js`.

## Handoff: state at the end of milestones 2–4 (2026-10-13)

**Not committed yet.** All of milestones 2–4 sits in the working tree on `main`.

**Verify a change:** with `npm run dev` running:
- `node e2e/loop.mjs`: ten PASS lines (forage, craft, place, dusk, night → day 2, upgrade,
  slingshot hit, boon, autosave, game over).
- `node e2e/balance.mjs 3 starter` should lose; `5 mid` should hold narrowly; `10 late` should hold.
- `node e2e/shots.mjs <dir>` + `python e2e/sheet.py <dir> sheet.png` for the visual views.
- Don't edit `src/` while a balance or critic run is going: Vite reloads the page and the run dies.

**Rules learned the hard way**
- Never change the number of lights in the scene during play. Anything that glows asks
  `LightPool` for a light each frame. A rift light hidden by day caused a 5–7 s freeze at the
  first dusk while every lit shader recompiled.
- Clamp every `pow()` input in custom shaders. A NaN under bloom spreads into black rectangles.
- Keep emissive and rim terms under the bloom threshold (1.15) on anything you fight up close.
  The enemy rim is capped at 0.45.

**Critic pass, round 2 (both run on this build, fixes applied)**
- indie-critic: fixed the first-dusk freeze (rift lights → LightPool) and the 400 ms
  flow-field rebuild (`Float32Array` → `Float64Array` distances: now ~3 ms). Also: rim capped;
  particles fade near the camera; sling aim pose lowered; bigger stone with a trail; finisher
  crits only from clicked swings; the Thornback is 1.4× with player collision and a slam warning
  ring; the victory title no longer clips; buildings can be worked from 3.5 m; boon hotkeys no
  longer leak to the belt; loot pickups count toward the first journal step.
- design-critic: cliff seams are chipped bevels in the bump height, not drawn grout; the
  Heartwood beam has soft view-dependent sides and only shows at night; tier decor lost its
  glowing beads (tier 3 gets a bound collar); the ghost draws a depth-only pass first and its
  emissive is off; range rings are thin and follow the ground; the Thornback has scutes, a
  darker body, brow ridges and a dimmer sac; the Heartwood stones are chamfered, carved and
  weathered; the tower foot-stones are darker and smooth; loot beams are half as tall.

**Known issues / next up**
- The late game is soft: a fully built *late* base takes no damage on night 10 with nobody
  fighting. Push nights 8–10 (more Rotboars or Wisps, a second boss) once real play is in.
- Boons are mostly +x% stat bumps. The indie critic wants fewer that change a rule.
- The victory moment doesn't change the Heartwood itself (no bloom of the crown yet).
- Chunk streaming still hitches (0.6–1.3 s) on the first sprint and on teleports.
- `WorldGen` cliffs are smooth slopes; bigger ledge steps would break their silhouettes, but
  that moves rifts and the base site, so it needs a balance re-run.
- The Wisp still reads as flat purple shards.
- The GLBs are uncompressed (~7 MB total). Meshopt would cut load time.
- The Space "glitch" the user reported in milestone 1 was never reproduced.
