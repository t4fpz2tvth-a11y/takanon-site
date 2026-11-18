// 18.11.2026 23:45 (Yoni: "סטטיסטיקות על כל אחד: כמה זמן בילה, כמה כניסות, כמה שאלות, כמה מקרים פתח, האם תירגל, האם סייר,
// באילו כלים השתמש"): how each coordinator uses the coordinators' page, from counters only. The page sends, about once a
// minute while it is in use: one visit, the seconds it was in active use, how many questions were answered, which tools
// were opened, and whether the tour was started or finished. No word of a question, an answer or a case arrives here.
// Kept per coordinator (the head sees it; nobody else does), as running totals plus the days the page was used.
//   POST { ev: { visit, secs, q, tools: [...], tour, tourEnd } } (a signed-in coordinator) -> 204
//   POST { op: 'report' } (the head) -> { people: [{ uid, name }], rows: [{ uid, k, n, t }], subs: [{ uid, n }] }
import { json, text, who, setup } from '../_lib.js';
const TOOL = /^[a-z0-9-]{1,24}$/;
const ilDay = t => new Date(t + 2 * 3600e3).toISOString().slice(0, 10);
export async function onRequestPost({ request, env }) {
  const url = new URL(request.url), origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return text('forbidden', 403);
  if (!env.DB) return new Response(null, { status: 204 });
  let b; try { b = await request.json(); } catch (_) { return text('bad request', 400); }
  const u = await who(request, env); if (!u) return text('sign in', 401);
  await setup(env);
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS use_n (uid TEXT NOT NULL, k TEXT NOT NULL, n INTEGER NOT NULL, t INTEGER NOT NULL, PRIMARY KEY (uid, k))').run();
  if (b && b.op === 'report') {
    if (!u.admin) return text('forbidden', 403);
    const rows = (await env.DB.prepare('SELECT uid, k, n, t FROM use_n').all()).results || [];
    let people = [], subs = [];
    try { people = (await env.DB.prepare('SELECT uid, name FROM codes').all()).results || []; } catch (_) {}
    try { subs = (await env.DB.prepare('SELECT uid, COUNT(*) AS n FROM push_subs GROUP BY uid').all()).results || []; } catch (_) {}
    return json({ people, rows, subs });
  }
  if (u.admin || u.notify || u.bench) return new Response(null, { status: 204 });   // the head's own use, and the automations, are not counted
  const ev = b && b.ev && typeof b.ev === 'object' ? b.ev : {}, now = Date.now(), add = [];
  const num = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
  if (num(ev.visit, 1)) add.push(['visit', 1]);
  if (num(ev.secs, 180)) add.push(['secs', num(ev.secs, 180)]);     // a minute or so a call; more than three is not believed
  if (num(ev.q, 5)) add.push(['q', num(ev.q, 5)]);
  if (num(ev.tour, 1)) add.push(['tour', 1]);
  if (num(ev.tourEnd, 1)) add.push(['tourEnd', 1]);
  (Array.isArray(ev.tools) ? ev.tools : []).slice(0, 8).forEach(x => { if (TOOL.test(String(x))) add.push(['tool|' + x, 1]); });
  if (!add.length) return new Response(null, { status: 204 });
  add.push(['day|' + ilDay(now), 1]);
  await env.DB.batch(add.map(([k, n]) => env.DB.prepare('INSERT INTO use_n (uid, k, n, t) VALUES (?, ?, ?, ?) ON CONFLICT (uid, k) DO UPDATE SET n = n + excluded.n, t = excluded.t').bind(u.uid, k, n, now)));
  await env.DB.prepare("DELETE FROM use_n WHERE uid = ? AND k LIKE 'day|%' AND k < ?").bind(u.uid, 'day|' + ilDay(now - 120 * 864e5)).run();   // the days of the last four months
  return new Response(null, { status: 204 });
}
