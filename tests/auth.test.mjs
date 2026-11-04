import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, passwordError, tokenHash, randomToken } from '../worker/auth.js';

test('contraseñas saladas: verificación y rechazo de contraseña incorrecta', async () => {
  const password = 'solo-para-pruebas-2026';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.ok(!first.includes(password));
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('incorrecta', first), false);
  assert.equal(await verifyPassword(password, 'invalido'), false);
});
test('límites de contraseña y tokens aleatorios no almacenados en claro', async () => {
  assert.ok(passwordError('abc'));
  assert.ok(passwordError('x'.repeat(129)));
  assert.equal(passwordError('x'.repeat(4)), null);
  const token = randomToken();
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.notEqual(token, randomToken());
  assert.notEqual(await tokenHash(token), token);
});
