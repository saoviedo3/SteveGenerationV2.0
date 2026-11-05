const clean = value => String(value ?? '').trim();

export function juniperPort(value) {
  const match = /^(?:et-0\/0\/)?(\d{1,3})$/.exec(clean(value));
  return match ? `et-0/0/${Number(match[1])}` : null;
}

export function juniperErrors(input) {
  const errors = {};
  if (input.service !== 'DATOS') errors.service = 'Juniper: por ahora están disponibles DATOS estático y BGP.';
  if (!juniperPort(input.port)) errors.port = 'Introduce el número de puerto, por ejemplo 19 para et-0/0/19.';
  for (const key of ['createVrf', 'createSpeed']) {
    if (input[key] !== undefined && !['YES', 'NO'].includes(input[key])) errors[key] = 'Selecciona Sí o No.';
  }
  if (input.createVrf === 'YES' || input.routing === 'BGP') {
    if (typeof input.rd !== 'string' || !/^\d{1,10}$/.test(clean(input.rd)) || Number(input.rd) > 4294967295) errors.rd = 'Introduce el número del RD entre 0 y 4294967295; el prefijo 19114 es fijo.';
  }
  if (input.routing === 'BGP' && input.bgpTerm !== undefined && (typeof input.bgpTerm !== 'string' || !/^\d{1,10}$/.test(clean(input.bgpTerm)) || Number(input.bgpTerm) < 3 || Number(input.bgpTerm) > 2147483647)) errors.bgpTerm = 'El término BGP debe ser un entero desde 3 hasta 2147483647.';
  return errors;
}

export function juniperScript(c) {
  const { d, vrf, iface, description, bandwidth, baseName, bgp, staticNets } = c;
  const port = d.port;
  const vlan = Number(d.vlan);
  const community = `19114:${Number(d.rd)}`;
  const importPolicy = `import_${vrf}`;
  const exportPolicy = `export_${vrf}`;
  const group = description.toUpperCase();
  const term = Number(d.bgpTerm ?? '3');
  const bits = Number.parseInt(bandwidth, 10) * 1000;
  const speed = bits <= 1000000000 ? '1g' : '10g';
  const script = [];
  if (d.createVrf === 'YES') script.push(
    '$CREACION DE VRF', '',
    `set policy-options community ${community} members target:${community}`,
    'set policy-options community 19114:200002 members target:19114:200002', '',
    `set routing-instances ${vrf} instance-type vrf`,
    `set routing-instances ${vrf} route-distinguisher ${community}`,
    `set routing-instances ${vrf} vrf-import ${importPolicy}`,
    `set routing-instances ${vrf} vrf-export ${exportPolicy}`,
    `set routing-instances ${vrf} vrf-table-label`, '',
    `set policy-options policy-statement ${importPolicy} term 1 from protocol bgp`,
    `set policy-options policy-statement ${importPolicy} term 1 from community ${community}`,
    `set policy-options policy-statement ${importPolicy} term 1 then accept`,
    `set policy-options policy-statement ${importPolicy} term 2 from protocol bgp`,
    `set policy-options policy-statement ${importPolicy} term 2 from community 19114:200002`,
    `set policy-options policy-statement ${importPolicy} term 2 then accept`,
    `set policy-options policy-statement ${importPolicy} term reject then reject`, '',
    ...['direct', 'static'].flatMap((protocol, index) => [
      `set policy-options policy-statement ${exportPolicy} term ${index + 1} from protocol ${protocol}`,
      `set policy-options policy-statement ${exportPolicy} term ${index + 1} then community add ${community}`,
      `set policy-options policy-statement ${exportPolicy} term ${index + 1} then accept`,
    ]),
    `set policy-options policy-statement ${exportPolicy} term reject then reject`, '',
  );
  if (d.createSpeed === 'YES') script.push(
    '$CREACION DE POLICER, FILTRO Y COS', '',
    `set firewall policer ${bandwidth} if-exceeding bandwidth-limit ${bits}`,
    `set firewall policer ${bandwidth} if-exceeding burst-size-limit ${Math.ceil(bits / 32)}`,
    `set firewall policer ${bandwidth} then discard`, '',
    `set firewall family inet filter ${bandwidth} interface-specific`,
    `set firewall family inet filter ${bandwidth} term 1 then policer ${bandwidth}`,
    `set firewall family inet filter ${bandwidth} term 1 then forwarding-class BEST-EFFORT`,
    `set firewall family inet filter ${bandwidth} term default then accept`, '',
    `set class-of-service traffic-control-profiles ${bandwidth} shaping-rate ${bits}`, '',
  );
  script.push(
    '$CONFIGURACION SUBINTERFACE', '',
    `delete interfaces ${port} unit 0`, `delete interfaces ${port} disable`,
    `set interfaces ${port} description "${group}"`,
    `set interfaces ${port} mtu 2000`, `set interfaces ${port} speed ${speed}`,
    `set interfaces ${port} flexible-vlan-tagging`, `set interfaces ${port} hierarchical-scheduler`,
    `set interfaces ${port} unit ${vlan} vlan-id ${vlan}`,
    `set interfaces ${port} unit ${vlan} description "${group}"`,
    `set interfaces ${port} unit ${vlan} family inet address ${d.wanPe}/30`,
    `set routing-instances ${vrf} interface ${iface}`,
    `set interfaces ${port} unit ${vlan} family inet filter input ${bandwidth}`,
    `set class-of-service interfaces ${port} unit ${vlan} output-traffic-control-profile ${bandwidth}`, '',
    '$CONFIGURACION RUTA ESTATICA', '',
    ...staticNets.map(net => `set routing-instances ${vrf} routing-options static route ${net} next-hop ${d.wanCpe}`),
  );
  if (bgp) script.push(
    '', '$CONFIGURACION BGP', '',
    `set policy-options policy-statement ${exportPolicy} term ${term} from protocol bgp`,
    `set policy-options policy-statement ${exportPolicy} term ${term} from neighbor ${d.wanCpe}`,
    `set policy-options policy-statement ${exportPolicy} term ${term} then community add ${community}`,
    `set policy-options policy-statement ${exportPolicy} term ${term} then accept`,
    `set policy-options policy-statement ${exportPolicy} term reject then reject`,
    `insert policy-options policy-statement ${exportPolicy} term ${term} before term reject`,
    `set routing-instances ${vrf} protocols bgp group ${group} type external`,
    `set routing-instances ${vrf} protocols bgp group ${group} description ${baseName}`,
    `set routing-instances ${vrf} protocols bgp group ${group} local-address ${d.wanPe}`,
    `set routing-instances ${vrf} protocols bgp group ${group} neighbor ${d.wanCpe}`,
    `set routing-instances ${vrf} protocols bgp group ${group} peer-as ${d.asn}`,
    `set routing-instances ${vrf} protocols bgp group ${group} as-override`,
    `set routing-instances ${vrf} protocols bgp group ${group} remove-private`,
  );
  const checks = [
    `show configuration firewall | display set | match ${bandwidth}`,
    `show configuration | display set | match ${port}`,
    `show interfaces diagnostics optics ${port} | match db`,
    `show interfaces terse ${port}`,
    `show configuration | display set | match ${d.wanCpe}`,
    `show route instance ${vrf}`,
    `show configuration | display set | match ${vrf}`,
    '', `sh route vrf sigmars | in ${d.loopback.split('/')[0]}`,
  ];
  return { script, checks };
}
