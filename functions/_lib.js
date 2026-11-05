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
// 4.11.2026 (security review): 20 locked every coordinator on the campus network after a few mistyped codes; the codes are long
// (a name, a word and a number), so 60 wrong ones an hour per address still leaves guessing out of reach
const FAILS_PER_HOUR = 60;
// the sign-in cookie: HttpOnly (the page's scripts cannot read it), sent only to this site, kept for a year
export const COOKIE = 'tkc';
export function codeCookie(request) {
  const m = String(request.headers.get('Cookie') || '').match(/(?:^|;\s*)tkc=([^;]*)/);
  return m ? m[1].trim() : '';
}
export const setCookie = v => COOKIE + '=' + v + '; Path=/; Max-Age=' + (v ? 31536000 : 0) + '; HttpOnly; Secure; SameSite=Strict';
export async function who(request, env) {
  // the page sends the code URI-encoded (a header carries no Hebrew); an older page or tool sends it as is
  // or, when the page sends none, the sign-in cookie this device got at its last sign-in (4.11.2026): a coordinator signs in once per device
  const sent = String(request.headers.get('X-Code') || '').trim() || codeCookie(request);
  let raw = sent; try { raw = decodeURIComponent(sent); } catch (_) {}
  if (!raw || raw.length > 200) return null;
  if (!env.DB) return env.ADMIN_CODE && (raw === env.ADMIN_CODE || sent === env.ADMIN_CODE) ? { uid: 'admin', name: 'רמ"ח', admin: true } : null;
  await setup(env);
  // wrong codes are counted per address: after 60 in an hour, no code is checked from it until the hour passes. 4.11.2026
  // (security review): the head's code too, so it cannot be guessed without limit
  const ip = request.headers.get('CF-Connecting-IP') || 'x', hour = Date.now() - 3600e3;
  const f = await env.DB.prepare('SELECT COUNT(*) AS n FROM fails WHERE ip = ? AND t > ?').bind(ip, hour).first();
  if (f && f.n >= FAILS_PER_HOUR) return null;
  if (env.ADMIN_CODE && (raw === env.ADMIN_CODE || sent === env.ADMIN_CODE)) return { uid: 'admin', name: 'רמ"ח', admin: true };
  // 5.11.2026 (the blind review: the head's own code was the automation's secret too): two narrow tokens, each good for one job.
  // NOTIFY_TOKEN only counts new cases (/api/notify); BENCH_TOKEN only runs the comparison (?test, the bench page's memory log).
  // Neither reads or writes the log, the codes or the sheet. Until they are set, the automation keeps using the head's code
  if (env.NOTIFY_TOKEN && raw === env.NOTIFY_TOKEN) return { uid: 'notify', name: 'התראות', admin: false, notify: true };
  if (env.BENCH_TOKEN && raw === env.BENCH_TOKEN) return { uid: 'bench', name: 'בדיקות', admin: false, bench: true };
  const r = await env.DB.prepare('SELECT uid, name FROM codes WHERE hash = ?').bind(await sha(normCode(raw))).first();
  if (r) return { uid: r.uid, name: r.name, admin: false };
  await env.DB.batch([env.DB.prepare('INSERT INTO fails (ip, t) VALUES (?, ?)').bind(ip, Date.now()), env.DB.prepare('DELETE FROM fails WHERE t < ?').bind(hour)]);
  return null;
}
// what the storage rules allow (as in the page inside Claude): log/<uid>/... is that coordinator's and the head's;
// data/users/<uid>/... is that person's alone; the list "log" and the shared "dir" and "answers" are the head's
export function allowed(u, path, write) {
  if (u.notify || u.bench) return false;   // the narrow tokens never reach the storage
  const s = String(path).split('/').filter(Boolean);
  if (!s.length || s.some(x => x === '.' || x === '..')) return false;
  if (s[0] === 'data' && s[1] === 'users') return s.length >= 3 && s[2] === u.uid;
  if (s[0] === 'log') { if (s.length === 1) return u.admin && !write; return u.admin || s[1] === u.uid; }
  if (s[0] === 'dir' || s[0] === 'answers') return u.admin;
  return false;
}
