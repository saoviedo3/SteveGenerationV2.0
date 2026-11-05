export const SOLUTION = 'NNI3_CRM';
export const SOLUTIONS = {
  NNI3_CRM: { label: 'NNI3 CARMEN', interface: 'TenGigE0/2/1/2' },
  NNI2_MAP: { label: 'NNI2 MAPASINGUE', interface: 'TenGigabitEthernet1/1/1' },
  NNI_PORT: { label: 'NNI PORTOVIEJO', interface: 'GigabitEthernet0/0/0/4', routeLinkType: true },
};
const SEPARATOR = '/'.repeat(73);
const clean = value => String(value ?? '').trim();
const normalize = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export const slug = value => normalize(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

export function ipv4Number(value) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return null;
  const parts = value.split('.').map(Number);
  if (parts.some(part => part > 255)) return null;
  return parts.reduce((total, part) => total * 256 + part, 0);
}

export function validCidr(value) {
  const match = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(value);
  if (!match) return false;
  const ip = ipv4Number(match[1]);
  const prefix = Number(match[2]);
  return ip !== null && prefix <= 32 && ip % (2 ** (32 - prefix)) === 0;
}

export function networks(value) {
  return [...new Set(clean(value).replace(/\s*\/\s*/g, '/').split(/[\s,;]+/).filter(Boolean))];
}

export function parseInventory(text) {
  const result = { wanRows: [], warnings: [], lastMile: 'UM TIGO' };
  const keys = { SERVICIO: 'service', ACCESO: 'access', PUERTO: 'port', AB: 'bandwidth', VLAN: 'vlan', VRF: 'vrf', ENRUTAMIENTO: 'routing', ASN: 'asn', 'LOOPBACK MONITOREO': 'loopback', 'RED PUBLICA': 'publicNetworks', 'RED LAN': 'lanNetworks', RESPONSABLE: 'responsible' };
  let inWan = false;
  let inObservations = false;
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const field = /^\s*([^:]+):\s*(.*?)\s*$/.exec(line);
    if (field) {
      const key = normalize(field[1]).toUpperCase();
      inObservations = key === 'OBSERVACIONES';
      if (key === 'RED WAN') { inWan = true; continue; }
      if (keys[key]) {
        result[keys[key]] = clean(field[2]).replace(/^\(\s*\)$/, '');
        inWan = false;
      } else if (/^(RESPONSABLE|OBSERVACIONES)$/.test(key)) inWan = false;
    }
    if (inWan) {
      const row = /^\s*(.*?)\s+(\d{1,3}(?:\.\d{1,3}){3})\s+(\S+)\s*$/.exec(line);
      if (row) result.wanRows.push({ label: row[1].trim().replace(/\s+/g, ' '), ip: row[2], role: row[3] });
    }
    if (inObservations && /^\s*UM\s+\S/i.test(line)) result.lastMile = line.trim().replace(/\s+/g, ' ');
  }
  const rowByRole = role => result.wanRows.find(row => normalize(row.role).toUpperCase() === role);
  result.wanNetwork = rowByRole('RED')?.ip ?? '';
  result.wanCpe = rowByRole('CLIENTE')?.ip ?? '';
  result.wanBroadcast = rowByRole('BROADCAST')?.ip ?? '';
  result.wanPe = result.wanRows.find(row => !['RED', 'CLIENTE', 'BROADCAST'].includes(normalize(row.role).toUpperCase()))?.ip ?? '';
  result.wanLabel = result.wanRows[0]?.label ?? '';
  result.peName = result.wanRows.find(row => row.ip === result.wanPe)?.role ?? '';
  result.service = normalize(result.service).toUpperCase();
  result.routing = /bgp/i.test(result.routing) ? 'BGP' : /estatic/i.test(normalize(result.routing)) ? 'STATIC' : '';
  if (!result.wanPe || !result.wanCpe) result.warnings.push('No se identificaron las cuatro filas WAN. Completa las direcciones manualmente.');
  if (!/^[1-9]\d{0,8}Kbps$/i.test(clean(result.bandwidth))) result.warnings.push('El ancho de banda está incompleto; indica la política QoS (ej. 20480Kbps).');
  if (result.service === 'INTERNET') result.vrf = 'internet-pccs-ncb';
  return result;
}

export function validate(input) {
  const errors = {};
  for (const key of ['iasi', 'client', 'branch', 'workOrder', 'linkId', 'access', 'port', 'bandwidth', 'vlan', 'responsible', 'vrf', 'asn', 'loopback', 'publicNetworks', 'lanNetworks', 'peName', 'wanLabel', 'wanNetwork', 'wanPe', 'wanCpe', 'wanBroadcast', 'lastMile', 'engineeringUrl']) {
    if (input[key] !== undefined && typeof input[key] !== 'string') errors[key] = 'El valor debe ser texto.';
  }
  const required = { iasi: 'IASI', client: 'Cliente', branch: 'Sucursal', workOrder: 'Orden de trabajo', linkId: 'ID del enlace', access: 'Equipo de acceso', port: 'Tarjeta y puerto', bandwidth: 'Ancho de banda', vlan: 'VLAN', responsible: 'Responsable' };
  for (const [key, label] of Object.entries(required)) if (!clean(input[key])) errors[key] = `${label}: campo obligatorio.`;
  for (const key of ['iasi', 'client', 'branch', 'workOrder', 'linkId', 'access', 'port', 'responsible', 'vrf', 'bandwidth', 'peName', 'wanLabel', 'lastMile']) {
    if (/[\r\n\x00-\x1f\x7f]/.test(String(input[key] ?? '')) || clean(input[key]).length > 180) errors[key] = 'Usa una sola línea de hasta 180 caracteres.';
  }
  for (const key of ['client', 'branch']) if (clean(input[key]) && !slug(input[key])) errors[key] = 'Introduce un nombre con letras o números.';
  for (const key of ['iasi', 'workOrder', 'linkId', 'access']) if (clean(input[key]) && !/^[a-zA-Z0-9_.-]+$/.test(clean(input[key]))) errors[key] = 'Usa letras, números, punto, guion o guion bajo.';
  if (!['DATOS', 'INTERNET'].includes(input.service)) errors.service = 'Selecciona DATOS o INTERNET.';
  if (!['BGP', 'STATIC'].includes(input.routing)) errors.routing = 'Selecciona BGP o estático.';
  if (!['UNIQUE', 'PPL', 'BCK'].includes(input.linkType)) errors.linkType = 'Selecciona el tipo de enlace.';
  if (!['OPTICAL', 'ELECTRICAL'].includes(input.medium)) errors.medium = 'Selecciona óptico o eléctrico.';
  if (!Object.hasOwn(SOLUTIONS, input.solution ?? '')) errors.solution = 'Selecciona una solución Cisco disponible.';
  if (clean(input.engineeringUrl)) {
    try {
      const url = new URL(clean(input.engineeringUrl));
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || /[\s\x00-\x1f\x7f]/.test(input.engineeringUrl) || input.engineeringUrl.length > 2048) throw new Error();
    } catch { errors.engineeringUrl = 'Usa un enlace HTTP o HTTPS válido, sin espacios ni credenciales.'; }
  }
  if (!/^[1-9]\d{0,8}Kbps$/i.test(clean(input.bandwidth))) errors.bandwidth = 'Usa el nombre de la política, por ejemplo 10240Kbps.';
  if (!/^\d+$/.test(clean(input.vlan)) || Number(input.vlan) < 1 || Number(input.vlan) > 4094) errors.vlan = 'La VLAN debe ser un entero entre 1 y 4094.';
  if (input.service === 'DATOS' && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(clean(input.vrf))) errors.vrf = 'Introduce una VRF válida de hasta 64 caracteres.';
  if (input.routing === 'BGP' && (!/^\d+$/.test(clean(input.asn)) || Number(input.asn) < 1 || Number(input.asn) > 4294967294)) errors.asn = 'El ASN remoto debe estar entre 1 y 4294967294.';
  if (input.service === 'DATOS' && (!validCidr(clean(input.loopback)) || !clean(input.loopback).endsWith('/32'))) errors.loopback = 'Introduce la loopback de monitoreo con máscara /32.';
  if (input.service === 'INTERNET' && !networks(input.publicNetworks).length) errors.publicNetworks = 'Introduce al menos una red pública en formato CIDR.';
  for (const key of ['lanNetworks', ...(input.service === 'INTERNET' ? ['publicNetworks'] : [])]) {
    const values = networks(input[key]);
    if (values.length > 50 || values.some(value => !validCidr(value))) errors[key] = 'Usa hasta 50 redes IPv4 con prefijo correcto, una por línea (ej. 192.168.100.0/24).';
  }
  for (const key of ['wanNetwork', 'wanPe', 'wanCpe', 'wanBroadcast']) if (ipv4Number(clean(input[key])) === null) errors[key] = 'Introduce una dirección IPv4 válida.';
  if (!['wanNetwork', 'wanPe', 'wanCpe', 'wanBroadcast'].some(key => errors[key])) {
    const base = ipv4Number(clean(input.wanNetwork));
    const pe = ipv4Number(clean(input.wanPe));
    const cpe = ipv4Number(clean(input.wanCpe));
    if (base % 4 !== 0 || ipv4Number(clean(input.wanBroadcast)) !== base + 3 || ![base + 1, base + 2].includes(pe) || ![base + 1, base + 2].includes(cpe) || pe === cpe) errors.wanNetwork = 'Las cuatro IP deben formar una /30: red, dos hosts distintos y broadcast.';
  }
  if (slug(input.client).length + slug(input.branch).length > 64) errors.branch = 'Cliente y sucursal deben sumar hasta 64 caracteres normalizados.';
  return errors;
}

function decimalMask(prefix) {
  const mask = 2 ** 32 - 2 ** (32 - Number(prefix));
  return [24, 16, 8, 0].map(shift => Math.floor(mask / 2 ** shift) % 256).join('.');
}

function carmenScript(c) {
  const { d, iface, description, bandwidth, vrf, staticNets, routeDescription, internet, bgp, publicNets, baseName } = c;
  const prefixSet = `PS_${description}_ALLOWED_IPV4`;
  const policy = `RP_internet-pccs-ncb_${description}_IPv4_IN`;
  const script = ['!', `interface ${iface}`, ` description --- ${description} ---`, ` service-policy input ${bandwidth}`, ` service-policy output ${bandwidth}`, ` vrf ${vrf}`, ` ipv4 address ${d.wanPe} 255.255.255.252`, ` encapsulation dot1q ${Number(d.vlan)}`, 'exit', '!'];
  if (staticNets.length) script.push('router static', ` vrf ${vrf}`, '  address-family ipv4 unicast', ...staticNets.map(net => `   ${net} ${iface} ${d.wanCpe} description ${routeDescription}`), '   !', '  !', ' !', '!');
  if (bgp && internet) {
    const preference = d.linkType === 'BCK' ? 100 : 200;
    script.push(`prefix-set ${prefixSet}`, `  ${publicNets.join(',\n  ')}`, 'end-set', '!', `route-policy ${policy}`, `  if (destination in ${prefixSet}) then`, '    set community (19114:20, 19114:21, 19114:504)', `    set local-preference ${preference}`, `    set weight ${preference}`, '  endif', 'end-policy', '!');
  }
  if (bgp) script.push('router bgp 19114', ` vrf ${vrf}`, `  neighbor ${d.wanCpe}`, `   remote-as ${d.asn}`, `   description ${baseName}`, '   address-family ipv4 unicast', `    maximum-prefix ${internet ? '100 75 warning-only' : '500 75'}`, `    route-policy ${internet ? policy : 'default_policy_pass_all'} in`, `    route-policy ${internet ? 'RP_internet-pccs-ncb_IPV4_OUT' : 'default_policy_pass_all'} out`, '    as-override', ...(internet ? ['    remove-private-AS'] : []), '   !', '  !', ' !', '!');
  script.push('show commit changes diff');
  const checks = [
    ...(bgp ? [`sho run router bgp 19114 vrf ${vrf} neighbor ${d.wanCpe}`] : []),
    ...(bgp && internet ? [`sho run prefix-set ${prefixSet}`, `sho run route-policy ${policy}`] : []),
  ];
  return { script, checks };
}

function mapasingueScript(c) {
  const { d, iface, description, bandwidth, vrf, staticNets, routeDescription, internet, bgp, publicNets, baseName } = c;
  const connectedMap = `RM_${vrf}_connected`;
  const prefixList = `PL_${description}_ALLOWED_IPV4`;
  const inputMap = `RM_internet-pccs-ncb_${description}_IPV4_IN`;
  const script = [
    `interface ${iface}`,
    ` description --- ${description} ---`,
    ` encapsulation dot1Q ${Number(d.vlan)}`,
    ` ${internet ? 'vrf forwarding' : 'ip vrf forwarding'} ${vrf}`,
    ` ip address ${d.wanPe} 255.255.255.252`,
    ' no ip redirects', ' no ip proxy-arp',
    ` service-policy input ${bandwidth}`, ` service-policy output ${bandwidth}`, 'exit', '!',
  ];
  if (!internet) script.push(`route-map ${connectedMap} permit 10`, ` match interface ${iface}`, 'exit', '!');
  for (const net of staticNets) {
    const [ip, prefix] = net.split('/');
    const tag = !internet && net === d.loopback ? ' tag 10' : '';
    script.push(`ip route vrf ${vrf} ${ip} ${decimalMask(prefix)} ${iface} ${d.wanCpe}${tag} name ${routeDescription}`, '!');
  }
  if (bgp && internet) {
    const preference = d.linkType === 'BCK' ? 100 : 200;
    script.push(
      ...publicNets.map((net, i) => `ip prefix-list ${prefixList} seq ${(i + 1) * 5} permit ${net}`), '!',
      `route-map ${inputMap} permit 5`, ` match ip address prefix-list ${prefixList}`,
      ` set local-preference ${preference}`, ` set weight ${preference}`,
      ' set community 19114:20 19114:21 19114:504', 'exit', '!',
    );
  }
  if (bgp) script.push(
    'router bgp 19114', ` address-family ipv4 vrf ${vrf}`,
    `  neighbor ${d.wanCpe} remote-as ${d.asn}`, `  neighbor ${d.wanCpe} description ${baseName}`,
    `  neighbor ${d.wanCpe} activate`,
    ...(internet ? [`  neighbor ${d.wanCpe} remove-private-as`] : []),
    `  neighbor ${d.wanCpe} as-override`,
    ...(internet ? [`  neighbor ${d.wanCpe} route-map ${inputMap} in`, `  neighbor ${d.wanCpe} route-map RM_internet-pccs-ncb_IPV4_OUT out`] : []),
    `  neighbor ${d.wanCpe} maximum-prefix ${internet ? 100 : 500}`, ' exit', 'exit', '!',
  );
  const checks = [
    ...(!internet ? [`sho route-map ${connectedMap}`] : []),
    ...(bgp && internet ? [`sho ip prefix-list ${prefixList}`, `sho route-map ${inputMap}`] : []),
  ];
  return { script, checks };
}

export function generate(input) {
  const errors = validate(input);
  if (Object.keys(errors).length) return { errors };
  const d = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]));
  const solution = SOLUTIONS[d.solution];
  const internet = d.service === 'INTERNET';
  const bgp = d.routing === 'BGP';
  const vrf = internet ? 'internet-pccs-ncb' : d.vrf;
  const baseName = `${slug(d.client)}_${slug(d.branch)}`;
  const routeSuffix = solution.routeLinkType && d.linkType !== 'UNIQUE' ? `_${d.linkType.toLowerCase()}` : '';
  const routeDescription = routeSuffix
    ? `${baseName.slice(0, 30 - routeSuffix.length).replace(/_+$/, '')}${routeSuffix}`
    : baseName.slice(0, 30);
  const description = `${baseName}_${internet ? 'int' : 'dat'}${d.linkType === 'UNIQUE' ? '' : `_${d.linkType.toLowerCase()}`}_${d.linkId}`;
  const iface = `${solution.interface}.${internet ? '30' : '10'}${Number(d.vlan)}`;
  const tag = `${description.toUpperCase()}:${d.access.toUpperCase()}:${d.solution}`;
  const publicNets = networks(d.publicNetworks);
  const lanNets = networks(d.lanNetworks);
  const staticNets = [...new Set([...(internet ? (!bgp ? publicNets : []) : [d.loopback]), ...lanNets])];
  const bandwidth = d.bandwidth.replace(/kbps/i, 'Kbps');
  const title = `${d.iasi} ${d.client.toUpperCase()} ${d.branch.toUpperCase()}${d.linkType === 'UNIQUE' ? '' : ` ${d.linkType}`} ${d.service}`;
  const wanLabel = d.wanLabel || `${d.client.toUpperCase()} ${d.branch.toUpperCase()} ${d.service}`;
  const wanRows = [[d.wanNetwork, 'Red'], [d.wanPe, d.peName || 'PE'], [d.wanCpe, 'CLIENTE'], [d.wanBroadcast, 'Broadcast']].map(([ip, role]) => `${wanLabel.padEnd(45)} ${ip.padEnd(15)} ${role}`).join('\n');
  const header = [
    title, '', ...(d.engineeringUrl ? [d.engineeringUrl] : []), '-----------------------------', '', d.workOrder,
    `ID: ${d.linkId}`, `SERVICIO: ${d.service}`, `ACCESO: ${d.access}`, `PUERTO: ${d.port}`,
    `AB: ${bandwidth}`, `VLAN: ${Number(d.vlan)}`, `VRF: ${vrf}`, `ENRUTAMIENTO: ${bgp ? 'BGP' : 'ESTATICO'}`,
    ...(bgp ? [`ASN: ${d.asn}`] : []),
    ...(internet ? [`RED PUBLICA: ${publicNets.join(', ')}`] : [`LOOPBACK MONITOREO: ${d.loopback}`]),
    `RED LAN: ${lanNets.join(', ')}`, 'RED WAN:', '', wanRows, '', tag, SEPARATOR, '',
    `RESPONSABLE: ${d.responsible}`, 'OBSERVACIONES:', d.lastMile ?? 'UM TIGO',
    d.medium === 'OPTICAL' ? 'REQUIERE SFP 1000BASEBX' : 'REQUIERE CONVERSOR OPTICO/ELECTRICO',
    '', SEPARATOR, 'Script:', '',
  ];
  const context = { d, internet, bgp, vrf, baseName, routeDescription, description, iface, bandwidth, staticNets, publicNets };
  const generated = d.solution === 'NNI2_MAP' ? mapasingueScript(context) : carmenScript(context);
  const whitelist = internet ? ['', '////////// IPTCHL1CAR201 - IPTCHL1CCRM01 //////////', '', 'object-group network ipv4 SMTP-WHITELIST-NET', ...publicNets, 'sh comm cha dif', `commit comment ${baseName}`, 'end'] : [];
  const monitorFilter = d.solution === 'NNI2_MAP' ? d.loopback?.split('/')[0] : d.loopback;
  const checks = [
    `sho run interface ${iface}`, `sho int desc | in ${Number(d.vlan)}`, `sho run | in ${d.wanCpe}`,
    ...generated.checks, '',
    ...(!internet ? [`sho route vrf sigmars | in ${monitorFilter}`] : publicNets.map(net => `sho route vrf ${vrf} | in ${net}`)),
    ...lanNets.map(net => `sho route vrf ${vrf} | in ${net}`),
    ...(internet ? ['', ...publicNets.map(net => `sh runn object-group network ipv4 SMTP-WHITELIST-NET | inc ${net}`)] : []),
  ];
  const document = [...header, ...generated.script, ...whitelist, '', SEPARATOR, 'VALIDACIONES:', '', ...checks, '', SEPARATOR, 'CONFIGURADO:', ''].join('\n');
  return { errors: {}, title, description, tag, interface: iface, solution: d.solution, solutionLabel: solution.label, script: generated.script.join('\n'), validations: checks.join('\n'), document, filename: `${d.iasi}_${description}.txt` };
}
