// 17.11.2026 (Yoni: "כן", a one-step road from WhatsApp on an iPhone): a coordinator's voice inbox. An iPhone cannot share a file
// into a web app, so a small Apple Shortcut in the share list sends the voice message here with the coordinator's personal
// inbox key. The recording is transcribed at once (the same speech model as /api/transcribe) and is NOT kept: only the
// text waits, for up to 30 minutes, until the coordinator's own signed-in page takes it (and it is deleted). The key can
// only put a transcript into its owner's inbox: it reads nothing and signs in to nothing. Only its hash is stored.
//   POST the recording, header X-Inbox-Key (from the Shortcut)       -> a short line of text for the Shortcut to show
//   POST { op: 'state' | 'key' | 'unkey' | 'take' } (the signed-in page) -> { hasKey, shortcut } | { key } | { ok } | { items }
import { json, text, who, sha } from '../_lib.js';
// the iCloud link of the Apple Shortcut "לבוט הרכזים" (not a secret); the setting SHORTCUT_URL overrides it
const SHORTCUT = '';
const MODEL = '@cf/openai/whisper-large-v3-turbo', MAX = 12 * 1048576, KEEP = 30 * 60e3, KEY = /^[a-f0-9]{40}$/;
async function tables(env) {
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS inbox_keys (uid TEXT PRIMARY KEY, h TEXT NOT NULL, t INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS inbox (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, name TEXT, body TEXT NOT NULL, t INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS hits (k TEXT NOT NULL, h INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (k, h))'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS inbox_t (id TEXT PRIMARY KEY, body TEXT NOT NULL, t INTEGER NOT NULL)'),
    env.DB.prepare('DELETE FROM inbox_t WHERE t < ?').bind(Date.now() - KEEP),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS inbox_dbg (uid TEXT PRIMARY KEY, meta TEXT NOT NULL, t INTEGER NOT NULL)'),
    env.DB.prepare('DELETE FROM inbox_dbg WHERE t < ?').bind(Date.now() - 2 * 3600e3),
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
    const owner = ticketRoad ? { uid: 'admin', ticket: true } : KEY.test(sent) ? await env.DB.prepare('SELECT uid FROM inbox_keys WHERE h = ?').bind(await sha('inbox|' + sent)).first() : null;
    if (!owner) { await count(env, 'ik:' + await sha(ip)); return text('המפתח האישי לא מוכר. צרו מפתח חדש בבוט הרכזים והדביקו אותו בקיצור הדרך.', 403); }
    if (!ticketRoad && (await count(env, 'ik:' + await sha(ip)) > 120 || await count(env, 'i:' + owner.uid) > 40)) return text('יותר מדי הקלטות בשעה האחרונה. נסו שוב מאוחר יותר.', 429);
    if (!env.AI) return ticketRoad ? back('err-off') : text('התמלול לא זמין כרגע.', 503);
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
    let b64 = ''; for (let i = 0; i < buf.length; i += 0x6000) b64 += btoa(String.fromCharCode.apply(null, buf.subarray(i, i + 0x6000)));
    let out;
    try { out = await env.AI.run(MODEL, { audio: b64, task: 'transcribe', vad_filter: true, language: url.searchParams.get('lang') || 'he' }); }
    catch (_) { return ticketRoad ? back('err-fail') : text('לא הצלחנו לתמלל את ההקלטה. נסו שוב.', 502); }
    const said = String(out && out.text || '').replace(/\s+/g, ' ').trim();
    // 17.11.2026 12:55, TEMPORARY (Yoni's first test from his iPhone came out "תודה רבה"): for the head's own key only, what
    // arrived (size, type, first bytes) and how three settings of the speech model heard it, kept two hours for the diagnosis
    if (owner.uid === 'admin') try {
      const ct0 = String(request.headers.get('Content-Type') || '').toLowerCase();
      const meta = { bytes: buf.length, type: request.headers.get('Content-Type') || '', name, magic: [...buf.subarray(0, 40)].map(x => x.toString(16).padStart(2, '0')).join(''), ua: (request.headers.get('User-Agent') || '').slice(0, 80),
        a: { text: said, info: out && out.transcription_info || null, segs: (out && out.segments || []).length } };
      // 13:15: Deepgram nova-3 on Cloudflare has no Hebrew. Candidates through OpenRouter (the union's own key), on the head's test only
      const fmt = /ogg|opus/.test(ct0) ? 'ogg' : /mpeg|mp3/.test(ct0) ? 'mp3' : /wav/.test(ct0) ? 'wav' : /webm/.test(ct0) ? 'webm' : /flac/.test(ct0) ? 'flac' : /aac/.test(ct0) ? 'aac' : 'm4a';
      const OR = { 'Authorization': 'Bearer ' + env.OPENROUTER_KEY, 'Content-Type': 'application/json', 'X-Title': 'Ma Omer HaTakanon' };
      const ask = 'תמללו את ההקלטה מילה במילה, בעברית, עם פיסוק. החזירו רק את התמלול, בלי הקדמה ובלי הערות. אם לא נשמע דיבור, החזירו שורה ריקה.';
      const jobs = [];
      for (const m of ['google/gemini-2.5-flash', 'google/gemini-3-flash-preview', 'google/gemini-2.5-flash-lite', 'openai/gpt-audio-mini', 'mistralai/voxtral-small-24b-2507']) jobs.push((async () => { const t0 = Date.now();
        try { const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: OR, body: JSON.stringify({ model: m, temperature: 0, max_tokens: 1500, provider: { data_collection: 'deny' }, usage: { include: true }, messages: [{ role: 'user', content: [{ type: 'text', text: ask }, { type: 'input_audio', input_audio: { data: b64, format: fmt } }] }] }) });
          const j = await r.json(); meta['or:' + m] = r.ok ? { text: String(j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '').slice(0, 700), cost: j.usage && j.usage.cost, ms: Date.now() - t0, provider: j.provider } : { status: r.status, error: JSON.stringify(j).slice(0, 300) }; } catch (e) { meta['or:' + m] = { error: String(e && e.message || e).slice(0, 200) }; } })());
      for (const m of ['openai/whisper-large-v3', 'openai/gpt-4o-transcribe', 'openai/gpt-4o-mini-transcribe']) jobs.push((async () => { const t0 = Date.now();
        try { const r = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', { method: 'POST', headers: OR, body: JSON.stringify({ model: m, language: 'he', input_audio: { data: b64, format: fmt } }) });
          const tx = await r.text(); meta['tr:' + m] = { status: r.status, body: tx.slice(0, 700), ms: Date.now() - t0 }; } catch (e) { meta['tr:' + m] = { error: String(e && e.message || e).slice(0, 200) }; } })());
      await Promise.all(jobs);
      await env.DB.prepare('INSERT INTO inbox_dbg (uid, meta, t) VALUES (?, ?, ?) ON CONFLICT (uid) DO UPDATE SET meta = excluded.meta, t = excluded.t').bind(owner.uid, JSON.stringify(meta), Date.now()).run();
    } catch (_) {}
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
  if (b.op === 'dbg' && w.admin) { const d = await env.DB.prepare('SELECT meta, t FROM inbox_dbg WHERE uid = ?').bind('admin').first(); return json(d ? { t: d.t, meta: JSON.parse(d.meta) } : {}); }
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
