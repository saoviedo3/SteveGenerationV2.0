import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { inventory, sample } from '../tests/fixtures.mjs';
import { wranglerArgs, stopProcess } from './wrangler.mjs';

const directory = await mkdtemp(join(tmpdir(), 'steve-browser-'));
const persistence = join(directory, 'state');
const env = { ...process.env, XDG_CONFIG_HOME: join(directory, 'config'), WRANGLER_SEND_METRICS: 'false' };
const password = randomBytes(24).toString('hex');
const port = process.env.BROWSER_TEST_PORT || '8792';
const origin = `http://127.0.0.1:${port}`;
const errors = [];
let logs = '';
let server;
let browser;

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, { env: { ...env, ...extraEnv }, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} falló: ${result.stderr}\n${result.stdout}`);
}
async function login(page, username) {
  await page.locator('#login-form [name=username]').fill(username);
  await page.locator('#login-form [name=password]').fill(password);
  await page.locator('#login-form button').click();
  await page.locator('#workspace').waitFor({ state: 'visible' });
}

try {
  run(process.execPath, wranglerArgs(['d1', 'migrations', 'apply', 'steve-generation', '--local', '--persist-to', persistence]));
  run(process.execPath, ['scripts/create-admin.mjs', '--local', '--username', 'testroot', '--persist-to', persistence], { ADMIN_PASSWORD: password });
  server = spawn(process.execPath, wranglerArgs(['dev', '--ip', '127.0.0.1', '--port', port, '--persist-to', persistence]), { env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', chunk => { logs += chunk; });
  server.stderr.on('data', chunk => { logs += chunk; });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { ready = (await fetch(origin)).status === 200; } catch { /* Wait for startup. */ }
    if (ready) break;
    if (server.exitCode !== null) throw new Error(logs);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(ready, 'El servidor no arrancó.');
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', event => { if (/Content Security Policy|Refused to/.test(event.text())) errors.push(event.text()); });
  await mkdir('test-results', { recursive: true });
  await page.goto(origin);
  await page.locator('#login-view').waitFor({ state: 'visible' });
  await page.screenshot({ path: 'test-results/login-desktop.png', fullPage: true });
  await login(page, 'testroot');
  await page.screenshot({ path: 'test-results/studio-empty.png', fullPage: true });
  console.log('✓ Inicio de sesión de administrador e interfaz inicial');

  await page.locator('#download').click();
  await page.locator('#validation-panel').waitFor({ state: 'visible' });
  assert.ok(await page.locator('[aria-invalid=true]').count() > 5);
  await page.locator('#load-example').click();
  assert.match(await page.locator('#code-preview').textContent(), /remote-as 64877/);
  await page.locator('#inventory-file').setInputFiles({ name: 'recursos.txt', mimeType: 'text/plain', buffer: Buffer.from(inventory) });
  await page.waitForFunction(() => document.querySelector('#import-status').textContent.includes('IMPORTADO'));
  assert.equal(await page.locator('[name=wanPe]').inputValue(), '10.115.3.205');
  assert.equal(await page.locator('[name=vrf]').inputValue(), '');
  assert.equal(await page.locator('[name=linkId]').inputValue(), '');
  for (const key of ['iasi', 'client', 'branch', 'workOrder', 'linkId']) await page.locator(`#config-form [name=${key}]`).fill(sample[key]);
  await page.locator('[name=access]').fill('PRADERA_GUASMO_6150');
  await page.locator('[name=port]').fill('OIGE8[0-1-7] GE: 8');
  await page.locator('[name=vrf]').fill('econofarm_datos');
  await page.locator('[name=asn]').fill('64877');
  await page.locator('[name=routing]').selectOption('STATIC');
  await page.locator('[name=lanNetworks]').fill('192.168.100.1/32');
  assert.match(await page.locator('#code-preview').textContent(), /192\.168\.100\.1\/32 TenGigE/);
  assert.ok(!/router bgp/.test(await page.locator('#code-preview').textContent()));
  console.log('✓ Errores de formulario, importación y DATOS estático con LAN');

  await page.locator('[name=service]').selectOption('INTERNET');
  await page.locator('[name=publicNetworks]').fill('10.115.3.200/29');
  assert.equal(await page.locator('[name=vrf]').inputValue(), 'internet-pccs-ncb');
  assert.equal(await page.locator('[name=vrf]').getAttribute('readonly'), '');
  assert.match(await page.locator('#code-preview').textContent(), /10\.115\.3\.200\/29 TenGigE0\/2\/1\/2\.303230/);
  await page.locator('[name=routing]').selectOption('BGP');
  await page.locator('[name=linkType][value=BCK]').check();
  assert.match(await page.locator('#code-preview').textContent(), /set local-preference 100/);
  assert.match(await page.locator('#tag-text').textContent(), /INT_BCK_10066459/);
  await page.locator('[data-preview=script]').click();
  assert.ok(!(await page.locator('#code-preview').textContent()).includes('SMTP-WHITELIST-NET'));
  await page.locator('[data-preview=validations]').click();
  assert.match(await page.locator('#code-preview').textContent(), /sho run prefix-set PS_/);
  await page.locator('[data-preview=document]').click();
  await page.screenshot({ path: 'test-results/internet-bgp-desktop.png', fullPage: true });
  console.log('✓ INTERNET estático/BGP, BCK y pestañas de vista previa');

  const downloading = page.waitForEvent('download');
  await page.locator('#download').click();
  const downloaded = await downloading;
  assert.ok(downloaded.suggestedFilename().endsWith('_int_bck_10066459.txt'));
  const content = await readFile(await downloaded.path(), 'utf8');
  assert.ok(content.includes('SMTP-WHITELIST-NET\r\n10.115.3.200/29'));
  await page.locator('.nav-item[data-view=history]').click();
  await page.locator('.history-item').waitFor();
  await page.getByRole('button', { name: 'Ver documento' }).click();
  await page.locator('#document-dialog').waitFor({ state: 'visible' });
  assert.match(await page.locator('#saved-document').textContent(), /set weight 100/);
  await page.locator('#document-dialog .icon-button').click();
  await page.locator('#history-search').fill('no-existe');
  await page.getByRole('heading', { name: 'Sin coincidencias' }).waitFor();
  await page.locator('#history-search').fill('FARCOMED');
  await page.locator('.history-item').waitFor();
  console.log('✓ Descarga real con CRLF, historial y búsqueda');

  await page.locator('#users-nav').click();
  await page.locator('#create-user-form [name=username]').fill('colleague');
  await page.locator('#create-user-form [name=password]').fill(password);
  await page.locator('#create-user-form button').click();
  await page.getByText('Usuario creado. Ya puede iniciar sesión.').waitFor();
  await page.locator('#logout').click();
  await page.locator('#login-view').waitFor({ state: 'visible' });
  await login(page, 'colleague');
  assert.equal(await page.locator('#users-nav').isVisible(), false);
  await page.locator('.nav-item[data-view=history]').click();
  await page.getByRole('heading', { name: 'Tu próximo enlace empieza aquí' }).waitFor();
  console.log('✓ Creación de usuario, cierre de sesión e historial privado vacío');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.nav-item[data-view=generator]').click();
  await page.locator('#load-example').click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await page.screenshot({ path: 'test-results/studio-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('✓ Pantalla móvil sin desbordamiento y sin errores JavaScript/CSP');
  console.log('\nPrueba de navegador completada. Capturas: test-results/');
} catch (error) {
  console.error(error);
  console.error(logs.slice(-3000));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await stopProcess(server);
  await rm(directory, { recursive: true, force: true });
}
