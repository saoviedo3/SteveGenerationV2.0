import test from 'node:test';
import assert from 'node:assert/strict';
import { generate, parseInventory, validate, validCidr } from '../public/lib/generator.js';
import { sample, inventory } from './fixtures.mjs';

test('importa el formato Network Inventory con CRLF y VRF vacía', () => {
  const parsed = parseInventory(inventory.replace(/\n/g, '\r\n'));
  assert.equal(parsed.service, 'DATOS');
  assert.equal(parsed.bandwidth, '10240Kbps');
  assert.equal(parsed.vrf, '');
  assert.equal(parsed.loopback, sample.loopback);
  for (const key of ['wanNetwork', 'wanPe', 'wanCpe', 'wanBroadcast', 'peName', 'wanLabel', 'responsible']) assert.equal(parsed[key], sample[key]);
  assert.equal(parsed.wanRows.length, 4);
  assert.deepEqual(parsed.warnings, []);
});
test('importa Internet, ignora última milla y aplica la VRF fija', () => {
  const parsed = parseInventory(inventory.replace('SERVICIO:  DATOS', 'SERVICIO: INTERNET').replace('RED PUBLICA:', 'RED PÚBLICA: 10.115.3.200/29').replace('UM TIGO', 'UM TELEFONICA'));
  assert.equal(parsed.publicNetworks, '10.115.3.200/29');
  assert.equal(parsed.vrf, 'internet-pccs-ncb');
  assert.equal(parsed.service, 'INTERNET');
});

for (const service of ['DATOS', 'INTERNET']) for (const routing of ['BGP', 'STATIC']) for (const linkType of ['UNIQUE', 'PPL', 'BCK']) {
  test(`${service} ${routing} ${linkType}: interfaz, política y etiqueta coherentes`, () => {
    const output = generate({ ...sample, service, routing, linkType });
    assert.deepEqual(output.errors, {});
    const internet = service === 'INTERNET';
    const name = `farcomed_ss_maldonado_${internet ? 'int' : 'dat'}${linkType === 'UNIQUE' ? '' : `_${linkType.toLowerCase()}`}_10066459`;
    const vrf = internet ? 'internet-pccs-ncb' : 'econofarm_datos';
    assert.equal(output.interface, `TenGigE0/2/1/2.${internet ? '30' : '10'}3230`);
    assert.equal(output.tag, `${name.toUpperCase()}:PRADERA_GUASMO_6150:NNI3_CRM`);
    assert.ok(output.script.includes(`description --- ${name} ---`));
    assert.ok(output.script.includes(`vrf ${vrf}`));
    assert.ok(output.script.includes('ipv4 address 10.115.3.205 255.255.255.252'));
    assert.ok(output.document.includes('UM TIGO\nREQUIERE SFP 1000BASEBX'));
    assert.equal(output.script.includes('router bgp 19114'), routing === 'BGP');
    assert.equal(output.document.includes('ASN: 64877'), routing === 'BGP');
    assert.equal(output.document.includes('SMTP-WHITELIST-NET'), internet);
    if (!internet) {
      assert.ok(output.script.includes('10.116.101.128/32 TenGigE0/2/1/2.103230 10.115.3.206 description farcomed_ss_maldonado'));
      assert.ok(output.validations.includes('sho route vrf sigmars | in 10.116.101.128/32'));
      if (routing === 'BGP') assert.ok(output.script.includes('maximum-prefix 500 75\n    route-policy default_policy_pass_all in\n    route-policy default_policy_pass_all out\n    as-override'));
    } else {
      assert.ok(!output.document.includes('sigmars'));
      assert.ok(!output.document.includes('10.116.101.128'));
      if (routing === 'BGP') {
        assert.ok(!output.script.includes('router static'));
        assert.ok(output.script.includes(`prefix-set PS_${name}_ALLOWED_IPV4\n  10.115.3.200/29\nend-set`));
        assert.ok(output.script.includes('set community (19114:20, 19114:21, 19114:504)'));
        assert.ok(output.script.includes(`set local-preference ${linkType === 'BCK' ? 100 : 200}`));
        assert.ok(output.script.includes(`set weight ${linkType === 'BCK' ? 100 : 200}`));
        assert.ok(output.script.includes('maximum-prefix 100 75 warning-only'));
        assert.ok(output.script.includes('route-policy RP_internet-pccs-ncb_IPV4_OUT out'));
        assert.ok(output.script.includes('remove-private-AS'));
      } else assert.ok(output.script.includes('10.115.3.200/29 TenGigE0/2/1/2.303230 10.115.3.206'));
    }
  });
}

test('DATOS estático genera únicamente monitoreo cuando LAN está vacía', () => {
  const output = generate({ ...sample, routing: 'STATIC', asn: '' });
  assert.equal(output.script, `!
interface TenGigE0/2/1/2.103230
 description --- farcomed_ss_maldonado_dat_10066459 ---
 service-policy input 10240Kbps
 service-policy output 10240Kbps
 vrf econofarm_datos
 ipv4 address 10.115.3.205 255.255.255.252
 encapsulation dot1q 3230
exit
!
router static
 vrf econofarm_datos
  address-family ipv4 unicast
   10.116.101.128/32 TenGigE0/2/1/2.103230 10.115.3.206 description farcomed_ss_maldonado
   !
  !
 !
!
show commit changes diff`);
});
test('redes LAN estáticas se deduplican, incluso con BGP', () => {
  for (const service of ['DATOS', 'INTERNET']) {
    const output = generate({ ...sample, service, lanNetworks: '192.168.100.1/32\n192.168.200.0/24,192.168.100.1/32' });
    assert.equal(output.errors.lanNetworks, undefined);
    assert.equal(output.script.split('192.168.100.1/32').length - 1, 1);
    assert.ok(output.script.includes('192.168.200.0/24 TenGigE'));
    assert.ok(output.script.includes('router bgp'));
  }
});
test('múltiples redes públicas alimentan prefix-set y whitelist', () => {
  const output = generate({ ...sample, service: 'INTERNET', publicNetworks: '10.115.3.200/29\n203.0.113.0/24' });
  assert.ok(output.script.includes('  10.115.3.200/29,\n  203.0.113.0/24\nend-set'));
  assert.ok(output.document.includes('object-group network ipv4 SMTP-WHITELIST-NET\n10.115.3.200/29\n203.0.113.0/24'));
});
test('no deduce PE y CPE por posición de fila ni por último octeto', () => {
  const parsed = parseInventory(inventory.replace('10.115.3.205   IPTCHL3CCRM03', '10.115.3.206   IPTCHL3CCRM03').replace('10.115.3.206   CLIENTE', '10.115.3.205   CLIENTE'));
  const output = generate({ ...sample, wanPe: parsed.wanPe, wanCpe: parsed.wanCpe });
  assert.deepEqual(output.errors, {});
  assert.ok(output.script.includes('ipv4 address 10.115.3.206 255.255.255.252'));
  assert.ok(output.script.includes('neighbor 10.115.3.205'));
});
test('nombres con acentos se normalizan y medio eléctrico cambia observación', () => {
  const output = generate({ ...sample, client: 'Farmacías', branch: 'Sede Norte', medium: 'ELECTRICAL' });
  assert.ok(output.tag.startsWith('FARMACIAS_SEDE_NORTE_DAT_'));
  assert.ok(output.document.includes('REQUIERE CONVERSOR OPTICO ELECTRICO'));
});
test('rechaza entradas incompletas, redes incoherentes e inyección de comandos', () => {
  const cases = [
    ['vlan', '4095'], ['vlan', '0'], ['vlan', '32.5'], ['vlan', '3230\nshutdown'],
    ['wanPe', '10.115.3.206'], ['wanCpe', '999.1.1.1'], ['wanNetwork', '10.115.3.205'],
    ['wanBroadcast', '10.115.3.208'], ['loopback', '10.116.101.128/24'], ['vrf', 'foo\nshutdown'],
    ['asn', '4294967295'], ['asn', '0'], ['lanNetworks', '192.168.1.1/24'], ['client', 'a\ncommit'],
    ['iasi', {}], ['branch', []], ['responsible', null], ['bandwidth', '10240Kbps\nshutdown'],
  ];
  for (const [key, value] of cases) {
    const output = generate({ ...sample, [key]: value });
    assert.ok(Object.keys(output.errors).length > 0, `${key}=${JSON.stringify(value)}`);
    assert.equal(output.document, undefined);
  }
  assert.ok(Object.keys(validate({})).length > 10);
  assert.ok(generate({ ...sample, service: 'INTERNET', publicNetworks: '' }).errors.publicNetworks);
  assert.ok(generate({ ...sample, solution: 'NNI2' }).errors.solution);
});
test('CIDR valida límites y alineación de red', () => {
  for (const valid of ['0.0.0.0/0', '255.255.255.255/32', '192.168.0.0/16']) assert.equal(validCidr(valid), true);
  for (const invalid of ['0.0.0.0/33', '10.0.0.1/24', '256.0.0.0/8', '10.0.0.0/-1']) assert.equal(validCidr(invalid), false);
});
