// The game "רכז ליום אחד" (public/rakaz/, 14.11.2026, Yoni: "באיזה מקום אתה ברשימה הכללית"): its general list.
// Anyone may send, with no access code. Nothing personal is kept: a random id the browser made up for itself,
// that browser's best score, how many rounds it played and when the last one was. No name and no address.
// POST { cid, score } -> { rank, total, best }   rank is by the browser's best score
// GET                 -> { total, plays, top }   how many browsers played, how many rounds, the ten best scores
import { json, text } from '../_lib.js';
const MAX_SCORE = 250, MAX_ROWS = 5000, MIN_GAP = 20000;
let ready = false;
async function setup(env) {
  if (ready) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS rakaz_scores (cid TEXT PRIMARY KEY, best INTEGER NOT NULL, plays INTEGER NOT NULL, t INTEGER NOT NULL)').run();
  ready = true;
}
export async function onRequestPost({ request, env }) {
  // as in /api/feedback: only the site's own page may send
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return text('forbidden', 403);
  if (!origin && request.headers.get('Sec-Fetch-Site') !== 'same-origin') return text('forbidden', 403);
  if (!env.DB) return text('the storage is not connected yet (binding DB)', 503);
  let b; try { b = await request.json(); } catch (_) { return text('bad request', 400); }
  const cid = String((b && b.cid) || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 40), score = Math.floor(Number(b && b.score));
  if (cid.length < 8 || !Number.isFinite(score) || score < 0 || score > MAX_SCORE) return text('bad request', 400);
  await setup(env);
  const now = Date.now();
  const row = await env.DB.prepare('SELECT best, t FROM rakaz_scores WHERE cid = ?').bind(cid).first();
  if (row) {
    // a round takes about a minute: a score that comes sooner than this after the last one is not a round
    if (now - row.t < MIN_GAP) return text('too soon', 429);
    await env.DB.prepare('UPDATE rakaz_scores SET best = MAX(best, ?), plays = plays + 1, t = ? WHERE cid = ?').bind(score, now, cid).run();
  } else {
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM rakaz_scores').first();
    if (n && n.n >= MAX_ROWS) return text('the list is full', 503);
    await env.DB.prepare('INSERT INTO rakaz_scores (cid, best, plays, t) VALUES (?, ?, 1, ?)').bind(cid, score, now).run();
  }
  const best = Math.max(score, row ? row.best : 0);
  const above = await env.DB.prepare('SELECT COUNT(*) AS n FROM rakaz_scores WHERE best > ?').bind(best).first();
  const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM rakaz_scores').first();
  return json({ rank: (above ? above.n : 0) + 1, total: total ? total.n : 1, best });
}
export async function onRequestGet({ env }) {
  if (!env.DB) return text('the storage is not connected yet (binding DB)', 503);
  await setup(env);
  const total = await env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(plays), 0) AS p FROM rakaz_scores').first();
  const top = await env.DB.prepare('SELECT best FROM rakaz_scores ORDER BY best DESC LIMIT 10').all();
  return json({ total: total ? total.n : 0, plays: total ? total.p : 0, top: ((top && top.results) || []).map(r => r.best) });
}
