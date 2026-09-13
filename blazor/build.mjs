import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
await import('./runtime-source/blazor/build-consumer.mjs');
const wasm = readFileSync('blazor/src/wwwroot/engine/vendor/canvaskit.wasm');
if (wasm.length < 1000000 || !wasm.subarray(0, 4).equals(Buffer.from([0, 97, 115, 109]))) throw new Error('The package must contain the actual Skia WASM engine, not a Git LFS pointer or placeholder.');
function inspect(path) { for (const entry of readdirSync(path, { withFileTypes: true })) { const item = join(path, entry.name); if (entry.isDirectory()) inspect(item); else if (/\.(ttf|otf|woff2?|ttc|otc|eot|pfa|pfb)$/i.test(item)) throw new Error(`Font binary must not be bundled: ${item}`); } }
inspect('blazor/src/wwwroot');
console.log(`Verified self-contained Skia engine: ${wasm.length} WASM bytes; no font binaries bundled.`);
