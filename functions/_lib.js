// Shared by the coordinators' server functions (3.11.2026): the access codes and the storage (Cloudflare D1, binding DB).
// A coordinator signs in with a personal access code that the head of academics (רמ"ח) creates; his own code is the
// secret ADMIN_CODE. Codes are kept only as their SHA-256 hash.
export const text = (s, status = 200) => new Response(s, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
export const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
export async function sha(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
let ready = false;
export async function setup(env) {
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS docs (path TEXT PRIMARY KEY, coll TEXT NOT NULL, data TEXT NOT NULL, t INTEGER NOT NULL)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS docs_coll ON docs (coll)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS codes (hash TEXT PRIMARY KEY, uid TEXT NOT NULL, name TEXT NOT NULL, created INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS fails (ip TEXT NOT NULL, t INTEGER NOT NULL)')
  ]);
  ready = true;
}
// who is asking: { uid, name, admin } or null
// a code as typed: spaces dropped, any dash made "-", Latin letters lowercase (3.11.2026: codes made of the coordinator's
// name, a word and a number, easy to type on a phone)
export const normCode = s => String(s || '').trim().replace(/\s+/g, '').replace(/[\u05BE\u2010-\u2015_]/g, '-').toLowerCase();
const FAILS_PER_HOUR = 20;
export async function who(request, env) {
  // the page sends the code URI-encoded (a header carries no Hebrew); an older page or tool sends it as is
  const sent = String(request.headers.get('X-Code') || '').trim();
  let raw = sent; try { raw = decodeURIComponent(sent); } catch (_) {}
  if (!raw || raw.length > 200) return null;
  if (env.ADMIN_CODE && (raw === env.ADMIN_CODE || sent === env.ADMIN_CODE)) return { uid: 'admin', name: 'רמ"ח', admin: true };
  if (!env.DB) return null;
  await setup(env);
  // wrong codes are counted per address: after 20 in an hour, no code is checked from it until the hour passes
  const ip = request.headers.get('CF-Connecting-IP') || 'x', hour = Date.now() - 3600e3;
  const f = await env.DB.prepare('SELECT COUNT(*) AS n FROM fails WHERE ip = ? AND t > ?').bind(ip, hour).first();
  if (f && f.n >= FAILS_PER_HOUR) return null;
  const r = await env.DB.prepare('SELECT uid, name FROM codes WHERE hash = ?').bind(await sha(normCode(raw))).first();
  if (r) return { uid: r.uid, name: r.name, admin: false };
  await env.DB.batch([env.DB.prepare('INSERT INTO fails (ip, t) VALUES (?, ?)').bind(ip, Date.now()), env.DB.prepare('DELETE FROM fails WHERE t < ?').bind(hour)]);
  return null;
}
// what the storage rules allow (as in the page inside Claude): log/<uid>/... is that coordinator's and the head's;
// data/users/<uid>/... is that person's alone; the list "log" and the shared "dir" and "answers" are the head's
export function allowed(u, path, write) {
  const s = String(path).split('/').filter(Boolean);
  if (!s.length || s.some(x => x === '.' || x === '..')) return false;
  if (s[0] === 'data' && s[1] === 'users') return s.length >= 3 && s[2] === u.uid;
  if (s[0] === 'log') { if (s.length === 1) return u.admin && !write; return u.admin || s[1] === u.uid; }
  if (s[0] === 'dir' || s[0] === 'answers') return u.admin;
  return false;
}
