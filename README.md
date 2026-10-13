# Overgrowth

A first-person, open-world jungle scavenging demo built with **Three.js** and **Vite**.
Hack through the undergrowth with a machete, search scrap heaps, smash crates and urns,
climb overgrown temples, and fill your satchel with 18 collectible items across five rarities.

Everything is procedural: there are **no image, model or audio files**. Textures are
painted with the canvas API, plants and props are built from code, and the soundscape is
synthesised with Web Audio.

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
| Left mouse | Swing machete (cuts plants, smashes crates/urns/chests) |
| E (hold) | Search scrap heaps, backpacks, cockpits, altars |
| Tab / I | Satchel (inventory + collection log) |
| T (hold) | Fast-forward the day/night cycle |
| M | Mute |
| Esc | Pause |

### Debug mode

`http://localhost:5188/?debug` skips pointer lock and starts immediately (arrow keys look
around). `?t=0.75` sets the time of day (0 = midnight, 0.5 = noon). The `game` object is
exposed on `window`, for example:

```js
game.teleport('temple')   // also: 'ruins', 'wreck', 'camp', 'scrap', 'crates'
game.sky.time = 0.9       // night
game.collect('golden_idol')
```

## How it's put together

```
src/
  main.js              boot, menu, pointer-lock pause
  core/Game.js         owns every system; the frame loop; machete hits, searching, loot
  core/Input.js        keyboard/mouse + pointer lock
  art/textures.js      every texture, painted with canvas (leaves, bark, stone, rust…)
  art/shaders.js       material patches: wind, foliage lighting, moss, terrain splat, fog
  world/WorldGen.js    the height function (warped hills, ridged mountains, rivers)
  world/World.js       chunk streaming, plant scattering, terrain meshes, collisions
  world/flora/         plant library (Flora.js) + geometry helpers (geom.js)
  world/poi/POI.js     points of interest: placement rules + builders
  world/Sky.js         sky dome shader, sun/moon, day-night palette, environment map
  world/Water.js       river/lake surface
  player/Player.js     movement, stamina, swimming, head-bob
  player/Machete.js    viewmodel + swing animation (rendered in a second pass)
  items/ItemDB.js      item definitions + loot tables
  items/ItemModels.js  3D item models + inventory icon renderer
  items/Pickups.js     items in the world (pop, bob, glow, magnet)
  fx/Particles.js      leaf bursts, wood chips, sparks
  fx/Ambient.js        pollen, fireflies, butterflies, birds, light shafts
  audio/AudioSys.js    synthesised ambience + sound effects
  ui/HUD.js, hud.css   compass, minimap, toasts, prompts, satchel
```

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
`python e2e/sheet.py <outDir> sheet.png` lays them out on one contact sheet. Two review agents
live in `.claude/agents/`:

- `indie-critic` reviews look, feel and play as a whole.
- `design-critic` is a stern pass/fail gate for "playable graphics".

## Extending it

- **New item:** add an entry in `ITEMS` (`items/ItemDB.js`), a builder in
  `items/ItemModels.js`, and reference it in a loot table. The icon is generated automatically.
- **New plant:** add a builder method in `world/flora/Flora.js`, register it in
  `this.types` (with `cut` if the machete should cut it), then scatter it in `World.plan`.
- **New point of interest:** add a builder in `world/poi/POI.js`, register it in `BUILDERS`
  and `POI_INFO`, and give it a probability in `poiSpec`.
- **Bigger world view:** raise `VIEW_RADIUS` in `World.js` (cost grows quadratically) and
  lower the fog density in `Sky.js`.

Ideas for next steps: a crafting bench that turns scrap into machete upgrades, a trader
who buys finds, saving progress to `localStorage`, plants that regrow, wildlife, and
weather (rain would suit the jungle).
