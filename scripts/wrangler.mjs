import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
// Run the JavaScript entry point with Node, without platform-specific .bin shims
// or a shell. This also preserves paths containing spaces on Windows.
export function wranglerArgs(args) {
  const manifestPath = require.resolve('wrangler/package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return [resolve(dirname(manifestPath), manifest.bin.wrangler), ...args];
}

export async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
  await exited;
}
