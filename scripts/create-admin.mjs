import { hashPassword, passwordError } from '../worker/auth.js';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { wranglerArgs } from './wrangler.mjs';

const args = process.argv.slice(2);
const local = args.includes('--local');
const remote = args.includes('--remote');
const username = args.includes('--username') ? args[args.indexOf('--username') + 1] : 'root';
const persistTo = args.includes('--persist-to') ? args[args.indexOf('--persist-to') + 1] : null;
if (local === remote || !/^[a-zA-Z0-9_.-]{3,40}$/.test(username ?? '')) {
  console.error('Uso: npm run admin:create -- --local|--remote [--username root]');
  process.exit(1);
}

function readPassword() {
  if (!process.stdin.isTTY) throw new Error('Usa una terminal interactiva o ADMIN_PASSWORD en el entorno.');
  return new Promise(resolve => {
    let password = '';
    process.stdout.write('Contraseña del administrador (4–128 caracteres): ');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    const handler = chunk => {
      for (const char of chunk) {
        if (char === '\u0003') process.exit(130);
        if (char === '\r' || char === '\n') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', handler);
          process.stdout.write('\n');
          resolve(password);
          return;
        }
        if (char === '\u007f' || char === '\b') password = password.slice(0, -1);
        else password += char;
      }
    };
    process.stdin.on('data', handler);
  });
}

let directory;
try {
  const password = process.env.ADMIN_PASSWORD || await readPassword();
  const error = passwordError(password);
  if (error) throw new Error(error);
  const hash = await hashPassword(password);
  directory = await mkdtemp(join(tmpdir(), 'steve-admin-'));
  const file = join(directory, 'create.sql');
  await writeFile(file, `INSERT INTO users (id, username, password_hash, role) VALUES ('${randomUUID()}', '${username.toLowerCase()}', '${hash}', 'admin');`, { mode: 0o600 });
  if (persistTo && !local) throw new Error('--persist-to solo se puede usar con --local.');
  const result = spawnSync(process.execPath, wranglerArgs(['d1', 'execute', 'steve-generation', local ? '--local' : '--remote', '--file', file, ...(persistTo ? ['--persist-to', persistTo] : [])]), { stdio: 'inherit' });
  if (result.error) throw new Error(`No se pudo iniciar Wrangler (${result.error.code || 'error de proceso'}). Comprueba Node.js y ejecuta npm ci.`);
  if (result.status !== 0) throw new Error(`Wrangler terminó ${result.signal ? `con señal ${result.signal}` : `con código ${result.status}`}. No se creó el administrador; revisa el error mostrado arriba.`);
  console.log(`Administrador ${username.toLowerCase()} creado en ${local ? 'la base local' : 'Cloudflare'}.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (directory) await rm(directory, { recursive: true, force: true });
}
