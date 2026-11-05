// Feedback from the public bot and from the coordinators' bot (5.11.2026, Yoni: "לשונית שמגיעה לרמ"ח בתוך בוט הרכזים"): a student's rating of an answer
// (כן / חלקית / לא) and an optional sentence, with no name. Anyone may send; only the head reads them (the "fb" collection,
// through /api/db). Identity numbers are removed before anything is kept; each address may send a few an hour.
// POST { r, q, a, build }            -> { id, k }   a new feedback (r: the rating)
// POST { id, k, text?, r? }          -> { ok }       the sentence added, or the rating changed (k: the key the first call returned)
import { json, text, setup, sha, who, codeCookie } from '../_lib.js';
const RATINGS = ['כן', 'חלקית', 'לא'];
const PER_HOUR = 30;
const scrub = (s, n) => String(s || '').replace(/\d[\d\s-]{6,12}\d/g, m => (m.replace(/\D/g, '').length >= 8 && m.replace(/\D/g, '').length <= 9 ? '[ת"ז הוסרה]' : m)).slice(0, n);
export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return text('forbidden', 403);
  if (!env.DB) return text('the storage is not connected yet (binding DB)', 503);
  let b; try { b = await request.json(); } catch (_) { return text('bad request', 400); }
  await setup(env);
  const ip = await sha((request.headers.get('CF-Connecting-IP') || 'x') + '|fb'), ipH = ip.slice(0, 16), now = Date.now();
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM docs WHERE coll = 'fb' AND t > ? AND json_extract(data, '$.ip') = ?").bind(now - 3600e3, ipH).first();
  if (b && b.id && b.k) {
    const path = 'fb/' + String(b.id).replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
    const r = await env.DB.prepare('SELECT data FROM docs WHERE path = ?').bind(path).first();
    if (!r) return json({ error: 'missing' }, 404);
    const d = JSON.parse(r.data);
    if (d.k !== await sha(String(b.k))) return json({ error: 'forbidden' }, 403);
    if (b.text !== undefined) d.text = scrub(b.text, 600);
    if (RATINGS.includes(String(b.r || ''))) d.r = String(b.r);   // the rating changed after the first tap
    d.t1 = new Date(now).toISOString();
    await env.DB.prepare('UPDATE docs SET data = ? WHERE path = ?').bind(JSON.stringify(d), path).run();
    return json({ ok: true });
  }
  if (n && n.n >= PER_HOUR) return json({ error: 'rate_limited' }, 429);
  const r = String(b && b.r || '');
  if (!RATINGS.includes(r)) return text('bad rating', 400);
  // a signed-in coordinator's feedback (the coordinators' bot sends its sign-in cookie or code) says who sent it; the public
  // bot's has no name (5.11.2026, Yoni: "שאצלי יהיה ברור איזה משוב זה")
  let src = 'public', from = '';
  if (request.headers.get('X-Code') || codeCookie(request)) { const u = await who(request, env); if (u && !u.notify && !u.bench) { src = 'coord'; from = String(u.name || '').slice(0, 80); } }
  const id = 'f' + crypto.randomUUID().replace(/-/g, '').slice(0, 19), k = crypto.randomUUID().replace(/-/g, '');
  const data = { r, q: scrub(b.q, 400), a: scrub(b.a, 1500), build: String(b.build || '').slice(0, 20), page: String(b.page || '').slice(0, 20), src, from, t0: new Date(now).toISOString(), read: false, ip: ipH, k: await sha(k) };
  await env.DB.prepare('INSERT INTO docs (path, coll, data, t) VALUES (?, ?, ?, ?)').bind('fb/' + id, 'fb', JSON.stringify(data), now).run();
  return json({ id, k });
}
