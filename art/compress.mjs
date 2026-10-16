// Shrinks the Blender exports in public/models with meshopt (EXT_meshopt_compression).
//
//   node art/compress.mjs            compress every .glb in public/models in place
//   node art/compress.mjs --dry      print what each would come to, write nothing
//   node art/compress.mjs a b        only these (names without .glb)
//
// Positions stay float: quantizing them would move each mesh's offset into its node
// transform (Models.js resets the root node's position). Normals (8 bit) and colours
// (12 bit, kept in 16) are quantized, and art/merge.js turns them back into floats when it
// bakes. dedup/weld/prune strip what Blender leaves behind.
// A file that is already compressed is left as it is. Run it after every Blender export.
import { readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, reorder, quantize } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const DIR = 'public/models';
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const only = args.filter((a) => !a.startsWith('--'));

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const files = readdirSync(DIR).filter((f) => f.endsWith('.glb') && (!only.length || only.includes(basename(f, '.glb'))));
let before = 0, after = 0;
for (const f of files) {
  const path = join(DIR, f);
  const size = statSync(path).size;
  const doc = await io.read(path);
  if (doc.getRoot().listExtensionsUsed().some((e) => e.extensionName === 'EXT_meshopt_compression')) {
    console.log(`${f.padEnd(22)} already compressed (${(size / 1024).toFixed(0)} KB)`);
    before += size;
    after += size;
    continue;
  }
  await doc.transform(
    dedup(), weld(), reorder({ encoder: MeshoptEncoder }),
    // normals and colours only: neither needs the node transforms changed
    quantize({ pattern: /^(NORMAL|COLOR_\d+)$/, quantizeNormal: 8, quantizeColor: 12 }),
    prune(),
  );
  doc.createExtension(EXTMeshoptCompression).setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  const out = await io.writeBinary(doc);
  before += size;
  after += out.byteLength;
  console.log(`${f.padEnd(22)} ${(size / 1024).toFixed(0).padStart(6)} KB -> ${(out.byteLength / 1024).toFixed(0).padStart(6)} KB`);
  if (!dry) await io.write(path, doc);
}
console.log(`total ${(before / 1048576).toFixed(2)} MB -> ${(after / 1048576).toFixed(2)} MB${dry ? ' (dry run)' : ''}`);
