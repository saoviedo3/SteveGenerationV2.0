const clean = value => String(value ?? '').trim();

export function provisioningErrors(input) {
  const errors = {};
  for (const key of ['createVrf', 'createSpeed']) {
    if (input[key] !== undefined && !['YES', 'NO'].includes(input[key])) errors[key] = 'Selecciona Sí o No.';
  }
  if (input.service === 'INTERNET' && input.createVrf === 'YES') errors.createVrf = 'INTERNET utiliza la VRF compartida existente; no se crea una nueva VRF.';
  const rdRequired = input.service === 'DATOS' && (input.createVrf === 'YES' || (input.solution === 'JUNIPER' && input.routing === 'BGP'));
  if (rdRequired && (typeof input.rd !== 'string' || !/^\d{1,10}$/.test(clean(input.rd)) || Number(input.rd) > 4294967295)) errors.rd = 'Introduce el número del RD entre 0 y 4294967295; el prefijo 19114 es fijo.';
  return errors;
}

export function ciscoProvisioning({ d, vrf, bandwidth, internet }) {
  const xe = d.solution === 'NNI2_MAP';
  const script = [];
  if (!internet && d.createVrf === 'YES') {
    const target = `19114:${Number(d.rd)}`;
    if (xe) script.push(
      '!', `ip vrf ${vrf}`, ` description ${vrf}`, ` rd ${target}`,
      ' export map RM-monitor', ` route-target export ${target}`,
      ` route-target import ${target}`, ' route-target import 19114:200002', 'exit', '!',
    );
    else script.push(
      '!', `vrf ${vrf}`, ` description ${vrf}`, ' address-family ipv4 unicast',
      '  import route-target', `   ${target}`, '   19114:200002', '  !',
      '  export route-policy RM-monitor', '  export route-target', `   ${target}`, '  !', ' !', '!',
    );
  }
  if (d.createSpeed === 'YES') {
    const bits = Number.parseInt(bandwidth, 10) * 1000;
    const burst = Math.ceil(bits / 32);
    script.push(`policy-map ${bandwidth}`, ' class class-default');
    if (xe) script.push(`  police cir ${bits} bc ${burst} be ${burst} conform-action transmit exceed-action drop`, ' exit', 'exit', '!');
    else script.push(
      `  police rate ${bits} bps burst ${burst} bytes peak-burst ${burst} bytes`,
      '   conform-action transmit', '   exceed-action drop', '  !', ' !', 'end-policy-map', '!',
    );
  }
  return script;
}
