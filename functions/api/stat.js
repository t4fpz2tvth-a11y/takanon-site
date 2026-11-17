// 17.11.2026 (Yoni: "תעשה את 5"): a monthly picture of what is asked, from counters only. The page sends, once per answered
// question: which page (public / coord), the answer's language, whether it was "לא נמצא", whether it was a follow-up, and
// which regulations the answer cited (doc|<document>, ch|<נה"ל chapter or appendix>, fac|<a faculty's regulations>).
// No word of the question or the answer arrives here, nothing about the asker is kept, and a count is only a number per month.
//   POST { page, lang, nf, fu, keys }                 -> 204 (same origin; 300 an hour per address)
//   POST { op: 'report', month: 'YYYY-MM' } (the head) -> { month, rows: [{ k, n }] , months: [...] }
import { json, text, who, sha } from '../_lib.js';
const KEY = /^(doc|ch|fac)\|[A-Za-z0-9_֐-׿' -]{1,40}$/;
const monthNow = () => new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 7);   // Israel's day, near enough for a month
export async function onRequestPost({ request, env }) {
  const url = new URL(request.url), origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return text('forbidden', 403);
  if (!env.DB) return new Response(null, { status: 204 });
  let b; try { b = await request.json(); } catch (_) { return text('bad request', 400); }
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS stat (m TEXT NOT NULL, k TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (m, k))'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS hits (k TEXT NOT NULL, h INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (k, h))')
  ]);
  if (b && b.op === 'report') {
    const w = await who(request, env);
    if (!w || !w.admin) return text('forbidden', 403);
    const month = /^\d{4}-\d{2}$/.test(String(b.month || '')) ? b.month : monthNow();
    const rows = (await env.DB.prepare('SELECT k, n FROM stat WHERE m = ? ORDER BY n DESC').bind(month).all()).results || [];
    const months = ((await env.DB.prepare('SELECT DISTINCT m FROM stat ORDER BY m DESC LIMIT 24').all()).results || []).map(x => x.m);
    return json({ month, rows, months });
  }
  if (!origin && request.headers.get('Sec-Fetch-Site') !== 'same-origin') return text('forbidden', 403);
  const ip = request.headers.get('CF-Connecting-IP') || 'x';
  const hit = await env.DB.prepare('INSERT INTO hits (k, h, n) VALUES (?, ?, 1) ON CONFLICT (k, h) DO UPDATE SET n = n + 1 RETURNING n').bind('st:' + await sha(ip), Math.floor(Date.now() / 3600e3)).first();
  if (hit && hit.n > 300) return new Response(null, { status: 204 });
  const page = b && b.page === 'coord' ? 'coord' : 'public', lang = ['he', 'ar', 'en'].includes(b && b.lang) ? b.lang : 'he';
  const keys = [(b && b.fu ? 'fu|' : 'q|') + page];
  if (!(b && b.fu)) {   // the picture is of questions; a follow-up is only counted
    keys.push('lang|' + lang + '|' + page);
    if (b && b.nf) keys.push('nf|' + page);
    const mine = [...new Set((Array.isArray(b && b.keys) ? b.keys : []).map(String).filter(k => KEY.test(k)))].slice(0, 12);
    if (!mine.length && !(b && b.nf)) keys.push('none|' + page);   // answered, and cited nothing
    mine.forEach(k => keys.push(k + '|' + page));
  }
  const m = monthNow();
  await env.DB.batch(keys.map(k => env.DB.prepare('INSERT INTO stat (m, k, n) VALUES (?, ?, 1) ON CONFLICT (m, k) DO UPDATE SET n = n + 1').bind(m, k)));
  return new Response(null, { status: 204 });
}
