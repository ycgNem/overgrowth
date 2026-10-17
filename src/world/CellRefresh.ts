// Building a ground layer's cells again (Grass, Litter, Cover) after the ground changed under
// them: the trampled lanes and the Rot worn in at dawn, the Rot spreading or burning back.
// Clearing every cell and building them all on the next frame cost 30-50 ms (150-200 on a slow
// machine) at every dawn. Instead the old cells stay drawn while the new ones are built a
// millisecond or so a frame, once the world has finished wearing its chunks (World.wearSoon),
// and they all go in together on the frame the last is done.

interface Layer<C> {
  cells: Map<string, C>;
  build(i: number, j: number): C | null;
  world: { wearing?: boolean };
  stale?: Set<string> | null;
  fresh?: Map<string, C> | null;
}

// the ground under every cell changed: build them all again, a few a frame
export function staleCells<C>(layer: Layer<C>) {
  layer.stale = new Set(layer.cells.keys());
  layer.fresh = new Map();
}

// Call at the top of the layer's update. Builds stale cells for up to `budget` ms; returns true
// on the frame they've all been built and swapped in (the layer must fill its instances again).
export function refreshCells<C>(layer: Layer<C>, budget = 1.5): boolean {
  if (!layer.stale || layer.world.wearing) return false;
  const t0 = performance.now();
  for (const key of layer.stale) {
    layer.stale.delete(key);
    // (a cell that has gone out of range since needn't be built)
    if (!layer.cells.has(key)) continue;
    const [i, j] = key.split(',').map(Number);
    const cell = layer.build(i, j);
    if (cell) layer.fresh.set(key, cell);
    if (performance.now() - t0 > budget) break;
  }
  if (layer.stale.size) return false;
  for (const [key, cell] of layer.fresh) if (layer.cells.has(key)) layer.cells.set(key, cell);
  layer.stale = layer.fresh = null;
  return true;
}
