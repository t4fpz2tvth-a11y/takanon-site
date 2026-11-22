// 22.11.2026 (Yoni: the log of the bot's failures, "ופירוט בכל הניתן"): what only the page can see. The server writes its own
// rows (api/chat.js: the model's service answered with an error). The page reports here the failures that never reach the
// server or happen after its answer began: no connection from the user's device, an answer cut in the middle, an error
// inside the stream, an empty answer. A report made while offline waits in the browser and is sent later, with its own time.
// POST { code, msg, ms, got, online, build, at } -> { ok }. Never the question or the answer. 20 reports an hour per address.
import { json, text, who, failLog, botOf, deviceOf } from '../_lib.js';
const seen = new Map();
const KINDS = { network: 'network', cut: 'cut', stream: 'stream', empty: 'empty' };
export async function onRequestPost({ request, env }) {
  const url = new URL(request.url), origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return text('forbidden', 403);
  if (!origin && request.headers.get('Sec-Fetch-Site') !== 'same-origin') return text('forbidden', 403);
  const ip = request.headers.get('CF-Connecting-IP') || 'x', now = Date.now(), h = (seen.get(ip) || []).filter(t => now - t < 3600e3);
  h.push(now); seen.set(ip, h); if (seen.size > 5000) seen.clear();
  if (h.length > 20) return text('too many', 429);
  let b; try { b = await request.json(); } catch (_) { return text('bad request', 400); }
  if (!b || typeof b !== 'object') return text('bad request', 400);
  let w = null; try { w = (request.headers.get('X-Code') || request.headers.get('Cookie')) ? await who(request, env) : null; } catch (_) {}
  await failLog(env, { src: 'page', kind: KINDS[b.code] || 'page', bot: botOf(request), device: deviceOf(request), ms: b.ms, got: b.got === true, online: b.online !== false,
    who: w && !w.bench && !w.notify ? w.name : '', build: b.build, at: b.at, stream: true, msg: String(b.msg || '').slice(0, 300) });
  return json({ ok: true });
}
