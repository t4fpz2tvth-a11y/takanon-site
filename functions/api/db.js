// The coordinators' storage (3.11.2026): the same calls the page makes inside Claude (doc get/set/update/delete,
// collection add/orderBy/limit/get), kept in Cloudflare D1. POST { op, path, data?, order?, dir?, limit? } with X-Code.
import { text, json, setup, who, allowed } from '../_lib.js';
const segs = p => String(p).split('/').filter(Boolean);
export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return text('forbidden', 403);
  if (!env.DB) return text('the storage is not connected yet (binding DB)', 503);
  const u = await who(request, env);
  if (!u) return text('sign in', 401);
  let b; try { b = await request.json(); } catch (_) { return text('bad request', 400); }
  const op = b.op, path = segs(b.path || '').join('/');
  if (op === 'me') return json({ uid: u.uid, name: u.name, admin: u.admin });
  const write = ['set', 'update', 'delete', 'add'].includes(op);
  if (!allowed(u, path, write)) return json({ code: 'permission_denied' }, 403);
  await setup(env);
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
  if (op === 'delete') { await env.DB.prepare('DELETE FROM docs WHERE path = ? OR path LIKE ?').bind(path, path + '/%').run(); return json({ ok: true }); }
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
