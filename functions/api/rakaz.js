// The game "רכז ליום אחד" (public/rakaz/, 14.11.2026, Yoni: "באיזה מקום אתה ברשימה הכללית"): its general list.
// 15.11.2026 (Yoni: "שאראה רשימת ניקוד וגם שאדע כמה כניסות היו לזה, בעדיפות שלא יחשיבו כניסות שלי"): visits are counted too,
// a browser can be marked as Yoni's own (the page's ?me=1) and is then left out of every number, and ?stats=1 gives the
// numbers the page /rakaz/stats/ shows.
// Anyone may send, with no access code. Nothing personal is kept: a random id the browser made up for itself,
// that browser's best score, how many rounds it played and when the last one was, and how many times it opened the page.
// No name and no address.
// POST { cid, score }        -> { rank, total, best }   rank is by the browser's best score, among browsers that are not Yoni's
// POST { cid, visit: 1, own } -> { ok, own }             one visit per browser per half hour; own: true marks, false unmarks
// GET                        -> { total, plays, top }   how many browsers played, how many rounds, the ten best scores
// GET ?stats=1               -> { visitors, visits, players, plays, list, days, mine }
import { json, text } from '../_lib.js';
const MAX_SCORE = 250, MAX_ROWS = 5000, MIN_GAP = 20000, VISIT_GAP = 30 * 60000;
const NOT_OWN = 'cid NOT IN (SELECT cid FROM rakaz_visits WHERE own = 1)', OWN = 'cid IN (SELECT cid FROM rakaz_visits WHERE own = 1)';
let ready = false;
async function setup(env) {
  if (ready) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS rakaz_scores (cid TEXT PRIMARY KEY, best INTEGER NOT NULL, plays INTEGER NOT NULL, t INTEGER NOT NULL)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS rakaz_visits (cid TEXT PRIMARY KEY, n INTEGER NOT NULL, first INTEGER NOT NULL, last INTEGER NOT NULL, own INTEGER NOT NULL DEFAULT 0)').run();
  ready = true;
}
export async function onRequestPost({ request, env }) {
  // as in /api/feedback: only the site's own page may send
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return text('forbidden', 403);
  if (!origin && request.headers.get('Sec-Fetch-Site') !== 'same-origin') return text('forbidden', 403);
  if (!env.DB) return text('the storage is not connected yet (binding DB)', 503);
  let b; try { b = await request.json(); } catch (_) { return text('bad request', 400); }
  const cid = String((b && b.cid) || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 40);
  if (cid.length < 8) return text('bad request', 400);
  await setup(env);
  const now = Date.now();
  if (b && b.visit) {
    const own = b.own === true || b.own === 1 ? 1 : b.own === false || b.own === 0 ? 0 : null;   // null: leave the mark as it is
    const v = await env.DB.prepare('SELECT last, own FROM rakaz_visits WHERE cid = ?').bind(cid).first();
    if (v) {
      const counts = now - v.last > VISIT_GAP;   // reloading the page is not another visit
      await env.DB.prepare('UPDATE rakaz_visits SET n = n + ?, last = ?, own = ? WHERE cid = ?').bind(counts ? 1 : 0, counts ? now : v.last, own === null ? v.own : own, cid).run();
    } else {
      const n = await env.DB.prepare('SELECT COUNT(*) AS c FROM rakaz_visits').first();
      if (!(n && n.c >= MAX_ROWS)) await env.DB.prepare('INSERT INTO rakaz_visits (cid, n, first, last, own) VALUES (?, 1, ?, ?, ?)').bind(cid, now, now, own || 0).run();
    }
    return json({ ok: true, own: own === null ? (v ? v.own : 0) : own });
  }
  const score = Math.floor(Number(b && b.score));
  if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) return text('bad request', 400);
  const row = await env.DB.prepare('SELECT best, t FROM rakaz_scores WHERE cid = ?').bind(cid).first();
  if (row) {
    // a round takes about a minute: a score that comes sooner than this after the last one is not a round
    if (now - row.t < MIN_GAP) return text('too soon', 429);
    await env.DB.prepare('UPDATE rakaz_scores SET best = MAX(best, ?), plays = plays + 1, t = ? WHERE cid = ?').bind(score, now, cid).run();
  } else {
    const n = await env.DB.prepare('SELECT COUNT(*) AS c FROM rakaz_scores').first();
    if (n && n.c >= MAX_ROWS) return text('the list is full', 503);
    await env.DB.prepare('INSERT INTO rakaz_scores (cid, best, plays, t) VALUES (?, ?, 1, ?)').bind(cid, score, now).run();
  }
  const best = Math.max(score, row ? row.best : 0);
  // the place is among the browsers that are not Yoni's; his own browser gets its place as if it were one more
  const mine = await env.DB.prepare('SELECT own FROM rakaz_visits WHERE cid = ?').bind(cid).first();
  const above = await env.DB.prepare('SELECT COUNT(*) AS c FROM rakaz_scores WHERE best > ? AND ' + NOT_OWN).bind(best).first();
  const total = await env.DB.prepare('SELECT COUNT(*) AS c FROM rakaz_scores WHERE ' + NOT_OWN).first();
  return json({ rank: (above ? above.c : 0) + 1, total: (total ? total.c : 0) + (mine && mine.own ? 1 : 0) || 1, best });
}
export async function onRequestGet({ request, env }) {
  if (!env.DB) return text('the storage is not connected yet (binding DB)', 503);
  await setup(env);
  const total = await env.DB.prepare('SELECT COUNT(*) AS c, COALESCE(SUM(plays), 0) AS p FROM rakaz_scores WHERE ' + NOT_OWN).first();
  if (!new URL(request.url).searchParams.has('stats')) {
    const top = await env.DB.prepare('SELECT best FROM rakaz_scores WHERE ' + NOT_OWN + ' ORDER BY best DESC LIMIT 10').all();
    return json({ total: total ? total.c : 0, plays: total ? total.p : 0, top: ((top && top.results) || []).map(r => r.best) });
  }
  const v = await env.DB.prepare('SELECT COUNT(*) AS c, COALESCE(SUM(n), 0) AS s FROM rakaz_visits WHERE own = 0').first();
  const mv = await env.DB.prepare('SELECT COUNT(*) AS c, COALESCE(SUM(n), 0) AS s FROM rakaz_visits WHERE own = 1').first();
  const mp = await env.DB.prepare('SELECT COUNT(*) AS c, COALESCE(SUM(plays), 0) AS p FROM rakaz_scores WHERE ' + OWN).first();
  const list = await env.DB.prepare('SELECT best, plays FROM rakaz_scores WHERE ' + NOT_OWN + ' ORDER BY best DESC, t ASC LIMIT 200').all();
  // new browsers per day, by the Israeli winter clock (UTC+2)
  const days = await env.DB.prepare('SELECT CAST((first + 7200000) / 86400000 AS INTEGER) AS d, COUNT(*) AS c FROM rakaz_visits WHERE own = 0 GROUP BY d ORDER BY d').all();
  return json({
    visitors: v ? v.c : 0, visits: v ? v.s : 0, players: total ? total.c : 0, plays: total ? total.p : 0,
    list: ((list && list.results) || []).map(r => ({ best: r.best, plays: r.plays })),
    days: ((days && days.results) || []).map(r => ({ day: new Date(r.d * 86400000).toISOString().slice(0, 10), n: r.c })),
    mine: { visitors: mv ? mv.c : 0, visits: mv ? mv.s : 0, players: mp ? mp.c : 0, plays: mp ? mp.p : 0 }
  });
}
