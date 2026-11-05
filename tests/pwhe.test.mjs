import test from 'node:test';
import assert from 'node:assert/strict';
import { generate, parseInventory } from '../public/lib/generator.js';
import { pwheSample, pwheInventory } from './fixtures.mjs';

for (const service of ['DATOS', 'INTERNET']) for (const routing of ['STATIC', 'BGP']) for (const linkType of ['UNIQUE', 'PPL', 'BCK']) {
  test(`PWHE CARRETAS ${service} ${routing} ${linkType}`, () => {
    const input = { ...pwheSample, service, routing, linkType, asn: '65437', vrf: 'test_datos', loopback: '192.0.2.1/32' };
    const output = generate(input);
    assert.deepEqual(output.errors, {});
    const internet = service === 'INTERNET';
    const iface = `PW-Ether${internet ? '2' : '1'}0600`;
    const description = `bluecard_uio_matriz_${internet ? 'int' : 'dat'}${linkType === 'UNIQUE' ? '' : `_${linkType.toLowerCase()}`}_10062910`;
    const vrf = internet ? 'internet-pccs-ncb' : 'test_datos';
    assert.equal(output.interface, iface);
    assert.equal(output.tags.length, 3);
    assert.equal(output.tags[0].value, `${description.toUpperCase()}:Finlandia_DRX30:CARRETAS_PWHE3`);
    assert.ok(output.document.includes('VLAN: 0600'));
    assert.ok(output.validations.includes('sho int desc | in 0600'));
    assert.ok(!output.script.includes('encapsulation dot1q'));
    assert.ok(output.script.includes(`IPTCHL3CAR205 (10.116.254.32) - ${internet ? '20' : '10'}0600`));
    assert.ok(output.script.includes(`IPTCHL3CAR203 (10.116.254.29) - ${internet ? '21' : '11'}0600`));
    assert.ok(output.script.includes(`neighbor ipv4 10.73.32.159 pw-id ${internet ? '20' : '10'}0600`));
    assert.ok(output.script.includes(`neighbor 10.73.32.159 pw-id ${internet ? '21' : '11'}0600`));
    for (const role of ['PRI', 'BCK']) assert.ok(output.script.includes(` description --- ${description} --- L3-PWHE-${role}`));
    assert.equal(output.script.match(/^interface PW-Ether\d+$/gm).length, 2);
    assert.equal(output.script.match(/^ mtu 2014$/gm).length, 2);
    assert.equal(output.script.match(/^ attach generic-interface-list PWHE-InterAS-Infinera$/gm).length, 2);
    assert.equal(output.script.match(/^    pw-class EoMPLS_Fusion_Infinera$/gm).length, 2);
    assert.equal(output.script.match(/^  p2p bluecard_uio_mat$/gm).length, 2);
    const backup = output.script.indexOf('IPTCHL3CAR203 (10.116.254.29)');
    const routingHeading = routing === 'BGP' ? 'BGP' : 'ENRUTAMIENTO';
    const routingStart = output.script.indexOf(`\n${routingHeading}\n`);
    assert.ok(routingStart > backup);
    assert.equal(output.script.match(/^(BGP|ENRUTAMIENTO)$/gm).length, 1);
    assert.ok(!output.document.includes('Aplicar estas validaciones en IPTCHL3CAR205 e IPTCHL3CAR203.'));
    const blocks = [output.script.slice(0, backup), output.script.slice(backup, routingStart)];
    for (const block of blocks) {
      assert.ok(block.includes(` vrf ${vrf}`));
      assert.ok(block.includes(' ipv4 address 10.112.21.201 255.255.255.252'));
      assert.ok(block.includes(' service-policy input 153600Kbps'));
      assert.ok(!block.includes('router bgp'));
      assert.ok(!block.includes('router static'));
    }
    const block = output.script.slice(routingStart);
    {
      assert.equal(block.includes('router bgp 19114'), routing === 'BGP');
      assert.equal((block.match(/^router bgp 19114$/gm) ?? []).length, routing === 'BGP' ? 1 : 0);
      assert.equal((block.match(/^router static$/gm) ?? []).length, !internet || routing === 'STATIC' ? 1 : 0);
      if (!internet) {
        assert.ok(block.includes(`192.0.2.1/32 ${iface} 10.112.21.202 description bluecard_uio_matriz`));
        if (routing === 'BGP') assert.ok(block.includes('maximum-prefix 500 75\n    route-policy default_policy_pass_all in\n    route-policy default_policy_pass_all out'));
      } else if (routing === 'STATIC') assert.ok(block.includes(`200.24.222.8/29 ${iface} 10.112.21.202 description bluecard_uio_matriz`));
      else {
        assert.ok(block.includes(`prefix-set PS_${description}_ALLOWED_IPV4`));
        assert.ok(block.includes(`route-policy RP_internet-pccs-ncb_${description}_IPV4_IN`));
        assert.ok(block.includes('set community (19114:10, 19114:11, 19114:504)'));
        assert.ok(!block.includes('(19114:20, 19114:21, 19114:504)'));
        assert.ok(block.includes(`set local-preference ${linkType === 'BCK' ? 100 : 200}`));
        assert.ok(block.includes(`set weight ${linkType === 'BCK' ? 100 : 200}`));
        assert.ok(block.includes('description bluecard_uio_mat\n'));
        assert.ok(block.includes('remote-as 65437'));
        assert.ok(block.includes('maximum-prefix 100 75 warning-only'));
        assert.ok(block.includes('route-policy RP_internet-pccs-ncb_IPV4_OUT out'));
        assert.ok(block.includes('as-override\n    remove-private-AS'));
      }
    }
    assert.equal(output.document.includes('object-group network ipv4 SMTP-WHITELIST-NET'), internet);
    if (internet) {
      assert.equal(output.document.match(/^object-group network ipv4 SMTP-WHITELIST-NET$/gm).length, 1);
      assert.ok(output.document.includes('commit comment bluecard_uio_matriz'));
      assert.ok(!output.document.includes('konnet_callcenter'));
    } else assert.ok(output.validations.includes('sho route vrf sigmars | in 192.0.2.1/32'));
    assert.ok(output.validations.includes('sho run l2vpn xconnect group EoMPLS_PWHE_Infinera p2p bluecard_uio_mat'));
  });
}

test('PWHE genera las tres etiquetas de referencia sin campos adicionales para p2p o equipo', () => {
  const output = generate(pwheSample);
  assert.equal(output.tag, `BLUECARD_UIO_MATRIZ_INT_PPL_10062910:Finlandia_DRX30:CARRETAS_PWHE3
BLUECARD_UIO_MAT_INT_PPL_10062910:Finlandia_DRX30:CARR_PWHE3_PRI
BLUECARD_UIO_MAT_INT_PPL_10062910:Finlandia_DRX30:CARR_PWHE3_BCK`);
  assert.ok(output.document.includes('ACCESO: N3059 - Finlandia_DRX30 - N-PE'));
  assert.ok(output.document.includes('SERVICIO: INTERNET PPL'));
  const simple = generate({ ...pwheSample, access: 'Finlandia_DRX30' });
  assert.equal(simple.tag, output.tag);
});

test('VLAN 600 equivale a 0600 y mantiene la numeración en los límites válidos', () => {
  assert.equal(generate({ ...pwheSample, vlan: '600' }).document, generate(pwheSample).document);
  for (const [vlan, iface, primary, backup] of [['1', '20001', '200001', '210001'], ['4094', '24094', '204094', '214094']]) {
    const output = generate({ ...pwheSample, vlan });
    assert.equal(output.interface, `PW-Ether${iface}`);
    assert.ok(output.script.includes(`pw-id ${primary}`));
    assert.ok(output.script.includes(`pw-id ${backup}`));
  }
});

test('WAN importada y vecino Infinera se usan literalmente en ambos equipos', () => {
  const parsed = parseInventory(pwheInventory);
  const input = { ...pwheSample, ...parsed, routing: 'STATIC', vlan: '0600', access: pwheSample.access, port: pwheSample.port, infineraIp: '10.73.32.160' };
  const output = generate(input);
  assert.deepEqual(output.errors, {});
  assert.equal(output.script.match(/ipv4 address 10\.112\.50\.109 /g).length, 2);
  assert.equal(output.script.match(/PW-Ether20600 10\.112\.50\.110 description/g).length, 1);
  assert.ok(!output.document.includes('10.112.21.201'));
  assert.ok(output.script.includes('neighbor ipv4 10.73.32.160 pw-id 200600'));
  assert.ok(output.script.includes('neighbor 10.73.32.160 pw-id 210600'));
});

test('PWHE valida vecino, VLAN, enrutamiento y caracteres de los encabezados', () => {
  for (const value of ['', '999.1.1.1', '10.73.32.159/32', '10.73.32.159\nshutdown']) assert.ok(generate({ ...pwheSample, infineraIp: value }).errors.infineraIp);
  for (const vlan of ['', '0', '4095', '00600', '0600\nshutdown']) assert.ok(generate({ ...pwheSample, vlan }).errors.vlan);
  assert.ok(generate({ ...pwheSample, routing: 'BGP', asn: '' }).errors.asn);
  assert.ok(generate({ ...pwheSample, service: 'DATOS', vrf: 'test_datos', loopback: '' }).errors.loopback);
  assert.ok(generate({ ...pwheSample, access: 'N3059\nshutdown' }).errors.access);
});

test('PWHE reúne LAN y varias redes públicas en un bloque común sin ampliar el prefix-set con LAN', () => {
  const output = generate({ ...pwheSample, routing: 'BGP', asn: '65437', publicNetworks: '200.24.222.8/29\n203.0.113.0/24', lanNetworks: '192.168.100.0/24' });
  assert.deepEqual(output.errors, {});
  assert.equal(output.script.match(/192\.168\.100\.0\/24 PW-Ether20600 /g).length, 1);
  assert.equal(output.script.match(/  200\.24\.222\.8\/29,\n  203\.0\.113\.0\/24\nend-set/g).length, 1);
  assert.ok(output.document.includes('object-group network ipv4 SMTP-WHITELIST-NET\n200.24.222.8/29\n203.0.113.0/24'));
});

test('p2p y descripciones de rutas respetan sus límites con nombres largos', () => {
  const input = { ...pwheSample, client: 'Un cliente con nombre largo', branch: 'Una sucursal extensa' };
  const output = generate(input);
  assert.deepEqual(output.errors, {});
  const p2p = output.script.match(/^  p2p (.+)$/m)[1];
  const route = output.script.match(/^   200\.24\.222\.8\/29 .+ description (.+)$/m)[1];
  assert.equal(p2p.length, 16);
  assert.equal(route.length, 30);
  assert.ok(output.description.length > 30);
});

test('servicio PWHE con PPL/BCK explícito en el encabezado se puede importar', () => {
  const parsed = parseInventory(generate(pwheSample).document);
  assert.equal(parsed.service, 'INTERNET');
  assert.equal(parsed.linkType, 'PPL');
  assert.equal(parsed.vlan, '0600');
  assert.equal(parsed.wanPe, '10.112.21.201');
});
