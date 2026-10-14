# World textures

The ground, bark, rock, stone and every leaf in the world come from generated photographs.
The process runs in two steps, and both need only `uv`.

1. **Generate** the raw photographs with Flux (ComfyUI on `http://127.0.0.1:8188`). `jobs.json`
   holds each prompt, seed, size and batch.

   ```
   uv run --no-project art/textures/generate.py            # into art/textures/raw (not committed)
   ```

2. **Process** them into game textures in `public/textures/`.

   ```
   uv run --no-project --with numpy --with pillow --with scipy art/textures/process.py [names]
   ```

   Pass no names to build everything, or name tiles and atlases (`litter`, `canopy`, ...).
   `OG_RAW=<dir>` reads the raw images from somewhere else.

## Tiles (`TILES` in `process.py`)

Each tile is a seamless 1024² surface. The source photo goes through these steps:

- It is made tileable by min-cut quilting across its own edges.
- Its large-scale shading is flattened (`flat`, `fsig`).
- Optional clean-ups, each switched on by its key:
  - `despec` removes sky glints.
  - `desheen` removes grey-blue wet sheen from litter.
  - `unspot` fades lichen blotches.
  - `mortar` darkens bright joints.
  - `gain` and `crop` adjust colour balance and framing.
- Its brightness and saturation are calibrated (`mean` is the target sRGB mean, `sat` the saturation).

It is written out as two files:

- `<name>.jpg`, the albedo.
- `<name>_n.jpg`, half resolution: normal X/Y in R/G (the shader rebuilds Z) and height in B. The
  terrain uses the height for blending.

## Atlases (`atlases.json`)

Each cell is a cut-out: a leaf, frond, twig spray, rosette or flower. It is processed like this:

- Keyed off its white backdrop. With `satkey`, pale *grey* pixels are dropped too, which removes the
  plant's soft shadow showing between its leaves.
- Cropped and fitted into its rectangle (bottom-aligned unless `align: center`), and flipped if
  `flip` is set.
- Colour-calibrated (`mean`, `sat`, `gain`).
- Given a domed normal and a thickness value for translucency.

Colour bleeds under the transparent pixels, so mipmaps don't halo. `atlas.json` lists every cell's
UV rectangle for `src/art/TextureLib.js`.
