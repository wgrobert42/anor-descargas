/* fb.js — Firebase por REST, sin SDK: Authentication (Identity Toolkit + Secure Token) y Cloud Firestore.
   Lo comparten Anor (acceso.js), el panel de administración (panel/) y los scripts de la compilación (Node 18+).
   Los errores se devuelven como FB.Fallo con un código corto en español (ver falloAuth / falloFs). */
(function (G) {
  'use strict';
  const AUTH = 'https://identitytoolkit.googleapis.com/v1/';
  const TOKEN = 'https://securetoken.googleapis.com/v1/token';
  const FS = 'https://firestore.googleapis.com/v1/';

  class Fallo extends Error {
    constructor(code, detalle, status) {
      super(code + (detalle ? ': ' + detalle : ''));
      this.name = 'Fallo'; this.code = code; this.detalle = detalle || ''; this.status = status || 0;
    }
  }

  /* ---------- valores de Firestore ↔ JavaScript (fechas como Date) ---------- */
  function aValor(v) {
    if (v === null || v === undefined) return { nullValue: null };
    if (v instanceof Date) return { timestampValue: v.toISOString() };
    if (Array.isArray(v)) return { arrayValue: v.length ? { values: v.map(aValor) } : {} };
    switch (typeof v) {
      case 'boolean': return { booleanValue: v };
      case 'number': return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
      case 'string': return { stringValue: v };
      case 'object': return { mapValue: { fields: aCampos(v) } };
      default: throw new Fallo('otro', 'valor no admitido: ' + typeof v);
    }
  }
  function aCampos(o) { const f = {}; for (const k of Object.keys(o || {})) if (o[k] !== undefined) f[k] = aValor(o[k]); return f; }
  function deValor(x) {
    if (!x || typeof x !== 'object') return null;
    if ('nullValue' in x) return null;
    if ('booleanValue' in x) return !!x.booleanValue;
    if ('integerValue' in x) return Number(x.integerValue);
    if ('doubleValue' in x) return Number(x.doubleValue);
    if ('stringValue' in x) return x.stringValue;
    if ('timestampValue' in x) return new Date(x.timestampValue);
    if ('arrayValue' in x) return ((x.arrayValue && x.arrayValue.values) || []).map(deValor);
    if ('mapValue' in x) return deCampos((x.mapValue && x.mapValue.fields) || {});
    if ('referenceValue' in x) return x.referenceValue;
    return null;
  }
  function deCampos(f) { const o = {}; for (const k of Object.keys(f || {})) o[k] = deValor(f[k]); return o; }

  /* ---------- tokens ---------- */
  function b64uTexto(s) {
    s = String(s || '').replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
    const bin = atob(s); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function jwt(t) { try { return JSON.parse(b64uTexto(String(t).split('.')[1])); } catch (e) { return {}; } }

  /* ---------- usuarios: «maria23» → maria23@<proyecto>.firebaseapp.com (con @ se usa tal cual: así entra el administrador) ---------- */
  const RE_USUARIO = /^[a-z0-9._-]{3,24}$/;
  const usuarioValido = (u) => RE_USUARIO.test(String(u == null ? '' : u));
  function emailDeUsuario(u, projectId) { const s = String(u == null ? '' : u).trim().toLowerCase(); return s.includes('@') ? s : s + '@' + projectId + '.firebaseapp.com'; }

  /* ---------- errores ---------- */
  function falloAuth(msg, status) {
    const m = String(msg || '').toUpperCase();
    const code = /INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND|INVALID_EMAIL|MISSING_PASSWORD|MISSING_EMAIL/.test(m) ? 'credenciales'
      : /USER_DISABLED/.test(m) ? 'deshabilitado'
      : /TOO_MANY_ATTEMPTS/.test(m) ? 'demasiados'
      : /TOKEN_EXPIRED|INVALID_REFRESH_TOKEN|USER_NOT_FOUND|INVALID_ID_TOKEN|CREDENTIAL_TOO_OLD|MISSING_REFRESH_TOKEN/.test(m) ? 'sesion'
      : /EMAIL_EXISTS/.test(m) ? 'existe'
      : /WEAK_PASSWORD|PASSWORD_DOES_NOT_MEET/.test(m) ? 'debil'
      : /OPERATION_NOT_ALLOWED|ADMIN_ONLY_OPERATION|API KEY|API_KEY|PROJECT_NOT_FOUND|CONFIGURATION_NOT_FOUND|PERMISSION_DENIED|BLOCKED/.test(m) ? 'config'
      : status >= 500 ? 'servidor' : 'otro';
    return new Fallo(code, msg || 'HTTP ' + status, status);
  }
  function falloFs(status, err) {
    const st = String((err && err.status) || ''); const msg = (err && err.message) || 'HTTP ' + status;
    const code = status === 403 || st === 'PERMISSION_DENIED' ? 'permiso'
      : status === 401 || st === 'UNAUTHENTICATED' ? 'sesion'
      : status === 404 || st === 'NOT_FOUND' ? 'no-existe'
      : status === 409 || st === 'ALREADY_EXISTS' || st === 'ABORTED' || st === 'FAILED_PRECONDITION' ? 'conflicto'
      : status >= 500 || status === 429 || st === 'UNAVAILABLE' || st === 'DEADLINE_EXCEEDED' || st === 'RESOURCE_EXHAUSTED' ? 'servidor'
      : /API KEY/i.test(msg) ? 'config' : 'otro';
    return new Fallo(code, msg, status);
  }

  /* fetch con tiempo máximo; cualquier fallo de transporte es «red» */
  async function pedir(f, url, init, timeout) {
    const ac = typeof AbortController === 'function' ? new AbortController() : null;
    const tm = ac ? setTimeout(() => ac.abort(), timeout) : null;
    try {
      let res;
      try { res = await f(url, Object.assign({}, init, ac ? { signal: ac.signal } : {})); }
      catch (e) { throw new Fallo('red', (e && e.message) || 'sin conexión'); }
      let body = null; try { body = await res.json(); } catch (e) { body = null; }
      return { status: res.status, ok: !!res.ok, body };
    } finally { if (tm) clearTimeout(tm); }
  }

  function cliente(o) {
    const f = o.fetch || (typeof fetch === 'function' ? fetch.bind(G) : null);
    const timeout = o.timeout || 15000;
    const key = encodeURIComponent(o.apiKey || '');
    const FSB = o.fsBase || FS; /* otra base (p. ej. el emulador de Firestore en las pruebas) */
    const root = 'projects/' + o.projectId + '/databases/(default)/documents';
    const docName = (ruta) => root + '/' + ruta;
    const enc = (ruta) => String(ruta).split('/').map(encodeURIComponent).join('/');
    const hdr = (token, extra) => Object.assign(token ? { Authorization: 'Bearer ' + token } : {}, extra || {});
    const sesion = (idToken, refresh, uid) => { const p = jwt(idToken); return { uid: uid || p.user_id || p.sub || '', idToken, refresh, iat: (p.iat || 0) * 1000, exp: (p.exp || 0) * 1000 }; };
    const doc = (d) => ({ id: String(d.name || '').split('/').pop(), datos: deCampos(d.fields), actualizado: d.updateTime ? new Date(d.updateTime) : null });
    async function auth(ruta, body) {
      const r = await pedir(f, AUTH + ruta + '?key=' + key, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, timeout);
      if (!r.ok) throw falloAuth(r.body && r.body.error && r.body.error.message, r.status);
      return r.body || {};
    }
    return {
      docName,
      async entrar(email, password) { const b = await auth('accounts:signInWithPassword', { email, password, returnSecureToken: true }); return sesion(b.idToken, b.refreshToken, b.localId); },
      async registrar(email, password) { const b = await auth('accounts:signUp', { email, password, returnSecureToken: true }); return sesion(b.idToken, b.refreshToken, b.localId); },
      async renovar(refresh) {
        const r = await pedir(f, TOKEN + '?key=' + key, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(refresh || '') }, timeout);
        if (!r.ok) throw falloAuth(r.body && r.body.error && r.body.error.message, r.status);
        const b = r.body || {}; return sesion(b.id_token, b.refresh_token, b.user_id);
      },
      /* documento → {id, datos, actualizado} o null si no existe */
      async leer(ruta, token) {
        const r = await pedir(f, FSB + root + '/' + enc(ruta), { method: 'GET', headers: hdr(token) }, timeout);
        if (r.status === 404) return null;
        if (!r.ok) throw falloFs(r.status, r.body && r.body.error);
        return doc(r.body || {});
      },
      /* colección entera (todas las páginas) → [{id, datos, actualizado}] */
      async listar(col, token) {
        const out = []; let page = '';
        for (let i = 0; i < 200; i++) {
          const r = await pedir(f, FSB + root + '/' + enc(col) + '?pageSize=300' + (page ? '&pageToken=' + encodeURIComponent(page) : ''), { method: 'GET', headers: hdr(token) }, timeout);
          if (!r.ok) throw falloFs(r.status, r.body && r.body.error);
          const b = r.body || {};
          for (const d of b.documents || []) out.push(doc(d));
          page = b.nextPageToken; if (!page) break;
        }
        return out;
      },
      /* escrituras atómicas: {op:'crear'|'actualizar'|'set'|'borrar', ruta, datos, campos?, hora?:[campo con la hora del servidor]} */
      async escribir(ws, token) {
        const writes = ws.map((w) => {
          const name = docName(w.ruta);
          if (w.op === 'borrar') return { delete: name };
          const x = { update: { name, fields: aCampos(w.datos || {}) } };
          if (w.op === 'actualizar') { x.updateMask = { fieldPaths: w.campos || Object.keys(w.datos || {}) }; x.currentDocument = { exists: true }; }
          else if (w.op === 'crear') x.currentDocument = { exists: false };
          else if (w.op !== 'set') throw new Fallo('otro', 'operación desconocida: ' + w.op);
          if (w.hora && w.hora.length) x.updateTransforms = w.hora.map((c) => ({ fieldPath: c, setToServerValue: 'REQUEST_TIME' }));
          return x;
        });
        const r = await pedir(f, FSB + root + ':commit', { method: 'POST', headers: hdr(token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ writes }) }, timeout);
        if (!r.ok) throw falloFs(r.status, r.body && r.body.error);
        return r.body || {};
      }
    };
  }

  const FB = { cliente, aValor, deValor, aCampos, deCampos, jwt, Fallo, emailDeUsuario, usuarioValido };
  G.FB = FB;
  if (typeof module !== 'undefined' && module.exports) module.exports = FB;
})(typeof window !== 'undefined' ? window : globalThis);
