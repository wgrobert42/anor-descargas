/* descargar.js — página pública de descarga: enlace a la última versión (Releases del repositorio público) y precios
   actuales (config/app de Firestore, de lectura pública). Todo se pinta como texto. */
'use strict';
(function () {
  const CFG = window.ANOR_CFG || {};
  const a = document.getElementById('descargar');
  if (CFG.apk) a.href = CFG.apk; else a.removeAttribute('href');
  const box = document.getElementById('precios');
  const som = (n) => (typeof n === 'number' && isFinite(n) ? String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' soʻm' : '—');
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  if (!CFG.apiKey || !CFG.projectId || !window.FB) { box.remove(); return; }
  FB.cliente({ apiKey: CFG.apiKey, projectId: CFG.projectId, timeout: 10000 }).leer('config/app', null).then((r) => {
    if (!r) { box.remove(); return; }
    const d = r.datos;
    const fila = (k, v) => { const f = el('div', 'pub-pl'); f.append(el('span', null, k), el('b', null, som(v))); return f; };
    box.replaceChildren(el('h2', null, 'Planes'), fila('Mensual', d.precioMensual), fila('Anual', d.precioAnual));
    if (d.contacto) { const p = el('p', 'mut', 'Para comprar o renovar: '); p.append(el('b', null, d.contacto)); box.append(p); }
  }).catch(() => box.remove());
})();
