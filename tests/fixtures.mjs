export const sample = {
  solution: 'NNI3_CRM', service: 'DATOS', routing: 'BGP', linkType: 'UNIQUE', medium: 'OPTICAL',
  iasi: '124906-36-1', client: 'FARCOMED', branch: 'SS MALDONADO', linkId: '10066459',
  workOrder: 'CRQ000000190789', access: 'PRADERA_GUASMO_6150', port: 'OIGE8[0-1-7] GE: 8',
  bandwidth: '10240Kbps', vlan: '3230', vrf: 'econofarm_datos', asn: '64877',
  loopback: '10.116.101.128/32', publicNetworks: '10.115.3.200/29', lanNetworks: '',
  responsible: 'Steven Alejandro Oviedo Buitron', wanNetwork: '10.115.3.204', wanPe: '10.115.3.205',
  wanCpe: '10.115.3.206', wanBroadcast: '10.115.3.207',
  wanLabel: 'FARCOMED SANA SANA MALDONADO DATOS', peName: 'IPTCHL3CCRM03',
  lastMile: 'UM TIGO', engineeringUrl: '',
};

export const mapSample = {
  ...sample, solution: 'NNI2_MAP', iasi: '130763-4-1', client: 'BCO PACIFICO', branch: 'GYE PLAZA GUAYARTE',
  linkId: '10072843', workOrder: 'CHG0510792', access: 'U_CATOLICA_GYE_GWT_6150', port: 'OIGE8[0-1-7] GE: 4',
  bandwidth: '1024Kbps', vlan: '2707', vrf: 'bco_pacifico_datos', loopback: '10.116.104.86/32',
  wanNetwork: '10.115.9.84', wanPe: '10.115.9.85', wanCpe: '10.115.9.86', wanBroadcast: '10.115.9.87',
  wanLabel: 'BANCO DEL PACIFICO GYE PLAZA GUAYARTE DATOS BCKDATOS', peName: 'IPTCHL3MAPA02',
  medium: 'ELECTRICAL', linkType: 'BCK',
  engineeringUrl: 'https://tigo.dokuvizsoftware02.com/direct/openpage.html?page=PRO@a673_GUAY_GYE-OTRO_GYE-ATMPGRT_SERV-DBCK',
};

export const mapInternetSample = {
  ...mapSample, service: 'INTERNET', iasi: '125422-16-1', client: 'RAVCORP', branch: 'BODEGAS PAPO',
  linkId: '10072303', workOrder: 'CHG0501020', access: 'DURAN_INDUSTRIAL_6120H-S', port: 'SMGD[0-1-1] 10GE',
  bandwidth: '51200Kbps', vlan: '2714', asn: '65540', publicNetworks: '200.7.198.88 /30',
  wanNetwork: '10.115.9.148', wanPe: '10.115.9.149', wanCpe: '10.115.9.150', wanBroadcast: '10.115.9.151',
  wanLabel: 'RAVCORP BODEGAS PAPO INT BACKUP INTERNET', medium: 'OPTICAL',
  engineeringUrl: 'https://tigo.dokuvizsoftware02.com/direct/openpage.html?page=PRO@C072_GUAY_BACKUP_DRN-BPAPO-BCK_SERV-IBCK',
};

export const portSample = {
  ...sample, solution: 'NNI_PORT', service: 'INTERNET', routing: 'STATIC',
  iasi: '132487-1-1', client: 'ASOCIACION MEDICA RENAL PORTOVIEJO ASMERP', branch: 'OFICINA 1',
  linkId: '10073838', workOrder: 'CHG0510785', access: 'ESTADIO_PORTOVIEJO_6150', port: 'OIGE8[0-1-1]-GE:4',
  bandwidth: '20480Kbps', vlan: '3386', vrf: 'internet-pccs-ncb', publicNetworks: '200.7.207.122/32',
  wanNetwork: '10.115.10.236', wanPe: '10.115.10.237', wanCpe: '10.115.10.238', wanBroadcast: '10.115.10.239',
  wanLabel: 'ASOCIACION MEDICA RENAL PORTOVIEJO ASMERP OFICINA 1 INT INTERNET', peName: 'IPTCHL3PORC02',
  medium: 'ELECTRICAL', asn: '', loopback: '',
  engineeringUrl: 'https://tigo.dokuvizsoftware02.com/direct/openpage.html?page=PRO@D378_MANABI_RED-AG-O_SERV-INT',
};

export const portInventory = `-----------------------------

SERVICIO: INTERNET
ACCESO:
PUERTO:
AB: Kbps
VLAN: 3386
VRF: ()
ENRUTAMIENTO:
ASN:
LOOPBACK MONITOREO:
RED PUBLICA: 200.7.207.122 /32
RED LAN:
SOURCE TUNEL (LOOPBACK PE):
DESTINATION TUNEL (IP SIM CARD):
IMSI SIM CARD:
RED WAN:

ASOCIACION MEDICA RENAL PORTOVIEJO ASMERP OFICINA 1 INT INTERNET           10.115.10.236   Red
ASOCIACION MEDICA RENAL PORTOVIEJO ASMERP OFICINA 1 INT INTERNET           10.115.10.237   IPTCHL3PORC02
ASOCIACION MEDICA RENAL PORTOVIEJO ASMERP OFICINA 1 INT INTERNET           10.115.10.238   CLIENTE
ASOCIACION MEDICA RENAL PORTOVIEJO ASMERP OFICINA 1 INT INTERNET           10.115.10.239   Broadcast

/////////////////////////////////////////////////////////////////////////
RESPONSABLE: Steven Alejandro Oviedo Buitron
OBSERVACIONES:
UM TIGO
`;

export const inventory = `FARMACIAS Y COMISARIATOS DE MEDICINAS SA FARCOMED
-----------------------------
SERVICIO:  DATOS
ACCESO:
PUERTO:
AB: 10240Kbps
VLAN: 3230
VRF:   ()
ENRUTAMIENTO:
ASN:
LOOPBACK MONITOREO: 10.116.101.128/32
RED PUBLICA:
RED LAN:
SOURCE TUNEL (LOOPBACK PE):
DESTINATION TUNEL (IP SIM CARD):
IMSI SIM CARD:
RED WAN:

FARCOMED SANA SANA MALDONADO DATOS           10.115.3.204   Red
FARCOMED SANA SANA MALDONADO DATOS           10.115.3.205   IPTCHL3CCRM03
FARCOMED SANA SANA MALDONADO DATOS           10.115.3.206   CLIENTE
FARCOMED SANA SANA MALDONADO DATOS           10.115.3.207   Broadcast

/////////////////////////////////////////////////////////////////////////
RESPONSABLE: Steven Alejandro Oviedo Buitron
OBSERVACIONES:
UM TIGO
`;
