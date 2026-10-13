# Overgrowth

A first-person **gather, craft and defend** game built with **Three.js** and **Vite**.
By day you hack through the jungle with a machete, forage the forest floor, harvest trees and rocks,
and scavenge old camps, wrecks and temples. In the satchel you craft what you found into towers,
barricades and traps, and build them around the **Heartwood**, the glowing shrine at your camp.
At dusk the Blight crawls out of rifts in the forest and follows the terrain to the Heart. Hold it
until dawn. Each night is harder than the last. See [PLAN.md](PLAN.md) for the design and roadmap.

The world is procedural: textures are painted with the canvas API, plants and props are built from
code, and the soundscape is synthesised with Web Audio. The hero models are the exception: the
Heartwood, the three towers, the barricade and both enemies are made in **Blender** from Python
scripts (`art/blender/`) and shipped as GLBs in `public/models/`.

## Running

```bash
npm install
npm run dev
```

Open http://localhost:5188 and click **Enter the jungle**.

| Key | Action |
| --- | --- |
| W A S D | Move |
| Shift | Sprint (uses stamina) |
| Space | Jump |
| Left mouse | Swing the machete (cuts plants, harvests trunks and rocks, hits the Blight) / place the held build |
| Right mouse | Use the held consumable (Berry Poultice) |
| E | Pick up forage (tap). Search camps, wrecks and altars (hold). Offer relics or call the night at the Heartwood (hold). Pack up a building by day (hold) |
| 1–8 / mouse wheel | Choose a belt slot. An empty slot means the machete |
| R | Rotate a barricade before placing it |
| Tab / I | Satchel: inventory and crafting |
| T (hold) | Skip daylight |
| M | Mute |
| Esc | Pause (mouse sensitivity is on the pause menu) |

### Debug mode

`http://localhost:5188/?debug` skips pointer lock and starts immediately (arrow keys look
around). `?t=0.75` sets the time of day (0 = midnight, 0.5 = noon). The `game` object is
exposed on `window`, for example:

```js
game.teleport('temple')   // also: 'ruins', 'wreck', 'camp', 'scrap', 'crates'
game.give('log', 5)       // any item id from src/items/ItemDB.js
game.skipToNight()        // jump the clock to dusk: the rifts open
game.enemies.spawn('rotboar', game.base.x + 20, game.base.z)
```

## How it's put together

```
src/
  main.js              boot, menu, pointer-lock pause, sensitivity slider
  core/Game.js         owns every system; the frame loop; combat, harvesting, foraging, building
  core/Input.js        keyboard/mouse, raw pointer-lock input with spike filtering
  assets/Models.js     loads the Blender GLBs, clones them, finds animated parts
  art/merge.js         flattens models to one draw call per moving part (baked colour/emissive)
  art/textures.js      every procedural texture, painted with canvas (leaves, bark, stone, rust…)
  art/shaders.js       material patches: wind, foliage lighting, moss, terrain splat, fog
  world/WorldGen.js    the height function (warped hills, ridged mountains, rivers)
  world/World.js       chunk streaming, plant and forage scattering, terrain, collisions
  world/flora/         plant library (Flora.js) + geometry helpers (geom.js)
  world/poi/POI.js     points of interest: placement rules + builders
  world/Sky.js         sky dome shader, sun/moon, day-night palette, environment map
  world/Water.js       river/lake surface
  player/Player.js     movement, jump buffering, stamina, swimming, health, head-bob
  player/Machete.js    viewmodel + swing animation (rendered in a second pass)
  items/ItemDB.js      items (materials, salvage, relics, buildables, consumables) + loot tables
  items/Recipes.js     crafting recipes
  items/Inventory.js   8-slot belt + 24-slot pack of stacks
  items/ItemModels.js  3D item models + inventory icon renderer
  items/Pickups.js     items in the world (pop, bob, glow, magnet)
  defense/Base.js      the Heartwood, base-site search, Blight rifts
  defense/FlowField.js enemy path-finding: one Dijkstra field around the base
  defense/Enemies.js   Blightling and Rotboar: steering, attacks, procedural animation
  defense/Towers.js    buildings, targeting, projectiles, placement ghost
  defense/Waves.js     the day/night director and wave composition
  fx/Particles.js      leaf bursts, wood chips, sparks, spores
  fx/Ambient.js        pollen, fireflies, butterflies, birds, light shafts
  audio/AudioSys.js    synthesised ambience + sound effects
  ui/HUD.js, hud.css   compass, minimap, vitals, belt, day/night strip, satchel + crafting
art/blender/           one Python script per Blender model, export_all.py, the saved .blend
public/models/         the exported GLBs
```

## Blender models

Each model is a Python script run inside Blender (through the Blender MCP add-on, or pasted into
Blender's script editor). `art/blender/oglib.py` is a small library: primitives, noise deformers,
leaves, lashings, per-face vertex colours with baked ground occlusion, and a GLB exporter.
`exec(open(r"<repo>/art/blender/export_all.py").read())` rebuilds and re-exports all seven models.
Parts that move in game are separate nodes: `Turret`/`Aim`/`Bolt` on the bow tower,
`Turret`/`Aim`/`Bellows` on the mortar, `Orb`/`Rings` on the totem, `Heart`/`Orbit` on the
Heartwood, and `Head`/`Jaw`/`Leg*`/`Tail` on the creatures. Forward is -Y in Blender, which is +Z
in three.js.

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
- **Viewmodel pass.** The machete is drawn in its own scene after clearing depth, so it
  never clips into plants.

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
`node e2e/loop.mjs` checks the gather → craft → defend loop end to end, and
`node e2e/balance.mjs <night> <starter|mid>` simulates one night against a fixed defence. Two review agents
live in `.claude/agents/`:

- `indie-critic` reviews look, feel and play as a whole.
- `design-critic` is a stern pass/fail gate for "playable graphics".

## Extending it

- **New item:** add an entry in `ITEMS` (`items/ItemDB.js`), a builder in
  `items/ItemModels.js`, and reference it in a loot table or recipe. The icon is generated
  automatically.
- **New tower:** model it in `art/blender/` (keep `Turret`/`Aim` nodes if it should aim), add it
  to `MODEL_NAMES` in `assets/Models.js`, add an item with `kind: 'build'` and `model`, a recipe,
  and an entry in `BUILD_DEFS` (`defense/Towers.js`) with its range, rate and damage. Give it a
  new `kind` and a branch in `Buildings.fire` if it shoots something new.
- **New enemy:** a Blender model with `Head`/`Leg*` nodes, an entry in `ENEMY_TYPES`
  (`defense/Enemies.js`), a loot table, and a place in `waveFor` (`defense/Waves.js`).
- **New plant:** add a builder method in `world/flora/Flora.js`, register it in
  `this.types` (with `cut` if the machete should cut it), then scatter it in `World.plan`.
- **New point of interest:** add a builder in `world/poi/POI.js`, register it in `BUILDERS`
  and `POI_INFO`, and give it a probability in `poiSpec`.
- **Bigger world view:** raise `VIEW_RADIUS` in `World.js` (cost grows quadratically) and
  lower the fog density in `Sky.js`.

Next steps are in [PLAN.md](PLAN.md): a slingshot, tower upgrades and repair, Wisps,
saves, boss nights and weather.
