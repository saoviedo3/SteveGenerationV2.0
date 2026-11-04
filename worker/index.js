import { generate } from '../public/lib/generator.js';
import { hashPassword, verifyPassword, tokenHash, randomToken, passwordError } from './auth.js';

const SESSION_SECONDS = 8 * 60 * 60;
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000',
};
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const publicUser = user => ({ id: user.id, username: user.username, role: user.role, active: Boolean(user.active), created_at: user.created_at });
const cookie = (request, token, age) => `sg_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
const usernameValid = value => typeof value === 'string' && /^[a-zA-Z0-9_.-]{3,40}$/.test(value);

async function body(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) fail('Se requiere JSON.', 415);
  if (Number(request.headers.get('Content-Length')) > 65536) fail('El formulario supera el tamaño permitido.', 413);
  const reader = request.body?.getReader();
  if (!reader) fail('Falta el formulario.');
  let length = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 65536) { await reader.cancel(); fail('El formulario supera el tamaño permitido.', 413); }
    chunks.push(value);
  }
  const buffer = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const data = JSON.parse(new TextDecoder().decode(buffer));
    if (!data || Array.isArray(data) || typeof data !== 'object') fail('Formulario inválido.');
    return data;
  } catch { fail('Formulario JSON inválido.'); }
}

async function session(request, env) {
  const token = request.headers.get('Cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith('sg_session='))?.slice(11);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = await tokenHash(token);
  const user = await env.DB.prepare('SELECT users.* FROM users JOIN sessions ON sessions.user_id = users.id WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.active = 1').bind(hash, Math.floor(Date.now() / 1000)).first();
  return user ? { user, hash } : null;
}

async function login(request, env) {
  const data = await body(request);
  const username = typeof data.username === 'string' ? data.username.trim().toLowerCase() : '';
  if (!usernameValid(username) || typeof data.password !== 'string' || data.password.length > 128) fail('Usuario o contraseña incorrectos.', 401);
  const now = Math.floor(Date.now() / 1000);
  const keys = [await tokenHash(`ip:${request.headers.get('CF-Connecting-IP') || 'local'}`), await tokenHash(`user:${username}`)];
  for (let i = 0; i < keys.length; i++) {
    const row = await env.DB.prepare('INSERT INTO login_attempts (key, attempts, window_start) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET attempts = CASE WHEN window_start < ? THEN 1 ELSE attempts + 1 END, window_start = CASE WHEN window_start < ? THEN excluded.window_start ELSE window_start END RETURNING attempts').bind(keys[i], now, now - 900, now - 900).first();
    if (row.attempts > (i === 0 ? 30 : 10)) return json({ error: 'Demasiados intentos. Intenta de nuevo en 15 minutos.' }, 429, { 'Retry-After': '900' });
  }
  const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
  // A dummy PBKDF2 hash keeps unknown-user and wrong-password work comparable.
  const saved = user?.password_hash || 'pbkdf2-sha256$100000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000';
  const valid = await verifyPassword(data.password, saved);
  if (!valid || !user?.active) fail('Usuario o contraseña incorrectos.', 401);
  const token = randomToken();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    env.DB.prepare('DELETE FROM login_attempts WHERE key = ? OR window_start < ?').bind(keys[1], now - 86400),
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').bind(await tokenHash(token), user.id, now + SESSION_SECONDS),
  ]);
  return json({ user: publicUser(user) }, 200, { 'Set-Cookie': cookie(request, token, SESSION_SECONDS) });
}

async function api(request, env) {
  const { pathname } = new URL(request.url);
  const method = request.method;
  if (!['GET', 'HEAD'].includes(method) && request.headers.get('Origin') !== new URL(request.url).origin) fail('Origen de solicitud no permitido.', 403);
  if (pathname === '/api/login' && method === 'POST') return login(request, env);
  const auth = await session(request, env);
  if (!auth) fail('Inicia sesión para continuar.', 401);
  const { user, hash } = auth;
  if (pathname === '/api/me' && method === 'GET') return json({ user: publicUser(user) });
  if (pathname === '/api/logout' && method === 'POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(hash).run();
    return json({ ok: true }, 200, { 'Set-Cookie': cookie(request, '', 0) });
  }
  if (pathname === '/api/password' && method === 'POST') {
    const data = await body(request);
    if (typeof data.currentPassword !== 'string' || data.currentPassword.length > 128 || !await verifyPassword(data.currentPassword, user.password_hash)) fail('La contraseña actual no es correcta.');
    const error = passwordError(data.password);
    if (error) fail(error);
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(data.password), user.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(user.id, hash),
    ]);
    return json({ ok: true });
  }
  if (pathname === '/api/history' && method === 'GET') {
    const rows = await env.DB.prepare('SELECT id, title, service, routing, link_type, solution, filename, created_at FROM history WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100').bind(user.id).all();
    return json({ items: rows.results });
  }
  if (pathname === '/api/history' && method === 'POST') {
    const data = await body(request);
    const result = generate(data);
    if (Object.keys(result.errors).length) return json({ error: 'Revisa los campos de la configuración.', fields: result.errors }, 422);
    const id = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO history (id, user_id, title, service, routing, link_type, solution, filename, document) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, user.id, result.title, data.service, data.routing, data.linkType, data.solution, result.filename, result.document),
      env.DB.prepare('DELETE FROM history WHERE user_id = ? AND id NOT IN (SELECT id FROM history WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 100)').bind(user.id, user.id),
    ]);
    return json({ id, filename: result.filename, document: result.document }, 201);
  }
  const historyMatch = /^\/api\/history\/([a-f0-9-]{36})$/.exec(pathname);
  if (historyMatch && ['GET', 'DELETE'].includes(method)) {
    const entry = await env.DB.prepare('SELECT * FROM history WHERE id = ? AND user_id = ?').bind(historyMatch[1], user.id).first();
    if (!entry) fail('El documento no existe.', 404);
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM history WHERE id = ? AND user_id = ?').bind(entry.id, user.id).run();
      return json({ ok: true });
    }
    return json({ item: entry });
  }
  if (pathname.startsWith('/api/users')) {
    if (user.role !== 'admin') fail('Solo el administrador puede gestionar usuarios.', 403);
    if (pathname === '/api/users' && method === 'GET') {
      const rows = await env.DB.prepare('SELECT id, username, role, active, created_at FROM users ORDER BY created_at').all();
      return json({ users: rows.results.map(publicUser) });
    }
    if (pathname === '/api/users' && method === 'POST') {
      const data = await body(request);
      const username = typeof data.username === 'string' ? data.username.trim().toLowerCase() : '';
      if (!usernameValid(username)) fail('El usuario debe tener de 3 a 40 letras, números, puntos o guiones.');
      const error = passwordError(data.password);
      if (error) fail(error);
      try {
        await env.DB.prepare("INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, 'user')").bind(crypto.randomUUID(), username, await hashPassword(data.password)).run();
      } catch (error) {
        if (/UNIQUE constraint/i.test(error.message)) fail('Ese nombre de usuario ya existe.', 409);
        throw error;
      }
      return json({ ok: true }, 201);
    }
    const userMatch = /^\/api\/users\/([a-f0-9-]{36})$/.exec(pathname);
    if (userMatch && method === 'PATCH') {
      const target = await env.DB.prepare('SELECT id, role FROM users WHERE id = ?').bind(userMatch[1]).first();
      if (!target) fail('El usuario no existe.', 404);
      if (target.role === 'admin') fail('La cuenta administradora se gestiona desde Mi cuenta.', 403);
      const data = await body(request);
      const statements = [];
      if (typeof data.active === 'boolean') statements.push(env.DB.prepare('UPDATE users SET active = ? WHERE id = ?').bind(data.active ? 1 : 0, target.id));
      if (data.password !== undefined) {
        const error = passwordError(data.password);
        if (error) fail(error);
        statements.push(env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(data.password), target.id));
      }
      if (!statements.length) fail('No hay cambios para guardar.');
      statements.push(env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id));
      await env.DB.batch(statements);
      return json({ ok: true });
    }
  }
  fail('Ruta no encontrada.', 404);
}

export default {
  async fetch(request, env) {
    let response;
    try {
      response = new URL(request.url).pathname.startsWith('/api/') ? await api(request, env) : await env.ASSETS.fetch(request);
    } catch (error) {
      if (!error.status) console.error('Request failed:', error.message);
      response = json({ error: error.status ? error.message : 'No se pudo completar la operación. Intenta de nuevo.' }, error.status || 500);
    }
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
    return new Response(response.body, { status: response.status, headers });
  },
};
