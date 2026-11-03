// The head's list of access codes (3.11.2026): POST { op: 'list' | 'create' | 'reset' | 'revoke', name?, uid? } with the head's X-Code.
// A new code is shown once, when it is created; only its hash is kept.
import { text, json, setup, who, sha, normCode } from '../_lib.js';
// an easy code (3.11.2026, Yoni: the random ones were hard to remember): the coordinator's first name, a common word and a
// two-digit number, e.g. "נועה-תפוז-47"; wrong guesses are limited per address (see who)
const WORDS = 'תפוז לימון אבטיח ענבים דובדבן תאנה רימון מנגו בננה אגס שזיף תמר ארנב דולפין פנדה זברה נמר אריה ינשוף פינגווין קיפוד צב סנאי דבורה פרפר כוכב ירח שמש ענן קשת גל חוף הר יער נחל גשר מגדלור כינור גיטרה תוף חליל פסנתר עפיפון סירה רכבת בלון שוקולד עוגה פיתה קפה תה פרח ורד חמנייה זית ארז אלון כרמל גליל נגב'.split(' ');
const pick = n => crypto.getRandomValues(new Uint32Array(1))[0] % n;
function easyCode(name) {
  const first = (String(name).trim().split(/\s+/)[0] || 'רכז').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 12) || 'רכז';
  return normCode(first + '-' + WORDS[pick(WORDS.length)] + '-' + (10 + pick(90)));
}
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
    const uid = 'u_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    for (let t = 0; t < 5; t++) {   // a code already in use (very rare) is drawn again
      const code = easyCode(name);
      try { await env.DB.prepare('INSERT INTO codes (hash, uid, name, created) VALUES (?, ?, ?, ?)').bind(await sha(code), uid, name, Date.now()).run(); return json({ uid, name, code }); } catch (_) {}
    }
    return text('try again', 500);
  }
  // a new code for the same coordinator: the same uid, so their log stays theirs; the old code stops working
  if (b.op === 'reset') {
    const row = await env.DB.prepare('SELECT name, created FROM codes WHERE uid = ?').bind(String(b.uid || '')).first();
    if (!row) return text('no such coordinator', 404);
    for (let t = 0; t < 5; t++) {
      const code = easyCode(row.name);
      try {
        await env.DB.batch([env.DB.prepare('DELETE FROM codes WHERE uid = ?').bind(String(b.uid)), env.DB.prepare('INSERT INTO codes (hash, uid, name, created) VALUES (?, ?, ?, ?)').bind(await sha(code), String(b.uid), row.name, row.created)]);
        return json({ uid: b.uid, name: row.name, code });
      } catch (_) {}
    }
    return text('try again', 500);
  }
  if (b.op === 'revoke') { await env.DB.prepare('DELETE FROM codes WHERE uid = ?').bind(String(b.uid || '')).run(); return json({ ok: true }); }
  return text('unknown op', 400);
}
