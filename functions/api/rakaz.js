// The game "רכז ליום אחד" (public/rakaz/, 14.11.2026, Yoni: "באיזה מקום אתה ברשימה הכללית"): its general list.
// 15.11.2026 (Yoni: "שאראה רשימת ניקוד וגם שאדע כמה כניסות היו לזה, בעדיפות שלא יחשיבו כניסות שלי"): visits are counted too,
// a browser can be marked as Yoni's own (the page's ?me=1) and is then left out of every number, and ?stats=1 gives the
// numbers the page /rakaz/stats/ shows.
// 15.11.2026 (Yoni: "הם מזינים את השם שלהם כשמסיימים? כדי שאדע מי זה בדירוג"): a player may add a name at the end of a round.
// It is optional, and the list gives names only to the head (his own sign-in on the device); everyone else gets the list without them.
// Anyone may send, with no access code. Nothing personal is kept: a random id the browser made up for itself,
// that browser's best score, how many rounds it played and when the last one was, how many times it opened the page,
// and the name the player chose to add, if any. No address.
// 16.11.2026 (Yoni: "מעכשיו תחייב לשמור בשם כדי להחשב"): a score is on the list only with a name. A round that ended before
// NAME_FROM stays as it was. A browser that plays after it with no name is still kept and counted as a player (so a name added
// later brings its best in), but it is not on the list and holds no place. The same day he had the first place taken off:
// it was moved to rakaz_removed (kept there, not shown anywhere).
// POST { cid, score }        -> { rank, total, best, named }   rank is by the browser's best score, among the listed browsers that are
//                                                              not Yoni's; named: false means the place is only what it would be with a name
// POST { cid, visit: 1, own } -> { ok, own }             one visit per browser per half hour; own: true marks, false unmarks
// POST { cid, name }           -> { ok, name, rank?, total? }   the name for the list; an empty one removes it (and takes the browser off the list)
// GET                        -> { total, plays, top }   how many browsers played, how many rounds, the ten best scores
// GET ?stats=1               -> { visitors, visits, players, plays, list, unlisted, days, mine, names, named }   names: true for the head only;
//                               unlisted: browsers that finished a round with no name since NAME_FROM, so they are not on the list
import { json, text, who } from '../_lib.js';
const MAX_SCORE = 450, MAX_ROWS = 5000, MIN_GAP = 20000, VISIT_GAP = 30 * 60000;
const NOT_OWN = 'cid NOT IN (SELECT cid FROM rakaz_visits WHERE own = 1)', OWN = 'cid IN (SELECT cid FROM rakaz_visits WHERE own = 1)';
const NAME_FROM = 1794829260000;   // 16.11.2026, 13:41 in Israel: from here on, only a browser with a name is listed
const LISTED = '(cid IN (SELECT cid FROM rakaz_names) OR t < ' + NAME_FROM + ')';
// the place of a browser by its best score, among the listed browsers that are not Yoni's. One that is not listed itself
// (no name, or Yoni's own) gets the place it would hold, as one more
async function place(env, cid) {
  const row = await env.DB.prepare('SELECT best, t FROM rakaz_scores WHERE cid = ?').bind(cid).first();
  if (!row) return null;
  const nm = await env.DB.prepare('SELECT COUNT(*) AS c FROM rakaz_names WHERE cid = ?').bind(cid).first();
  const mine = await env.DB.prepare('SELECT own FROM rakaz_visits WHERE cid = ?').bind(cid).first();
  const named = !!(nm && nm.c), listed = !(mine && mine.own) && (named || row.t < NAME_FROM);
  const above = await env.DB.prepare('SELECT COUNT(*) AS c FROM rakaz_scores WHERE best > ? AND ' + NOT_OWN + ' AND ' + LISTED).bind(row.best).first();
  const total = await env.DB.prepare('SELECT COUNT(*) AS c FROM rakaz_scores WHERE ' + NOT_OWN + ' AND ' + LISTED).first();
  return { rank: (above ? above.c : 0) + 1, total: (total ? total.c : 0) + (listed ? 0 : 1) || 1, best: row.best, named };
}
let ready = false;
async function setup(env) {
  if (ready) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS rakaz_scores (cid TEXT PRIMARY KEY, best INTEGER NOT NULL, plays INTEGER NOT NULL, t INTEGER NOT NULL)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS rakaz_visits (cid TEXT PRIMARY KEY, n INTEGER NOT NULL, first INTEGER NOT NULL, last INTEGER NOT NULL, own INTEGER NOT NULL DEFAULT 0)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS rakaz_names (cid TEXT PRIMARY KEY, name TEXT NOT NULL, t INTEGER NOT NULL)').run();
  // 18.11.2026 (Yoni: the game is choppy in the phone's browser): how smoothly the last round ran in each browser. Technical only:
  // frame counts, screen size and how the round was played (touch, mouse or keys). No names, no device model
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS rakaz_perf (cid TEXT PRIMARY KEY, t INTEGER NOT NULL, frames INTEGER NOT NULL, ms INTEGER NOT NULL, slow INTEGER NOT NULL, vslow INTEGER NOT NULL, dpr REAL, w INTEGER, h INTEGER, ctl TEXT)').run();
  ready = true;
}
// the smoothness of the round that just ended: frames drawn, their total time, and how many took over 25 ms and over 45 ms
async function savePerf(env, cid, p, now) {
  if (!p || typeof p !== 'object') return;
  const int = (v, max) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 0 && n <= max ? n : null; };
  const frames = int(p.n, 2000000), ms = int(p.ms, 7200000), slow = int(p.s, 2000000), vslow = int(p.v, 2000000);
  if (frames === null || ms === null || slow === null || vslow === null || frames < 120 || ms < 2000 || slow > frames || vslow > slow) return;
  const dpr = Number(p.d), w = int(p.w, 10000), h = int(p.h, 10000), ctl = /^[tmpk]$/.test(String(p.c || '')) ? String(p.c) : null;
  await env.DB.prepare('INSERT INTO rakaz_perf (cid, t, frames, ms, slow, vslow, dpr, w, h, ctl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (cid) DO UPDATE SET t = excluded.t, frames = excluded.frames, ms = excluded.ms, slow = excluded.slow, vslow = excluded.vslow, dpr = excluded.dpr, w = excluded.w, h = excluded.h, ctl = excluded.ctl')
    .bind(cid, now, frames, ms, slow, vslow, Number.isFinite(dpr) && dpr > 0 && dpr < 10 ? Math.round(dpr * 100) / 100 : null, w, h, ctl).run();
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
  if (b && typeof b.name === 'string') {
    // letters, digits and a few marks only, one line, up to 24 characters; only a browser that visited or played may add one
    const name = b.name.normalize('NFC').replace(/[^\p{L}\p{N} .\-'’׳״]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24);
    if (!name) { await env.DB.prepare('DELETE FROM rakaz_names WHERE cid = ?').bind(cid).run(); return json({ ok: true, name: '' }); }
    const known = await env.DB.prepare('SELECT (SELECT COUNT(*) FROM rakaz_scores WHERE cid = ?) + (SELECT COUNT(*) FROM rakaz_visits WHERE cid = ?) AS c').bind(cid, cid).first();
    if (!known || !known.c) return text('bad request', 400);
    await env.DB.prepare('INSERT INTO rakaz_names (cid, name, t) VALUES (?, ?, ?) ON CONFLICT (cid) DO UPDATE SET name = excluded.name, t = excluded.t').bind(cid, name, now).run();
    const p = await place(env, cid);   // the name is what puts the browser's best on the list
    return json(p ? { ok: true, name, rank: p.rank, total: p.total } : { ok: true, name });
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
  try { await savePerf(env, cid, b.perf, now); } catch (_) { /* a measurement must never cost a player the score */ }
  return json(await place(env, cid) || { rank: 1, total: 1, best: Math.max(score, row ? row.best : 0), named: false });
}
export async function onRequestGet({ request, env }) {
  if (!env.DB) return text('the storage is not connected yet (binding DB)', 503);
  await setup(env);
  const total = await env.DB.prepare('SELECT COUNT(*) AS c, COALESCE(SUM(plays), 0) AS p FROM rakaz_scores WHERE ' + NOT_OWN).first();
  if (!new URL(request.url).searchParams.has('stats')) {
    const listed = await env.DB.prepare('SELECT COUNT(*) AS c FROM rakaz_scores WHERE ' + NOT_OWN + ' AND ' + LISTED).first();
    const top = await env.DB.prepare('SELECT best FROM rakaz_scores WHERE ' + NOT_OWN + ' AND ' + LISTED + ' ORDER BY best DESC LIMIT 10').all();
    return json({ total: listed ? listed.c : 0, plays: total ? total.p : 0, top: ((top && top.results) || []).map(r => r.best) });
  }
  const v = await env.DB.prepare('SELECT COUNT(*) AS c, COALESCE(SUM(n), 0) AS s FROM rakaz_visits WHERE own = 0').first();
  const mv = await env.DB.prepare('SELECT COUNT(*) AS c, COALESCE(SUM(n), 0) AS s FROM rakaz_visits WHERE own = 1').first();
  const mp = await env.DB.prepare('SELECT COUNT(*) AS c, COALESCE(SUM(plays), 0) AS p FROM rakaz_scores WHERE ' + OWN).first();
  // names go only to the head, signed in on this device; any trouble telling who is asking means no names
  let admin = false; try { const w = await who(request, env); admin = !!(w && w.admin); } catch (_) {}
  const list = await env.DB.prepare('SELECT s.best AS best, s.plays AS plays, s.t AS t, n.name AS name FROM rakaz_scores s LEFT JOIN rakaz_names n ON n.cid = s.cid WHERE s.cid NOT IN (SELECT cid FROM rakaz_visits WHERE own = 1) AND (n.cid IS NOT NULL OR s.t < ' + NAME_FROM + ') ORDER BY s.best DESC, s.t ASC LIMIT 200').all();
  const unlisted = await env.DB.prepare('SELECT COUNT(*) AS c FROM rakaz_scores WHERE ' + NOT_OWN + ' AND NOT ' + LISTED).first();
  // new browsers per day, by the Israeli winter clock (UTC+2)
  const days = await env.DB.prepare('SELECT CAST((first + 7200000) / 86400000 AS INTEGER) AS d, COUNT(*) AS c FROM rakaz_visits WHERE own = 0 GROUP BY d ORDER BY d').all();
  return json({
    visitors: v ? v.c : 0, visits: v ? v.s : 0, players: total ? total.c : 0, plays: total ? total.p : 0,
    names: admin, named: ((list && list.results) || []).filter(r => r.name).length, unlisted: unlisted ? unlisted.c : 0,
    list: ((list && list.results) || []).map(r => admin ? { best: r.best, plays: r.plays, t: r.t, name: r.name || '' } : { best: r.best, plays: r.plays, t: r.t }),   // t: when that browser last finished a round (15.11.2026, Yoni: "תוסיף גם שעה ויום ששיחק")
    days: ((days && days.results) || []).map(r => ({ day: new Date(r.d * 86400000).toISOString().slice(0, 10), n: r.c })),
    mine: { visitors: mv ? mv.c : 0, visits: mv ? mv.s : 0, players: mp ? mp.c : 0, plays: mp ? mp.p : 0 }
  });
}
