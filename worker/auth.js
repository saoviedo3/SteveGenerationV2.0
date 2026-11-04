const encoder = new TextEncoder();
const hex = buffer => [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');
const unhex = value => Uint8Array.from(value.match(/.{2}/g) ?? [], byte => parseInt(byte, 16));
export const tokenHash = async value => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
export const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));

export async function hashPassword(password, salt = hex(crypto.getRandomValues(new Uint8Array(16)))) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations: 100000, salt: unhex(salt) }, key, 256);
  return `pbkdf2-sha256$100000$${salt}$${hex(bits)}`;
}

export async function verifyPassword(password, saved) {
  const parts = saved.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256' || parts[1] !== '100000') return false;
  const actual = await hashPassword(password, parts[2]);
  let difference = actual.length ^ saved.length;
  for (let i = 0; i < actual.length; i++) difference |= actual.charCodeAt(i) ^ saved.charCodeAt(i);
  return difference === 0;
}

export function passwordError(password) {
  return typeof password !== 'string' || password.length < 4 || password.length > 128 ? 'La contraseña debe tener entre 4 y 128 caracteres.' : null;
}
