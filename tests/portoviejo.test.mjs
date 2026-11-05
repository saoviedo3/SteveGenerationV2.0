import test from 'node:test';
import assert from 'node:assert/strict';
import { generate, parseInventory } from '../public/lib/generator.js';
import { portSample, portInventory } from './fixtures.mjs';

for (const service of ['DATOS', 'INTERNET']) for (const routing of ['STATIC', 'BGP']) for (const linkType of ['UNIQUE', 'PPL', 'BCK']) {
  test(`NNI PORTOVIEJO ${service} ${routing} ${linkType}`, () => {
    const input = { ...portSample, service, routing, linkType, vrf: 'test_datos', loopback: '192.0.2.1/32', asn: '64877' };
    const output = generate(input);
    assert.deepEqual(output.errors, {});
    const internet = service === 'INTERNET';
    const iface = `GigabitEthernet0/0/0/4.${internet ? '30' : '10'}3386`;
    const name = `asociacion_medica_renal_portoviejo_asmerp_oficina_1_${internet ? 'int' : 'dat'}${linkType === 'UNIQUE' ? '' : `_${linkType.toLowerCase()}`}_10073838`;
    assert.equal(output.interface, iface);
    assert.equal(output.solutionLabel, 'NNI PORTOVIEJO');
    assert.equal(output.tag, `${name.toUpperCase()}:ESTADIO_PORTOVIEJO_6150:NNI_PORT`);
    assert.ok(output.script.includes(`description --- ${name} ---`));
    assert.ok(output.script.includes('ipv4 address 10.115.10.237 255.255.255.252'));
    assert.ok(output.script.includes('service-policy input 20480Kbps\n service-policy output 20480Kbps'));
    assert.ok(output.script.includes('encapsulation dot1q 3386'));
    assert.ok(output.script.includes('show commit changes diff'));
    assert.ok(!output.script.includes('TenGigE'));
    assert.ok(!output.script.includes('ip vrf forwarding'));
    assert.equal(output.script.includes('router bgp 19114'), routing === 'BGP');
    assert.ok(output.validations.includes(`sho run interface ${iface}`));
    const routes = output.script.split('\n').filter(line => /^\s+\d+\.\d+\.\d+\.\d+\/\d+ /.test(line));
    for (const route of routes) {
      const name = route.split(' description ')[1];
      assert.ok(name.length <= 30);
      if (linkType !== 'UNIQUE') assert.ok(name.endsWith(`_${linkType.toLowerCase()}`));
      assert.ok(!name.includes('10073838'));
    }
    if (!internet) {
      assert.ok(output.script.includes(`192.0.2.1/32 ${iface} 10.115.10.238 description `));
      assert.ok(output.validations.includes('sho route vrf sigmars | in 192.0.2.1/32'));
      assert.ok(!output.document.includes('SMTP-WHITELIST-NET'));
      if (routing === 'BGP') assert.ok(output.script.includes('maximum-prefix 500 75\n    route-policy default_policy_pass_all in\n    route-policy default_policy_pass_all out\n    as-override'));
    } else {
      assert.ok(output.script.includes('vrf internet-pccs-ncb'));
      assert.ok(output.document.includes('object-group network ipv4 SMTP-WHITELIST-NET\n200.7.207.122/32'));
      assert.ok(output.validations.includes('sh runn object-group network ipv4 SMTP-WHITELIST-NET | inc 200.7.207.122/32'));
      assert.ok(!output.document.includes('sigmars'));
      if (routing === 'BGP') {
        assert.equal(routes.length, 0);
        assert.ok(output.script.includes(`prefix-set PS_${name}_ALLOWED_IPV4\n  200.7.207.122/32`));
        assert.ok(output.script.includes(`route-policy RP_internet-pccs-ncb_${name}_IPv4_IN`));
        assert.ok(output.script.includes('set community (19114:20, 19114:21, 19114:504)'));
        assert.ok(output.script.includes(`set local-preference ${linkType === 'BCK' ? 100 : 200}`));
        assert.ok(output.script.includes(`set weight ${linkType === 'BCK' ? 100 : 200}`));
        assert.ok(output.script.includes('maximum-prefix 100 75 warning-only'));
        assert.ok(output.script.includes('route-policy RP_internet-pccs-ncb_IPV4_OUT out'));
        assert.ok(output.script.includes('remove-private-AS'));
      } else assert.ok(output.script.includes(`200.7.207.122/32 ${iface} 10.115.10.238 description `));
    }
  });
}

test('Portoviejo importa /32 y AB incompleto sin inventar la velocidad', () => {
  const parsed = parseInventory(portInventory);
  assert.equal(parsed.bandwidth, 'Kbps');
  assert.equal(parsed.vlan, '3386');
  assert.equal(parsed.publicNetworks, '200.7.207.122 /32');
  assert.equal(parsed.wanPe, '10.115.10.237');
  assert.equal(parsed.wanCpe, '10.115.10.238');
  assert.equal(parsed.peName, 'IPTCHL3PORC02');
  assert.ok(parsed.warnings.some(text => text.includes('ancho de banda')));
  const input = { ...portSample, ...parsed, access: portSample.access, port: portSample.port, routing: 'STATIC' };
  assert.ok(generate(input).errors.bandwidth);
  const output = generate({ ...input, bandwidth: '20480Kbps' });
  assert.deepEqual(output.errors, {});
  assert.ok(output.script.includes('200.7.207.122/32 GigabitEthernet0/0/0/4.303386'));
});

test('rutas de Portoviejo usan cliente y sucursal; reservan el sufijo PPL/BCK dentro de 30 caracteres', () => {
  for (const linkType of ['UNIQUE', 'PPL', 'BCK']) {
    const output = generate({ ...portSample, client: 'ASMERP', linkType });
    const route = output.script.split('\n').find(line => line.includes('200.7.207.122/32 '));
    const name = route.split(' description ')[1];
    assert.equal(name, `asmerp_oficina_1${linkType === 'UNIQUE' ? '' : `_${linkType.toLowerCase()}`}`);
    assert.ok(!name.includes('_int'));
  }
  const long = generate({ ...portSample, linkType: 'BCK' });
  const route = long.script.split('\n').find(line => line.includes('200.7.207.122/32 '));
  assert.equal(route.split(' description ')[1].length, 30);
  assert.ok(route.endsWith('_bck'));
  assert.ok(long.tag.includes('ASOCIACION_MEDICA_RENAL_PORTOVIEJO_ASMERP_OFICINA_1_INT_BCK_10073838'));
});

test('Portoviejo conserva rutas LAN estáticas también en BGP, sin modificar el filtro público', () => {
  const output = generate({ ...portSample, routing: 'BGP', asn: '64877', lanNetworks: '192.168.100.0/24', linkType: 'PPL' });
  assert.deepEqual(output.errors, {});
  assert.ok(output.script.includes('192.168.100.0/24 GigabitEthernet0/0/0/4.303386 10.115.10.238 description '));
  assert.ok(output.script.split('\n').find(line => line.includes('192.168.100.0/24 ')).endsWith('_ppl'));
  assert.ok(output.script.includes('  200.7.207.122/32\nend-set'));
});

test('DATOS de Portoviejo exige sus propios recursos de monitoreo y BGP exige ASN', () => {
  assert.ok(generate({ ...portSample, service: 'DATOS', vrf: '' }).errors.vrf);
  assert.ok(generate({ ...portSample, service: 'DATOS', vrf: 'test_datos', loopback: '' }).errors.loopback);
  assert.ok(generate({ ...portSample, routing: 'BGP', asn: '' }).errors.asn);
});
