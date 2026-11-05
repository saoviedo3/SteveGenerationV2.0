import test from 'node:test';
import assert from 'node:assert/strict';
import { generate, parseInventory } from '../public/lib/generator.js';
import { calderonSample, pwheSample } from './fixtures.mjs';

for (const service of ['DATOS', 'INTERNET']) for (const routing of ['STATIC', 'BGP']) for (const linkType of ['UNIQUE', 'PPL', 'BCK']) {
  test(`PWHE CALDERON ${service} ${routing} ${linkType}`, () => {
    const output = generate({ ...calderonSample, service, routing, linkType, vrf: 'test_datos', loopback: '192.0.2.1/32' });
    assert.deepEqual(output.errors, {});
    const internet = service === 'INTERNET';
    const iface = `PW-Ether${internet ? '2' : '1'}2318`;
    const name = `farmaenlace_uio_la_luz_cob_${internet ? 'int' : 'dat'}${linkType === 'UNIQUE' ? '' : `_${linkType.toLowerCase()}`}_10063222`;
    assert.equal(output.interface, iface);
    assert.equal(output.tags.length, 3);
    assert.equal(output.tags[0].value, `${name.toUpperCase()}:El_Labrador_8615:CALDERON_PWHE3`);
    assert.ok(output.tags[1].label.includes('IPTCHL3CALD02'));
    assert.ok(output.tags[2].label.includes('IPTCHL3CALD01'));
    assert.ok(output.tags[1].value.startsWith(`FARMAENLACE_UIO_${internet ? 'INT' : 'DAT'}`));
    assert.ok(output.tags[1].value.endsWith(':CLD_PWHE3_PRI'));
    assert.ok(output.tags[2].value.endsWith(':CLD_PWHE3_BCK'));
    assert.ok(!output.document.includes('IPTCHL3CAR205'));
    assert.ok(!output.document.includes('IPTCHL3CAR203'));
    assert.ok(output.script.includes(`IPTCHL3CALD02 (10.116.254.136) - ${internet ? '20' : '10'}2318`));
    assert.ok(output.script.includes(`IPTCHL3CALD01 (10.116.254.26) - ${internet ? '21' : '11'}2318`));
    assert.ok(output.script.includes(`neighbor ipv4 10.73.32.224 pw-id ${internet ? '20' : '10'}2318`));
    assert.ok(output.script.includes(`neighbor ipv4 10.73.32.224 pw-id ${internet ? '21' : '11'}2318`));
    assert.equal(output.script.match(/^ dampening 1 75 2000 240$/gm).length, 2);
    assert.equal(output.script.match(/^interface PW-Ether\d+$/gm).length, 2);
    assert.equal(output.script.match(/^ mtu 2014$/gm).length, 2);
    assert.equal(output.script.match(/^  p2p farmaenlace_uio_$/gm).length, 2);
    assert.equal(output.script.match(/^ ipv4 address 10\.112\.26\.45 255\.255\.255\.252$/gm).length, 2);
    assert.equal(output.script.match(/^(BGP|ENRUTAMIENTO)$/gm).length, 1);
    assert.equal((output.script.match(/^router bgp 19114$/gm) ?? []).length, routing === 'BGP' ? 1 : 0);
    assert.ok(!output.document.includes('Aplicar estas validaciones'));
    for (const role of ['PRI', 'BCK']) assert.ok(output.script.includes(`description --- ${name} --- L3-PWHE-${role}`));
    if (!internet) {
      assert.ok(output.script.includes(`192.0.2.1/32 ${iface} 10.112.26.46 description farmaenlace_uio_la_luz_cob`));
      assert.ok(output.validations.includes('sho route vrf sigmars | in 192.0.2.1/32'));
      assert.ok(!output.document.includes('SMTP-WHITELIST-NET'));
      if (routing === 'BGP') assert.ok(output.script.includes('maximum-prefix 500 75\n    route-policy default_policy_pass_all in'));
    } else {
      assert.ok(output.document.includes('object-group network ipv4 SMTP-WHITELIST-NET\n200.24.209.244/30'));
      assert.ok(output.document.includes('commit comment farmaenlace_uio_la_luz_cob'));
      assert.ok(!output.document.includes('konnet_callcenter'));
      if (routing === 'STATIC') assert.ok(output.script.includes(`200.24.209.244/30 ${iface} 10.112.26.46 description farmaenlace_uio_la_luz_cob`));
      else {
        assert.ok(output.script.includes(`prefix-set PS_${name}_ALLOWED_IPV4`));
        assert.ok(output.script.includes(`destination in PS_${name}_ALLOWED_IPV4`));
        assert.ok(output.script.includes(`route-policy RP_internet-pccs-ncb_${name}_IPV4_IN in`));
        assert.ok(output.script.includes('set community (19114:10, 19114:11, 19114:504)'));
        assert.ok(output.script.includes(`set local-preference ${linkType === 'BCK' ? 100 : 200}`));
        assert.ok(output.script.includes(`set weight ${linkType === 'BCK' ? 100 : 200}`));
        assert.ok(output.script.includes('remote-as 65113'));
        assert.ok(output.script.includes('maximum-prefix 100 75 warning-only'));
        assert.ok(output.script.includes('route-policy RP_internet-pccs-ncb_IPV4_OUT out'));
        assert.ok(!output.script.includes('ppal'));
      }
    }
  });
}

test('dampening es exclusivo de Calderon y se mantiene en ambas interfaces', () => {
  assert.ok(!generate(pwheSample).script.includes('dampening'));
  const output = generate(calderonSample);
  assert.equal(output.script.match(/ipv4 address 10\.112\.26\.45 255\.255\.255\.252\n dampening 1 75 2000 240\n attach generic-interface-list/g).length, 2);
});

test('Calderon exige vecino Infinera y conserva las máscaras y la WAN al importar su documento', () => {
  assert.ok(generate({ ...calderonSample, infineraIp: '' }).errors.infineraIp);
  const parsed = parseInventory(generate(calderonSample).document);
  assert.equal(parsed.wanPe, '10.112.26.45');
  assert.equal(parsed.wanCpe, '10.112.26.46');
  assert.equal(parsed.peName, 'IPTCHL3CALD02 - IPTCHL3CALD01');
  assert.equal(parsed.lastMile, 'UM TELEFONICA');
  assert.equal(parsed.asn, '65113');
  assert.equal(parsed.publicNetworks, '200.24.209.244/30');
});
