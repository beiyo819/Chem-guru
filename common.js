const $ = (s, r = document) => r.querySelector(s);
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let DOING = '';
async function api(path, method = 'GET', body) {
  const h = {}; if (body !== undefined) h['Content-Type'] = 'application/json'; if (DOING) h['x-doing'] = encodeURIComponent(DOING);
  const r = await fetch('/api' + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (!r.ok) { const e = new Error(j.error || 'Request failed'); e.status = r.status; throw e; }
  return j;
}
function toast(m, bad) { let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); } t.textContent = m; t.style.background = bad ? 'var(--bad)' : ''; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 3200); }
const when = t => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
function countdown(ms) { if (ms <= 0) return 'Expired'; const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), p = n => String(n).padStart(2, '0'); return `${d}d ${p(Math.floor(s % 86400 / 3600))}:${p(Math.floor(s % 3600 / 60))}:${p(s % 60)}`; }
setInterval(() => document.querySelectorAll('[data-end]').forEach(e => { const ms = +e.dataset.end - Date.now(); e.textContent = countdown(ms); e.classList.toggle('exp', ms <= 0); }), 1000);
const wrap = fn => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message, true); } };
