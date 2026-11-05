const clean = value => String(value ?? '').trim();

export function juniperPort(value) {
  const match = /^(?:et-0\/0\/)?(\d{1,3})$/.exec(clean(value));
  return match ? `et-0/0/${Number(match[1])}` : null;
}

export function juniperErrors(input) {
  const errors = {};
  if (!juniperPort(input.port)) errors.port = 'Introduce el número de puerto, por ejemplo 19 para et-0/0/19.';
  if (input.routing === 'BGP') {
    const internet = input.service === 'INTERNET';
    const key = internet ? 'mgmtTerm' : 'bgpTerm';
    const minimum = internet ? 1 : 3;
    if (input[key] !== undefined && (typeof input[key] !== 'string' || !/^\d{1,10}$/.test(clean(input[key])) || Number(input[key]) < minimum || Number(input[key]) > 2147483647)) errors[key] = `El término BGP debe ser un entero desde ${minimum} hasta 2147483647.`;
    if (internet && !['QUITO', 'CUENCA'].includes(input.juniperRegion)) errors.juniperRegion = 'Selecciona si el equipo Juniper es de Quito o Cuenca.';
  }
  return errors;
}

function internetNames(c) {
  const name = `${c.baseName}_int${c.d.linkType === 'UNIQUE' ? '' : `_${c.d.linkType.toLowerCase()}`}`;
  return {
    name, prefix: `PS_${name}_ALLOWED_IPV4`, policy: `RP_${c.vrf}_${name}_IPV4_IN`,
    management: `RP_CPE-MGMT-INTERNET-PCCS-NCB${c.d.juniperRegion === 'CUENCA' ? '_IPV4' : ''}`,
  };
}

function internetBgp(c) {
  const { d, vrf, baseName, publicNets } = c;
  const { name, prefix, policy, management } = internetNames(c);
  const communityIds = d.juniperRegion === 'QUITO' ? [10, 11, 504] : [20, 21, 504];
  const preference = d.linkType === 'BCK' ? 100 : 200;
  const term = Number(d.mgmtTerm ?? '4');
  return [
    '', '# BGP Prefix List', '',
    ...publicNets.map(net => `set policy-options prefix-list ${prefix} ${net}`),
    '', '# BGP Route Map', '',
    `set policy-options policy-statement ${policy} term 1 from protocol bgp`,
    `set policy-options policy-statement ${policy} term 1 from prefix-list ${prefix}`,
    ...communityIds.map(id => `set policy-options policy-statement ${policy} term 1 then community add 19114:${id}`),
    `set policy-options policy-statement ${policy} term 1 then local-preference ${preference}`,
    `set policy-options policy-statement ${policy} term 1 then metric ${preference}`,
    `set policy-options policy-statement ${policy} term 1 then accept`,
    `set policy-options policy-statement ${policy} term reject then reject`,
    '', '# BGP neighbor configuration', '',
    `set routing-instances ${vrf} protocols bgp group ${name} type external`,
    `set routing-instances ${vrf} protocols bgp group ${name} local-address ${d.wanPe}`,
    `set routing-instances ${vrf} protocols bgp group ${name} neighbor ${d.wanCpe}`,
    `set routing-instances ${vrf} protocols bgp group ${name} peer-as ${d.asn}`,
    `set routing-instances ${vrf} protocols bgp group ${name} description "${baseName}"`,
    `set routing-instances ${vrf} protocols bgp group ${name} import ${policy}`,
    `set routing-instances ${vrf} protocols bgp group ${name} family inet unicast accepted-prefix-limit maximum 100`,
    `set routing-instances ${vrf} protocols bgp group ${name} export RP_internet-pccs-ncb_IPV4_OUT`,
    `set routing-instances ${vrf} protocols bgp group ${name} as-override`,
    `set routing-instances ${vrf} protocols bgp group ${name} remove-private`, '',
    `set policy-options policy-statement ${management} term ${term} from protocol bgp`,
    `set policy-options policy-statement ${management} term ${term} from neighbor ${d.wanCpe}`,
    `set policy-options policy-statement ${management} term ${term} then accept`,
    `set policy-options policy-statement ${management} term reject then reject`,
    `insert policy-options policy-statement ${management} term ${term} before term reject`,
  ];
}

export function juniperScript(c) {
  const { d, vrf, iface, description, bandwidth, baseName, bgp, staticNets, internet, publicNets } = c;
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
  if (!internet && d.createVrf === 'YES') script.push(
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
    ...(internet && bgp ? [`set interfaces ${port} encapsulation flexible-ethernet-services`] : []),
    `set interfaces ${port} unit ${vlan} vlan-id ${vlan}`,
    `set interfaces ${port} unit ${vlan} description "${group}"`,
    `set interfaces ${port} unit ${vlan} family inet address ${d.wanPe}/30`,
    `set routing-instances ${vrf} interface ${iface}`,
    `set interfaces ${port} unit ${vlan} family inet filter input ${bandwidth}`,
    `set class-of-service interfaces ${port} unit ${vlan} output-traffic-control-profile ${bandwidth}`,
  );
  if (staticNets.length) script.push(
    '', '$CONFIGURACION RUTA ESTATICA', '',
    ...staticNets.map(net => `set routing-instances ${vrf} routing-options static route ${net} next-hop ${d.wanCpe}`),
  );
  if (bgp && !internet) script.push(
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
  if (bgp && internet) script.push(...internetBgp(c));
  const checks = [
    `show configuration firewall | display set | match ${bandwidth}`,
    `show configuration | display set | match ${port}`,
    `show interfaces diagnostics optics ${port} | match db`,
    `show interfaces terse ${port}`,
    `show configuration | display set | match ${d.wanCpe}`,
    `show route instance ${vrf}`,
    `show configuration routing-instances | display set | match ${vrf}`,
    ...(internet && bgp ? [`show configuration | display set | match ${internetNames(c).management}`] : []),
    '',
    ...(internet ? publicNets.map(net => `show route table ${vrf}.inet.0 ${net}`) : [`sh route vrf sigmars | in ${d.loopback.split('/')[0]}`]),
  ];
  return { script, checks };
}
