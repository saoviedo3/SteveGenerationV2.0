import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { sample, mapSample, mapInternetSample, portSample, pwheSample, calderonSample, juniperSample, juniperInternetStatic, juniperInternetBgp } from '../tests/fixtures.mjs';
import { wranglerArgs, stopProcess } from './wrangler.mjs';

const directory = await mkdtemp(join(tmpdir(), 'steve-integration-'));
const persistence = join(directory, 'state with spaces');
const env = { ...process.env, XDG_CONFIG_HOME: join(directory, 'config'), WRANGLER_SEND_METRICS: 'false' };
const port = process.env.TEST_PORT || '8791';
const origin = `http://127.0.0.1:${port}`;
const password = `!${randomBytes(1).toString('hex')}?`; // Exercise the requested four-character minimum.
const bootstrapPassword = randomBytes(24).toString('hex');
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
  run(process.execPath, ['scripts/build-pages.mjs']);
  run(process.execPath, wranglerArgs(['d1', 'migrations', 'apply', 'steve-generation', '--local', '--persist-to', persistence]));
  server = spawn(process.execPath, wranglerArgs(['pages', 'dev', '--ip', '127.0.0.1', '--port', port, '--persist-to', persistence, '--binding', `INITIAL_ADMIN_PASSWORD=${bootstrapPassword}`]), { env, stdio: ['ignore', 'pipe', 'pipe'] });
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
  let bootstrapId;
  let bootstrapCookie;
  await check('Pages inicializa root solo con el secreto correcto y la base vacía', async () => {
    assert.equal((await request('/login', { method: 'POST', data: { username: 'other-admin', password: bootstrapPassword } })).status, 401);
    assert.equal((await request('/login', { method: 'POST', data: { username: 'root', password: 'incorrecta' } })).status, 401);
    const login = await request('/login', { method: 'POST', data: { username: 'root', password: bootstrapPassword } });
    assert.equal(login.status, 200);
    assert.equal(login.data.user.role, 'admin');
    bootstrapId = login.data.user.id;
    bootstrapCookie = login.cookie;
    assert.equal((await request('/users', { cookie: bootstrapCookie })).data.users.length, 1);
  });
  await check('el secreto inicial no restablece una contraseña que ya se cambió', async () => {
    assert.equal((await request('/password', { method: 'POST', cookie: bootstrapCookie, data: { currentPassword: bootstrapPassword, password } })).status, 200);
    assert.equal((await request('/login', { method: 'POST', data: { username: 'root', password: bootstrapPassword } })).status, 401);
    assert.equal((await request('/login', { method: 'POST', data: { username: 'root', password } })).status, 200);
  });
  run(process.execPath, ['scripts/create-admin.mjs', '--local', '--username', 'testroot', '--persist-to', persistence], { ADMIN_PASSWORD: password });
  run(process.execPath, wranglerArgs(['d1', 'execute', 'steve-generation', '--local', '--persist-to', persistence, '--command', `DELETE FROM users WHERE id = '${bootstrapId}';`]));
  await check('el bootstrap no agrega un administrador a una base con usuarios existentes', async () => {
    assert.equal((await request('/login', { method: 'POST', data: { username: 'root', password: bootstrapPassword } })).status, 401);
  });
  await check('CLI informa un administrador duplicado sin revelar la contraseña', async () => {
    const duplicate = spawnSync(process.execPath, ['scripts/create-admin.mjs', '--local', '--username', 'testroot', '--persist-to', persistence], { env: { ...env, ADMIN_PASSWORD: password }, encoding: 'utf8' });
    assert.equal(duplicate.status, 1);
    assert.ok(duplicate.stderr.includes('Wrangler terminó con código'));
    assert.ok(!`${duplicate.stdout}${duplicate.stderr}`.includes(password));
  });
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
  await check('las veinte variantes se generan y guardan con su solución', async () => {
    for (const solution of ['NNI3_CRM', 'NNI2_MAP', 'NNI_PORT', 'CARRETAS_PWHE3', 'CALDERON_PWHE3']) for (const service of ['DATOS', 'INTERNET']) for (const routing of ['BGP', 'STATIC']) {
      let input = solution === 'NNI3_CRM' ? sample : service === 'DATOS' ? mapSample : mapInternetSample;
      if (solution === 'NNI_PORT') input = { ...portSample, vrf: 'test_datos', loopback: '192.0.2.1/32', asn: '64877' };
      if (solution === 'CARRETAS_PWHE3') input = { ...pwheSample, vrf: 'test_datos', loopback: '192.0.2.1/32', asn: '65437' };
      if (solution === 'CALDERON_PWHE3') input = { ...calderonSample, vrf: 'test_datos', loopback: '192.0.2.1/32' };
      const result = await request('/history', { method: 'POST', cookie: firstCookie, data: { ...input, solution, service, routing, engineeringUrl: mapSample.engineeringUrl, lastMile: 'UM TELEFONICA' } });
      assert.equal(result.status, 201);
      assert.equal(result.data.document.includes('router bgp 19114'), routing === 'BGP');
      assert.ok(result.data.document.includes('OBSERVACIONES:\nUM TELEFONICA'));
      assert.ok(result.data.document.includes(mapSample.engineeringUrl));
      if (['CARRETAS_PWHE3', 'CALDERON_PWHE3'].includes(solution)) {
        assert.equal(result.data.document.match(/^interface PW-Ether\d+$/gm).length, 2);
        const peers = solution === 'CALDERON_PWHE3'
          ? ['IPTCHL3CALD02 (10.116.254.136)', 'IPTCHL3CALD01 (10.116.254.26)']
          : ['IPTCHL3CAR205 (10.116.254.32)', 'IPTCHL3CAR203 (10.116.254.29)'];
        for (const peer of peers) assert.ok(result.data.document.includes(peer));
        assert.equal((result.data.document.match(/^ dampening 1 75 2000 240$/gm) ?? []).length, solution === 'CALDERON_PWHE3' ? 2 : 0);
        assert.equal((result.data.document.match(/^router bgp 19114$/gm) ?? []).length, routing === 'BGP' ? 1 : 0);
        assert.equal((result.data.document.match(/^router static$/gm) ?? []).length, service === 'DATOS' || routing === 'STATIC' ? 1 : 0);
        assert.ok(!result.data.document.includes('Aplicar estas validaciones'));
        const stored = (await request(`/history/${result.data.id}`, { cookie: firstCookie })).data.item;
        assert.equal(stored.document, result.data.document);
        assert.equal(stored.solution, solution);
      }
    }
    const items = (await request('/history', { cookie: firstCookie })).data.items;
    assert.equal(items.filter(item => item.solution === 'NNI_PORT').length, 4);
    assert.equal(items.filter(item => item.solution === 'NNI2_MAP').length, 4);
    assert.equal(items.filter(item => item.solution === 'CARRETAS_PWHE3').length, 4);
    assert.equal(items.filter(item => item.solution === 'CALDERON_PWHE3').length, 4);
  });
  await check('Juniper DATOS valida RD y término, genera ambas variantes y conserva su solución en el historial', async () => {
    assert.equal((await request('/history', { method: 'POST', cookie: firstCookie, data: { ...juniperSample, service: 'INTERNET' } })).status, 422);
    assert.equal((await request('/history', { method: 'POST', cookie: firstCookie, data: { ...juniperSample, routing: 'BGP', rd: '' } })).status, 422);
    assert.equal((await request('/history', { method: 'POST', cookie: firstCookie, data: { ...juniperSample, routing: 'BGP', bgpTerm: '2' } })).status, 422);
    for (const routing of ['STATIC', 'BGP']) {
      const result = await request('/history', { method: 'POST', cookie: firstCookie, data: { ...juniperSample, routing, createVrf: 'YES', createSpeed: 'YES', bgpTerm: '5' } });
      assert.equal(result.status, 201);
      assert.ok(result.data.document.includes('set interfaces et-0/0/19 unit 1204 vlan-id 1204'));
      assert.ok(result.data.document.includes('burst-size-limit 1280000'));
      assert.equal(result.data.document.includes('term 5 from protocol bgp'), routing === 'BGP');
      const stored = (await request(`/history/${result.data.id}`, { cookie: firstCookie })).data.item;
      assert.equal(stored.solution, 'JUNIPER');
      assert.equal(stored.document, result.data.document);
      assert.equal((await request(`/history/${result.data.id}`, { method: 'DELETE', cookie: firstCookie })).status, 200);
    }
  });
  await check('INTERNET Juniper genera estático y BGP por ciudad con QoS opcional y guarda el historial', async () => {
    assert.equal((await request('/history', { method: 'POST', cookie: firstCookie, data: { ...juniperInternetBgp, juniperRegion: '' } })).status, 422);
    assert.equal((await request('/history', { method: 'POST', cookie: firstCookie, data: { ...juniperInternetStatic, createVrf: 'YES', rd: '103211' } })).status, 422);
    for (const juniperRegion of ['QUITO', 'CUENCA']) for (const routing of ['STATIC', 'BGP']) {
      const data = { ...(routing === 'BGP' ? juniperInternetBgp : juniperInternetStatic), juniperRegion, createSpeed: 'YES', mgmtTerm: '7' };
      const result = await request('/history', { method: 'POST', cookie: firstCookie, data });
      assert.equal(result.status, 201);
      assert.ok(result.data.document.includes('SMTP-WHITELIST-NET'));
      assert.ok(result.data.document.includes('$CREACION DE POLICER, FILTRO Y COS'));
      assert.ok(!result.data.document.includes('route-distinguisher'));
      if (routing === 'BGP') assert.ok(result.data.document.includes(`RP_CPE-MGMT-INTERNET-PCCS-NCB${juniperRegion === 'CUENCA' ? '_IPV4' : ''} term 7 from neighbor 10.112.48.178`));
      const stored = (await request(`/history/${result.data.id}`, { cookie: firstCookie })).data.item;
      assert.equal(stored.solution, 'JUNIPER');
      assert.equal(stored.document, result.data.document);
      assert.equal((await request(`/history/${result.data.id}`, { method: 'DELETE', cookie: firstCookie })).status, 200);
    }
  });
  await check('Cisco XE/XR y PWHE crean VRF y redistribución con enrutamiento estático o BGP', async () => {
    assert.equal((await request('/history', { method: 'POST', cookie: firstCookie, data: { ...sample, createVrf: 'YES', rd: '' } })).status, 422);
    for (const [fixture, routing] of [[mapSample, 'STATIC'], [sample, 'BGP'], [calderonSample, 'STATIC']]) {
      const data = { ...fixture, service: 'DATOS', routing, vrf: 'new_vrf', createVrf: 'YES', createSpeed: 'YES', rd: '102742', loopback: '192.0.2.1/32', asn: '64705', bandwidth: '1024Kbps' };
      const result = await request('/history', { method: 'POST', cookie: firstCookie, data });
      assert.equal(result.status, 201);
      assert.ok(result.data.document.includes('19114:102742'));
      assert.ok(result.data.document.includes('redistribute static'));
      assert.ok(result.data.document.includes('policy-map 1024Kbps'));
      assert.equal((await request(`/history/${result.data.id}`, { method: 'DELETE', cookie: firstCookie })).status, 200);
    }
  });
  await check('aislamiento del historial, incluso frente al administrador', async () => {
    assert.equal((await request('/history', { cookie: secondCookie })).data.items.length, 0);
    for (const cookie of [secondCookie, adminCookie]) {
      assert.equal((await request(`/history/${entryId}`, { cookie })).status, 404);
      assert.equal((await request(`/history/${entryId}`, { method: 'DELETE', cookie })).status, 404);
    }
    assert.equal((await request('/history', { cookie: firstCookie })).data.items.length, 21);
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
  console.log(`\n${checks} comprobaciones de integración pasaron con Pages y D1 locales.`);
} catch (error) {
  console.error(error instanceof Error ? error.message.replaceAll(bootstrapPassword, '[redacted]') : error);
  console.error(logs.slice(-5000).replaceAll(bootstrapPassword, '[redacted]'));
  process.exitCode = 1;
} finally {
  await stopProcess(server);
  await rm(directory, { recursive: true, force: true });
}
