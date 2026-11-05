import { build } from 'esbuild';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL('public/', root), output, { recursive: true });
await build({
  entryPoints: [fileURLToPath(new URL('worker/index.js', root))],
  outfile: fileURLToPath(new URL('_worker.js', output)),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  legalComments: 'none',
  sourcemap: false,
});
// Pages must route API requests and static responses through the same handler.
await writeFile(new URL('_routes.json', output), `${JSON.stringify({ version: 1, include: ['/*'], exclude: [] }, null, 2)}\n`);
console.log('Pages preparado en dist/: web, API y enrutamiento.');
