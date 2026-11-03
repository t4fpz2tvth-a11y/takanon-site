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
    env.DB.prepare('CREATE TABLE IF NOT EXISTS codes (hash TEXT PRIMARY KEY, uid TEXT NOT NULL, name TEXT NOT NULL, created INTEGER NOT NULL)')
  ]);
  ready = true;
}
// who is asking: { uid, name, admin } or null
export async function who(request, env) {
  const code = String(request.headers.get('X-Code') || '').trim();
  if (!code || code.length > 200) return null;
  if (env.ADMIN_CODE && code === env.ADMIN_CODE) return { uid: 'admin', name: 'רמ"ח', admin: true };
  if (!env.DB) return null;
  await setup(env);
  const r = await env.DB.prepare('SELECT uid, name FROM codes WHERE hash = ?').bind(await sha(code)).first();
  return r ? { uid: r.uid, name: r.name, admin: false } : null;
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
