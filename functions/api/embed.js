// 17.11.2026 (Yoni: "ולמה לא לבנות מנוע סמנטי?"): the meaning search's server part, at /api/embed. It turns text into a vector with
// Cloudflare's own multilingual model (@cf/baai/bge-m3, through the project's binding AI; the text is not kept there), so a
// question in everyday words can be matched to a clause by meaning and not only by its words.
//   The page: POST { q } -> { v }: the question's vector (1024 numbers, unit length, as signed bytes in base64). Same origin
//     only, counted per address by the hour (EMBED_PER_HOUR, default 120). The page sends the question with identity numbers
//     masked, as it does to the model that answers; nothing is stored here.
//   The clauses' job (ask/embed.mjs, with the comparison secret): POST { texts: [...] } -> { vs: [...] }, up to 50 at a time.
import { json, text, who, setup, sha } from '../_lib.js';
const MODEL = '@cf/baai/bge-m3';
function pack(vec) {   // unit length -> signed bytes (x127) -> base64
  let n = 0; for (const x of vec) n += x * x; n = Math.sqrt(n) || 1;
  const b = new Uint8Array(vec.length);
  for (let i = 0; i < vec.length; i++) b[i] = Math.max(-127, Math.min(127, Math.round(vec[i] / n * 127))) & 255;
  let s = ''; for (let i = 0; i < b.length; i += 0x2000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x2000));
  return btoa(s);
}
export async function onRequestPost({ request, env }) {
  const url = new URL(request.url), origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return text('forbidden', 403);
  if (!env.AI) return text('the meaning search is not connected yet (binding AI)', 503);
  let b; try { b = await request.json(); } catch (_) { return text('bad request', 400); }
  const batch = Array.isArray(b && b.texts);
  if (batch) {
    const w = await who(request, env);
    if (!w || !(w.admin || w.bench)) return text('for the head only', 403);
  } else {
    if (!origin && request.headers.get('Sec-Fetch-Site') !== 'same-origin') return text('forbidden', 403);
    try {
      if (env.DB) {
        await setup(env);
        const h = Math.floor(Date.now() / 3600e3), k = 'e:' + (await sha((request.headers.get('CF-Connecting-IP') || 'x') + '|embed')).slice(0, 24);
        const r = await env.DB.prepare('INSERT INTO hits (k, h, n) VALUES (?, ?, 1) ON CONFLICT (k, h) DO UPDATE SET n = n + 1 RETURNING n').bind(k, h).first();
        if (r && r.n > Number(env.EMBED_PER_HOUR || 120)) return text('too many', 429);
      }
    } catch (_) {}
  }
  const texts = (batch ? b.texts : [b && b.q]).map(x => String(x || '').slice(0, 6000)).filter(x => x.trim());
  if (!texts.length || texts.length > 50) return text('bad request', 400);
  let out;
  try { out = await env.AI.run(MODEL, { text: texts }); } catch (e) { return text('the embedding model did not answer: ' + String(e && e.message || e).slice(0, 200), 502); }
  const data = out && out.data;
  if (!Array.isArray(data) || data.length !== texts.length) return text('unexpected answer from the embedding model', 502);
  const vs = data.map(pack);
  return json(batch ? { vs, dim: data[0].length, model: MODEL } : { v: vs[0], dim: data[0].length });
}
