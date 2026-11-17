// 17.11.2026 (Yoni: "תבנה את 3 ההצעות"): the human check of the public bot, with Cloudflare Turnstile. The page asks here for
// the widget's public key, runs the check (most visitors see nothing), and sends the token it got; this function has
// Cloudflare confirm it and gives the browser a pass for twelve hours (a cookie, see humanPass in _lib.js). /api/chat
// counts questions with and without a pass, and blocks those without one only when TURNSTILE_ENFORCE=1.
// Settings: TURNSTILE_SITEKEY (the public key), TURNSTILE_SECRET (secret). Until both are set, everything here is off.
//   GET  -> { sitekey, ok }           (the head, signed in, also gets the last days' counts)
//   POST { token } -> { ok }          + the pass
import { json, text, who, setup, humanOk, humanPass, HUMAN_COOKIE } from '../_lib.js';
export async function onRequestGet({ request, env }) {
  const on = !!(env.TURNSTILE_SITEKEY && env.TURNSTILE_SECRET);
  const out = { sitekey: on ? String(env.TURNSTILE_SITEKEY) : '', ok: on ? await humanOk(request, env) : true, enforce: env.TURNSTILE_ENFORCE === '1' };
  try {
    const w = (request.headers.get('X-Code') || request.headers.get('Cookie')) ? await who(request, env) : null;
    if (w && w.admin && env.DB) {
      await setup(env);
      const day = Math.floor(Date.now() / 864e5) + 10000000;
      const rs = await env.DB.prepare("SELECT k, h, n FROM hits WHERE k IN ('h:ok', 'h:no') AND h >= ? ORDER BY h").bind(day - 13).all();
      out.days = (rs.results || []).map(x => ({ day: new Date((x.h - 10000000) * 864e5).toISOString().slice(0, 10), pass: x.k === 'h:ok', n: x.n }));
    }
  } catch (_) {}
  return json(out);
}
export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return text('forbidden', 403);
  if (!env.TURNSTILE_SECRET) return json({ ok: true, off: true });
  let b; try { b = await request.json(); } catch (_) { return text('bad request', 400); }
  const token = String(b && b.token || '');
  if (!token || token.length > 2100) return text('bad request', 400);
  let v = null;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token, remoteip: request.headers.get('CF-Connecting-IP') || undefined }) });
    v = await r.json();
  } catch (_) { return json({ ok: false, error: 'the check could not be confirmed right now' }, 502); }
  if (!v || !v.success) return json({ ok: false, error: (v && v['error-codes'] || []).join(',').slice(0, 100) }, 403);
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'Set-Cookie': HUMAN_COOKIE + '=' + await humanPass(env) + '; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Strict' } });
}
