import test from 'node:test';
import assert from 'node:assert/strict';
import { generate } from '../public/lib/generator.js';
import { sample, mapSample, portSample, pwheSample, calderonSample } from './fixtures.mjs';

const fixtures = { NNI3_CRM: sample, NNI2_MAP: mapSample, NNI_PORT: portSample, CARRETAS_PWHE3: pwheSample, CALDERON_PWHE3: calderonSample };
for (const [solution, fixture] of Object.entries(fixtures)) for (const routing of ['STATIC', 'BGP']) {
  test(`${solution} ${routing}: crea VRF, redistribución y velocidad con la sintaxis del equipo`, () => {
    const result = generate({ ...fixture, service: 'DATOS', routing, vrf: 'metaltronic', rd: '102742', createVrf: 'YES', createSpeed: 'YES', bandwidth: '1024Kbps', asn: '64705', loopback: '192.0.2.1/32' });
    assert.deepEqual(result.errors, {});
    const xe = solution === 'NNI2_MAP';
    assert.ok(result.script.indexOf(xe ? '\nip vrf metaltronic\n' : '\nvrf metaltronic\n') < result.script.indexOf(`interface ${result.interface}\n`));
    assert.ok(result.script.indexOf('policy-map 1024Kbps\n') < result.script.indexOf(`interface ${result.interface}\n`));
    assert.equal(result.script.match(/^router bgp 19114$/gm).length, 1);
    assert.ok(result.script.includes('redistribute static'));
    assert.ok(result.script.includes('19114:102742'));
    assert.ok(result.script.includes('19114:200002'));
    assert.ok(result.script.includes('RM-monitor'));
    assert.equal(result.script.includes('remote-as 64705'), routing === 'BGP');
    if (xe) {
      assert.ok(result.script.includes('route-target export 19114:102742'));
      assert.ok(result.script.includes('redistribute connected route-map RM_metaltronic_connected'));
      assert.ok(result.script.includes('police cir 1024000 bc 32000 be 32000 conform-action transmit exceed-action drop'));
      assert.ok(!result.script.includes('end-policy-map'));
    } else {
      assert.ok(result.script.includes('  rd 19114:102742\n  address-family ipv4 unicast\n   redistribute connected\n   redistribute static'));
      assert.ok(result.script.includes('police rate 1024000 bps burst 32000 bytes peak-burst 32000 bytes'));
      assert.ok(result.script.includes('end-policy-map'));
      assert.ok(!result.script.includes('police cir'));
      if (solution.includes('PWHE')) assert.equal(result.script.match(/^interface PW-Ether\d+$/gm).length, 2);
    }
  });
  test(`${solution} ${routing}: INTERNET crea velocidad y conserva su VRF existente`, () => {
    const input = { ...fixture, service: 'INTERNET', routing, publicNetworks: '203.0.113.0/24', asn: '64705', createSpeed: 'YES', bandwidth: '1024Kbps' };
    const result = generate(input);
    assert.deepEqual(result.errors, {});
    assert.ok(result.script.includes('policy-map 1024Kbps'));
    assert.ok(!result.script.includes('route-target'));
    assert.ok(!result.script.includes('redistribute connected'));
    assert.ok(result.document.includes('SMTP-WHITELIST-NET\n203.0.113.0/24'));
    assert.ok(generate({ ...input, createVrf: 'YES', rd: '102742' }).errors.createVrf);
  });
}

test('las opciones de creación son No por defecto y exigen un RD válido al crear VRF en Cisco', () => {
  assert.equal(generate(sample).document, generate({ ...sample, createVrf: 'NO', createSpeed: 'NO' }).document);
  for (const rd of ['', '19114:102742', '-1', '4294967296', '1\ncommit', 102742]) assert.ok(generate({ ...sample, createVrf: 'YES', rd }).errors.rd);
  assert.ok(generate({ ...sample, createSpeed: true }).errors.createSpeed);
  assert.ok(generate({ ...sample, createVrf: 'YES\ncommit' }).errors.createVrf);
});
