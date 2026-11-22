// 17.11.2026 (Yoni: "תבנה את 3 ההצעות"): a voice message turned into text, for the coordinators' bot only. A coordinator attaches
// the recording a student sent (WhatsApp's .ogg / .opus / .m4a, or mp3 / wav / webm); it is transcribed by a speech model
// (see ../_voice.js: gpt-4o-transcribe through OpenRouter, then two fall-backs; the recording is not kept), and the page shows the text as an attached file the coordinator can read and correct before asking.
// Signed-in coordinators and the head only (and the comparison token, for the format tests); 60 an hour each; up to 12 MB.
// POST the recording itself as the body (?lang=he by default, or auto) -> { text }
import { json, text, who, setup, failLog, botOf, deviceOf } from '../_lib.js';
import { transcribe } from '../_voice.js';
const MAX = 12 * 1048576;
export async function onRequestPost(context) {
  const { request, env } = context, t00 = Date.now();
  const url = new URL(request.url), origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return text('forbidden', 403);
  const w = await who(request, env);
  if (!w || w.notify) return text('for signed-in coordinators only', 403);
  try {
    if (env.DB) {
      await setup(env);
      const r = await env.DB.prepare('INSERT INTO hits (k, h, n) VALUES (?, ?, 1) ON CONFLICT (k, h) DO UPDATE SET n = n + 1 RETURNING n').bind('t:' + w.uid, Math.floor(Date.now() / 3600e3)).first();
      if (r && r.n > 60) return text('too many', 429);
    }
  } catch (_) {}
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > MAX) return text('too large', 413);
  const buf = new Uint8Array(await request.arrayBuffer());
  if (!buf.length) return text('bad request', 400);
  if (buf.length > MAX) return text('too large', 413);
  const lang = url.searchParams.get('lang') || 'he';
  let out;
  try { out = await transcribe(env, buf, request.headers.get('Content-Type') || '', lang); }
  catch (e) {
    // 22.11.2026: the log of the bot's failures (the recording itself is never kept)
    const p = failLog(env, { kind: 'voice', status: 502, bot: botOf(request), device: deviceOf(request), ms: Date.now() - t00, who: w.bench ? '' : w.name, msg: (buf.length / 1048576).toFixed(1) + ' MB, ' + (request.headers.get('Content-Type') || '?') + ': ' + String(e && e.message || e) }); try { context.waitUntil(p); } catch (_) {}
    return text('the recording could not be transcribed: ' + String(e && e.message || e).replace(/\s+/g, ' ').slice(0, 200), 502); }
  return json({ text: out.text, via: out.via });
}
