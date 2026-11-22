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
    env.DB.prepare('CREATE TABLE IF NOT EXISTS fails (ip TEXT NOT NULL, t INTEGER NOT NULL)'),
    // 6.11.2026 (the QA round): the questions' count per browser, per address and per coordinator, by the hour (api/chat.js)
    env.DB.prepare('CREATE TABLE IF NOT EXISTS hits (k TEXT NOT NULL, h INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (k, h))'),
    // 10.11.2026 (the Fable review, #4 and #5): a device's sign-in is a random token of its own, not the access code (see newSession)
    env.DB.prepare('CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, uid TEXT NOT NULL, name TEXT NOT NULL, admin INTEGER NOT NULL, ac TEXT, created INTEGER NOT NULL)')
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
// 10.11.2026 (the Fable review, #4 and #5): the sign-in cookie held the access code itself, and after 60 wrong codes from one
// address (a campus or office network) even a right code was refused and db.js then cleared the cookie: everyone on that
// network was signed out. Now a sign-in with a code that works gives the device a random token ("s." and 64 hex digits; only
// its hash is kept, table sessions). A token is checked first, is never counted as a wrong code and is not held back by the
// address's lock (it cannot be guessed); it stops working when the coordinator's code is replaced or revoked, when the head's
// code changes, at sign-out, and after a year. A typed code is checked as before, under the lock.
const SESSION = /^s\.[0-9a-f]{64}$/, YEAR = 365 * 864e5;
const adminMark = env => sha('ac|' + String(env.ADMIN_CODE || ''));
export async function newSession(env, u) {
  const token = 's.' + [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2, '0')).join('');
  await env.DB.prepare('INSERT INTO sessions (hash, uid, name, admin, ac, created) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(await sha(token), u.uid, u.name, u.admin ? 1 : 0, u.admin ? await adminMark(env) : null, Date.now()).run();
  if (Math.random() < 0.05) env.DB.prepare('DELETE FROM sessions WHERE created < ?').bind(Date.now() - YEAR).run().catch(() => {});
  return token;
}
export async function endSession(env, token) { if (env.DB && SESSION.test(String(token || ''))) { try { await setup(env); await env.DB.prepare('DELETE FROM sessions WHERE hash = ?').bind(await sha(token)).run(); } catch (_) {} } }
async function bySession(env, token) {
  if (!env.DB || !SESSION.test(token)) return null;
  await setup(env);
  const r = await env.DB.prepare('SELECT uid, name, admin, ac, created FROM sessions WHERE hash = ?').bind(await sha(token)).first();
  if (!r || r.created < Date.now() - YEAR) return null;
  if (r.admin) return env.ADMIN_CODE && r.ac === await adminMark(env) ? { uid: 'admin', name: 'רמ"ח', admin: true, via: 'session' } : null;
  const c = await env.DB.prepare('SELECT name FROM codes WHERE uid = ?').bind(r.uid).first();   // a revoked coordinator's devices are out
  return c ? { uid: r.uid, name: c.name, admin: false, via: 'session' } : null;
}
// is this address held back from trying codes right now (60 wrong ones within the hour)?
export async function locked(request, env) {
  if (!env.DB) return false;
  try { await setup(env); const f = await env.DB.prepare('SELECT COUNT(*) AS n FROM fails WHERE ip = ? AND t > ?').bind(request.headers.get('CF-Connecting-IP') || 'x', Date.now() - 3600e3).first(); return !!(f && f.n >= FAILS_PER_HOUR); } catch (_) { return false; }
}
export async function who(request, env) {
  // 10.11.2026: the device's token first (the cookie, or the header of a tool that keeps one)
  for (const tok of [codeCookie(request), String(request.headers.get('X-Code') || '').trim()]) if (SESSION.test(tok)) { const s = await bySession(env, tok); if (s) return s; }
  // the page sends the code URI-encoded (a header carries no Hebrew); an older page or tool sends it as is
  // or, when the page sends none, the sign-in cookie this device got at its last sign-in (4.11.2026): a coordinator signs in once per device
  const sent = (h => SESSION.test(h) ? '' : h)(String(request.headers.get('X-Code') || '').trim()) || codeCookie(request);
  let raw = sent; try { raw = decodeURIComponent(sent); } catch (_) {}
  if (!raw || raw.length > 200 || SESSION.test(raw)) return null;
  if (!env.DB) return env.ADMIN_CODE && (raw === env.ADMIN_CODE || sent === env.ADMIN_CODE) ? { uid: 'admin', name: 'רמ"ח', admin: true } : null;
  await setup(env);
  // wrong codes are counted per address: after 60 in an hour, no code is checked from it until the hour passes. 4.11.2026
  // (security review): the head's code too, so it cannot be guessed without limit
  const ip = request.headers.get('CF-Connecting-IP') || 'x', hour = Date.now() - 3600e3;
  const f = await env.DB.prepare('SELECT COUNT(*) AS n FROM fails WHERE ip = ? AND t > ?').bind(ip, hour).first();
  if (f && f.n >= FAILS_PER_HOUR) return null;
  if (env.ADMIN_CODE && (raw === env.ADMIN_CODE || sent === env.ADMIN_CODE)) return { uid: 'admin', name: 'רמ"ח', admin: true, via: 'code' };
  // 5.11.2026 (the blind review: the head's own code was the automation's secret too): two narrow tokens, each good for one job.
  // NOTIFY_TOKEN only counts new cases (/api/notify); BENCH_TOKEN only runs the comparison (?test, the bench page's memory log).
  // Neither reads or writes the log, the codes or the sheet. Until they are set, the automation keeps using the head's code
  if (env.NOTIFY_TOKEN && raw === env.NOTIFY_TOKEN) return { uid: 'notify', name: 'התראות', admin: false, notify: true };
  if (env.BENCH_TOKEN && raw === env.BENCH_TOKEN) return { uid: 'bench', name: 'בדיקות', admin: false, bench: true };
  const r = await env.DB.prepare('SELECT uid, name FROM codes WHERE hash = ?').bind(await sha(normCode(raw))).first();
  if (r) return { uid: r.uid, name: r.name, admin: false, via: 'code' };
  await env.DB.batch([env.DB.prepare('INSERT INTO fails (ip, t) VALUES (?, ?)').bind(ip, Date.now()), env.DB.prepare('DELETE FROM fails WHERE t < ?').bind(hour)]);
  return null;
}
// what the storage rules allow (as in the page inside Claude): log/<uid>/... is that coordinator's and the head's;
// data/users/<uid>/... is that person's alone; the list "log" and the shared "dir" and "answers" are the head's
export function allowed(u, path, write, op) {
  if (u.notify || u.bench) return false;   // the narrow tokens never reach the storage
  const s = String(path).split('/').filter(Boolean);
  if (!s.length || s.some(x => x === '.' || x === '..')) return false;
  if (s[0] === 'data' && s[1] === 'users') return s.length >= 3 && s[2] === u.uid;
  if (s[0] === 'log') { if (s.length === 1) return u.admin && !write; return u.admin || s[1] === u.uid; }
  // 10.11.2026 (the Fable review, #1): the coordinators' shared address book ("שמירה לכל הרכזים") was the head's alone here, so
  // a coordinator's save always failed and the addresses the head added never reached them. Every signed-in coordinator reads
  // it and adds an address; changing or deleting one stays the head's
  if (s[0] === 'dir') return u.admin || !write || (op === 'add' && s.length === 1);
  if (s[0] === 'answers') return u.admin;
  if (s[0] === 'fb') return u.admin;   // 5.11.2026: the public bot's feedback, for the head only
  if (s[0] === 'miss') return u.admin;   // 16.11.2026: the questions that were not found, for the head only
  if (s[0] === 'fail') return u.admin && op !== 'add' && op !== 'set' && op !== 'update';   // 22.11.2026: the log of the bot's failures; the head reads and deletes, only the server writes
  return false;
}

// 17.11.2026: the human check's pass (Cloudflare Turnstile, /api/human): a cookie "tkh" = <expiry>.<signature>, signed with the
// widget's secret; twelve hours. It says only that a check passed on this browser, nothing about who
export const HUMAN_COOKIE = 'tkh';
async function humanSig(env, exp) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(env.TURNSTILE_SECRET || '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const b = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('human|' + exp)));
  return [...b.slice(0, 16)].map(x => x.toString(16).padStart(2, '0')).join('');
}
export async function humanPass(env) { const exp = Date.now() + 12 * 3600e3; return exp + '.' + await humanSig(env, exp); }
export async function humanOk(request, env) {
  try {
    const m = /(?:^|;\s*)tkh=(\d{13})\.([0-9a-f]{32})(?:;|$)/.exec(request.headers.get('Cookie') || '');
    if (!m || Number(m[1]) < Date.now()) return false;
    return (await humanSig(env, m[1])) === m[2];
  } catch (_) { return false; }
}

// 22.11.2026 (Yoni: "צור לי לשונית תחת ניהול בה יהיה כתוב תיעוד של פעמים שהבוט לא מצליח לתפקד", "ושיהיה הסבר למה ופירוט בכל
// הניתן"): every time a bot could not answer, one row (docs, path fail/<id>; the head alone reads it, in the "תקלות" tab of
// "ניהול"). What is kept: when, which bot, what kind of failure, the status and the error text the model's service returned,
// the model, the route (gateway or direct), how long it took, the kind of device, and for a signed-in coordinator the name.
// Never the question or the answer. Identity numbers, e-mail addresses and keys are scrubbed from the error text.
// At most 40 rows of one kind in an hour (a credit that ran out fails every question), kept 180 days.
const failScrub = (s) => String(s == null ? '' : s).replace(/sk-or-[\w-]+/g, '[מפתח הוסר]').replace(/Bearer\s+\S+/gi, '[מפתח הוסר]').replace(/\b\d{9}\b/g, '[ת״ז הוסרה]').replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[מייל הוסר]').replace(/\s+/g, ' ').trim();
export const botOf = (request) => { try { return /^\/coord/.test(new URL(request.headers.get('Referer') || '').pathname) ? 'coord' : 'public'; } catch (_) { return 'public'; } };
export const deviceOf = (request) => { const u = request.headers.get('User-Agent') || '';
  const os = /iPhone|iPad/.test(u) ? 'אייפון' : /Android/.test(u) ? 'אנדרואיד' : /Macintosh/.test(u) ? 'מק' : /Windows/.test(u) ? 'חלונות' : /Linux/.test(u) ? 'לינוקס' : 'לא ידוע';
  const br = /Edg\//.test(u) ? 'אדג׳' : /CriOS|Chrome\//.test(u) ? 'כרום' : /Firefox|FxiOS/.test(u) ? 'פיירפוקס' : /Safari\//.test(u) ? 'ספארי' : '';
  return os + (br ? ', ' + br : ''); };
// which kind of failure a status of the model's service is
export function failKind(status, body) {
  const b = String(body || '');
  if (status === 402) return 'credit';
  if (/data policy|No endpoints found|no allowed providers|No allowed providers/i.test(b)) return 'policy';
  if (status === 401) return 'key';
  if (status === 403) return /moderation|flagged/i.test(b) ? 'moderation' : /limit|credit|quota/i.test(b) ? 'credit' : 'key';
  if (status === 429) return 'upstream-rate';
  if (status === 408 || status === 504 || status === 524) return 'timeout';
  if (status >= 500) return 'provider';
  return 'other';
}
export async function failLog(env, ev) {
  try {
    if (!env || !env.DB) return;
    await setup(env);
    const now = Date.now(), kind = String(ev.kind || 'other').replace(/[^a-z-]/g, '').slice(0, 24) || 'other';
    const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM docs WHERE coll = 'fail' AND t > ? AND data LIKE ?").bind(now - 3600e3, '%"kind":"' + kind + '"%').first();
    if (c && c.n >= 40) return;
    const at = Number(ev.at) > now - 7 * 864e5 && Number(ev.at) <= now ? Number(ev.at) : now;
    const data = { t0: new Date(at).toISOString(), src: ev.src === 'page' ? 'page' : 'server', bot: ev.bot === 'coord' ? 'coord' : 'public', kind,
      status: Number(ev.status) || 0, model: String(ev.model || '').slice(0, 80), via: String(ev.via || '').slice(0, 200), ms: Math.max(0, Math.min(36e5, Number(ev.ms) || 0)),
      stream: ev.stream === true, got: ev.got === true, online: ev.online !== false, who: failScrub(ev.who).slice(0, 60), device: String(ev.device || '').slice(0, 40),
      build: String(ev.build || '').replace(/[^0-9a-f]/g, '').slice(0, 8), msg: failScrub(ev.msg).slice(0, 700) };
    if (at !== now) data.sent = new Date(now).toISOString();
    await env.DB.prepare('INSERT INTO docs (path, coll, data, t) VALUES (?, ?, ?, ?)').bind('fail/' + now.toString(36) + Math.random().toString(36).slice(2, 6), 'fail', JSON.stringify(data), now).run();
    if (Math.random() < 0.02) await env.DB.prepare("DELETE FROM docs WHERE coll = 'fail' AND t < ?").bind(now - 180 * 864e5).run();
  } catch (_) {}
}
