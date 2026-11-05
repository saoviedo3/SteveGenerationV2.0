import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { sample, mapSample, mapInternetSample, portSample, pwheSample } from '../tests/fixtures.mjs';
import { wranglerArgs, stopProcess } from './wrangler.mjs';

const directory = await mkdtemp(join(tmpdir(), 'steve-integration-'));
const persistence = join(directory, 'state with spaces');
const env = { ...process.env, XDG_CONFIG_HOME: join(directory, 'config'), WRANGLER_SEND_METRICS: 'false' };
const port = process.env.TEST_PORT || '8791';
const origin = `http://127.0.0.1:${port}`;
const password = `!${randomBytes(1).toString('hex')}?`; // Exercise the requested four-character minimum.
let server;
let logs = '';
let checks = 0;
function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, { env: { ...env, ...extraEnv }, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} falló: ${result.stderr}\n${result.stdout}`);
}
async function request(path, { method = 'GET', data, cookie, originHeader = origin } = {}) {
  const response = await fetch(`${origin}/api${path}`, {
    method,
    headers: { Origin: originHeader, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  const result = await response.json();
  return { status: response.status, data: result, cookie: response.headers.get('set-cookie')?.split(';')[0], headers: response.headers };
}
async function check(name, action) { await action(); checks++; console.log(`✓ ${name}`); }

try {
  run(process.execPath, wranglerArgs(['d1', 'migrations', 'apply', 'steve-generation', '--local', '--persist-to', persistence]));
  run(process.execPath, ['scripts/create-admin.mjs', '--local', '--username', 'testroot', '--persist-to', persistence], { ADMIN_PASSWORD: password });
  await check('CLI informa un administrador duplicado sin revelar la contraseña', async () => {
    const duplicate = spawnSync(process.execPath, ['scripts/create-admin.mjs', '--local', '--username', 'testroot', '--persist-to', persistence], { env: { ...env, ADMIN_PASSWORD: password }, encoding: 'utf8' });
    assert.equal(duplicate.status, 1);
    assert.ok(duplicate.stderr.includes('Wrangler terminó con código'));
    assert.ok(!`${duplicate.stdout}${duplicate.stderr}`.includes(password));
  });
  server = spawn(process.execPath, wranglerArgs(['dev', '--ip', '127.0.0.1', '--port', port, '--persist-to', persistence]), { env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', chunk => { logs += chunk; });
  server.stderr.on('data', chunk => { logs += chunk; });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { ready = (await fetch(origin)).status === 200; } catch { /* Startup is still in progress. */ }
    if (ready) break;
    if (server.exitCode !== null) throw new Error(`Servidor detenido: ${logs}`);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(ready, `El servidor no arrancó: ${logs}`);
  let adminCookie;
  let firstCookie;
  let secondCookie;
  let firstId;
  let entryId;
  await check('assets y cabeceras de seguridad', async () => {
    const response = await fetch(origin);
    assert.equal(response.status, 200);
    assert.ok((await response.text()).includes('Tu configuración'));
    assert.ok(response.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  });
  await check('API privada y protección de origen', async () => {
    assert.equal((await request('/history')).status, 401);
    assert.equal((await request('/login', { method: 'POST', data: {}, originHeader: 'https://other.example' })).status, 403);
  });
  await check('login rechaza contraseña incorrecta y entrega cookie HttpOnly', async () => {
    assert.equal((await request('/login', { method: 'POST', data: { username: 'testroot', password: 'incorrecta' } })).status, 401);
    const login = await request('/login', { method: 'POST', data: { username: 'testroot', password } });
    assert.equal(login.status, 200);
    assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    assert.equal(login.data.user.role, 'admin');
    adminCookie = login.cookie;
  });
  await check('administrador crea cuentas; no acepta duplicados', async () => {
    assert.equal((await request('/users', { method: 'POST', cookie: adminCookie, data: { username: 'short-password', password: 'abc' } })).status, 400);
    for (const username of ['engineer-one', 'engineer-two']) assert.equal((await request('/users', { method: 'POST', cookie: adminCookie, data: { username, password } })).status, 201);
    assert.equal((await request('/users', { method: 'POST', cookie: adminCookie, data: { username: 'ENGINEER-ONE', password } })).status, 409);
    const users = (await request('/users', { cookie: adminCookie })).data.users;
    assert.equal(users.length, 3);
    assert.equal(users.some(user => 'password_hash' in user), false);
    firstId = users.find(user => user.username === 'engineer-one').id;
    firstCookie = (await request('/login', { method: 'POST', data: { username: 'engineer-one', password } })).cookie;
    secondCookie = (await request('/login', { method: 'POST', data: { username: 'engineer-two', password } })).cookie;
  });
  await check('usuario común no puede administrar cuentas', async () => {
    assert.equal((await request('/users', { cookie: firstCookie })).status, 403);
    assert.equal((await request('/users', { method: 'POST', cookie: firstCookie, data: { username: 'intruder', password } })).status, 403);
  });
  await check('generación validada en servidor y descarga recuperable', async () => {
    assert.equal((await request('/history', { method: 'POST', cookie: firstCookie, data: { ...sample, vlan: '9999' } })).status, 422);
    assert.equal((await request('/history', { method: 'POST', cookie: firstCookie, data: { ...portSample, bandwidth: 'Kbps' } })).status, 422);
    assert.equal((await request('/history', { method: 'POST', cookie: firstCookie, data: { ...pwheSample, infineraIp: '' } })).status, 422);
    const result = await request('/history', { method: 'POST', cookie: firstCookie, data: sample });
    assert.equal(result.status, 201);
    assert.ok(result.data.document.includes('remote-as 64877'));
    entryId = result.data.id;
    const stored = await request(`/history/${entryId}`, { cookie: firstCookie });
    assert.equal(stored.data.item.document, result.data.document);
  });
  await check('las dieciséis variantes se generan y guardan con su solución', async () => {
    for (const solution of ['NNI3_CRM', 'NNI2_MAP', 'NNI_PORT', 'CARRETAS_PWHE3']) for (const service of ['DATOS', 'INTERNET']) for (const routing of ['BGP', 'STATIC']) {
      let input = solution === 'NNI3_CRM' ? sample : service === 'DATOS' ? mapSample : mapInternetSample;
      if (solution === 'NNI_PORT') input = { ...portSample, vrf: 'test_datos', loopback: '192.0.2.1/32', asn: '64877' };
      if (solution === 'CARRETAS_PWHE3') input = { ...pwheSample, vrf: 'test_datos', loopback: '192.0.2.1/32', asn: '65437' };
      const result = await request('/history', { method: 'POST', cookie: firstCookie, data: { ...input, solution, service, routing, engineeringUrl: mapSample.engineeringUrl, lastMile: 'UM TELEFONICA' } });
      assert.equal(result.status, 201);
      assert.equal(result.data.document.includes('router bgp 19114'), routing === 'BGP');
      assert.ok(result.data.document.includes('OBSERVACIONES:\nUM TELEFONICA'));
      assert.ok(result.data.document.includes(mapSample.engineeringUrl));
      if (solution === 'CARRETAS_PWHE3') {
        assert.equal(result.data.document.match(/^interface PW-Ether\d+$/gm).length, 2);
        assert.ok(result.data.document.includes('IPTCHL3CAR205 (10.116.254.32)'));
        assert.ok(result.data.document.includes('IPTCHL3CAR203 (10.116.254.29)'));
        assert.equal((result.data.document.match(/^router bgp 19114$/gm) ?? []).length, routing === 'BGP' ? 1 : 0);
        assert.equal((result.data.document.match(/^router static$/gm) ?? []).length, service === 'DATOS' || routing === 'STATIC' ? 1 : 0);
        assert.ok(!result.data.document.includes('Aplicar estas validaciones'));
        const stored = (await request(`/history/${result.data.id}`, { cookie: firstCookie })).data.item;
        assert.equal(stored.document, result.data.document);
        assert.equal(stored.solution, 'CARRETAS_PWHE3');
      }
    }
    const items = (await request('/history', { cookie: firstCookie })).data.items;
    assert.equal(items.filter(item => item.solution === 'NNI_PORT').length, 4);
    assert.equal(items.filter(item => item.solution === 'NNI2_MAP').length, 4);
    assert.equal(items.filter(item => item.solution === 'CARRETAS_PWHE3').length, 4);
  });
  await check('aislamiento del historial, incluso frente al administrador', async () => {
    assert.equal((await request('/history', { cookie: secondCookie })).data.items.length, 0);
    for (const cookie of [secondCookie, adminCookie]) {
      assert.equal((await request(`/history/${entryId}`, { cookie })).status, 404);
      assert.equal((await request(`/history/${entryId}`, { method: 'DELETE', cookie })).status, 404);
    }
    assert.equal((await request('/history', { cookie: firstCookie })).data.items.length, 17);
  });
  await check('cambio de contraseña comprueba la actual', async () => {
    assert.equal((await request('/password', { method: 'POST', cookie: firstCookie, data: { currentPassword: password, password: 'abc' } })).status, 400);
    assert.equal((await request('/password', { method: 'POST', cookie: firstCookie, data: { currentPassword: 'incorrecta', password: `${password}new` } })).status, 400);
    assert.equal((await request('/password', { method: 'POST', cookie: firstCookie, data: { currentPassword: password, password: `${password}new` } })).status, 200);
  });
  await check('desactivar revoca sesiones y bloquea el login', async () => {
    assert.equal((await request(`/users/${firstId}`, { method: 'PATCH', cookie: adminCookie, data: { active: false } })).status, 200);
    assert.equal((await request('/me', { cookie: firstCookie })).status, 401);
    assert.equal((await request('/login', { method: 'POST', data: { username: 'engineer-one', password: `${password}new` } })).status, 401);
  });
  await check('restablecer contraseña permite reactivar la cuenta', async () => {
    assert.equal((await request(`/users/${firstId}`, { method: 'PATCH', cookie: adminCookie, data: { active: true, password } })).status, 200);
    const login = await request('/login', { method: 'POST', data: { username: 'engineer-one', password } });
    assert.equal(login.status, 200);
    firstCookie = login.cookie;
  });
  await check('borrado propio y cierre de sesión', async () => {
    assert.equal((await request(`/history/${entryId}`, { method: 'DELETE', cookie: firstCookie })).status, 200);
    assert.equal((await request(`/history/${entryId}`, { cookie: firstCookie })).status, 404);
    assert.equal((await request('/logout', { method: 'POST', cookie: firstCookie })).status, 200);
    assert.equal((await request('/me', { cookie: firstCookie })).status, 401);
  });
  await check('límite de intentos de login', async () => {
    let last;
    for (let i = 0; i < 11; i++) last = await request('/login', { method: 'POST', data: { username: 'missing-user', password: 'not-a-real-password' } });
    assert.equal(last.status, 429);
    assert.equal(last.headers.get('retry-after'), '900');
  });
  console.log(`\n${checks} comprobaciones de integración pasaron con Worker y D1 locales.`);
} catch (error) {
  console.error(error);
  console.error(logs.slice(-5000));
  process.exitCode = 1;
} finally {
  await stopProcess(server);
  await rm(directory, { recursive: true, force: true });
}
