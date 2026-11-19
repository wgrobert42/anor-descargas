/* admin.js — panel de administración de Anor: crear clientes, renovar planes, bloquear, liberar móviles, dar un acceso
   nuevo (contraseña olvidada), eliminar, y editar precios, contacto y versión mínima.
   Habla con Firebase por REST (fb.js). Todo lo que hace lo vuelven a comprobar las reglas de Firestore
   (firebase/firestore.rules): solo funciona con cuentas que estén en «admins» (variable ANOR_ADMINS de GitHub).
   Nada de lo que viene de Firestore se inserta como HTML: todo se pinta como texto. */
'use strict';
(function () {
  /* nunca dentro de un marco ajeno (evita que otra web lo «envuelva» para robar clics) */
  if (window.top !== window.self) { try { window.top.location.replace(window.self.location.href); } catch (e) { document.documentElement.textContent = ''; } return; }

  const CFG = window.ANOR_CFG || {};
  const fb = FB.cliente({ apiKey: CFG.apiKey, projectId: CFG.projectId });
  const DIA = 864e5;
  const SESION_MAX = 7 * DIA; /* tras 7 días hay que volver a escribir la contraseña */
  const LS = 'anor.admin';

  /* ---------------- funciones puras (también las usan las pruebas) ---------------- */
  function sumarMeses(ms, n) {
    const d = new Date(ms); const dia = d.getDate();
    const r = new Date(ms); r.setDate(1); r.setMonth(r.getMonth() + n);
    const ultimo = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
    r.setDate(Math.min(dia, ultimo));
    return r.getTime();
  }
  /* renovar: desde el vencimiento si aún está vigente; si no, desde ahora */
  function nuevoVence(venceMs, plan, ahoraMs) { return sumarMeses(Math.max(venceMs || 0, ahoraMs), plan === 'anual' ? 12 : 1); }
  function azar(n) { /* entero uniforme en [0, n) */
    const lim = Math.floor(0x100000000 / n) * n; const a = new Uint32Array(1);
    do { crypto.getRandomValues(a); } while (a[0] >= lim);
    return a[0] % n;
  }
  function generarClave() {
    const P = window.PALABRAS || []; const w = () => P[azar(P.length)];
    let a = w(), b = w(), c = w(); while (b === a) b = w(); while (c === a || c === b) c = w();
    return a + '-' + b + '-' + c + '-' + String(azar(90) + 10);
  }
  function sugerirUsuario(nombre) {
    let s = String(nombre || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
    while (s.length > 24 && s.includes('.')) s = s.slice(0, s.lastIndexOf('.'));
    s = s.slice(0, 24).replace(/\.+$/, '');
    return s.length >= 3 ? s : '';
  }
  function idPago() { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; let s = ''; for (let i = 0; i < 20; i++) s += A[azar(A.length)]; return s; }
  window.Panel = { sumarMeses, nuevoVence, generarClave, sugerirUsuario };

  /* ---------------- utilidades de interfaz ---------------- */
  const $ = (s, r) => (r || document).querySelector(s);
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) for (const k of Object.keys(props)) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(9)) { if (c == null || c === false) continue; el.append(c.nodeType ? c : document.createTextNode(String(c))); }
    return el;
  }
  const som = (n) => (typeof n === 'number' && isFinite(n) ? String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' soʻm' : '—');
  const fecha = (ms) => (ms ? new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const fechaLarga = (ms) => (ms ? new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');
  const fechaHora = (ms) => (ms ? new Date(ms).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  const ms = (d) => (d instanceof Date ? d.getTime() : typeof d === 'number' ? d : 0);
  const importe = (s) => { const n = parseInt(String(s || '').replace(/\D/g, ''), 10); return isFinite(n) ? n : NaN; };
  const nombrePlan = (p) => (p === 'anual' ? 'Anual' : 'Mensual');
  let toastT = null;
  function toast(msg, t) { const el = $('#adm-toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), t || 2400); }
  function mensaje(e) {
    switch (e && e.code) {
      case 'credenciales': return 'Email o contraseña incorrectos.';
      case 'noadmin': return 'Esta cuenta no es de administrador. Añade su email a la variable ANOR_ADMINS de GitHub y vuelve a compilar. (UID: ' + (e.detalle || '?') + ')';
      case 'demasiados': return 'Demasiados intentos. Espera unos minutos.';
      case 'red': case 'servidor': return 'Sin conexión con Firebase. Revisa internet y vuelve a probar.';
      case 'existe': return 'Ese usuario ya existe. Elige otro.';
      case 'debil': return 'La contraseña es demasiado débil.';
      case 'config': return 'Firebase no está bien configurado (' + (e.detalle || '') + '). Revisa que «Correo electrónico/contraseña» esté activado.';
      case 'permiso': return 'Firebase ha rechazado la operación (reglas de seguridad). ' + (e.detalle || '');
      case 'sesion': return 'La sesión ha caducado. Vuelve a entrar.';
      case 'conflicto': return 'Los datos han cambiado mientras tanto. Recarga e inténtalo otra vez.';
      default: return 'Algo ha fallado: ' + ((e && (e.detalle || e.message)) || e);
    }
  }
  /* ventana modal sencilla: build(caja, cerrar) */
  function ventana(build, cls) {
    const fondo = h('div', { class: 'dlg-fondo' }); const caja = h('div', { class: 'dlg ' + (cls || ''), role: 'dialog', 'aria-modal': 'true' });
    const cerrar = () => fondo.remove();
    fondo.append(caja); document.body.append(fondo);
    build(caja, cerrar);
    const f = caja.querySelector('input,button'); if (f) setTimeout(() => f.focus(), 30);
    return cerrar;
  }
  function confirmar(titulo, texto, ok, peligro) {
    return new Promise((res) => {
      ventana((c, cerrar) => c.append(h('h2', null, titulo), texto ? h('p', { class: 'mut' }, texto) : null,
        h('div', { class: 'fila-btn' },
          h('button', { id: 'dlg-no', class: 'btn blanco', type: 'button', onclick: () => { cerrar(); res(false); } }, 'Cancelar'),
          h('button', { id: 'dlg-ok', class: 'btn ' + (peligro ? 'rojo' : ''), type: 'button', onclick: () => { cerrar(); res(true); } }, ok))));
    });
  }
  const ocupado = async (btn, fn) => { if (btn) btn.disabled = true; try { return await fn(); } finally { if (btn) btn.disabled = false; } };

  /* ---------------- sesión de administrador ---------------- */
  let ses = null, tk = null;
  const guardarSes = () => { try { localStorage.setItem(LS, JSON.stringify(ses)); } catch (e) { /* noop */ } };
  const leerSes = () => { try { const s = JSON.parse(localStorage.getItem(LS)); return s && s.refresh && Date.now() - (s.desde || 0) < SESION_MAX ? s : null; } catch (e) { return null; } };
  async function token() {
    if (tk && tk.exp - 60000 > Date.now()) return tk.idToken;
    tk = await fb.renovar(ses.refresh); if (tk.refresh) { ses.refresh = tk.refresh; guardarSes(); }
    return tk.idToken;
  }
  async function entrar(email, clave) {
    const t = await fb.entrar(String(email).trim().toLowerCase(), clave);
    if (!(await fb.leer('admins/' + t.uid, t.idToken))) throw new FB.Fallo('noadmin', t.uid);
    ses = { uid: t.uid, email: String(email).trim().toLowerCase(), refresh: t.refresh, desde: Date.now() }; tk = t; guardarSes();
  }
  function salir() { ses = null; tk = null; try { localStorage.removeItem(LS); } catch (e) { /* noop */ } pintarEntrada(); }

  /* ---------------- datos ---------------- */
  let usuarios = [], cfgApp = { precioMensual: 80000, precioAnual: 600000, contacto: '', versionMinima: 0 }, version = null, filtro = '';
  async function cargar() {
    const tok = await token();
    const [lista, c, v] = await Promise.all([fb.listar('usuarios', tok), fb.leer('config/app', tok), fb.leer('config/version', tok)]);
    usuarios = lista.map((d) => Object.assign({ uid: d.id }, d.datos, { vence: ms(d.datos.vence), ultimaVez: ms(d.datos.ultimaVez), creado: ms(d.datos.creado) }));
    if (c) cfgApp = Object.assign(cfgApp, c.datos);
    version = v ? Object.assign({}, v.datos, { publicada: ms(v.datos.publicada) }) : null;
  }
  const emailDe = (u) => FB.emailDeUsuario(u, CFG.projectId);
  const precioDe = (plan) => (plan === 'anual' ? cfgApp.precioAnual : cfgApp.precioMensual);
  function estadoDe(u) {
    if (u.estado !== 'activo') return { k: 'bloq', t: u.estado === 'bloqueado' && u.despues ? 'sustituido' : 'bloqueado' };
    const dias = Math.ceil((u.vence - Date.now()) / DIA);
    if (dias <= 0) return { k: 'venc', t: 'vencido' + (dias < 0 ? ' hace ' + -dias + (dias === -1 ? ' día' : ' días') : ' hoy') };
    if (dias <= 5) return { k: 'pronto', t: 'quedan ' + dias + (dias === 1 ? ' día' : ' días') };
    return { k: 'ok', t: 'quedan ' + dias + ' días' };
  }

  /* ---------------- pantallas ---------------- */
  const app = () => $('#app');
  function pintarEntrada(aviso) {
    const email = h('input', { id: 'adm-email', type: 'email', autocomplete: 'username', placeholder: 'Email de administrador', 'aria-label': 'Email' });
    const clave = h('input', { id: 'adm-clave', type: 'password', autocomplete: 'current-password', placeholder: 'Contraseña', 'aria-label': 'Contraseña' });
    const err = h('div', { class: 'adm-err', role: 'alert' }, aviso || '');
    const btn = h('button', { id: 'adm-entrar', class: 'btn', type: 'submit' }, 'Entrar');
    app().replaceChildren(h('div', { class: 'entrada' }, h('img', { src: '../icono.svg', alt: '', class: 'logo', width: 96, height: 96 }), h('h1', null, 'Panel de Anor'),
      h('p', { class: 'mut' }, 'Clientes, planes y precios. Solo para administradores.'),
      h('form', { class: 'form', onsubmit: (e) => { e.preventDefault(); ocupado(btn, async () => {
        err.textContent = '';
        try { await entrar(email.value, clave.value); clave.value = ''; await abrirPanel(); } catch (x) { err.textContent = mensaje(x); }
      }); } }, email, clave, err, btn)));
    setTimeout(() => email.focus(), 30);
  }
  let pestana = 'usuarios';
  async function abrirPanel() {
    app().replaceChildren(h('p', { class: 'mut cargando' }, 'Cargando…'));
    try { await cargar(); } catch (e) { if (e && e.code === 'sesion') return salir(); app().replaceChildren(h('div', { class: 'adm-err' }, mensaje(e)), h('button', { class: 'btn', type: 'button', onclick: abrirPanel }, 'Reintentar')); return; }
    pintarPanel();
  }
  function pintarPanel() {
    const cab = h('header', { class: 'cab' }, h('img', { src: '../icono.svg', alt: '', width: 36, height: 36 }), h('div', { class: 'cab-t' }, h('b', null, 'Anor · Panel'), h('span', { class: 'mut' }, ses.email)),
      h('button', { id: 'adm-salir', class: 'btn blanco peque', type: 'button', onclick: salir }, 'Salir'));
    const tabs = h('nav', { class: 'tabs' },
      h('button', { id: 'adm-tab-usuarios', class: 'tab' + (pestana === 'usuarios' ? ' on' : ''), type: 'button', onclick: () => { pestana = 'usuarios'; pintarPanel(); } }, 'Clientes'),
      h('button', { id: 'adm-tab-ajustes', class: 'tab' + (pestana === 'ajustes' ? ' on' : ''), type: 'button', onclick: () => { pestana = 'ajustes'; pintarPanel(); } }, 'Precios y versión'));
    app().replaceChildren(cab, tabs, pestana === 'ajustes' ? vistaAjustes() : vistaUsuarios());
  }

  /* ----- lista de clientes ----- */
  function vistaUsuarios() {
    const orden = { pronto: 0, ok: 1, venc: 2, bloq: 3 };
    const vis = usuarios.filter((u) => !filtro || [u.usuario, u.nombre, u.nota, u.dispositivoNombre].some((x) => String(x || '').toLowerCase().includes(filtro)))
      .sort((a, b) => (orden[estadoDe(a).k] - orden[estadoDe(b).k]) || (a.vence - b.vence));
    const cuenta = (k) => usuarios.filter((u) => estadoDe(u).k === k).length;
    const buscar = h('input', { id: 'adm-buscar', type: 'search', placeholder: 'Buscar por usuario, nombre o móvil', value: filtro, 'aria-label': 'Buscar' });
    const lista = h('div', { id: 'adm-lista', class: 'lista' });
    const pinta = () => { lista.replaceChildren(...(vis.length ? vis.map(tarjeta) : [h('p', { class: 'mut vacio' }, usuarios.length ? 'Nadie coincide con la búsqueda.' : 'Todavía no hay clientes. Crea el primero con «Nuevo cliente».')])); };
    buscar.addEventListener('input', () => { filtro = buscar.value.trim().toLowerCase(); const v2 = vistaUsuarios(); app().lastChild.replaceWith(v2); const b2 = $('#adm-buscar'); b2.focus(); b2.setSelectionRange(b2.value.length, b2.value.length); });
    pinta();
    return h('section', { class: 'vista' },
      h('div', { class: 'resumen' }, h('span', { class: 'chip ok' }, 'Activos ' + (cuenta('ok') + cuenta('pronto'))), h('span', { class: 'chip pronto' }, 'Vencen pronto ' + cuenta('pronto')), h('span', { class: 'chip venc' }, 'Vencidos ' + cuenta('venc')), h('span', { class: 'chip bloq' }, 'Bloqueados ' + cuenta('bloq'))),
      h('div', { class: 'barra' }, buscar, h('button', { id: 'adm-nuevo', class: 'btn', type: 'button', onclick: nuevoCliente }, '+ Nuevo cliente')),
      lista);
  }
  function tarjeta(u) {
    const e = estadoDe(u);
    return h('button', { class: 'adm-u ' + e.k, type: 'button', 'data-uid': u.uid, onclick: () => ficha(u.uid) },
      h('div', { class: 'u1' }, h('b', null, u.usuario || '—'), u.nombre ? h('span', { class: 'mut' }, ' · ' + u.nombre) : null, h('span', { class: 'chip ' + e.k }, e.t)),
      h('div', { class: 'u2 mut' }, nombrePlan(u.plan) + ' · vence ' + fecha(u.vence)),
      h('div', { class: 'u2 mut' }, (u.dispositivoNombre ? '📱 ' + u.dispositivoNombre : 'Sin móvil asignado') + (u.ultimaVez ? ' · visto ' + fechaHora(u.ultimaVez) : '')));
  }

  /* ----- alta de cliente ----- */
  function radiosPlan(pref, sel, onChange) {
    const r = (p, txt) => h('label', { class: 'radio' }, h('input', { id: pref + '-plan-' + p, type: 'radio', name: pref + '-plan', value: p, checked: sel === p, onchange: () => onChange(p) }), ' ' + txt);
    return h('div', { class: 'radios', role: 'radiogroup' }, r('mensual', 'Mensual · ' + som(cfgApp.precioMensual)), r('anual', 'Anual · ' + som(cfgApp.precioAnual)));
  }
  function nuevoCliente() {
    ventana((c, cerrar) => {
      let plan = 'mensual', tocado = false;
      const nombre = h('input', { id: 'nu-nombre', type: 'text', maxlength: 80, placeholder: 'Nombre del cliente (opcional)', autocomplete: 'off' });
      const usuario = h('input', { id: 'nu-usuario', type: 'text', maxlength: 24, placeholder: 'Usuario (p. ej. maria23)', autocapitalize: 'none', autocomplete: 'off', spellcheck: 'false' });
      const imp = h('input', { id: 'nu-importe', type: 'text', inputmode: 'numeric', value: String(precioDe(plan)) });
      const nota = h('input', { id: 'nu-nota', type: 'text', maxlength: 200, placeholder: 'Nota (cómo pagó, teléfono…)', autocomplete: 'off' });
      const err = h('div', { class: 'adm-err', role: 'alert' });
      nombre.addEventListener('input', () => { if (!tocado) usuario.value = sugerirUsuario(nombre.value); });
      usuario.addEventListener('input', () => { tocado = true; });
      const crear = h('button', { id: 'nu-crear', class: 'btn', type: 'submit' }, 'Crear y generar contraseña');
      c.append(h('h2', null, 'Nuevo cliente'), h('form', { class: 'form', onsubmit: (ev) => { ev.preventDefault(); ocupado(crear, async () => {
        err.textContent = '';
        const u = usuario.value.trim().toLowerCase(); const cantidad = importe(imp.value);
        if (!FB.usuarioValido(u)) { err.textContent = 'El usuario debe tener de 3 a 24 letras minúsculas, números, puntos, guiones o guiones bajos (sin espacios ni tildes).'; return; }
        if (!(cantidad >= 0)) { err.textContent = 'Escribe el importe pagado (solo números).'; return; }
        try {
          const clave = generarClave();
          const cuenta = await fb.registrar(emailDe(u), clave);
          const vence = nuevoVence(0, plan, Date.now());
          await fb.escribir([
            { op: 'crear', ruta: 'usuarios/' + cuenta.uid, datos: { usuario: u, nombre: nombre.value.trim(), plan, vence: new Date(vence), estado: 'activo', dispositivo: null, dispositivoNombre: null, ultimaVez: null, version: null, nota: nota.value.trim() }, hora: ['creado'] },
            { op: 'crear', ruta: 'usuarios/' + cuenta.uid + '/pagos/' + idPago(), datos: { plan, importe: cantidad, nota: 'Alta', venceAntes: null, venceDespues: new Date(vence) }, hora: ['fecha'] }
          ], await token());
          cerrar(); await recargar(); credenciales(u, clave, plan, vence);
        } catch (x) { err.textContent = mensaje(x); }
      }); } },
      h('label', null, 'Nombre', nombre), h('label', null, 'Usuario', usuario), h('div', { class: 'etq' }, 'Plan'), radiosPlan('nu', plan, (p) => { plan = p; imp.value = String(precioDe(p)); }),
      h('label', null, 'Importe pagado (soʻm)', imp), h('label', null, 'Nota', nota), err,
      h('div', { class: 'fila-btn' }, h('button', { id: 'nu-cancelar', class: 'btn blanco', type: 'button', onclick: cerrar }, 'Cancelar'), crear)));
    });
  }
  function credenciales(usuario, clave, plan, vence) {
    const web = CFG.web || '';
    const texto = 'Tu acceso a Anor\nUsuario: ' + usuario + '\nContraseña: ' + clave + '\nPlan ' + nombrePlan(plan).toLowerCase() + ' hasta el ' + fechaLarga(vence) + (web ? '\nDescarga la app: ' + web : '');
    ventana((c, cerrar) => c.append(h('div', { class: 'adm-cred' }, h('h2', null, 'Acceso creado'),
      h('div', { class: 'cred' }, h('div', null, h('span', { class: 'mut' }, 'Usuario'), h('b', null, usuario)), h('div', null, h('span', { class: 'mut' }, 'Contraseña'), h('b', { class: 'clave' }, clave))),
      h('p', { class: 'aviso' }, 'Apunta o envía la contraseña ahora: no se guarda en ningún sitio y no se puede volver a ver.'),
      h('pre', { class: 'msg' }, texto),
      h('div', { class: 'fila-btn' },
        h('button', { id: 'cred-copiar', class: 'btn azul', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(texto); toast('Mensaje copiado ✓'); } catch (e) { toast('No se pudo copiar: selecciónalo a mano'); } } }, 'Copiar mensaje'),
        h('button', { id: 'cred-cerrar', class: 'btn blanco', type: 'button', onclick: cerrar }, 'Hecho')))));
  }
  async function recargar() { await cargar(); pintarPanel(); }

  /* ----- ficha de un cliente ----- */
  async function ficha(uid) {
    const u = usuarios.find((x) => x.uid === uid); if (!u) return;
    let pagos = [];
    try { pagos = (await fb.listar('usuarios/' + uid + '/pagos', await token())).map((p) => Object.assign({}, p.datos, { fecha: ms(p.datos.fecha) })).sort((a, b) => b.fecha - a.fecha); } catch (e) { pagos = null; }
    const e = estadoDe(u);
    const fila = (k, v) => h('div', { class: 'fila' }, h('span', { class: 'mut' }, k), h('b', null, v));
    const accion = (id, txt, fn, cls) => h('button', { id, class: 'btn ' + (cls || 'blanco'), type: 'button', onclick: (ev) => ocupado(ev.currentTarget, fn) }, txt);
    const vista = h('section', { id: 'ficha', class: 'vista' },
      h('button', { class: 'volver', type: 'button', onclick: pintarPanel }, '← Volver a la lista'),
      h('h2', null, u.usuario, ' ', h('span', { class: 'chip ' + e.k }, e.t)), u.nombre ? h('p', { class: 'mut' }, u.nombre) : null,
      h('div', { class: 'tarjeta' },
        fila('Plan', nombrePlan(u.plan)), fila('Vence', fechaLarga(u.vence)), fila('Estado', u.estado === 'activo' ? 'Activo' : 'Bloqueado'),
        fila('Móvil', u.dispositivoNombre || (u.dispositivo ? 'Asignado' : 'Sin móvil asignado')), fila('Última conexión', fechaHora(u.ultimaVez)),
        fila('Versión de Anor', u.version ? '1.0.' + u.version : '—'), fila('Alta', fecha(u.creado)), u.nota ? fila('Nota', u.nota) : null,
        u.antes ? fila('Sustituye a', (usuarios.find((x) => x.uid === u.antes) || {}).usuario || u.antes) : null,
        u.despues ? fila('Sustituido por', (usuarios.find((x) => x.uid === u.despues) || {}).usuario || u.despues) : null),
      h('div', { class: 'acciones' },
        accion('f-renovar', 'Renovar o cambiar plan', () => renovar(u), ''),
        accion('f-bloquear', u.estado === 'activo' ? 'Bloquear' : 'Desbloquear', async () => {
          try { await fb.escribir([{ op: 'actualizar', ruta: 'usuarios/' + uid, datos: { estado: u.estado === 'activo' ? 'bloqueado' : 'activo' } }], await token()); await recargar(); ficha(uid); toast(u.estado === 'activo' ? 'Cliente bloqueado' : 'Cliente desbloqueado'); } catch (x) { toast(mensaje(x), 4000); }
        }),
        accion('f-liberar', 'Liberar móvil', async () => {
          if (!(await confirmar('¿Liberar el móvil de ' + u.usuario + '?', 'Podrá entrar en otro móvil. El móvil actual dejará de funcionar con esta cuenta cuando se conecte.', 'Liberar'))) return;
          try { await fb.escribir([{ op: 'actualizar', ruta: 'usuarios/' + uid, datos: { dispositivo: null, dispositivoNombre: null } }], await token()); await recargar(); ficha(uid); toast('Móvil liberado'); } catch (x) { toast(mensaje(x), 4000); }
        }),
        accion('f-acceso', 'Nuevo acceso (contraseña olvidada)', () => nuevoAcceso(u)),
        accion('f-eliminar', 'Eliminar cliente', async () => {
          if (!(await confirmar('¿Eliminar a ' + u.usuario + '?', 'Se borran su plan y sus pagos. No se puede deshacer. Si solo quieres cortar el acceso, usa «Bloquear».', 'Eliminar', true))) return;
          try {
            const ps = await fb.listar('usuarios/' + uid + '/pagos', await token());
            await fb.escribir([...ps.map((p) => ({ op: 'borrar', ruta: 'usuarios/' + uid + '/pagos/' + p.id })), { op: 'borrar', ruta: 'usuarios/' + uid }], await token());
            await recargar(); toast('Cliente eliminado');
          } catch (x) { toast(mensaje(x), 4000); }
        }, 'rojo')),
      h('h3', null, 'Pagos'),
      pagos === null ? h('p', { class: 'mut' }, 'No se pudieron cargar los pagos.') : pagos.length ? h('div', { class: 'tarjeta pagos' }, ...pagos.map((p) => h('div', { class: 'fila' }, h('span', { class: 'mut' }, fecha(p.fecha) + ' · ' + nombrePlan(p.plan) + (p.nota ? ' · ' + p.nota : '')), h('b', null, som(p.importe))))) : h('p', { class: 'mut' }, 'Sin pagos registrados.'));
    app().lastChild.replaceWith(vista);
    window.scrollTo(0, 0);
  }
  function renovar(u) {
    ventana((c, cerrar) => {
      let plan = u.plan === 'anual' ? 'anual' : 'mensual';
      const imp = h('input', { id: 'rn-importe', type: 'text', inputmode: 'numeric', value: String(precioDe(plan)) });
      const nota = h('input', { id: 'rn-nota', type: 'text', maxlength: 200, placeholder: 'Nota (opcional)' });
      const nv = h('p', { class: 'mut' });
      const err = h('div', { class: 'adm-err', role: 'alert' });
      const pinta = () => { nv.textContent = 'Nuevo vencimiento: ' + fechaLarga(nuevoVence(u.vence, plan, Date.now())) + (u.vence > Date.now() ? ' (se suma a lo que le quedaba)' : ''); };
      pinta();
      const ok = h('button', { id: 'rn-ok', class: 'btn', type: 'submit' }, 'Renovar');
      c.append(h('h2', null, 'Renovar a ' + u.usuario), h('form', { class: 'form', onsubmit: (ev) => { ev.preventDefault(); ocupado(ok, async () => {
        const cantidad = importe(imp.value); if (!(cantidad >= 0)) { err.textContent = 'Escribe el importe pagado (solo números).'; return; }
        const nuevo = nuevoVence(u.vence, plan, Date.now());
        try {
          await fb.escribir([
            { op: 'actualizar', ruta: 'usuarios/' + u.uid, datos: { plan, vence: new Date(nuevo) } },
            { op: 'crear', ruta: 'usuarios/' + u.uid + '/pagos/' + idPago(), datos: { plan, importe: cantidad, nota: nota.value.trim() || 'Renovación', venceAntes: u.vence ? new Date(u.vence) : null, venceDespues: new Date(nuevo) }, hora: ['fecha'] }
          ], await token());
          cerrar(); await recargar(); ficha(u.uid); toast('Renovado hasta el ' + fechaLarga(nuevo));
        } catch (x) { err.textContent = mensaje(x); }
      }); } }, h('div', { class: 'etq' }, 'Plan'), radiosPlan('rn', plan, (p) => { plan = p; imp.value = String(precioDe(p)); pinta(); }), nv,
      h('label', null, 'Importe pagado (soʻm)', imp), h('label', null, 'Nota', nota), err,
      h('div', { class: 'fila-btn' }, h('button', { id: 'rn-no', class: 'btn blanco', type: 'button', onclick: cerrar }, 'Cancelar'), ok)));
    });
  }
  function nuevoAcceso(u) {
    ventana((c, cerrar) => {
      const base = String(u.usuario || 'cliente').slice(0, 23);
      const prop = (() => { for (const suf of ['b', 'c', 'd', '2', '3', '4']) { const p = (base + suf).slice(-24); if (!usuarios.some((x) => x.usuario === p)) return p; } return base + 'x'; })();
      const usuario = h('input', { id: 'na-usuario', type: 'text', maxlength: 24, value: prop, autocapitalize: 'none', spellcheck: 'false' });
      const err = h('div', { class: 'adm-err', role: 'alert' });
      const ok = h('button', { id: 'na-ok', class: 'btn', type: 'submit' }, 'Crear acceso nuevo');
      c.append(h('h2', null, 'Nuevo acceso para ' + u.usuario),
        h('p', { class: 'mut' }, 'Firebase gratuito no deja cambiar la contraseña de otra persona. Se crea un usuario nuevo con el mismo plan y vencimiento, y el antiguo queda bloqueado. El progreso del cliente está en su móvil: no se pierde.'),
        h('form', { class: 'form', onsubmit: (ev) => { ev.preventDefault(); ocupado(ok, async () => {
          const nu = usuario.value.trim().toLowerCase();
          if (!FB.usuarioValido(nu)) { err.textContent = 'El usuario debe tener de 3 a 24 letras minúsculas, números, puntos, guiones o guiones bajos.'; return; }
          try {
            const clave = generarClave();
            const cuenta = await fb.registrar(emailDe(nu), clave);
            await fb.escribir([
              { op: 'crear', ruta: 'usuarios/' + cuenta.uid, datos: { usuario: nu, nombre: u.nombre || '', plan: u.plan === 'anual' ? 'anual' : 'mensual', vence: new Date(u.vence), estado: 'activo', dispositivo: null, dispositivoNombre: null, ultimaVez: null, version: null, nota: u.nota || '', antes: u.uid }, hora: ['creado'] },
              { op: 'actualizar', ruta: 'usuarios/' + u.uid, datos: { estado: 'bloqueado', despues: cuenta.uid, dispositivo: null, dispositivoNombre: null } }
            ], await token());
            cerrar(); await recargar(); credenciales(nu, clave, u.plan, u.vence);
          } catch (x) { err.textContent = mensaje(x); }
        }); } }, h('label', null, 'Usuario nuevo', usuario), err,
        h('div', { class: 'fila-btn' }, h('button', { id: 'na-no', class: 'btn blanco', type: 'button', onclick: cerrar }, 'Cancelar'), ok)));
    });
  }

  /* ----- precios, contacto y versión ----- */
  function vistaAjustes() {
    const men = h('input', { id: 'aj-mensual', type: 'text', inputmode: 'numeric', value: String(cfgApp.precioMensual) });
    const anu = h('input', { id: 'aj-anual', type: 'text', inputmode: 'numeric', value: String(cfgApp.precioAnual) });
    const con = h('input', { id: 'aj-contacto', type: 'text', maxlength: 300, value: cfgApp.contacto || '', placeholder: 'Telegram @usuario · +998 90 123 45 67' });
    const err = h('div', { class: 'adm-err', role: 'alert' });
    const guardar = async (cambios) => {
      const nuevo = Object.assign({ precioMensual: importe(men.value), precioAnual: importe(anu.value), contacto: con.value.trim(), versionMinima: cfgApp.versionMinima || 0 }, cambios || {});
      if (!(nuevo.precioMensual >= 0) || !(nuevo.precioAnual >= 0)) { err.textContent = 'Los precios deben ser números.'; return false; }
      try { await fb.escribir([{ op: 'set', ruta: 'config/app', datos: nuevo }], await token()); cfgApp = nuevo; err.textContent = ''; return true; } catch (x) { err.textContent = mensaje(x); return false; }
    };
    const bGuardar = h('button', { id: 'aj-guardar', class: 'btn', type: 'submit' }, 'Guardar');
    const v = version;
    return h('section', { id: 'ajustes', class: 'vista' },
      h('h2', null, 'Precios y contacto'),
      h('p', { class: 'mut' }, 'Se muestran en la app (pantalla de entrada, renovación y «Cuenta y plan») y en la página de descarga. Los cambios se ven al momento, sin sacar otra versión.'),
      h('form', { class: 'form', onsubmit: (ev) => { ev.preventDefault(); ocupado(bGuardar, async () => { if (await guardar()) { toast('Guardado ✓'); pintarPanel(); } }); } },
        h('label', null, 'Plan mensual (soʻm)', men), h('label', null, 'Plan anual (soʻm)', anu), h('label', null, 'Contacto para comprar o renovar', con), err, bGuardar),
      h('h2', null, 'Versión de la app'),
      h('div', { class: 'tarjeta' },
        h('div', { class: 'fila' }, h('span', { class: 'mut' }, 'Última publicada'), h('b', null, v ? (v.nombre || v.codigo) + ' · ' + fecha(v.publicada) : 'todavía ninguna')),
        h('div', { class: 'fila' }, h('span', { class: 'mut' }, 'Versión mínima obligatoria'), h('b', null, cfgApp.versionMinima ? '1.0.' + cfgApp.versionMinima : 'ninguna'))),
      h('p', { class: 'mut' }, 'Anor avisa sola de cada versión nueva. Si una versión tiene un problema grave, obliga a todos a actualizar a la última.'),
      v && v.codigo ? h('button', { id: 'aj-obligar', class: 'btn blanco', type: 'button', onclick: (ev) => ocupado(ev.currentTarget, async () => {
        if (!(await confirmar('¿Obligar a actualizar a la ' + (v.nombre || v.codigo) + '?', 'Quien tenga una versión anterior no podrá usar Anor hasta actualizar.', 'Obligar'))) return;
        if (await guardar({ versionMinima: v.codigo })) { toast('Versión mínima: ' + (v.nombre || v.codigo)); pintarPanel(); }
      }) }, 'Obligar a actualizar a la última versión') : null);
  }

  /* ---------------- arranque ---------------- */
  if (!CFG.apiKey || !CFG.projectId) { app().replaceChildren(h('div', { class: 'adm-err' }, 'Falta la configuración de Firebase (config.js).')); return; }
  ses = leerSes();
  if (ses) abrirPanel(); else pintarEntrada();
})();
