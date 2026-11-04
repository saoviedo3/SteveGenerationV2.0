export const sample = {
  solution: 'NNI3_CRM', service: 'DATOS', routing: 'BGP', linkType: 'UNIQUE', medium: 'OPTICAL',
  iasi: '124906-36-1', client: 'FARCOMED', branch: 'SS MALDONADO', linkId: '10066459',
  workOrder: 'CRQ000000190789', access: 'PRADERA_GUASMO_6150', port: 'OIGE8[0-1-7] GE: 8',
  bandwidth: '10240Kbps', vlan: '3230', vrf: 'econofarm_datos', asn: '64877',
  loopback: '10.116.101.128/32', publicNetworks: '10.115.3.200/29', lanNetworks: '',
  responsible: 'Steven Alejandro Oviedo Buitron', wanNetwork: '10.115.3.204', wanPe: '10.115.3.205',
  wanCpe: '10.115.3.206', wanBroadcast: '10.115.3.207',
  wanLabel: 'FARCOMED SANA SANA MALDONADO DATOS', peName: 'IPTCHL3CCRM03',
};

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
