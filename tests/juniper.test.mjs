import test from 'node:test';
import assert from 'node:assert/strict';
import { generate, parseInventory } from '../public/lib/generator.js';
import { juniperSample, juniperInventory, sample } from './fixtures.mjs';

for (const routing of ['STATIC', 'BGP']) for (const linkType of ['UNIQUE', 'PPL', 'BCK']) {
  test(`Juniper DATOS ${routing} ${linkType}`, () => {
    const result = generate({ ...juniperSample, routing, linkType, lanNetworks: '192.0.2.0/24' });
    assert.deepEqual(result.errors, {});
    const label = `CORNEJOTEX_UIO_PLANTA_ZAMBIZA_DAT${linkType === 'UNIQUE' ? '' : `_${linkType}`}_10073947`;
    assert.equal(result.interface, 'et-0/0/19.1204');
    assert.equal(result.tag, label);
    assert.equal(result.tags.length, 1);
    assert.ok(result.document.includes('SERVICIO: DATOS'));
    assert.ok(result.document.includes('PUERTO: et-0/0/19'));
    assert.ok(result.document.includes(juniperSample.engineeringUrl));
    assert.ok(result.document.includes('REQUIERE SFP 1000BASEBX'));
    assert.ok(result.script.includes(`set interfaces et-0/0/19 description "${label}"`));
    assert.ok(result.script.includes(`set interfaces et-0/0/19 unit 1204 description "${label}"`));
    assert.ok(result.script.includes('set interfaces et-0/0/19 unit 1204 vlan-id 1204'));
    assert.ok(result.script.includes('set interfaces et-0/0/19 unit 1204 family inet address 10.112.48.181/30'));
    assert.ok(result.script.includes('set routing-instances cornejotex interface et-0/0/19.1204'));
    assert.ok(result.script.includes('static route 10.116.103.202/32 next-hop 10.112.48.182'));
    assert.ok(result.script.includes('static route 192.0.2.0/24 next-hop 10.112.48.182'));
    assert.equal(result.script.includes('$CONFIGURACION BGP'), routing === 'BGP');
    assert.equal(result.script.includes(`group ${label} peer-as 65509`), routing === 'BGP');
    assert.ok(result.validations.includes('match 40960Kbps'));
    assert.ok(result.validations.includes('sh route vrf sigmars | in 10.116.103.202'));
    assert.ok(!result.document.includes('153600Kbps'));
    assert.ok(!result.document.includes('10.116.101.185'));
    assert.ok(!result.document.includes('SMTP-WHITELIST-NET'));
    assert.ok(!result.script.includes('router bgp'));
  });
}

test('VRF y velocidad se crean solo si se solicitan; el filtro existente siempre se aplica', () => {
  const defaultResult = generate({ ...juniperSample, rd: '' });
  assert.deepEqual(defaultResult.errors, {});
  assert.ok(!defaultResult.script.includes('$CREACION DE VRF'));
  assert.ok(!defaultResult.script.includes('set firewall policer'));
  assert.ok(defaultResult.script.includes('family inet filter input 40960Kbps'));
  assert.ok(defaultResult.script.includes('output-traffic-control-profile 40960Kbps'));
  const result = generate({ ...juniperSample, createVrf: 'YES', createSpeed: 'YES' });
  assert.deepEqual(result.errors, {});
  for (const line of [
    'set policy-options community 19114:103211 members target:19114:103211',
    'set policy-options community 19114:200002 members target:19114:200002',
    'set routing-instances cornejotex route-distinguisher 19114:103211',
    'set routing-instances cornejotex vrf-import import_cornejotex',
    'set routing-instances cornejotex vrf-export export_cornejotex',
    'set policy-options policy-statement import_cornejotex term reject then reject',
    'set policy-options policy-statement export_cornejotex term 2 from protocol static',
    'set firewall policer 40960Kbps if-exceeding bandwidth-limit 40960000',
    'set firewall policer 40960Kbps if-exceeding burst-size-limit 1280000',
    'set class-of-service traffic-control-profiles 40960Kbps shaping-rate 40960000',
  ]) assert.ok(result.script.includes(line), line);
});

test('BGP exige RD aun sin crear VRF y permite elegir término sin dejarlo después de reject', () => {
  assert.ok(generate({ ...juniperSample, routing: 'BGP', rd: '' }).errors.rd);
  assert.ok(generate({ ...juniperSample, createVrf: 'YES', rd: '' }).errors.rd);
  for (const term of ['3', '4', '5', '99']) {
    const result = generate({ ...juniperSample, routing: 'BGP', bgpTerm: term });
    assert.deepEqual(result.errors, {});
    assert.ok(!result.script.includes('$CREACION DE VRF'));
    assert.ok(result.script.includes(`export_cornejotex term ${term} from protocol bgp`));
    assert.ok(result.script.includes(`export_cornejotex term ${term} from neighbor 10.112.48.182`));
    assert.ok(result.script.includes(`export_cornejotex term ${term} then community add 19114:103211`));
    assert.ok(result.script.includes(`insert policy-options policy-statement export_cornejotex term ${term} before term reject`));
    assert.ok(result.script.includes('as-override'));
    assert.ok(result.script.includes('remove-private'));
  }
  assert.ok(generate({ ...juniperSample, routing: 'BGP', bgpTerm: undefined }).script.includes('term 3 from protocol bgp'));
});

test('la negociación usa 1g hasta 1 Gbps inclusive y 10g al superarlo', () => {
  for (const [bandwidth, speed] of [['40960Kbps', '1g'], ['1000000Kbps', '1g'], ['1000001Kbps', '10g'], ['2048000Kbps', '10g']]) {
    assert.ok(generate({ ...juniperSample, bandwidth }).script.includes(`set interfaces et-0/0/19 speed ${speed}`));
  }
});

test('puerto fijo acepta el número y la forma completa importada sin duplicar prefijos', () => {
  assert.equal(generate(juniperSample).script, generate({ ...juniperSample, port: 'et-0/0/19' }).script);
  assert.equal(generate({ ...juniperSample, port: '0', vlan: '0600' }).interface, 'et-0/0/0.600');
  for (const port of ['-1', '19.1204', 'ge-0/0/19', '19;delete', 'et-0/0/19\ncommit', '1000']) assert.ok(generate({ ...juniperSample, port }).errors.port);
});

test('campos de Juniper impiden inyección y sobrescritura de términos de políticas base', () => {
  for (const rd of ['', '-1', '19114:103211', '4294967296', '103211;commit', 103211]) assert.ok(generate({ ...juniperSample, createVrf: 'YES', rd }).errors.rd);
  for (const bgpTerm of ['', '0', '1', '2', '3.5', '3;commit', 3]) assert.ok(generate({ ...juniperSample, routing: 'BGP', bgpTerm }).errors.bgpTerm);
  assert.ok(generate({ ...juniperSample, createVrf: true }).errors.createVrf);
  assert.ok(generate({ ...juniperSample, createSpeed: 'yes\ncommit' }).errors.createSpeed);
  assert.ok(generate({ ...juniperSample, service: 'INTERNET' }).errors.publicNetworks);
  assert.ok(generate({ ...sample, createVrf: 'YES', rd: '' }).errors.rd);
  assert.deepEqual(generate({ ...sample, createVrf: 'YES', createSpeed: 'YES', rd: '103211', bgpTerm: '1' }).errors, {});
});

test('importa la WAN con FUSION y conserva valores del inventario sin sustituirlos por el ejemplo', () => {
  const parsed = parseInventory(juniperInventory.replace(/\n/g, '\r\n'));
  assert.equal(parsed.bandwidth, '194560Kbps');
  assert.equal(parsed.wanPe, '10.112.48.181');
  assert.equal(parsed.wanCpe, '10.112.48.182');
  assert.equal(parsed.peName, 'FUSION');
  assert.equal(parsed.service, '');
  assert.equal(parsed.vlan, '');
  assert.equal(parsed.loopback, '10.116.103.202/32');
  const roundtrip = parseInventory(generate(juniperSample).document);
  assert.equal(roundtrip.port, 'et-0/0/19');
  assert.equal(roundtrip.service, 'DATOS');
  assert.equal(roundtrip.vlan, '1204');
  assert.equal(roundtrip.peName, 'FUSION');
});
