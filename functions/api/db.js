// The coordinators' storage (3.11.2026): the same calls the page makes inside Claude (doc get/set/update/delete,
// collection add/orderBy/limit/get), kept in Cloudflare D1. POST { op, path, data?, order?, dir?, limit? } with X-Code.
import { text, json, setup, who, allowed, codeCookie, setCookie } from '../_lib.js';
const segs = p => String(p).split('/').filter(Boolean);
// 4.11.2026 (Yoni's decision): a closed case is kept for one year from its closing, then removed with its steps and its
// private record. Checked at most every six hours by each server copy, on the next call
let swept = 0;
async function sweep(env) {
  const now = Date.now();
  if (now - swept < 6 * 3600e3) return;
  swept = now;
  try {
    const cut = new Date(now - 365 * 864e5).toISOString();
    const rows = (await env.DB.prepare("SELECT path FROM docs WHERE coll LIKE 'log/%/cases' AND json_extract(data, '$.status') = 'closed' AND json_extract(data, '$.statusT') < ?").bind(cut).all()).results || [];
    for (const r of rows) {
      const [, uid, , id] = segs(r.path), priv = 'data/users/' + uid + '/priv/cases/' + id;
      await env.DB.prepare('DELETE FROM docs WHERE path = ? OR path LIKE ? OR path = ? OR path LIKE ?').bind(r.path, r.path + '/%', priv, priv + '/%').run();
    }
    // 5.11.2026: the public bot's feedback is kept for one year
    await env.DB.prepare("DELETE FROM docs WHERE coll = 'fb' AND t < ?").bind(now - 365 * 864e5).run();
  } catch (_) {}
}
export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return text('forbidden', 403);
  if (!env.DB) return text('the storage is not connected yet (binding DB)', 503);
  let b; try { b = await request.json(); } catch (_) { return text('bad request', 400); }
  // signing out on this device clears its sign-in cookie (4.11.2026)
  if (b && b.op === 'logout') { const r = json({ ok: true }); r.headers.append('Set-Cookie', setCookie('')); return r; }
  const u = await who(request, env);
  if (!u) { const r = text('sign in', 401); if (codeCookie(request)) r.headers.append('Set-Cookie', setCookie('')); return r; }
  const op = b.op, path = segs(b.path || '').join('/');
  if (op === 'me') {
    // a sign-in with a code that works: this device keeps it in a cookie, so the next visits (also as an installed app) need no code
    const r = json({ uid: u.uid, name: u.name, admin: u.admin });
    const sent = String(request.headers.get('X-Code') || '').trim();
    if (sent && /^[A-Za-z0-9%._~-]{1,600}$/.test(sent)) r.headers.append('Set-Cookie', setCookie(sent));
    return r;
  }
  const write = ['set', 'update', 'delete', 'add'].includes(op);
  if (!allowed(u, path, write)) return json({ code: 'permission_denied' }, 403);
  await setup(env);
  await sweep(env);
  const n = segs(path).length, now = Date.now();
  if (op === 'get') {
    if (n % 2) return text('a document path', 400);
    const r = await env.DB.prepare('SELECT data FROM docs WHERE path = ?').bind(path).first();
    return json({ exists: !!r, data: r ? JSON.parse(r.data) : null });
  }
  if (op === 'set' || op === 'update') {
    if (n % 2) return text('a document path', 400);
    const data = b.data && typeof b.data === 'object' ? b.data : {};
    const s = JSON.stringify(data); if (s.length > 900000) return text('too large', 413);
    const coll = segs(path).slice(0, -1).join('/');
    if (op === 'set') { await env.DB.prepare('INSERT OR REPLACE INTO docs (path, coll, data, t) VALUES (?, ?, ?, ?)').bind(path, coll, s, now).run(); return json({ ok: true }); }
    const r = await env.DB.prepare('SELECT data FROM docs WHERE path = ?').bind(path).first();
    if (!r) return json({ code: 'invalid_argument', message: 'missing' }, 404);
    const merged = Object.assign(JSON.parse(r.data), data);
    await env.DB.prepare('UPDATE docs SET data = ?, t = ? WHERE path = ?').bind(JSON.stringify(merged), now, path).run();
    return json({ ok: true });
  }
  if (op === 'delete') {
    await env.DB.prepare('DELETE FROM docs WHERE path = ? OR path LIKE ?').bind(path, path + '/%').run();
    // 5.11.2026 (the blind review: a case the head deleted left the student's message in its private record): from the preview
    // copy (X-Preview), a deleted case takes its private record with it, as the yearly sweep already does
    const sg = segs(path);
    if (request.headers.get('X-Preview') === '1' && sg.length === 4 && sg[0] === 'log' && sg[2] === 'cases') {
      const priv = 'data/users/' + sg[1] + '/priv/cases/' + sg[3];
      await env.DB.prepare('DELETE FROM docs WHERE path = ? OR path LIKE ?').bind(priv, priv + '/%').run();
    }
    return json({ ok: true });
  }
  if (op === 'add') {
    if (n % 2 === 0) return text('a collection path', 400);
    const id = 'a' + crypto.randomUUID().replace(/-/g, '').slice(0, 19);
    const s = JSON.stringify(b.data || {}); if (s.length > 900000) return text('too large', 413);
    await env.DB.prepare('INSERT INTO docs (path, coll, data, t) VALUES (?, ?, ?, ?)').bind(path + '/' + id, path, s, now).run();
    return json({ id });
  }
  if (op === 'list') {
    if (n % 2 === 0) return text('a collection path', 400);
    const lim = Math.max(1, Math.min(Number(b.limit) || 500, 2000));
    const rows = (await env.DB.prepare('SELECT path, data FROM docs WHERE coll = ?').bind(path).all()).results || [];
    let ds = rows.map(r => ({ id: r.path.split('/').pop(), data: JSON.parse(r.data) }));
    if (b.order) { const f = String(b.order), asc = b.dir === 'asc'; ds.sort((x, y) => { const a = x.data[f], c = y.data[f]; const k = (a == null ? '' : String(a)).localeCompare(c == null ? '' : String(c)); return asc ? k : -k; }); }
    return json({ docs: ds.slice(0, lim) });
  }
  return text('unknown op', 400);
}
