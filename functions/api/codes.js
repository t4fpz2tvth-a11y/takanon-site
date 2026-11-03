// The head's list of access codes (3.11.2026): POST { op: 'list' | 'create' | 'revoke', name?, uid? } with the head's X-Code.
// A new code is shown once, when it is created; only its hash is kept.
import { text, json, setup, who, sha } from '../_lib.js';
export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return text('forbidden', 403);
  if (!env.DB) return text('the storage is not connected yet (binding DB)', 503);
  const u = await who(request, env);
  if (!u || !u.admin) return text('the head only', 403);
  await setup(env);
  let b; try { b = await request.json(); } catch (_) { return text('bad request', 400); }
  if (b.op === 'list') return json({ codes: ((await env.DB.prepare('SELECT uid, name, created FROM codes ORDER BY created').all()).results || []) });
  if (b.op === 'create') {
    const name = String(b.name || '').trim().slice(0, 80); if (!name) return text('a name', 400);
    const code = [...crypto.getRandomValues(new Uint8Array(9))].map(x => 'abcdefghjkmnpqrstuvwxyz23456789'[x % 31]).join('');
    const uid = 'u_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    await env.DB.prepare('INSERT INTO codes (hash, uid, name, created) VALUES (?, ?, ?, ?)').bind(await sha(code), uid, name, Date.now()).run();
    return json({ uid, name, code });
  }
  if (b.op === 'revoke') { await env.DB.prepare('DELETE FROM codes WHERE uid = ?').bind(String(b.uid || '')).run(); return json({ ok: true }); }
  return text('unknown op', 400);
}
