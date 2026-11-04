import { generate, parseInventory, SOLUTION } from './lib/generator.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const form = $('#config-form');
let user = null;
let current = null;
let previewMode = 'document';
let showErrors = false;
let history = [];
let savedEntry = null;
let resetUserId = null;
let deleteId = null;
let toastTimer;
let lastService = 'DATOS';
let datosVrf = '';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function icon(name) {
  const paths = {
    upload: ['M12 16V4m-5 5 5-5 5 5', 'M4 16v4h16v-4'],
    download: ['M12 3v12m-5-5 5 5 5-5', 'M4 17v4h16v-4'],
    arrow: ['M7 17 17 7M7 7h10v10'],
    copy: ['M8 8h12v13H8z', 'M16 8V3H3v13h5'],
    grid: ['M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z'],
    history: ['M3 11a9 9 0 1 1 2 7', 'M3 4v7h7M12 7v5l3 2'],
    users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M17 4a4 4 0 0 1 0 7M22 21v-2a4 4 0 0 0-3-4'],
    logout: ['M9 21H3V3h6M9 12h12m-5-5 5 5-5 5'],
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'ui-icon');
  for (const d of paths[name]) {
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
$('.upload-icon').replaceChildren(icon('upload'));
$('.nav-item[data-view=generator] .nav-icon').replaceChildren(icon('grid'));
$('.nav-item[data-view=history] .nav-icon').replaceChildren(icon('history'));
$('#users-nav .nav-icon').replaceChildren(icon('users'));
$('.nav-arrow').replaceChildren(icon('arrow'));
$('.profile-arrow').replaceChildren(icon('arrow'));
$('#logout span').replaceChildren(icon('logout'));
$('#load-example').replaceChildren(icon('arrow'), document.createTextNode('Cargar ejemplo'));
$('#download').replaceChildren(icon('download'), document.createTextNode('Guardar y descargar TXT'));
$('#copy-document').replaceChildren(icon('copy'), document.createTextNode('Copiar documento'));
$('#copy-tag').replaceChildren(icon('copy'));
$('#saved-download').replaceChildren(icon('download'), document.createTextNode('Descargar TXT'));
function toast(message, error = false) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').classList.toggle('error', error);
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500);
}
function message(selector, text, error = false) {
  $(selector).textContent = text;
  $(selector).classList.toggle('error', error);
}
async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  let data;
  try { data = await response.json(); } catch { throw new Error('El servidor no respondió correctamente. Intenta de nuevo.'); }
  if (!response.ok) {
    if (response.status === 401 && path !== '/login') {
      endSession();
      message('#login-error', 'Tu sesión terminó. Vuelve a ingresar.');
    }
    throw Object.assign(new Error(data.error || 'No se pudo completar la operación.'), { fields: data.fields });
  }
  return data;
}
async function busy(button, action) {
  const content = [...button.childNodes];
  button.disabled = true;
  button.textContent = 'Un momento…';
  try { return await action(); }
  finally { button.disabled = false; button.replaceChildren(...content); }
}
function startSession(account) {
  user = account;
  $('#login-view').hidden = true;
  $('#loading').hidden = true;
  $('#workspace').hidden = false;
  $('#profile-name').textContent = user.username;
  $('#profile-role').textContent = user.role === 'admin' ? 'Administrador' : 'Equipo de redes';
  $('#avatar').textContent = user.username[0].toUpperCase();
  $('#users-nav').hidden = user.role !== 'admin';
  navigate('generator');
}
function endSession() {
  user = null;
  current = null;
  history = [];
  savedEntry = null;
  resetUserId = null;
  deleteId = null;
  form.reset();
  $('#login-form').reset();
  $('#password-form').reset();
  $('#create-user-form').reset();
  $('#reset-form').reset();
  $('#inventory-text').value = '';
  $('#inventory-file').value = '';
  $('#history-search').value = '';
  $('#history-list').replaceChildren();
  $('#users-list').replaceChildren();
  $('#saved-document').textContent = '';
  $$('dialog[open]').forEach(dialog => dialog.close());
  showErrors = false;
  lastService = 'DATOS';
  datosVrf = '';
  update();
  message('#import-message', 'Las direcciones PE y CPE se extraen automáticamente.');
  $('#import-status').textContent = '.TXT';
  $('#workspace').hidden = true;
  $('#loading').hidden = true;
  $('#login-view').hidden = false;
}

async function navigate(view) {
  if (view === 'users' && user?.role !== 'admin') return;
  const names = { generator: 'Generador', history: 'Mi historial', users: 'Usuarios', account: 'Mi cuenta' };
  $$('.view').forEach(section => { section.hidden = section.id !== `${view}-view`; });
  $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  $('#page-label').textContent = names[view];
  window.scrollTo({ top: 0, behavior: 'instant' });
  try {
    if (view === 'history') await loadHistory();
    if (view === 'users') await loadUsers();
  } catch (error) { toast(error.message, true); }
}
$$('[data-view]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.view)));

function values() { return Object.fromEntries(new FormData(form)); }
function syncFields() {
  const internet = form.elements.service.value === 'INTERNET';
  const bgp = form.elements.routing.value === 'BGP';
  if (internet && lastService !== 'INTERNET') datosVrf = form.elements.vrf.value;
  if (!internet && lastService === 'INTERNET') form.elements.vrf.value = datosVrf;
  lastService = form.elements.service.value;
  if (internet) form.elements.vrf.value = 'internet-pccs-ncb';
  form.elements.vrf.readOnly = internet;
  $('#asn-field').hidden = !bgp;
  $('#loopback-field').hidden = internet;
  $('#public-field').hidden = !internet;
}
function renderErrors(errors) {
  $$('.field-error').forEach(node => node.remove());
  $$('[aria-invalid]').forEach(node => { node.removeAttribute('aria-invalid'); node.removeAttribute('aria-describedby'); });
  const entries = Object.entries(errors);
  $('#validation-panel').hidden = !showErrors || !entries.length;
  $('#validation-list').replaceChildren();
  if (!showErrors) return;
  for (const [key, value] of entries) {
    const field = form.elements[key];
    if (field?.tagName) {
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', `error-${key}`);
      const hint = element('span', 'field-error', value);
      hint.id = `error-${key}`;
      field.parentElement.append(hint);
    }
    const li = element('li');
    const link = element('button', '', value);
    link.type = 'button';
    link.addEventListener('click', () => {
      const focusField = field?.tagName ? field : field?.[0];
      focusField?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      focusField?.focus({ preventScroll: true });
    });
    li.append(link);
    $('#validation-list').append(li);
  }
}
function update() {
  syncFields();
  current = generate(values());
  const valid = !Object.keys(current.errors).length;
  renderErrors(current.errors);
  $('#preview-status').textContent = valid ? '✓ Lista para revisar' : 'Por completar';
  $('#preview-status').classList.toggle('ready', valid);
  $('#preview-empty').hidden = valid;
  $('#code-preview').hidden = !valid;
  $('#code-preview').textContent = valid ? current[previewMode] : '';
  $('#code-filename').textContent = valid ? current.filename : 'configuracion.txt';
  $('#tag-box').hidden = !valid;
  $('#tag-text').textContent = valid ? current.tag : '';
  $('#interface-summary').textContent = valid ? current.interface : 'NNI3 CARMEN · Cisco IOS XR';
}
form.addEventListener('input', update);
form.addEventListener('change', update);
form.addEventListener('submit', event => event.preventDefault());
$$('[data-preview]').forEach(button => button.addEventListener('click', () => {
  previewMode = button.dataset.preview;
  $$('[data-preview]').forEach(tab => tab.setAttribute('aria-selected', String(tab === button)));
  update();
}));
$('.preview-tabs').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const tabs = $$('[data-preview]');
  const index = tabs.indexOf(document.activeElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next].focus();
  tabs[next].click();
});

function importText(text, filename = 'Texto importado') {
  if (!text.trim()) throw new Error('El texto está vacío. Pega los recursos de Network Inventory.');
  if (new TextEncoder().encode(text).byteLength > 262144) throw new Error('El TXT debe pesar como máximo 256 KB.');
  const parsed = parseInventory(text);
  if (!parsed.service && !parsed.bandwidth && !parsed.wanRows.length) throw new Error('No se reconocieron recursos de Network Inventory. Revisa el contenido del TXT.');
  // A new source must not inherit identifiers from a previous or demo link.
  for (const key of ['iasi', 'client', 'branch', 'workOrder', 'linkId']) form.elements[key].value = '';
  for (const key of ['access', 'port', 'bandwidth', 'vlan', 'vrf', 'asn', 'loopback', 'publicNetworks', 'lanNetworks', 'responsible', 'wanNetwork', 'wanPe', 'wanCpe', 'wanBroadcast', 'wanLabel', 'peName']) form.elements[key].value = parsed[key] ?? '';
  if (['DATOS', 'INTERNET'].includes(parsed.service)) form.elements.service.value = parsed.service;
  if (parsed.routing) form.elements.routing.value = parsed.routing;
  lastService = form.elements.service.value;
  datosVrf = lastService === 'DATOS' ? form.elements.vrf.value : '';
  $('#import-status').textContent = '✓ IMPORTADO';
  message('#import-message', `${filename} · ${parsed.warnings.length ? parsed.warnings.join(' ') : 'Recursos extraídos. Completa los identificadores de este enlace.'}`);
  $('#import-message').className = `import-message ${parsed.warnings.length ? '' : 'success'}`;
  update();
}
async function importFile(file) {
  if (!file) return;
  try {
    if (!/\.txt$/i.test(file.name)) throw new Error('Selecciona un archivo con extensión .txt.');
    if (file.size > 262144) throw new Error('El TXT debe pesar como máximo 256 KB.');
    const buffer = await file.arrayBuffer();
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch { text = new TextDecoder('windows-1252').decode(buffer); }
    importText(text, file.name);
  } catch (error) {
    message('#import-message', error.message);
    $('#import-message').className = 'import-message error';
    toast(error.message, true);
  } finally { $('#inventory-file').value = ''; }
}
$('#inventory-file').addEventListener('change', event => importFile(event.target.files[0]));
$('#parse-text').addEventListener('click', () => {
  try { importText($('#inventory-text').value); } catch (error) { toast(error.message, true); }
});
for (const name of ['dragenter', 'dragover']) $('#dropzone').addEventListener(name, event => { event.preventDefault(); $('#dropzone').classList.add('dragover'); });
for (const name of ['dragleave', 'drop']) $('#dropzone').addEventListener(name, event => { event.preventDefault(); $('#dropzone').classList.remove('dragover'); });
$('#dropzone').addEventListener('drop', event => importFile(event.dataTransfer.files[0]));

$('#load-example').addEventListener('click', () => {
  const example = { solution: SOLUTION, service: 'DATOS', routing: 'BGP', linkType: 'UNIQUE', medium: 'OPTICAL', client: 'FARCOMED', branch: 'SS MALDONADO', iasi: '124906-36-1', linkId: '10066459', workOrder: 'CRQ000000190789', access: 'PRADERA_GUASMO_6150', port: 'OIGE8[0-1-7] GE: 8', bandwidth: '10240Kbps', vlan: '3230', vrf: 'econofarm_datos', asn: '64877', loopback: '10.116.101.128/32', publicNetworks: '10.115.3.200/29', lanNetworks: '', responsible: 'Steven Alejandro Oviedo Buitron', wanNetwork: '10.115.3.204', wanPe: '10.115.3.205', wanCpe: '10.115.3.206', wanBroadcast: '10.115.3.207', wanLabel: 'FARCOMED SANA SANA MALDONADO DATOS', peName: 'IPTCHL3CCRM03' };
  for (const [key, value] of Object.entries(example)) form.elements[key].value = value;
  lastService = 'DATOS';
  datosVrf = example.vrf;
  $('#inventory-text').value = '';
  message('#import-message', 'Ejemplo cargado. Estos datos son de demostración; reemplázalos para un enlace real.');
  $('#import-message').className = 'import-message';
  $('#import-status').textContent = 'EJEMPLO';
  update();
  toast('Ejemplo cargado. Puedes explorar las cuatro variantes.');
});

function requireValid() {
  showErrors = true;
  update();
  if (Object.keys(current.errors).length) { toast('Completa los campos indicados antes de continuar.', true); return false; }
  return true;
}
function download(content, filename) {
  const url = URL.createObjectURL(new Blob([content.replace(/\r?\n/g, '\r\n')], { type: 'text/plain;charset=utf-8' }));
  const link = element('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function copy(text, success) {
  try { await navigator.clipboard.writeText(text); toast(success); }
  catch { toast('No se pudo copiar. Selecciona el texto de la vista previa o descarga el TXT.', true); }
}
$('#download').addEventListener('click', () => {
  if (!requireValid()) return;
  busy($('#download'), async () => {
    try {
      const saved = await api('/history', { method: 'POST', body: JSON.stringify(values()) });
      download(saved.document, saved.filename);
      toast('Documento guardado en tu historial y descarga iniciada.');
    } catch (error) {
      if (error.fields) renderErrors(error.fields);
      toast(error.message, true);
    }
  });
});
$('#copy-document').addEventListener('click', () => { if (requireValid()) copy(current.document, 'Documento copiado. No se guardó en el historial.'); });
$('#copy-tag').addEventListener('click', () => { if (current?.tag) copy(current.tag, 'Etiqueta ZTE copiada.'); });

function emptyState(title, description, icon = '◷') {
  const box = element('div', 'empty-state');
  box.append(element('span', '', icon), element('h2', '', title), element('p', '', description));
  return box;
}
async function loadHistory() {
  const accountId = user?.id;
  $('#history-list').replaceChildren(element('p', 'muted', 'Cargando tus documentos…'));
  try {
    const result = await api('/history');
    if (user?.id !== accountId) return;
    history = result.items;
    renderHistory();
  } catch (error) {
    if (user?.id !== accountId) return;
    $('#history-list').replaceChildren(emptyState('No pudimos cargar tu historial', 'Vuelve a abrir esta sección para intentarlo de nuevo.'));
    throw error;
  }
}
function renderHistory() {
  const term = $('#history-search').value.trim().toLowerCase();
  const items = history.filter(item => item.title.toLowerCase().includes(term));
  $('#history-count').textContent = `${items.length} ${items.length === 1 ? 'DOCUMENTO' : 'DOCUMENTOS'}`;
  $('#history-list').replaceChildren();
  if (!items.length) {
    $('#history-list').append(emptyState(term ? 'Sin coincidencias' : 'Tu próximo enlace empieza aquí', term ? 'Prueba con otro cliente, IASI o sucursal.' : 'Los documentos que descargues aparecerán en este espacio.'));
    return;
  }
  const dateFormat = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' });
  for (const item of items) {
    const card = element('article', 'history-item');
    const info = element('div');
    const meta = element('div', 'history-meta');
    meta.append(element('span', 'subtle-badge', `${item.service} / ${item.routing === 'STATIC' ? 'ESTÁTICO' : 'BGP'}`), element('p', '', dateFormat.format(new Date(item.created_at))));
    info.append(element('h3', '', item.title), meta);
    const actions = element('div', 'actions');
    const view = element('button', 'button secondary small', 'Ver documento');
    const remove = element('button', 'icon-button', '×');
    remove.setAttribute('aria-label', `Eliminar ${item.title}`);
    view.addEventListener('click', () => busy(view, async () => {
      try {
        savedEntry = (await api(`/history/${item.id}`)).item;
        $('#dialog-title').textContent = savedEntry.title;
        $('#saved-document').textContent = savedEntry.document;
        $('#document-dialog').showModal();
      } catch (error) { toast(error.message, true); }
    }));
    remove.addEventListener('click', () => { deleteId = item.id; $('#confirm-dialog').showModal(); });
    actions.append(view, remove);
    card.append(info, actions);
    $('#history-list').append(card);
  }
}
$('#history-search').addEventListener('input', renderHistory);
$('#saved-download').addEventListener('click', () => { if (savedEntry) download(savedEntry.document, savedEntry.filename); });
$('#confirm-delete').addEventListener('click', () => busy($('#confirm-delete'), async () => {
  try {
    await api(`/history/${deleteId}`, { method: 'DELETE' });
    $('#confirm-dialog').close();
    await loadHistory();
    toast('Documento eliminado del historial.');
  } catch (error) { toast(error.message, true); }
}));
$$('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));

async function loadUsers() {
  const accountId = user?.id;
  $('#users-list').replaceChildren(element('p', 'muted', 'Cargando usuarios…'));
  try {
    const accounts = (await api('/users')).users;
    if (user?.id !== accountId) return;
    $('#users-list').replaceChildren();
    for (const account of accounts) {
      const row = element('div', 'user-row');
      const info = element('div', 'user-info');
      info.append(element('b', '', account.username), element('small', '', account.role === 'admin' ? 'Administrador' : account.active ? 'Acceso activo' : 'Cuenta desactivada'));
      row.append(element('span', 'avatar', account.username[0].toUpperCase()), info);
      if (account.role !== 'admin') {
        const actions = element('div', 'user-actions');
        const reset = element('button', 'button secondary small', 'Contraseña');
        const toggle = element('button', 'button secondary small', account.active ? 'Desactivar' : 'Activar');
        reset.addEventListener('click', () => {
          resetUserId = account.id;
          $('#reset-form').reset();
          $('#reset-message').textContent = '';
          $('#reset-username').textContent = `Usuario: ${account.username}`;
          $('#reset-dialog').showModal();
        });
        toggle.addEventListener('click', () => busy(toggle, async () => {
          try {
            await api(`/users/${account.id}`, { method: 'PATCH', body: JSON.stringify({ active: !account.active }) });
            await loadUsers();
            toast(account.active ? 'Cuenta desactivada y sesiones cerradas.' : 'Cuenta activada.');
          } catch (error) { toast(error.message, true); }
        }));
        actions.append(reset, toggle);
        row.append(actions);
      }
      $('#users-list').append(row);
    }
  } catch (error) {
    if (user?.id !== accountId) return;
    $('#users-list').replaceChildren(element('p', 'error-text', 'No se pudieron cargar los usuarios. Vuelve a abrir esta sección.'));
    throw error;
  }
}
$('#create-user-form').addEventListener('submit', event => {
  event.preventDefault();
  const target = event.currentTarget;
  busy(target.querySelector('button'), async () => {
    try {
      await api('/users', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(target))) });
      target.reset();
      message('#user-form-message', 'Usuario creado. Ya puede iniciar sesión.');
      await loadUsers();
    } catch (error) { message('#user-form-message', error.message, true); }
  });
});
$('#reset-form').addEventListener('submit', event => {
  event.preventDefault();
  const target = event.currentTarget;
  busy(target.querySelector('button[type="submit"], button:not([type])'), async () => {
    try {
      await api(`/users/${resetUserId}`, { method: 'PATCH', body: JSON.stringify({ password: target.elements.password.value }) });
      target.reset();
      $('#reset-dialog').close();
      toast('Contraseña actualizada. Sus sesiones anteriores se cerraron.');
    } catch (error) { message('#reset-message', error.message, true); }
  });
});
$('#password-form').addEventListener('submit', event => {
  event.preventDefault();
  const target = event.currentTarget;
  if (target.elements.password.value !== target.elements.confirmation.value) { message('#password-message', 'Las contraseñas nuevas no coinciden.', true); return; }
  busy(target.querySelector('button'), async () => {
    try {
      await api('/password', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(target))) });
      target.reset();
      message('#password-message', 'Contraseña actualizada.');
    } catch (error) { message('#password-message', error.message, true); }
  });
});
$('#login-form').addEventListener('submit', event => {
  event.preventDefault();
  const target = event.currentTarget;
  message('#login-error', '');
  busy(target.querySelector('button'), async () => {
    try {
      const data = await api('/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(target))) });
      target.reset();
      startSession(data.user);
    } catch (error) { message('#login-error', error.message, true); }
  });
});
$('#logout').addEventListener('click', () => busy($('#logout'), async () => {
  try { await api('/logout', { method: 'POST' }); endSession(); }
  catch (error) { toast(error.message, true); }
}));

update();
try { startSession((await api('/me')).user); }
catch (error) {
  endSession();
  if (!/Inicia sesión/.test(error.message)) message('#login-error', error.message, true);
}
