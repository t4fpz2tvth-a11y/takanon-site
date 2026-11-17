// 17.11.2026 (Yoni: "כן", a one-step road from WhatsApp on an iPhone): a coordinator's voice inbox. An iPhone cannot share a file
// into a web app, so a small Apple Shortcut in the share list sends the voice message here with the coordinator's personal
// inbox key. The recording is transcribed at once (the same speech model as /api/transcribe) and is NOT kept: only the
// text waits, for up to 30 minutes, until the coordinator's own signed-in page takes it (and it is deleted). The key can
// only put a transcript into its owner's inbox: it reads nothing and signs in to nothing. Only its hash is stored.
//   POST the recording, header X-Inbox-Key (from the Shortcut)       -> a short line of text for the Shortcut to show
//   POST { op: 'state' | 'key' | 'unkey' | 'take' } (the signed-in page) -> { hasKey, shortcut } | { key } | { ok } | { items }
import { json, text, who, sha } from '../_lib.js';
const MODEL = '@cf/openai/whisper-large-v3-turbo', MAX = 12 * 1048576, KEEP = 30 * 60e3, KEY = /^[a-f0-9]{40}$/;
async function tables(env) {
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS inbox_keys (uid TEXT PRIMARY KEY, h TEXT NOT NULL, t INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS inbox (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, name TEXT, body TEXT NOT NULL, t INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS hits (k TEXT NOT NULL, h INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (k, h))'),
    env.DB.prepare('DELETE FROM inbox WHERE t < ?').bind(Date.now() - KEEP)
  ]);
}
const count = async (env, k) => { const r = await env.DB.prepare('INSERT INTO hits (k, h, n) VALUES (?, ?, 1) ON CONFLICT (k, h) DO UPDATE SET n = n + 1 RETURNING n').bind(k, Math.floor(Date.now() / 3600e3)).first(); return r ? r.n : 0; };
export async function onRequestPost({ request, env }) {
  if (!env.DB) return text('the inbox is not set up', 503);
  const url = new URL(request.url), sent = String(request.headers.get('X-Inbox-Key') || '').trim().toLowerCase();
  await tables(env);
  if (sent) {   // the Shortcut
    const ip = request.headers.get('CF-Connecting-IP') || 'x';
    const owner = KEY.test(sent) ? await env.DB.prepare('SELECT uid FROM inbox_keys WHERE h = ?').bind(await sha('inbox|' + sent)).first() : null;
    if (!owner) { await count(env, 'ik:' + await sha(ip)); return text('המפתח האישי לא מוכר. צרו מפתח חדש בבוט הרכזים והדביקו אותו בקיצור הדרך.', 403); }
    if (await count(env, 'ik:' + await sha(ip)) > 120 || await count(env, 'i:' + owner.uid) > 40) return text('יותר מדי הקלטות בשעה האחרונה. נסו שוב מאוחר יותר.', 429);
    if (!env.AI) return text('התמלול לא זמין כרגע.', 503);
    if (Number(request.headers.get('Content-Length') || 0) > MAX + 4096) return text('ההקלטה ארוכה מדי לתמלול (עד 12 מ"ב).', 413);
    let buf = null, name = '';
    try {
      if (/^multipart\/form-data/i.test(request.headers.get('Content-Type') || '')) {
        const form = await request.formData();
        for (const [, v] of form) if (v && typeof v !== 'string' && v.size) { buf = new Uint8Array(await v.arrayBuffer()); name = v.name || ''; break; }
      } else buf = new Uint8Array(await request.arrayBuffer());
    } catch (_) {}
    if (!buf || !buf.length) return text('לא התקבלה הקלטה.', 400);
    if (buf.length > MAX) return text('ההקלטה ארוכה מדי לתמלול (עד 12 מ"ב).', 413);
    let b64 = ''; for (let i = 0; i < buf.length; i += 0x6000) b64 += btoa(String.fromCharCode.apply(null, buf.subarray(i, i + 0x6000)));
    let out;
    try { out = await env.AI.run(MODEL, { audio: b64, task: 'transcribe', vad_filter: true, language: url.searchParams.get('lang') || 'he' }); }
    catch (_) { return text('לא הצלחנו לתמלל את ההקלטה. נסו שוב.', 502); }
    const said = String(out && out.text || '').replace(/\s+/g, ' ').trim();
    if (!said) return text('לא נשמע דיבור בהקלטה.', 422);
    name = String(name || url.searchParams.get('name') || 'הודעה קולית').replace(/[\u0000-\u001f<>]/g, '').slice(0, 120);
    await env.DB.prepare('INSERT INTO inbox (uid, name, body, t) VALUES (?, ?, ?, ?)').bind(owner.uid, name, said.slice(0, 60000), Date.now()).run();
    return text('ההודעה תומללה ומחכה בבוט הרכזים.');
  }
  // the signed-in page
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return text('forbidden', 403);
  const w = await who(request, env);
  if (!w || w.notify) return text('for signed-in coordinators only', 403);
  let b = {}; try { b = await request.json(); } catch (_) {}
  if (b.op === 'state') { const k = await env.DB.prepare('SELECT t FROM inbox_keys WHERE uid = ?').bind(w.uid).first(); return json({ hasKey: !!k, shortcut: String(env.SHORTCUT_URL || '') }); }
  if (b.op === 'key') {   // a new key replaces the old one; shown once, kept only as a hash
    const a = new Uint8Array(20); crypto.getRandomValues(a);
    const key = [...a].map(x => x.toString(16).padStart(2, '0')).join('');
    await env.DB.prepare('INSERT INTO inbox_keys (uid, h, t) VALUES (?, ?, ?) ON CONFLICT (uid) DO UPDATE SET h = excluded.h, t = excluded.t').bind(w.uid, await sha('inbox|' + key), Date.now()).run();
    return json({ key });
  }
  if (b.op === 'unkey') { await env.DB.batch([env.DB.prepare('DELETE FROM inbox_keys WHERE uid = ?').bind(w.uid), env.DB.prepare('DELETE FROM inbox WHERE uid = ?').bind(w.uid)]); return json({ ok: true }); }
  if (b.op === 'take') {
    const rs = await env.DB.prepare('SELECT id, name, body, t FROM inbox WHERE uid = ? ORDER BY id LIMIT 10').bind(w.uid).all(), items = rs.results || [];
    if (items.length) await env.DB.prepare('DELETE FROM inbox WHERE uid = ? AND id <= ?').bind(w.uid, items[items.length - 1].id).run();
    return json({ items: items.map(x => ({ name: x.name, text: x.body, t: x.t })) });
  }
  return text('bad request', 400);
}
