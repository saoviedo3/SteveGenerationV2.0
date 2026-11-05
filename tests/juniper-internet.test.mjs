import test from 'node:test';
import assert from 'node:assert/strict';
import { generate, parseInventory } from '../public/lib/generator.js';
import { juniperInternetBgp, juniperInternetStatic } from './fixtures.mjs';

for (const routing of ['STATIC', 'BGP']) for (const juniperRegion of ['QUITO', 'CUENCA']) for (const linkType of ['UNIQUE', 'PPL', 'BCK']) {
  test(`Juniper INTERNET ${routing} ${juniperRegion} ${linkType}`, () => {
    const fixture = routing === 'BGP' ? juniperInternetBgp : juniperInternetStatic;
    const result = generate({ ...fixture, juniperRegion, linkType, vrf: 'internet-pcs-ncb', lanNetworks: '192.0.2.0/24' });
    assert.deepEqual(result.errors, {});
    const name = `${routing === 'BGP' ? 'cornejotex_uio_planta_zambiza' : 'centro_ceramico_cermosa_cue_cc_ofi_mce'}_int${linkType === 'UNIQUE' ? '' : `_${linkType.toLowerCase()}`}`;
    assert.equal(result.tag, `${name.toUpperCase()}_SINID`);
    assert.equal(result.interface, `et-0/0/${fixture.port}.${fixture.vlan}`);
    assert.ok(result.document.includes('VRF: internet-pccs-ncb'));
    assert.ok(!result.document.includes('VRF: internet-pcs-ncb'));
    assert.ok(!result.document.includes('LOOPBACK MONITOREO'));
    assert.ok(!result.document.includes('sigmars'));
    assert.ok(!result.script.includes('$CREACION DE VRF'));
    assert.ok(!result.script.includes('route-distinguisher'));
    assert.ok(result.script.includes(`static route 192.0.2.0/24 next-hop ${fixture.wanCpe}`));
    assert.ok(result.document.includes(`object-group network ipv4 SMTP-WHITELIST-NET\n${fixture.publicNetworks}`));
    assert.ok(result.validations.includes(`show route table internet-pccs-ncb.inet.0 ${fixture.publicNetworks}`));
    assert.ok(result.validations.includes(`| inc ${fixture.publicNetworks.split('/')[0]}`));
    assert.equal(result.script.includes('encapsulation flexible-ethernet-services'), routing === 'BGP');
    if (routing === 'STATIC') {
      assert.ok(result.script.includes(`static route ${fixture.publicNetworks} next-hop ${fixture.wanCpe}`));
      assert.ok(!result.script.includes('protocols bgp'));
    } else {
      const prefix = `PS_${name}_ALLOWED_IPV4`;
      const policy = `RP_internet-pccs-ncb_${name}_IPV4_IN`;
      const management = `RP_CPE-MGMT-INTERNET-PCCS-NCB${juniperRegion === 'CUENCA' ? '_IPV4' : ''}`;
      assert.ok(result.script.includes(`prefix-list ${prefix} 181.188.210.71/32`));
      assert.ok(result.script.includes(`${policy} term 1 from prefix-list ${prefix}`));
      for (const community of juniperRegion === 'QUITO' ? [10, 11, 504] : [20, 21, 504]) assert.ok(result.script.includes(`${policy} term 1 then community add 19114:${community}`));
      assert.ok(!result.script.includes(`community add 19114:${juniperRegion === 'QUITO' ? 20 : 10}\n`));
      const preference = linkType === 'BCK' ? 100 : 200;
      assert.ok(result.script.includes(`${policy} term 1 then local-preference ${preference}`));
      assert.ok(result.script.includes(`${policy} term 1 then metric ${preference}`));
      assert.ok(result.script.includes(`group ${name} peer-as 65509`));
      assert.ok(result.script.includes(`group ${name} import ${policy}`));
      assert.ok(result.script.includes(`group ${name} export RP_internet-pccs-ncb_IPV4_OUT`));
      assert.ok(result.script.includes('accepted-prefix-limit maximum 100'));
      assert.ok(result.script.includes(`policy-statement ${management} term 4 from neighbor ${fixture.wanCpe}`));
      assert.ok(result.script.includes(`insert policy-options policy-statement ${management} term 4 before term reject`));
      assert.ok(result.validations.includes(`match ${management}`));
      assert.ok(!result.script.includes(`static route ${fixture.publicNetworks} next-hop`));
      assert.ok(!result.script.includes(`group ${name}_sinid`));
    }
  });
}

test('INTERNET BGP exige ciudad y término válidos, sin exigir RD; estático no exige ciudad', () => {
  for (const juniperRegion of ['', undefined, 'GUAYAQUIL', 'QUITO\ncommit']) assert.ok(generate({ ...juniperInternetBgp, juniperRegion }).errors.juniperRegion);
  for (const mgmtTerm of ['', '0', '-1', '4.5', '4;commit', 4]) assert.ok(generate({ ...juniperInternetBgp, mgmtTerm }).errors.mgmtTerm);
  const result = generate({ ...juniperInternetBgp, rd: undefined, mgmtTerm: '9', createSpeed: 'YES', publicNetworks: '181.188.210.71/32\n203.0.113.0/24' });
  assert.deepEqual(result.errors, {});
  assert.ok(result.script.includes('term 9 from neighbor 10.112.48.178'));
  assert.ok(result.script.includes('bandwidth-limit 153600000'));
  assert.ok(result.script.includes('burst-size-limit 4800000'));
  assert.ok(result.script.includes('ALLOWED_IPV4 203.0.113.0/24'));
  assert.ok(result.document.includes('SMTP-WHITELIST-NET\n181.188.210.71/32\n203.0.113.0/24'));
  assert.deepEqual(generate({ ...juniperInternetStatic, juniperRegion: undefined }).errors, {});
  assert.ok(generate({ ...juniperInternetStatic, createVrf: 'YES', rd: '103211' }).errors.createVrf);
});

test('la importación conserva SINID y corrige la VRF compartida del ejemplo', () => {
  const document = generate(juniperInternetStatic).document.replace('ENRUTAMIENTO: ESTATICO', 'ENRUTAMIENTO: Estáatico').replace('VRF: internet-pccs-ncb', 'VRF: internet-pcs-ncb');
  const parsed = parseInventory(document);
  assert.equal(parsed.routing, 'STATIC');
  assert.equal(parsed.service, 'INTERNET');
  assert.equal(parsed.vrf, 'internet-pccs-ncb');
  assert.equal(parsed.wanCpe, '10.115.6.122');
  assert.equal(parsed.port, 'et-0/0/4');
});
