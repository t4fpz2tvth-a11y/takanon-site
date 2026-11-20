// 16.11.2026 (Yoni: "ללמוד מהשטח"): the questions the bots could not answer from the regulations, so the table of everyday
// words (the page's widening ladder) grows from what people really ask. The page sends a question here in two cases only:
// the answer was "לא נמצא" even after the wider search (st: 'nf'), or it was found only after widening (st: 'wide', with
// the words that found it). No name, no address and no code are kept; identity numbers, phones and e-mails are removed here
// again (the page removes them first). Only the head reads the list (the "miss" collection, through /api/db). Kept one year.
// 20.11.2026 (Yoni: "שהבוט נעשה חכם יותר ולומד"; he approves each fix): a third case, st: 'refine' — a follow-up that asked the
// same question again in other words within minutes of an answer. With it go the question before (q0), the start of that
// answer (a0) and whether the bot had asked something (asked). The same scrubbing; the same list; the same year.
// POST { q, st, step, words, build, page, lang, q0?, a0?, asked? } -> { ok }
import { json, text, setup, sha } from '../_lib.js';
const PER_HOUR = 40;
const scrub = (s, n) => String(s || '')
  .replace(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g, '[מייל הוסר]')
  .replace(/(?<!\d)(?:\+?972[\s-]?|0)(?:5\d|7[2-9]|[23489])[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}(?!\d)/g, '[טלפון הוסר]')
  .replace(/\d[\d\s-]{6,12}\d/g, m => (m.replace(/\D/g, '').length >= 8 && m.replace(/\D/g, '').length <= 9 ? '[ת"ז הוסרה]' : m))
  .replace(/\s+/g, ' ').trim().slice(0, n);
export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return text('forbidden', 403);
  if (!origin && request.headers.get('Sec-Fetch-Site') !== 'same-origin') return text('forbidden', 403);
  if (!env.DB) return text('the storage is not connected yet (binding DB)', 503);
  let b; try { b = await request.json(); } catch (_) { return text('bad request', 400); }
  const q = scrub(b && b.q, 300);
  if (!q) return text('bad request', 400);
  await setup(env);
  const now = Date.now(), ipH = (await sha((request.headers.get('CF-Connecting-IP') || 'x') + '|miss')).slice(0, 16);
  // the hourly count per address lives beside the questions' counts (table hits), so nothing about the sender is kept with the question
  const h = Math.floor(now / 3600e3), k = 'm:' + ipH;
  const n = await env.DB.prepare('SELECT n FROM hits WHERE k = ? AND h = ?').bind(k, h).first();
  if (n && n.n >= PER_HOUR) return json({ error: 'rate_limited' }, 429);
  await env.DB.prepare('INSERT INTO hits (k, h, n) VALUES (?, ?, 1) ON CONFLICT(k, h) DO UPDATE SET n = n + 1').bind(k, h).run();
  const words = Array.isArray(b.words) ? b.words.map(w => scrub(w, 30)).filter(w => /^[א-ת"'\- ]{2,30}$/.test(w)).slice(0, 8) : [];
  const refine = b.st === 'refine';
  const data = { q, st: refine ? 'refine' : b.st === 'wide' ? 'wide' : 'nf', step: Math.max(1, Math.min(4, Number(b.step) || 1)), words, build: String(b.build || '').slice(0, 20),
    page: b.page === 'coord' ? 'coord' : 'public', lang: ['he', 'en', 'ar'].includes(b.lang) ? b.lang : 'he', t0: new Date(now).toISOString(), done: false };
  if (refine) { data.q0 = scrub(b.q0, 300); data.a0 = scrub(b.a0, 400); data.asked = b.asked === true; if (!data.q0) return text('bad request', 400); }
  const id = 'm' + crypto.randomUUID().replace(/-/g, '').slice(0, 19);
  await env.DB.prepare('INSERT INTO docs (path, coll, data, t) VALUES (?, ?, ?, ?)').bind('miss/' + id, 'miss', JSON.stringify(data), now).run();
  return json({ ok: true });
}
