import test from 'node:test';
import assert from 'node:assert/strict';
import { generate, parseInventory } from '../public/lib/generator.js';
import { mapSample, mapInternetSample, sample, inventory } from './fixtures.mjs';

for (const service of ['DATOS', 'INTERNET']) for (const routing of ['STATIC', 'BGP']) for (const linkType of ['UNIQUE', 'PPL', 'BCK']) {
  test(`NNI2 MAPASINGUE ${service} ${routing} ${linkType}`, () => {
    const input = { ...(service === 'DATOS' ? mapSample : mapInternetSample), routing, linkType };
    const output = generate(input);
    assert.deepEqual(output.errors, {});
    const internet = service === 'INTERNET';
    const iface = `TenGigabitEthernet1/1/1.${internet ? '302714' : '102707'}`;
    const resource = internet ? 'ravcorp_bodegas_papo_int' : 'bco_pacifico_gye_plaza_guayarte_dat';
    const name = `${resource}${linkType === 'UNIQUE' ? '' : `_${linkType.toLowerCase()}`}_${input.linkId}`;
    assert.equal(output.interface, iface);
    assert.equal(output.tag, `${name.toUpperCase()}:${input.access}:NNI2_MAP`);
    assert.ok(output.script.includes(`description --- ${name} ---`));
    assert.ok(output.script.includes(internet ? ' vrf forwarding internet-pccs-ncb' : ' ip vrf forwarding bco_pacifico_datos'));
    assert.ok(output.script.includes(' no ip redirects\n no ip proxy-arp'));
    assert.ok(!output.script.includes('ipv4 address'));
    assert.ok(!output.script.includes('router static'));
    assert.ok(!output.script.includes('show commit changes diff'));
    if (!internet) {
      assert.ok(output.script.includes(`route-map RM_bco_pacifico_datos_connected permit 10\n match interface ${iface}`));
      const route = output.script.split('\n').find(line => line.startsWith('ip route '));
      assert.match(route, /^ip route vrf bco_pacifico_datos 10\.116\.104\.86 255\.255\.255\.255 TenGigabitEthernet1\/1\/1\.102707 10\.115\.9\.86 tag 10 name /);
      assert.ok(route.split(' name ')[1].length <= 30);
      assert.ok(output.validations.includes('sho route-map RM_bco_pacifico_datos_connected'));
      assert.ok(output.validations.includes('sho route vrf sigmars | in 10.116.104.86'));
      assert.ok(!output.validations.includes('10.116.104.86/32'));
      if (routing === 'BGP') {
        assert.ok(output.script.includes('neighbor 10.115.9.86 maximum-prefix 500'));
        assert.ok(!output.script.includes('default_policy_pass_all'));
      }
    } else {
      assert.ok(!output.script.includes('_connected'));
      assert.ok(!output.document.includes('sigmars'));
      assert.ok(output.document.includes('object-group network ipv4 SMTP-WHITELIST-NET\n200.7.198.88/30'));
      if (routing === 'STATIC') assert.ok(output.script.includes(`ip route vrf internet-pccs-ncb 200.7.198.88 255.255.255.252 ${iface} 10.115.9.150 name ravcorp_bodegas_papo`));
      else {
        assert.ok(output.script.includes(`ip prefix-list PL_${name}_ALLOWED_IPV4 seq 5 permit 200.7.198.88/30`));
        assert.ok(output.script.includes(`route-map RM_internet-pccs-ncb_${name}_IPV4_IN permit 5`));
        assert.ok(output.script.includes(` set local-preference ${linkType === 'BCK' ? 100 : 200}`));
        assert.ok(output.script.includes(` set weight ${linkType === 'BCK' ? 100 : 200}`));
        assert.ok(output.script.includes('set community 19114:20 19114:21 19114:504'));
        assert.ok(output.script.includes('neighbor 10.115.9.150 remote-as 65540'));
        assert.ok(output.script.includes('neighbor 10.115.9.150 remove-private-as'));
        assert.ok(output.script.includes('neighbor 10.115.9.150 route-map RM_internet-pccs-ncb_IPV4_OUT out'));
        assert.ok(output.script.includes('neighbor 10.115.9.150 maximum-prefix 100'));
        assert.ok(output.validations.includes(`sho ip prefix-list PL_${name}_ALLOWED_IPV4`));
        assert.ok(!output.script.includes('ip route vrf'));
      }
    }
    assert.equal(output.script.includes('router bgp 19114'), routing === 'BGP');
    assert.ok(output.document.startsWith(`${output.title}\n\n${input.engineeringUrl}\n-----------------------------`));
  });
}

test('DATOS estático NNI2: documento de referencia y límite de nombre de ruta', () => {
  const output = generate({ ...mapSample, routing: 'STATIC' });
  assert.equal(output.script, `interface TenGigabitEthernet1/1/1.102707
 description --- bco_pacifico_gye_plaza_guayarte_dat_bck_10072843 ---
 encapsulation dot1Q 2707
 ip vrf forwarding bco_pacifico_datos
 ip address 10.115.9.85 255.255.255.252
 no ip redirects
 no ip proxy-arp
 service-policy input 1024Kbps
 service-policy output 1024Kbps
exit
!
route-map RM_bco_pacifico_datos_connected permit 10
 match interface TenGigabitEthernet1/1/1.102707
exit
!
ip route vrf bco_pacifico_datos 10.116.104.86 255.255.255.255 TenGigabitEthernet1/1/1.102707 10.115.9.86 tag 10 name bco_pacifico_gye_plaza_guayart
!`);
});

test('tag 10 solo para monitoreo; LAN usa máscara decimal sin tag, incluso con BGP', () => {
  for (const routing of ['STATIC', 'BGP']) {
    const output = generate({ ...mapSample, routing, lanNetworks: '192.168.100.1/32\n192.168.200.0/24\n0.0.0.0/0' });
    const routes = output.script.split('\n').filter(line => line.startsWith('ip route'));
    assert.equal(routes.length, 4);
    assert.equal(routes.filter(line => line.includes(' tag 10 ')).length, 1);
    assert.ok(routes.some(line => line.includes('192.168.200.0 255.255.255.0')));
    assert.ok(routes.some(line => line.includes('0.0.0.0 0.0.0.0')));
  }
});

test('NNI2 prefix-list asigna secuencias distintas a varias redes públicas', () => {
  const output = generate({ ...mapInternetSample, publicNetworks: '200.7.198.88 /30\n203.0.113.0/24' });
  const lines = output.script.split('\n').filter(line => line.startsWith('ip prefix-list'));
  assert.equal(lines.length, 2);
  assert.ok(lines[0].endsWith('seq 5 permit 200.7.198.88/30'));
  assert.ok(lines[1].endsWith('seq 10 permit 203.0.113.0/24'));
});

test('rutas estáticas de ambas soluciones nunca superan 30 caracteres de descripción', () => {
  for (const solution of ['NNI3_CRM', 'NNI2_MAP']) {
    const input = { ...sample, solution, client: 'Cliente bastante largo', branch: 'Sucursal con nombre extenso', lanNetworks: '192.168.2.0/24' };
    const output = generate(input);
    assert.deepEqual(output.errors, {});
    const routes = output.script.split('\n').filter(line => line.startsWith('ip route ') || /^\s+\d+\.\d+\.\d+\.\d+\/\d+ /.test(line));
    assert.equal(routes.length, 2);
    for (const route of routes) assert.equal(route.split(solution === 'NNI2_MAP' ? ' name ' : ' description ')[1].length, 30);
    assert.ok(output.description.length > 30);
  }
});

test('enlace de ingeniería opcional y última milla editable', () => {
  for (const solution of ['NNI3_CRM', 'NNI2_MAP']) {
    const output = generate({ ...sample, solution, engineeringUrl: mapSample.engineeringUrl, lastMile: 'UM TELEFONICA' });
    assert.deepEqual(output.errors, {});
    assert.ok(output.document.startsWith(`${output.title}\n\n${mapSample.engineeringUrl}\n-----------------------------`));
    assert.ok(output.document.includes('OBSERVACIONES:\nUM TELEFONICA\n'));
    const noLink = generate({ ...sample, solution });
    assert.ok(noLink.document.startsWith(`${noLink.title}\n\n-----------------------------`));
  }
  for (const bad of ['javascript:alert(1)', 'https://example.com/\nshutdown', 'https://user:secret@example.com', 'no-es-enlace']) assert.ok(generate({ ...sample, engineeringUrl: bad }).errors.engineeringUrl);
  assert.ok(generate({ ...sample, lastMile: 'UM TIGO\nshutdown' }).errors.lastMile);
});

test('inventario con tabulaciones y máscara separada se puede generar', () => {
  const parsed = parseInventory(inventory.replace('SERVICIO:  DATOS', 'SERVICIO: INTERNET').replace('RED PUBLICA:', 'RED PUBLICA: 200.7.198.88 /30').replaceAll('FARCOMED SANA SANA MALDONADO DATOS', 'RAVCORP\tBODEGAS PAPO INT BACKUP\t INTERNET').replace('UM TIGO', 'UM TELEFONICA'));
  assert.ok(!parsed.wanLabel.includes('\t'));
  const output = generate({ ...sample, ...parsed, solution: 'NNI2_MAP', routing: 'STATIC', access: sample.access, port: sample.port });
  assert.deepEqual(output.errors, {});
  assert.ok(output.document.includes('RED PUBLICA: 200.7.198.88/30'));
  assert.ok(output.document.includes('OBSERVACIONES:\nUM TELEFONICA'));
});
