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
| Title & pause | `ui/Menu.js`, `ui/menu.css`, `main.js` | splash, title menu and its pages, pause menu; `Game.startTitle/flyIn` run the cinematic |
| Difficulty | `core/Difficulty.js` | Verdant / Warden / Blightborn: Blight HP and numbers, Heartwood HP, starting kit |
| Records | `core/Save.js` | lifetime totals in `og.records`, banked at each dawn and when a run ends |

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
5. **Art overhaul: done (2026-10-14, release 0.4).** Generated photographic surfaces with relief
   on everything, a forest floor with parallax, 3D litter and an herb layer, soft canopy
   shadows, rebuilt trees, cliffs and temple, water reflections, rain wetness, quality presets,
   five rifts and rule-changing boons. See the handoff below.

6. **Sharp edges: done (2026-10-14, release 0.5).** The machete and a gloved
   hand rebuilt, blade contact with gashes and scrapes, plants that bend and whip, cut plants
   that fall and leave stalks, a mixed forest floor with bare earth, parallax relief on bark,
   rock and stone, a new rock surface, and fuller tree crowns. See the handoff below.

7. **Blight Blooms: done (2026-10-14, release 0.6).** Turf meadows and 3D grass, thickets,
   about seven times more forage (hold E to rake it up), a sprint that keeps time with your feet,
   a mouse prompt for smashables, and Blight Blooms: the day's guarded pods that open new lanes
   at dusk if left standing. See the handoff below.

8. **The Title: done (2026-10-14, release 0.7).** A live cinematic title screen with a
   sigil, a press-any-key splash and synthesised title music; a fly-in from the menu into the
   game; three difficulties; a Continue card; the Field Guide with rendered portraits; lifetime
   Records; Settings, Controls and Credits pages; a real pause menu. See the handoff below.

## Balance

- Day 1 is generous: you start with one Bramble Bow Tower, two spike traps and two poultices.
  The tower holds night 1 (9 Blightlings) on its own.
- Night *n*: Blightlings `6 + 3n`; Rotboars from night 2, `n − 1` (at most 8); Wisps from
  night 4, `floor((n − 2) × 1.3)`; the Thornback on nights 5 and 10. A wave arrives in three packs.
- Enemy HP: +12% a night up to night 6, then +14% a night. The Thornback (1800 HP) comes at 0.8×
  on night 5 and scales at half the Blight's rate after that. From night 7 the *surge* (a fourth
  pack from every rift at once) adds `4(n − 6)` Blightlings, `1.5(n − 6)` Rotboars and
  `(n − 6)/2` Wisps. Tower damage only grows through upgrades and boons.
- Five rifts: three open from night 1, the fourth tears open on night 7 and the fifth on night 9.
- Heartwood: 500 HP. Blightling bite 8 per 1 s, Wisp 7, Rotboar 22 per 1.5 s, Thornback 40 per
  2.2 s plus a slam every 6.5–8.5 s (30 to the Heart, 110 to buildings, 26 to you).
- Measured with a passive player (`e2e/balance.mjs`, Heartwood HP left out of 500):

  | Night | starter | mid | late |
  | --- | --- | --- | --- |
  | 1 | 500 | | |
  | 2 | 413 | | |
  | 3 | 26–74 (or lost) | | |
  | 4 | | 500 | |
  | 5 (boss) | | 123 | |
  | 6 | | 391 | |
  | 8 | | lost | |
  | 9 | | | 500 |
  | 10 (boss) | | | 183 |

  *starter* is the one bow tower. *mid* is two bow towers, a mortar, a brazier, and a barricade
  plus spike trap per rift. *late* adds a third bow, a totem, a second brazier and a snare per
  rift, everything upgraded to tier 2. Spawns are random, so a run varies by ±50 HP and night 3
  with the starter tower sometimes falls. The curve asks you to keep building after night 6: a
  *late* base now loses about 300 HP on night 10 with nobody fighting (0.4 rebalance, measured on
  2026-10-14).

## Where things live

- `art/blender/*.py`: one script per model, built on `oglib.py`. Headless:
  `blender -b --factory-startup -P art/blender/export_new.py -- <names>` (no names = all;
  `OG_OUT=<dir>` exports somewhere else first, to compare before replacing the live GLBs).
- `src/assets/Models.js` loads the GLBs. `src/art/merge.js` flattens each animated part into one
  draw call with per-vertex colour, emissive and roughness/metalness, plus the flash, tint, rim,
  dissolve and emissive-scale uniforms.
- `src/defense/`: `Base.js` (the Heartwood, site search, rifts), `FlowField.js`, `Enemies.js`,
  `Towers.js` (buildings, tiers, projectiles, placement ghost) and `Waves.js` (the director).
- `src/player/MacheteModel.js` (machete + hand), `src/fx/Marks.js` (gashes, scrapes),
  `src/world/Stubs.js` (cut stalks).
- `src/ui/Menu.js` + `menu.css` (title, pages, pause), `src/ui/Portraits.js`,
  `src/audio/TitleTheme.js`, `src/core/Difficulty.js`.
- `src/combat/Projectiles.js` (stones, firepots), `src/core/{Save,Perks,Journal}.js`,
  `src/fx/{LightPool,Weather}.js`.
- Textures: `art/textures/jobs.json` holds the Flux prompts. `generate.py <raw dir>` renders
  them through ComfyUI (raw photos are not committed). `OG_RAW=<raw dir> process.py [names]`
  turns them into the tiles and atlases in `public/textures/`. `TILES` and `atlases.json` hold
  the per-texture settings: crop, mean albedo, saturation, flatten, normal strength.
- The ground: `makeTerrainMaterial` in `src/art/shaders.js` (height-blended splat, parallax,
  side projection on slopes, wetness). `src/world/Litter.js` places the 3D leaves and sticks and
  `src/world/Cover.js` the herb layer, both in 4 m cells around the player. `World.groundAt`
  gives the exact terrain height, normal and splat under a point.
- Shadows: `installSoftShadows` (called from `main.js`) swaps three's PCF for a contact-hardening
  filter on lights whose `shadow.radius` is above 1.5. Only the sun opts in.

## Handoff: 0.7 "The Title" (2026-10-14)

**Live:** 0.7 is on `main`, pushed (GitHub Pages deploys on push). The version is 0.7.0 and
CHANGELOG has the notes. **Starting a new session:** read this file and `README.md`,
`npm run dev`, then `node e2e/loop.mjs`; `node e2e/menu.mjs <outDir>` screenshots the title
flow (`SAVE=<save.json>` seeds a save, `PANELS=new,guide,...` opens pages, `FLY=1` films the
fly-in and the pause menu). `?debug` skips the title entirely, so the other e2e scripts are
unchanged. The developer's alias is **ycgNem** (credits, git author).

**What changed and where**
- Title cinematic: `Game.startTitle()` holds the clock near sunset (`TITLE_TIME` 0.728, crawling
  at `timeScale` 0.15) and `updateTitle` moves the camera through three shots (`titleShot`:
  a low orbit of the Heartwood, a crane up out of the grass, a push in from the treeline),
  framing the heart right of centre, cutting every `TITLE_SHOT` s through `#title-fade`.
  `player.pos` follows the eye so the world, grass and litter stream round the camera. While
  `game.title` is set the frame loop skips player control (`active` is false).
- Fly-in: `Game.flyIn(done)` respawns the player, slerps the camera from the shot to the eye
  (FOV 50 to 72), dips to black, sets the clock to `title.wake` (a loaded save's dawn, else
  `startTime ?? 0.29`) and fades in. `loadFrom` writes `title.wake` instead of the clock while
  the title runs.
- `src/ui/Menu.js`: modes `boot`, `title`, `flying`, `play`, `pause`. Pages are built in the
  `page*()` methods; their widths are in `open()`. Hovering Continue previews its card
  (unpinned); clicks pin a page. `crowd()` dims the logo when a wide page reaches it. Settings
  live in localStorage (`og.quality`, `og.bloom`, `og.sensitivity`, `og.invertY`, `og.volume`,
  `og.music`). Quit to Title autosaves and reloads (a new run needs a clean world anyway).
- Portraits: `src/ui/Portraits.js` renders GLBs to 360 px PNGs on the first open of the guide
  or records, with a coloured rim light. The spike trap has no GLB and uses its item icon.
- Audio: `src/audio/TitleTheme.js` (pad through Am-F-C-G, pentatonic kalimba, drone,
  generated reverb, echo). `AudioSys.music(on)`, `setVolume`, `toggleMute`, `hover`, `choose`.
- Difficulty: `waveFor(n, count)` scales the packs (not the boss); `Waves.diff.hp` multiplies
  `hpScale` (the Thornback's own curve is scaled the same); `Game.setDifficulty(id)` sets the
  Heartwood HP and the starting kit. Saves carry `difficulty` (old saves load as Warden).
- Records: `Game.bankRecords` adds kills, bosses, blooms and builds since the last bank at each
  dawn and on defeat; `begin()` counts a run. `seen` holds the Blight types felled; the guide
  also treats a type as known once your best run held through the night it first comes.

**Ideas for next time**
- A rendered portrait for the spike trap; slowly turning portraits in the guide.
- Per-difficulty bests, and a victory badge per difficulty on the Records page.
- Return to the title without a reload (needs a world reset).
- Title shots at other times of day or in rain, picked from how far the save has got.

## Handoff: 0.6 "Blight Blooms" (2026-10-14)

**Live:** 0.6 is on `main`, pushed (GitHub Pages deploys on push). `node e2e/loop.mjs` passes
all ten checks and `vite build` is clean. **Starting a new session:** read this file and
`README.md`, `npm run dev`, then `node e2e/loop.mjs` (the 0.4 handoff below has the critic setup
and the hard-learned rules). CHANGELOG has the 0.6
notes; the version is 0.6.0. Both critics ran against a frozen copy; their findings are applied
except where noted below.

**What changed and where**
- Ground: the dark wet `litter` tile is gone (files removed, `TILES` entry dropped). Its texture
  units went to `turf` (`turf_00002_.png`, a short-grass-and-clover photo). `World.grassAt` is the
  meadow weight per terrain vertex (open gaps out of the crowns' shade, a ring round the camp,
  none on rock, mud or steep ground); it is a `grass` vertex attribute and `groundAt().grass`.
  In `makeTerrainMaterial`, `gk` breaks its edge per pixel and turf wins over the litter by
  height. Moss is kept off turf. The mud/humus is lifted (it read black by the river).
- `src/world/Grass.js`: instanced tufts (5 shapes, incl. a short lawn and a tall seed head) out
  to 28 m, thinned (not shrunk) over the last 10 m, clumped and sized by `groundPatch` fields,
  tinted golden or green in drifts. Thin sedge under the trees and stragglers past the meadow
  edge. Clears building footprints and blooms (`setBlockers`) and the spots where forage lies.
  Cover.js and Litter.js thin out on turf; Cover also keeps off forage. Costs ~0.8 ms.
- Thickets: the last scatter in `World.plan` (so nothing else moved) puts 4-8 tree ferns,
  bananas, aroids, saplings, shrubs and taro in clumps, by `jungleDensity`.
- Forage: `scatter('forage', 170)` plus 48 themed clusters and drops round the giants; scale
  1.5-1.9. `Game.highlightForage` brightens the targeted instance and glints it.
  `Game.interact`: tap E picks up, holding E rakes the nearest within 3 m (`nearestForage`);
  `holdAction` ignores E while raking, so it never calls the night.
- Sprint: `Player.bob` advances one unit per step (stride 2.0 m walking, 2.6 m sprinting) and
  drives the footstep sound; `runK` eases sprinting in. `Machete.poses.run` carries the blade low
  at the right; the pump is mostly vertical. FOV +5 at a sprint. After `collide`, `vel` is the
  movement that actually happened (no running on the spot). Stamina drain 0.12/s, regen 0.2/s.
- Smashables: labels are nouns ("Supply crate"); the prompt key `'LMB'` draws a mouse icon
  (`MOUSE_SVG` in HUD.js) and the ring fills with damage.
- Blight Blooms: `src/defense/Blooms.js` (model, sprout placement, damage, pulse, beacon) and
  `Game.sproutBlooms / hatchBlooms / hitBloom / onBloomCleansed`. Sprouted on `waves.onDay` and
  2.5 s after `begin()`; 1/2/2/3... per day, 45-90 m out, inside the flow field, clear of trunks
  (`world.staticCircles`), undergrowth withered (`World.clearAround`). Guards are Blightlings
  with `e.guard = {x, z, r, leash}` (`Enemies.updateWalker` prowls round the bloom and only
  chases the player inside the leash). Cut: loot table `bloom`, favour `10 + 2n`, guards die,
  journal goal `bloom`. At dusk (`waves.onNight`) survivors become lanes: `{x, z, bloom}` pushed
  into `waves.open`, so packs spawn there too; cutting one at night removes its lane. Sling
  stones and firepots hit blooms (`Projectiles.update`, `ctx.blooms`).

**Measured** (this machine, `e2e/perf.mjs`): sprint p50 9.0 ms, p95 14.8 ms. The 0.5 build
measures 9.0 / 14.3 the same way today, so the 4.8 ms in the 0.5 notes was a different state of
the machine, not a regression. ComfyUI or a second headless browser on the GPU doubles it.

**Left from the critics (next up)**
- Mid-distance is better with thickets but still opens up in places; card LODs past 30 m and
  fewer shadow casters would pay for a denser understory. Fog could go greener in dense forest.
- The turf still reads a little temperate. A Flux attempt at tropical carpet grass came out
  illustrated (drawn outlines), so it wasn't used; try a photo prompt with "macro photograph".
- Trampled lanes worn into the turf along last night's routes from each rift.
- The Heartwood's glowing vines are flat ribbons; the supply crates look like new pine.
- Bloom mound and thorns could take the tri-planar bark/moss surfaces; ground cover inside a
  bloom's stain could wilt purple.
- Forage is visible when targeted but small items still blend into the litter at a glance.

## Handoff: 0.5 "Sharp Edges" (2026-10-14, overnight autonomous pass)

**Live:** 0.5 is on `main`, pushed (GitHub Pages deploys on push). `node e2e/loop.mjs` passes
all ten checks and `vite build` is clean. CHANGELOG has the 0.5 notes; the version is 0.5.0.

**What changed and where**
- Machete: `src/player/MacheteModel.js` builds the blade (its own grid geometry: flat, filed
  bevel and spine as separate strips), the canvas steel and roughness maps, the scales, rivets
  and thong, and loads `public/models/hand.glb`. The hand is `art/blender/hand.py`: metaballs
  along each finger, the palm and the forearm, meshed, decimated and vertex-coloured
  (`blender -b --factory-startup -P art/blender/export_new.py -- hand`). Its frame matches the
  machete's: handle along -x, spine +y, back of the hand +z, forearm roughly +y.
- `Machete.js`: poses are `makePose(grip, bladeDir, armDir)`; the arm direction keeps the
  forearm running off the bottom right. The viewmodel camera is 14 degrees narrower than the
  world's. `SwingTrail` draws the smear. `bite(strength, 'flesh' | 'wood' | 'stone')`.
  The steel's direct specular is halved and its output capped below the bloom threshold.
- Contact: `Game.bladeContact` raycasts the one instance a collider belongs to (colliders now
  carry `mesh` and `instance`). `src/fx/Marks.js` lays curved decals (gash, scrape) and deepens
  a gash hit again. `WOODY` in Game.js lists what bites like wood.
- Plants: `addWind(..., { push: true })` bends plants away from `uPush` (the player) and whips
  them with `uSwing`/`uSwingDir` (set in `onSwingHit`). Cut plants lie down for `FALL_LIFE`
  seconds and leave `src/world/Stubs.js` stalks.
- Ground: `litter3` (mixed species) replaced the pale `litter2`; `humus` is bare earth in
  noise patches inside the litter and doubles as the riverbank "mud" layer (the terrain
  shader was at 16 texture units). `campEarth` in `World.terrainSteps` bares the camp.
- Relief: `addRelief(material, depthMetres)` in `shaders.js` marches the normal map's height in
  UV space (scale from screen derivatives) and `#define`s the map UVs to the result. It is on
  bark, palm bark, logs, dead wood, rocks and the POI stone/rubble/temple blocks.
- Rock: `rock7_00002_.png` (dry fractured plates). Raw photos live in ComfyUI's output folder
  (`OG_RAW=C:/Users/jacks/AppData/Local/Comfy-Desktop/ComfyUI-Shared/output`).
- Crowns: `Flora.crown` uses ~1.5x as many cards at ~0.74x the size, facing out of the crown,
  with 60% crossed by a second card; bushes cross 55% of their sprays. Main-pass triangles at
  spawn went from ~4.7M to ~6.4M; sprint p50 4.8 ms, p95 6.8 ms on this machine.
- New e2e tools: `e2e/vm.mjs` (viewmodel poses, `lerp` between named poses) and `e2e/hit.mjs`
  (stand at a plant type, swing, report marks and stubs; `hide` captures without the
  viewmodel, `mid` captures particles in flight).

**Next up (ideas, not started)**
- Gashes are only on trees/logs/rocks the player can reach; Blight hits still use generic chips.
- The scrape decal on stone is subtle; the gash could get a few chips lying at the tree's foot.
- The hand is one fixed grip; a second, open-hand pose for consumables would remove the
  floating item.
- The 0.4 items below still stand.

## Handoff: state after the 0.4 art overhaul (2026-10-14)

**Live:** 0.4 is on `main`, pushed. `.github/workflows/deploy.yml` publishes to GitHub Pages on
every push. Player-facing patch notes are in [CHANGELOG.md](CHANGELOG.md); add a section there
with each release.

**Starting a new session:** read this file and `README.md`, start `npm run dev`, and run
`node e2e/loop.mjs` to check the build. The critics are `.claude/agents/indie-critic.md` (a real
agent type) and `.claude/agents/design-critic.md` (run through a general-purpose agent told to
adopt that file). Run them against a copy of the repo on its own Vite port (copy `src`,
`public`, `e2e`, `index.html`, `package.json`, `vite.config.js` to a scratch folder, link
`node_modules`, `PORT=<port> npx vite`). On the live dev server, every edit you make reloads
their page and kills their run. Other projects on this machine hold ports 5190, 5191, 5197
and 5200.

**Verify a change:** with `npm run dev` running (or `BASE=<url>` for another server):
- `node e2e/loop.mjs`: ten PASS lines (forage, craft, place, dusk, night → day 2, upgrade,
  slingshot hit, boons, autosave, game over).
- `node e2e/balance.mjs <night> <starter|mid|late>`: `5 mid` should hold narrowly and `10 late`
  should hold while losing a few hundred HP. Night 3 with the starter tower only just holds.
- `node e2e/view.mjs <dir> '<json shots>'` renders chosen views. The header lists the finders:
  `spawn`, `river`, `cliff`, `clearing`, `slope`, `jungle`, `temple` and `base`, or a plant
  `type` with `nth`/`dist`/`around`. `eval` runs page code before the capture.
- `node e2e/perf.mjs`: sprint frame times. The two long frames are the script's teleports.
  `e2e/probe.mjs "<js>"` prints any expression from the running game.
- Don't edit `src/` while a balance or critic run is going: Vite reloads the page and the run dies.

**Rules learned the hard way**
- Never change the number of lights in the scene during play. Anything that glows asks
  `LightPool` for a light each frame. A rift light hidden by day caused a 5–7 s freeze at the
  first dusk while every lit shader recompiled.
- Clamp every `pow()` input in custom shaders. A NaN under bloom spreads into black rectangles.
- Keep emissive and rim terms under the bloom threshold (1.15) on anything you fight up close.
  The enemy rim is capped at 0.45.
- three.js strips blank lines and indentation from its shader chunks at build time. A
  multi-line `replace` anchor copied from `node_modules/three/src` silently matches nothing.
  Anchor on one line, or on two lines joined with `\n\t\t\t`, and warn when the chunk is
  unchanged.
- GLSL ES has no `?:` on structs. Use `if`/`else`.
- Compile the warm-up for the target play renders into (`PostFX.sceneRT`), not the canvas. The
  canvas gives a different program variant, which then compiled again mid-game.
- When blending two samples of a photo by height, let the higher one win outright (`ogPick`).
  Any softer and two leaves of similar height cross-fade into a double exposure.
- Sharp shadows from a canopy 20 m up print ghostly leaf shapes on the floor. That was the
  "double-exposed leaves" both critics kept reporting. The shadows must soften with the
  caster's distance.

**This pass (both critics' reports applied):**
- Ground:
  - new small-leaf litters at life size;
  - parallax relief with self-shadowing, crisp height switches;
  - side projection on slopes;
  - 3D leaves and sticks in drifts (14 m ring);
  - seedlings, ferns and dead fronds to 25 m (`Cover.js`);
  - warmer mud;
  - a broken gravel edge;
  - rain wetness.
- Light:
  - soft contact-hardening sun shadows;
  - warm shade (no more teal);
  - darker haze under the canopy;
  - the terrain fades sun and moon where the ground faces away, which stops stair-step bands.
- Models:
  - buttresses rebuilt;
  - cliff outcrops (`cliffRock`);
  - mushrooms;
  - temple shrine;
  - cleaner temple stone;
  - moss that buries the relief under it, wraps edges cleanly and patches on the damp side;
  - plant stems coloured;
  - atlas leaf bursts;
  - creature bone and crust textured.
- Play:
  - 5 rifts;
  - Rotboar tower aggro;
  - five rule-changing boons;
  - the night-5 Thornback lighter, nights 7–10 harder;
  - forage near the Heartwood;
  - Quality presets;
  - staged chunk streaming;
  - the shader warm-up fix.

**Known issues / next up**
- Props still built from primitives:
  - the camp tent (two quads and a box backpack);
  - the wreck (capsule, box and cylinder);
  - the Heartwood's moss "eggs".
  Model them in Blender like the towers.
- Night reads a bit like tinted day. Pale dry litter under the 3.2× night hemisphere light is
  nearly as bright as the sky. Lowering it needs a pass on night readability (enemies must
  still stand out).
- Draw calls run 450–790 in the main pass. The fix is one `InstancedMesh` per plant variant
  across the 5×5 window instead of one per chunk.
- Frame time on this machine: sprinting p50 ~13 ms, p95 ~23 ms. Teleports still take ~1 s
  because they build the 3×3 chunks at once.
- Vines lying on the ground still read a little like green ropes, and leaf cards look flat
  within 2 m.
- The parallax fades out at 4–12 m. On High it could reach further (6–20 m) if the frame time
  allows.
- The GLBs are uncompressed (~7 MB total). Meshopt would cut load time.
