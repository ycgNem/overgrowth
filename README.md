# Overgrowth

A first-person **gather, craft and defend** game built with **Three.js** and **Vite**.
By day you hack through the jungle with a machete, forage the forest floor, harvest trees and rocks,
and scavenge old camps, wrecks and temples. In the satchel you craft what you found into towers,
barricades and traps, and build them around the **Heartwood**, the glowing shrine at your camp.
At dusk the Blight crawls out of rifts in the forest and follows the terrain to the Heart. Hold it
until dawn. Each night is harder than the last, every fifth night brings a boss, and holding
through **night 10** wins the run (you can carry on in endless mode). Each day a few **Blight Blooms**
sprout out in the forest under guard: cut them down for rare loot and the Heartwood's favour, or
at dusk each one opens a new lane the Blight pours out of all night. The run saves itself every
morning. Six kinds of Blight come for it, from swarming Blightlings to bile-lobbing Spitters and
Burrowers that dig under your walls, and what you live through stays with you: lifetime records
unlock **Memories** that add to every run after. A short walk out lies a second
region, the **drowned grove**: black water, mangroves and fog, with its own forage, a sunken
shrine, and from night 4 its own rift.

The day plays like a scavenging raid. You search crates, lockers and root caches, weigh what's
worth carrying (a heavy pack slows you and the Husks hear you), store it in the **Coffer** at
camp and craft at the benches. Die out there and your pack stays where you fell. The defence is
a budget: the Heartwood feeds only so many roots, and every tower and upgrade draws on them.
Through the ten nights runs the story of a lost 1931 expedition, told in torn pages you find.
Each part of it gives you something new: seals that put a rift to sleep, grafts for your towers,
a radio that calls supply drops, and the Rot that creeps out from the rifts. It ends with the
Rot Mother on night 10 and a choice of two endings. See [PLAN.md](PLAN.md) for the design and
roadmap, and [CHANGELOG.md](CHANGELOG.md) for patch notes.

The world is built from code and dressed with generated photographs. Terrain, plants and props are
code-built meshes. Their surfaces (leaf litter, moss, mud, rock, bark, temple stone) and every leaf,
frond and flower are Flux generations, turned into seamless tiles and cut-out atlases by
`art/textures/` (see its README) and shipped in `public/textures/`. The image goes through an HDR post
chain (ambient occlusion, sun shafts through the canopy, bloom, filmic grade). The soundscape is
synthesised with Web Audio. The hero models (the Heartwood, the five towers, the barricade, the
vine snare, the glowcap lantern, the six Blight, and the tent, plane wreck and supply crates)
are made in **Blender** from Python scripts (`art/blender/`),
shipped as GLBs in `public/models/`, and pick up the same bark, stone and moss surfaces at load.

## Running

```bash
npm install
npm run dev
```

Open http://localhost:5188, press any key at the title, and choose **New Game** (pick a
difficulty) or **Continue**. The title also has the **Field Guide** (every Blight, defence and
boon), your lifetime **Records**, **Settings**, **Controls** and **Credits**. The Journal on the
left walks you through the first day.

| Key | Action |
| --- | --- |
| W A S D | Move |
| Shift | Sprint (uses stamina) |
| Space | Jump |
| Left mouse | Swing the machete (cuts plants, harvests trunks and rocks, smashes crates and urns, cuts down Blight Blooms, hits the Blight; every third hit in a row is a crit). With the slingshot held: hold to draw, release to fire. With a build held: place it |
| Right mouse | Use the held consumable: eat a poultice, throw a firepot, raise orchid salve to mend nearby buildings and the Heartwood |
| E | Pick up forage (tap; keep holding to rake up everything loose within 3 m). Search camps, wrecks and altars (hold). At a building: repair it if damaged, otherwise upgrade it (hold). At the Heartwood: offer relics for a boon, or call the night (hold) |
| F (hold) | Pack up a building by day (60% of its materials back). At the Heartwood: bury relics for root capacity. At the Workbench: set the Thornback's heart. At the Tinker's Bench: fit a radio part |
| G (hold) | Graft the graft you carry onto a tier 2 or 3 tower |
| 1–8 / mouse wheel | Choose a belt slot. An empty slot means the machete |
| R | Rotate a barricade before placing it |
| Tab / I | Satchel: inventory and crafting |
| T (hold) | Skip daylight |
| M | Mute |
| Esc | Pause: resume, the Field Guide, settings, controls, or quit to the title |
| F8 / F9 | Capture mode (a free camera: WASD, Space/C, wheel for speed, P to hold the world still) / hide the HUD |

Every key can be moved on the **Controls** page. A gamepad works too (partly: the satchel and
crafting still want a mouse): sticks to move and look, RT to swing, LT to use, A jump, X
gather, B pack up, Y satchel, the bumpers along the belt, and the d-pad, A and B in the menus,
Settings and the cards. `?daily` starts the **daily vigil** (one world a day, the
same for everyone, with its own save); `?seed=<anything>` any other world.

### Debug mode

`http://localhost:5188/?debug` skips pointer lock and starts immediately (arrow keys look
around). `?t=0.75` sets the time of day (0 = midnight, 0.5 = noon). The `game` object is
exposed on `window`, for example:

```js
game.teleport('temple')   // also: 'ruins', 'wreck', 'camp', 'scrap', 'crates', 'shrine'
game.give('log', 5)       // any item id from src/items/ItemDB.ts
game.skipToNight()        // jump the clock to dusk: the rifts open
game.waves.setNight(5)    // pretend it's night 5 (a boss night)
game.enemies.spawn('rotboar', game.base.x + 20, game.base.z)   // also 'blightling', 'wisp', 'thornback'
```

Debug runs never autosave. The save lives in `localStorage` under `og.save.v1` (a daily vigil
under `og.save.daily.<date>`), the best run under `og.best`, lifetime records under
`og.records`, achievements under `og.ach`, the pages read under `og.notes`, tips told under
`og.tips`, key bindings under `og.keys`, and settings under `og.quality`, `og.bloom`,
`og.autores`, `og.sensitivity`, `og.invertY`, `og.volume`, `og.music`, `og.captions`,
`og.shake`, `og.bob` and `og.cb`.

## How it's put together

```
src/
  main.js              boot, wires the title menu to the game, pointer-lock pause
  ui/Menu.js, menu.css the splash, title menu and its pages (continue, new game, field guide,
                       records, settings, controls, credits) and the pause menu
  ui/Portraits.js      renders the Blender models to portraits for the Field Guide
  core/Difficulty.js   Verdant / Warden / Blightborn
  core/Memories.js     permanent unlocks earned from lifetime records
  audio/TitleTheme.js  the synthesised title music
  core/Game.ts         owns every system; the frame loop; combat, slingshot, harvesting, foraging,
                       building, boss slams, endings, autosave
  core/Save.js         localStorage save/load of a run, best-run record, lifetime records
  core/Perks.js        boons offered at the Heartwood and the stat modifiers they change
  core/Journal.ts      first-day tutorial steps, then rolling optional goals
  core/Input.js        keyboard/mouse, raw pointer-lock input with spike filtering
  assets/Models.js     loads the Blender GLBs, clones them, finds animated parts
  art/merge.js         flattens models to one draw call per moving part (baked colour/emissive),
                       tri-planar bark/stone/moss detail on their parts
  art/TextureLib.js    loads the generated surfaces and leaf atlases (public/textures)
  art/textures.js      small canvas textures (glows, sparks, item details, water normals)
  art/shaders.js       material patches: wind, foliage translucency, moss, terrain splat, fog
  render/PostFX.js     HDR chain: SAO-style AO, ray-marched sun shafts, bloom, tone map + grade
  render/Canopy.js     sky occlusion under the tree crowns (darkens and greens the forest floor)
  world/WorldGen.js    the height function (warped hills, ridged mountains, rivers, the
                       drowned grove's swamp), spawn and base-site search
  world/World.js       chunk streaming, plant and forage scattering, terrain, collisions,
                       draw distances and LODs per plant type
  world/Pools.js       one instanced mesh per plant variant for the whole view: chunks take
                       slot blocks, culled per block, near/far LOD sorted per plant
  world/Trample.js     the lanes the Blight wear into the ground, settled at dawn
  world/Litter.js      3D fallen leaves and sticks on the ground around the player
  world/Cover.js       seedlings, small ferns and dead fronds within 25 m of the player
  world/Grass.js       3D grass tufts on the turf (and sedge under the trees) within 20 m
  world/flora/         plant library (Flora.js), geometry helpers (geom.js) and the thinned
                       far copies of trees (lod.js)
  world/poi/POI.js     points of interest: placement rules + builders
  world/Sky.js         sky dome shader, sun/moon, day-night palette, environment map
  world/Water.js       river/lake surface
  player/Player.js     movement, jump buffering, stamina, swimming, health, head-bob
  player/Machete.js    viewmodel: machete, slingshot, held items and their animations
                       (rendered in a second pass)
  player/MacheteModel.js the machete (blade, scales, rivets) and the gloved hand (hand.glb)
  fx/Marks.js          gashes the machete cuts in bark, scrapes it leaves on stone
  world/Stubs.js       the cut stalks a machete leaves standing
  items/ItemDB.ts      items (materials, salvage, relics, buildables, consumables) + loot tables
  items/Recipes.js     crafting recipes
  items/Inventory.ts   8-slot belt + 24-slot pack of stacks
  items/ItemModels.ts  3D item models + inventory icon renderer
  items/Pickups.ts     items in the world (pop, bob, glow, magnet)
  defense/Base.js      the Heartwood (light, beam, hit reactions), base-site search, Blight rifts
  defense/FlowField.js enemy path-finding: one Dijkstra field around the base
  defense/Enemies.js   Blightling, Rotboar, Wisp, Spitter, Burrower, Thornback: steering,
                       wind-ups, pounces, bile globs and puddles, digging,
                       statuses (burn/root/slow), boss slam, spawn and death animations
  defense/Towers.ts    buildings, tiers, repair, targeting, projectiles, placement ghost
  defense/Waves.js     the day/night director, wave composition, boss and rain nights
  defense/Blooms.js    Blight Blooms: the day's guarded pods, cut down for loot, or they open lanes at dusk
  combat/Projectiles.js  slingshot stones and thrown firepots
  fx/Particles.js      leaf bursts, wood chips, sparks, spores, smoke, embers, ash, rings
  fx/LightPool.js      six shared point lights handed out by priority (no shader recompiles)
  fx/Weather.js        rain streaks, lightning, fog and light dimming
  fx/Ambient.js        pollen, fireflies, butterflies, birds, light shafts
  audio/AudioSys.js    synthesised ambience + sound effects
  ui/HUD.js, hud.css   compass, minimap, vitals, belt, day/night strip, satchel + crafting
art/blender/           one Python script per Blender model, export_all.py, the saved .blend
art/textures/          Flux prompts (jobs.json), generate.py, process.py -> public/textures
public/models/         the exported GLBs
public/textures/       generated tiles (albedo + packed normal/height) and leaf atlases
```

## Blender models

Each model is a Python script run inside Blender. `art/blender/oglib.py` is a small library:
primitives, noise deformers, leaves, lashings, per-face vertex colours with baked ground occlusion,
auto-smoothing by angle, and a GLB exporter. The quickest route is headless Blender:

```bash
blender -b --factory-startup -P art/blender/export_new.py -- wisp thornback
```

With no names after `--` it rebuilds and exports all of them. Then compress what changed with
meshopt (`npm run compress`, or `node art/compress.mjs wisp thornback`): it halves the files,
and the game's loader decodes them (`gltfLoader()` in `assets/Models.js`). Positions stay
float; normals and colours are quantized and `art/merge.js` turns them back into floats.
Inside a running Blender,
`exec(open(r"<repo>/art/blender/export_all.py").read())` does the same.
Parts that move in game are separate nodes: `Turret`/`Aim`/`Bolt` on the bow tower,
`Turret`/`Aim`/`Bellows` on the mortar, `Orb`/`Rings` on the totem, `Flame`/`Coals` on the
brazier, `Grab0`–`Grab4` on the vine snare, `Heart`/`Orbit` on the Heartwood, and
`Head`/`Jaw`/`Leg*`/`Tail`/`Wing*`/`Core`/`Sac` on the creatures. Forward is -Y in Blender, which
is +Z in three.js.

### Key ideas worth studying

- **An infinite world from a pure function.** `sampleTerrain(x, z)` in `WorldGen.js` always
  returns the same height for the same point, so any chunk can be built in any order. The
  world is streamed in 64 m chunks around the player (`World.update`).
- **Deterministic scattering.** Each chunk seeds its own RNG from its coordinates
  (`chunkRng`), so walking away and back regenerates the exact same jungle. Cut plants and
  looted containers are remembered in sets keyed by chunk and index.
- **Instancing.** Each plant species/variant is one merged geometry drawn with
  `InstancedMesh`, so ~1,000 plants per chunk cost a handful of draw calls.
- **Card canopies with "fluffy" normals.** Tree crowns are clusters of alpha-tested leaf
  cards whose normals point away from the crown centre (`radialNormals`), which makes them
  light like soft volumes instead of flat planes.
- **Patching built-in materials.** `art/shaders.js` uses `onBeforeCompile` to add wind sway,
  moss on upward faces, 4-way terrain splatting and valley mist, while keeping three.js
  PBR lighting, shadows and fog.
- **Walkable structures without a physics engine.** Colliders are circles and rotated boxes
  with a `top` height. Anything at most `STEP_HEIGHT` above your feet is ground, anything
  taller is a wall. That's how the temple stairs work.
- **Viewmodel pass.** The machete and the gloved hand holding it are drawn in their own scene
  after clearing depth, with a narrower field of view than the world, so they never clip into
  plants or stretch at the screen edge.
- **A blade that touches things.** A swing finds the exact point it strikes on the tree or
  rock model (a ray against that one instance), throws chips off the surface there and leaves
  a gash in the bark or a scrape on the stone. Wood holds the blade for a moment; stone throws
  it back. Every plant in reach whips along with the swing, plants lean away as you walk
  through them, and a cut plant falls, lies on the ground and leaves its stalks standing.

- **A ground that holds up at your feet.** Each terrain layer (litter, moss, rock, mud) is
  painted with its own height field. The terrain shader blends layers by height, so moss settles
  between leaves and pebbles poke out of the mud. It also uses that height as a bump map and
  switches between two rotated samples along leaf outlines to hide tiling. Leaf drifts, fallen
  branches, seedlings, stones and dead fronds are instanced only in the chunks next to the player
  (`World.updateDressing`). Tree roots, logs and stumps shear onto the slope per instance
  (`addSlopeShear`).

## Screenshots and critics

With the dev server running, `node e2e/shots.mjs <outDir> [filter...]` captures a fixed set of
views and prints the main scene's draw calls and triangles for each. Spawn, floor close-up,
riverbank, cliffs, clearing, temple, dusk and hillside are covered.
`python e2e/sheet.py <outDir> sheet.png` lays them out on one contact sheet.
`node e2e/view.mjs <outDir> '<json shots>'` takes one-off views by place, plant type, time of day
and pitch (see its header), and `node e2e/probe.mjs "<js>"` prints the result of a JS expression
evaluated in a booted game.
`node e2e/loop.mjs` checks the gather → craft → defend loop end to end, `node e2e/blight.mjs`
stages the Spitter, the Burrower and the Glowcap Lantern and checks each works,
`node e2e/night.mjs <dir>` stages a night fight for lighting checks, `node e2e/menu.mjs <dir>`
screenshots the title flow, and
`node e2e/balance.mjs <night> <starter|mid|late> [difficulty]` simulates one night against a
fixed defence (and says who broke which building). For performance, `node e2e/perf.mjs` profiles
frame times while sprinting, `node e2e/gpu.mjs` times what each part of a frame costs on the GPU
(shadows, post effects, plants, terrain...), `node e2e/calls.mjs` counts draw calls and
`node e2e/lod.mjs` shoots views with the far tree LODs on and off. Two review agents
live in `.claude/agents/`:

- `indie-critic` reviews look, feel and play as a whole.
- `design-critic` is a stern pass/fail graphics gate, graded against shipped AAA jungle games.

## Extending it

- **New item:** add an entry in `ITEMS` (`items/ItemDB.ts`), a builder in
  `items/ItemModels.ts`, and reference it in a loot table or recipe. The icon is generated
  automatically.
- **New tower:** model it in `art/blender/` (keep `Turret`/`Aim` nodes if it should aim), add it
  to `MODEL_NAMES` in `assets/Models.js`, add an item with `kind: 'build'` and `model`, a recipe,
  and an entry in `BUILD_DEFS` (`defense/Towers.ts`) with its range, rate and damage. Give it a
  new `kind` and a branch in `Buildings.fire` if it shoots something new.
- **New enemy:** a Blender model with `Head`/`Leg*` nodes, an entry in `ENEMY_TYPES`
  (`defense/Enemies.js`), a loot table, and a place in `waveFor` (`defense/Waves.js`).
- **New plant:** add a builder method in `world/flora/Flora.js`, register it in
  `this.types` (with `cut` if the machete should cut it), then scatter it in `World.plan`.
- **New point of interest:** add a builder in `world/poi/POI.js`, register it in `BUILDERS`
  and `POI_INFO`, and give it a probability in `poiSpec`.
- **Bigger world view:** raise `VIEW_RADIUS` in `World.js` (cost grows quadratically) and
  lower the fog density in `Sky.js`.

- **New boon:** add an entry to `PERKS` in `core/Perks.js`. If it needs a new stat, give it a
  default in `baseMods()` and read `game.mods.<name>` where it applies.

Next steps are in [PLAN.md](PLAN.md).
