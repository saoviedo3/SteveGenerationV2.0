import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInventory } from '../public/lib/generator.js';
import { pwheInventory } from './fixtures.mjs';

test('importa la WAN PWHE y ambos nombres de PE sin sustituir la red del TXT', () => {
  const result = parseInventory(pwheInventory.replace(/\n/g, '\r\n'));
  assert.equal(result.wanRows.length, 4);
  assert.equal(result.wanNetwork, '10.112.50.108');
  assert.equal(result.wanPe, '10.112.50.109');
  assert.equal(result.wanCpe, '10.112.50.110');
  assert.equal(result.wanBroadcast, '10.112.50.111');
  assert.equal(result.peName, 'IPTCHL3CAR205 - IPTCHL3CAR203');
  assert.equal(result.vlan, '');
  assert.equal(result.publicNetworks, '200.24.222.8 /29');
  assert.deepEqual(result.warnings, []);
});
