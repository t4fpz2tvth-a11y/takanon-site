// 17.11.2026 (Yoni: "כן", a one-step road from WhatsApp on an iPhone): a coordinator's voice inbox. An iPhone cannot share a file
// into a web app, so a small Apple Shortcut in the share list sends the voice message here with the coordinator's personal
// inbox key. The recording is transcribed at once (the same road as /api/transcribe, ../_voice.js) and is NOT kept: only the
// text waits, for up to 30 minutes, until the coordinator's own signed-in page takes it (and it is deleted). The key can
// only put a transcript into its owner's inbox: it reads nothing and signs in to nothing. Only its hash is stored.
//   POST the recording, header X-Inbox-Key (from the Shortcut)       -> a short line of text for the Shortcut to show
//   POST { op: 'state' | 'key' | 'unkey' | 'take' } (the signed-in page) -> { hasKey, shortcut } | { key } | { ok } | { items }
import { json, text, who, sha } from '../_lib.js';
import { transcribe } from '../_voice.js';
// the iCloud link of the Apple Shortcut "לבוט הרכזים" (not a secret); the setting SHORTCUT_URL overrides it
const SHORTCUT = '';
const MAX = 12 * 1048576, KEEP = 30 * 60e3, KEY = /^[a-f0-9]{40}$/;
async function tables(env) {
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS inbox_keys (uid TEXT PRIMARY KEY, h TEXT NOT NULL, t INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS inbox (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, name TEXT, body TEXT NOT NULL, t INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS hits (k TEXT NOT NULL, h INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (k, h))'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS inbox_t (id TEXT PRIMARY KEY, body TEXT NOT NULL, t INTEGER NOT NULL)'),
    env.DB.prepare('DELETE FROM inbox_t WHERE t < ?').bind(Date.now() - KEEP),
    env.DB.prepare('DROP TABLE IF EXISTS inbox_dbg'),   // the model comparison of 17.11.2026 is over
    env.DB.prepare('DELETE FROM inbox WHERE t < ?').bind(Date.now() - KEEP)
  ]);
}
const count = async (env, k) => { const r = await env.DB.prepare('INSERT INTO hits (k, h, n) VALUES (?, ?, 1) ON CONFLICT (k, h) DO UPDATE SET n = n + 1 RETURNING n').bind(k, Math.floor(Date.now() / 3600e3)).first(); return r ? r.n : 0; };
export async function onRequestPost({ request, env }) {
  if (!env.DB) return text('the inbox is not set up', 503);
  const url = new URL(request.url), sent = String(request.headers.get('X-Inbox-Key') || '').trim().toLowerCase();
  await tables(env);
  // 17.11.2026 13:17 (Yoni: "תחתוך את התיווך"): no personal key. The Shortcut (header X-Inbox-App) sends the recording; the answer
  // is the address of the coordinators' page with a one-time ticket (?inbox=<ticket>), which the Shortcut opens; the
  // signed-in page there claims the ticket and gets the text. A ticket is random, works once, and lasts 30 minutes; only a
  // signed-in coordinator can claim one. The old road with a personal key still works for whoever has one
  const app = String(request.headers.get('X-Inbox-App') || '').trim().toLowerCase();
  const ticketRoad = !!app && !sent;
  const back = code => text(url.origin + '/coord/?inbox=' + code);
  if (ticketRoad && app !== String(env.INBOX_APP || 'takanon')) return back('err-app');
  if (sent || ticketRoad) {   // the Shortcut
    const ip = request.headers.get('CF-Connecting-IP') || 'x';
    if (ticketRoad) {   // open to whoever has the Shortcut: so, tight limits by address and for the whole day
      if (await count(env, 'ia:' + await sha(ip)) > 30) return back('err-many');
      const day = await env.DB.prepare('INSERT INTO hits (k, h, n) VALUES (?, ?, 1) ON CONFLICT (k, h) DO UPDATE SET n = n + 1 RETURNING n').bind('ia:all', Math.floor(Date.now() / 864e5) + 10000000).first();
      if (day && day.n > 400) return back('err-many');
    }
    const owner = ticketRoad ? { uid: '', ticket: true } : KEY.test(sent) ? await env.DB.prepare('SELECT uid FROM inbox_keys WHERE h = ?').bind(await sha('inbox|' + sent)).first() : null;
    if (!owner) { await count(env, 'ik:' + await sha(ip)); return text('המפתח האישי לא מוכר. צרו מפתח חדש בבוט הרכזים והדביקו אותו בקיצור הדרך.', 403); }
    if (!ticketRoad && (await count(env, 'ik:' + await sha(ip)) > 120 || await count(env, 'i:' + owner.uid) > 40)) return text('יותר מדי הקלטות בשעה האחרונה. נסו שוב מאוחר יותר.', 429);
    if (Number(request.headers.get('Content-Length') || 0) > MAX + 4096) return ticketRoad ? back('err-long') : text('ההקלטה ארוכה מדי לתמלול (עד 12 מ"ב).', 413);
    let buf = null, name = '';
    try {
      if (/^multipart\/form-data/i.test(request.headers.get('Content-Type') || '')) {
        const form = await request.formData();
        for (const [, v] of form) if (v && typeof v !== 'string' && v.size) { buf = new Uint8Array(await v.arrayBuffer()); name = v.name || ''; break; }
      } else buf = new Uint8Array(await request.arrayBuffer());
    } catch (_) {}
    if (!buf || !buf.length) return ticketRoad ? back('err-none') : text('לא התקבלה הקלטה.', 400);
    if (buf.length > MAX) return ticketRoad ? back('err-long') : text('ההקלטה ארוכה מדי לתמלול (עד 12 מ"ב).', 413);
    let said = '';
    try { said = (await transcribe(env, buf, request.headers.get('Content-Type') || '', url.searchParams.get('lang') || 'he')).text; }
    catch (_) { return ticketRoad ? back('err-fail') : text('לא הצלחנו לתמלל את ההקלטה. נסו שוב.', 502); }
    if (!said) return ticketRoad ? back('err-quiet') : text('לא נשמע דיבור בהקלטה.', 422);
    name = String(name || url.searchParams.get('name') || 'הודעה קולית').replace(/[\u0000-\u001f<>]/g, '').slice(0, 120);
    if (ticketRoad) {
      const a = new Uint8Array(16); crypto.getRandomValues(a);
      const id = [...a].map(x => x.toString(16).padStart(2, '0')).join('');
      await env.DB.prepare('INSERT INTO inbox_t (id, body, t) VALUES (?, ?, ?)').bind(id, said.slice(0, 60000), Date.now()).run();
      return back(id);
    }
    await env.DB.prepare('INSERT INTO inbox (uid, name, body, t) VALUES (?, ?, ?, ?)').bind(owner.uid, name, said.slice(0, 60000), Date.now()).run();
    return text('ההודעה תומללה ומחכה בבוט הרכזים.');
  }
  // the signed-in page
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return text('forbidden', 403);
  const w = await who(request, env);
  if (!w || w.notify) return text('for signed-in coordinators only', 403);
  let b = {}; try { b = await request.json(); } catch (_) {}
  if (b.op === 'state') { const k = await env.DB.prepare('SELECT t FROM inbox_keys WHERE uid = ?').bind(w.uid).first(); return json({ hasKey: !!k, shortcut: String(env.SHORTCUT_URL || SHORTCUT || '') }); }
  if (b.op === 'key') {   // a new key replaces the old one; shown once, kept only as a hash
    const a = new Uint8Array(20); crypto.getRandomValues(a);
    const key = [...a].map(x => x.toString(16).padStart(2, '0')).join('');
    await env.DB.prepare('INSERT INTO inbox_keys (uid, h, t) VALUES (?, ?, ?) ON CONFLICT (uid) DO UPDATE SET h = excluded.h, t = excluded.t').bind(w.uid, await sha('inbox|' + key), Date.now()).run();
    return json({ key });
  }
  if (b.op === 'unkey') { await env.DB.batch([env.DB.prepare('DELETE FROM inbox_keys WHERE uid = ?').bind(w.uid), env.DB.prepare('DELETE FROM inbox WHERE uid = ?').bind(w.uid)]); return json({ ok: true }); }
  if (b.op === 'claim') {   // a ticket the Shortcut got: taken once
    const id = String(b.id || '');
    if (!/^[a-f0-9]{32}$/.test(id)) return json({ text: '' });
    const r = await env.DB.prepare('DELETE FROM inbox_t WHERE id = ? RETURNING body').bind(id).first();
    return json({ text: r ? r.body : '', gone: !r });
  }
  if (b.op === 'take') {
    const rs = await env.DB.prepare('SELECT id, name, body, t FROM inbox WHERE uid = ? ORDER BY id LIMIT 10').bind(w.uid).all(), items = rs.results || [];
    if (items.length) await env.DB.prepare('DELETE FROM inbox WHERE uid = ? AND id <= ?').bind(w.uid, items[items.length - 1].id).run();
    return json({ items: items.map(x => ({ name: x.name, text: x.body, t: x.t })) });
  }
  return text('bad request', 400);
}
