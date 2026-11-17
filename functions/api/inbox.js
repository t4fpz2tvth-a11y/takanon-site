// 17.11.2026 (Yoni: "כן", a one-step road from WhatsApp on an iPhone): a coordinator's voice inbox. An iPhone cannot share a file
// into a web app, so a small Apple Shortcut in the share list sends the voice message here with the coordinator's personal
// inbox key. The recording is transcribed at once (the same road as /api/transcribe, ../_voice.js) and is NOT kept: only the
// text waits, for up to 30 minutes, until the coordinator's own signed-in page takes it (and it is deleted). The key can
// only put a transcript into its owner's inbox: it reads nothing and signs in to nothing. Only its hash is stored.
//   POST the recording, header X-Inbox-Key (from the Shortcut)       -> a short line of text for the Shortcut to show
//   POST { op: 'state' | 'key' | 'unkey' | 'take' } (the signed-in page) -> { hasKey, shortcut } | { key } | { ok } | { items }
import { json, text, who, sha } from '../_lib.js';
import { transcribe, kindOf, readImage, readPdf, readZip } from '../_voice.js';
// the iCloud link of the Apple Shortcut "לבוט הרכזים" (not a secret); the setting SHORTCUT_URL overrides it
const SHORTCUT = 'https://www.icloud.com/shortcuts/b4651da468e84c5dbf6cf4616e6576e6';   // 17.11.2026 13:49, from Yoni
const MAX = 12 * 1048576, KEEP = 30 * 60e3, KEY = /^[a-f0-9]{40}$/;
async function tables(env) {
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS inbox_keys (uid TEXT PRIMARY KEY, h TEXT NOT NULL, t INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS inbox (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, name TEXT, body TEXT NOT NULL, t INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS hits (k TEXT NOT NULL, h INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (k, h))'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS inbox_done (uid TEXT PRIMARY KEY, t INTEGER NOT NULL, last INTEGER NOT NULL, n INTEGER NOT NULL)'),
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
    // 17.11.2026 15:35 (Yoni: "תעשה את 1"): not only a voice message. A written message that was shared goes in as it is; a
    // picture (a screenshot of a chat) is read into text; a recording is transcribed. v| i| t| before the text says which
    let said = '', what = kindOf(buf, request.headers.get('Content-Type') || '');
    try {
      if (what.kind === 'text') said = what.text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 20000);
      else if (what.kind === 'image') said = (await readImage(env, buf, what.mime)).text;
      else if (what.kind === 'pdf') said = (await readPdf(env, buf)).text.slice(0, 20000);   // 17.11.2026 17:55: a document
      else if (what.kind === 'zip') said = (await readZip(buf, 20000)).text;   // a Word file, or WhatsApp's chat export
      else said = (await transcribe(env, buf, request.headers.get('Content-Type') || '', url.searchParams.get('lang') || 'he')).text;
    } catch (_) { return ticketRoad ? back('err-fail') : text('לא הצלחנו לתמלל את ההקלטה. נסו שוב.', 502); }
    if (!said && what.kind !== 'voice') return ticketRoad ? back(what.kind !== 'text' ? 'err-notext' : 'err-none') : text('לא נמצא טקסט.', 422);
    if (!said) return ticketRoad ? back('err-quiet') : text('לא נשמע דיבור בהקלטה.', 422);
    name = String(name || url.searchParams.get('name') || 'הודעה קולית').replace(/[\u0000-\u001f<>]/g, '').slice(0, 120);
    if (ticketRoad) {
      const a = new Uint8Array(16); crypto.getRandomValues(a);
      const id = [...a].map(x => x.toString(16).padStart(2, '0')).join('');
      await env.DB.prepare('INSERT INTO inbox_t (id, body, t) VALUES (?, ?, ?)').bind(id, what.kind[0] + '|' + said.slice(0, 60000), Date.now()).run();
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
  if (b.op === 'state') { const k = await env.DB.prepare('SELECT t FROM inbox_done WHERE uid = ?').bind(w.uid).first(); return json({ done: !!k, shortcut: String(env.SHORTCUT_URL || SHORTCUT || '') }); }
  if (b.op === 'key') {   // a new key replaces the old one; shown once, kept only as a hash
    const a = new Uint8Array(20); crypto.getRandomValues(a);
    const key = [...a].map(x => x.toString(16).padStart(2, '0')).join('');
    await env.DB.prepare('INSERT INTO inbox_keys (uid, h, t) VALUES (?, ?, ?) ON CONFLICT (uid) DO UPDATE SET h = excluded.h, t = excluded.t').bind(w.uid, await sha('inbox|' + key), Date.now()).run();
    return json({ key });
  }
  if (b.op === 'unkey') { await env.DB.batch([env.DB.prepare('DELETE FROM inbox_keys WHERE uid = ?').bind(w.uid), env.DB.prepare('DELETE FROM inbox WHERE uid = ?').bind(w.uid)]); return json({ ok: true }); }
  // the head's panel: who is connected (a first voice message arrived), since when, how many; and a reset
  if (b.op === 'voice-list' && w.admin) {
    const done = (await env.DB.prepare('SELECT uid, t, last, n FROM inbox_done').all()).results || [], by = Object.fromEntries(done.map(x => [x.uid, x]));
    let codes = []; try { codes = (await env.DB.prepare('SELECT uid, name FROM codes ORDER BY created').all()).results || []; } catch (_) {}
    const day = await env.DB.prepare("SELECT n FROM hits WHERE k = 'ia:all' AND h = ?").bind(Math.floor(Date.now() / 864e5) + 10000000).first();
    return json({ today: day ? day.n : 0, rows: [{ uid: 'admin', name: 'רמ"ח (אני)' }].concat(codes).map(c => Object.assign({ uid: c.uid, name: c.name }, by[c.uid] ? { t: by[c.uid].t, last: by[c.uid].last, n: by[c.uid].n } : {})) });
  }
  if (b.op === 'voice-reset' && w.admin) {
    if (b.uid === '*') await env.DB.prepare('DELETE FROM inbox_done').run(); else await env.DB.prepare('DELETE FROM inbox_done WHERE uid = ?').bind(String(b.uid || '')).run();
    return json({ ok: true });
  }
  if (b.op === 'claim') {   // a ticket the Shortcut got: taken once
    const id = String(b.id || '');
    if (!/^[a-f0-9]{32}$/.test(id)) return json({ text: '' });
    const r = await env.DB.prepare('DELETE FROM inbox_t WHERE id = ? RETURNING body').bind(id).first();
    // 17.11.2026 14:00 (Yoni: the iPhone button goes away once the coordinator is connected): a first transcript that
    // arrived means the Shortcut is installed and works; the head can reset it (voice-reset), and the button comes back
    if (r) await env.DB.prepare('INSERT INTO inbox_done (uid, t, last, n) VALUES (?, ?, ?, 1) ON CONFLICT (uid) DO UPDATE SET last = excluded.last, n = n + 1').bind(w.uid, Date.now(), Date.now()).run();
    const m = r ? /^([vitpz])\|([\s\S]*)$/.exec(r.body) : null;
    return json({ text: r ? (m ? m[2] : r.body) : '', kind: m ? { v: 'voice', i: 'image', t: 'text', p: 'doc', z: 'doc' }[m[1]] : 'voice', gone: !r });
  }
  if (b.op === 'take') {
    const rs = await env.DB.prepare('SELECT id, name, body, t FROM inbox WHERE uid = ? ORDER BY id LIMIT 10').bind(w.uid).all(), items = rs.results || [];
    if (items.length) await env.DB.prepare('DELETE FROM inbox WHERE uid = ? AND id <= ?').bind(w.uid, items[items.length - 1].id).run();
    return json({ items: items.map(x => ({ name: x.name, text: x.body, t: x.t })) });
  }
  return text('bad request', 400);
}
