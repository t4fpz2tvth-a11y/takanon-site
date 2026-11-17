// 17.11.2026 (Yoni: "תבנה את 3 ההצעות"): a check of the new Cloudflare pieces on the live site, with synthetic data only.
// (1) /api/chat through the AI Gateway (?test=1&aig=1): which way the call went (X-Via), the status, and that a streamed
//     answer arrives in pieces; the same straight, for comparison. (2) /api/transcribe on small synthetic recordings
//     (ask/audio/s.*: an English sentence spoken by a computer voice) in the formats voice messages come in.
//     (3) /api/human: what it says before the widget is set. Writes ask/results_<tag>.json. The secret goes only as a header.
import fs from 'node:fs';
const CODE = process.env.BENCH_CODE || '';
if (!CODE) { console.log('BENCH_CODE secret is missing'); process.exit(1); }
const req = JSON.parse(fs.readFileSync('ask/request.json', 'utf8'));
const tag = String(req.tag || 'cftest').replace(/[^A-Za-z0-9_-]/g, '');
const SITE = 'https://takanon-site.pages.dev', H = { 'X-Code': encodeURIComponent(CODE) };
const out = { tag, at: new Date().toISOString(), chat: [], audio: [], human: null };
for (const aig of req.chat === false ? [] : ['', '1', 'log']) for (const stream of [false, true]) {
  const t0 = Date.now(), row = { aig: !!aig, stream };
  try {
    const r = await fetch(SITE + '/api/chat?test=1' + (aig ? '&aig=' + aig : ''), { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, H),
      body: JSON.stringify({ input: 'ענו במילה אחת בלבד: מה בירת ישראל?', tier: 'default', stream, model: 'anthropic/claude-haiku-5.5' }) });
    row.status = r.status; row.via = r.headers.get('X-Via'); row.log = r.headers.get('X-Aig-Log'); row.type = r.headers.get('Content-Type');
    if (stream) { let n = 0, first = 0, txt = ''; const rd = r.body.getReader(), dec = new TextDecoder(); for (;;) { const x = await rd.read(); if (x.done) break; if (!n) first = Date.now() - t0; n++; txt += dec.decode(x.value, { stream: true }); } row.chunks = n; row.firstMs = first; row.tail = txt.slice(-700); }
    else row.body = (await r.text()).slice(0, 900);
  } catch (e) { row.error = String(e && e.message || e).slice(0, 200); }
  row.ms = Date.now() - t0; out.chat.push(row); console.log('chat', JSON.stringify(row).slice(0, 300));
}
// the live road, as the public page calls it (no test mode, no code): it should say X-Via: gateway
for (const stream of req.chat === false ? [] : [false, true]) {
  const t0 = Date.now(), row = { live: true, stream };
  try {
    const r = await fetch(SITE + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Origin': SITE, 'X-Preview': '1', 'X-Client': 'cftest0cftest0cftest0' },
      body: JSON.stringify({ input: 'ענו במילה אחת בלבד: כמה ימים יש בשבוע?', tier: 'default', stream }) });
    row.status = r.status; row.via = r.headers.get('X-Via'); const t = await r.text(); row.len = t.length; row.tail = t.slice(-200);
  } catch (e) { row.error = String(e && e.message || e).slice(0, 200); }
  row.ms = Date.now() - t0; out.chat.push(row); console.log('live', JSON.stringify(row).slice(0, 300));
}
for (const f of req.audio === false ? [] : fs.readdirSync('ask/audio').sort()) for (const lang of ['auto']) {
  const t0 = Date.now(), row = { file: f, lang, bytes: fs.statSync('ask/audio/' + f).size };
  try {
    const r = await fetch(SITE + '/api/transcribe?lang=' + lang, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/octet-stream' }, H), body: fs.readFileSync('ask/audio/' + f) });
    row.status = r.status; row.body = (await r.text()).slice(0, 600);
  } catch (e) { row.error = String(e && e.message || e).slice(0, 200); }
  row.ms = Date.now() - t0; out.audio.push(row); console.log('audio', JSON.stringify(row).slice(0, 300));
}
// the voice inbox: a key for the comparison's own user, a synthetic recording sent with it, taken once, the key removed.
// The key is never written to the results
if (req.inbox) { out.inbox = {}; try {
  const J = { 'Content-Type': 'application/json' }, op = async o => { const r = await fetch(SITE + '/api/inbox', { method: 'POST', headers: Object.assign({}, J, H), body: JSON.stringify({ op: o }) }); return { status: r.status, j: r.ok ? await r.json() : null }; };
  const k = await op('key'); out.inbox.key = { status: k.status, len: k.j && k.j.key ? k.j.key.length : 0 };
  const key = k.j && k.j.key || '';
  const bad = await fetch(SITE + '/api/inbox', { method: 'POST', headers: { 'X-Inbox-Key': '0'.repeat(40), 'Content-Type': 'audio/ogg' }, body: fs.readFileSync('ask/audio/s.ogg') }); out.inbox.wrong = bad.status;
  const t0 = Date.now(), s1 = await fetch(SITE + '/api/inbox', { method: 'POST', headers: { 'X-Inbox-Key': key, 'Content-Type': 'audio/ogg' }, body: fs.readFileSync('ask/audio/s.ogg') });
  out.inbox.send = { status: s1.status, text: (await s1.text()).slice(0, 200), ms: Date.now() - t0 };
  const t1 = await op('take'); out.inbox.take = { status: t1.status, items: (t1.j && t1.j.items || []).map(x => ({ name: x.name, text: String(x.text).slice(0, 200) })) };
  const t2 = await op('take'); out.inbox.again = (t2.j && t2.j.items || []).length;
  out.inbox.state = (await op('state')).j; out.inbox.unkey = (await op('unkey')).status;
  const after = await fetch(SITE + '/api/inbox', { method: 'POST', headers: { 'X-Inbox-Key': key, 'Content-Type': 'audio/ogg' }, body: fs.readFileSync('ask/audio/s.ogg') }); out.inbox.afterUnkey = after.status;
} catch (e) { out.inbox.error = String(e && e.message || e).slice(0, 200); } console.log('inbox', JSON.stringify(out.inbox)); }
// the keyless road of the Shortcut: a synthetic recording -> a ticket address -> claimed once
if (req.ticket) { out.ticket = {}; try {
  const s1 = await fetch(SITE + '/api/inbox?lang=auto', { method: 'POST', headers: { 'X-Inbox-App': 'takanon', 'Content-Type': 'audio/x-m4a' }, body: fs.readFileSync('ask/audio/s.m4a') });
  const u = await s1.text(); out.ticket.send = { status: s1.status, shape: u.replace(/[a-f0-9]{32}/, '<ticket>') };
  const id = (/inbox=([a-f0-9]{32})/.exec(u) || [])[1] || '';
  const claim = async () => { const r = await fetch(SITE + '/api/inbox', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, H), body: JSON.stringify({ op: 'claim', id }) }); return r.ok ? await r.json() : { status: r.status }; };
  out.ticket.first = await claim(); out.ticket.second = await claim();
  const nc = await fetch(SITE + '/api/inbox', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'claim', id }) }); out.ticket.noSignIn = nc.status;
  const bad = await fetch(SITE + '/api/inbox', { method: 'POST', headers: { 'X-Inbox-App': 'other', 'Content-Type': 'audio/x-m4a' }, body: fs.readFileSync('ask/audio/s.m4a') }); out.ticket.otherApp = (await bad.text()).slice(-20);
} catch (e) { out.ticket.error = String(e && e.message || e).slice(0, 200); } console.log('ticket', JSON.stringify(out.ticket)); }
if (req.state) { try { const r = await fetch(SITE + '/api/inbox', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, H), body: '{"op":"state"}' }); out.state = { status: r.status, j: r.ok ? await r.json() : null }; } catch (e) { out.state = { error: String(e).slice(0, 200) }; } }
// 17.11.2026: a written message and a picture (an invented chat) through the Shortcut's road
if (req.shared) { out.shared = {}; try {
  const go = async (body, ct) => { const s1 = await fetch(SITE + '/api/inbox', { method: 'POST', headers: { 'X-Inbox-App': 'takanon', 'Content-Type': ct }, body }); const u = await s1.text(); const id = (/inbox=([a-f0-9]{32})/.exec(u) || [])[1] || '';
    if (!id) return { status: s1.status, shape: u.slice(-40) }; const r = await fetch(SITE + '/api/inbox', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, H), body: JSON.stringify({ op: 'claim', id }) }); return r.ok ? await r.json() : { status: r.status }; };
  out.shared.text = await go(Buffer.from('היי, לא נתנו לי מועד מיוחד אחרי המילואים. מה עושים?'), 'text/plain');
  out.shared.image = await go(fs.readFileSync('ask/img/chat.png'), 'image/png');
  out.shared.voice = await go(fs.readFileSync('ask/audio/s.m4a'), 'audio/x-m4a');
  // 17.11.2026 18:40: documents (invented ones): a PDF through the model, a Word file and a chat export read on the server
  if (req.docs) { out.shared.pdf = await go(fs.readFileSync('ask/doc/letter.pdf'), 'application/pdf'); out.shared.docx = await go(fs.readFileSync('ask/doc/doc.docx'), 'application/octet-stream'); out.shared.chat = await go(fs.readFileSync('ask/doc/chat.zip'), 'application/zip'); if (out.shared.chat && out.shared.chat.text) out.shared.chat.text = out.shared.chat.text.slice(-60); }
} catch (e) { out.shared.error = String(e && e.message || e).slice(0, 200); } console.log('shared', JSON.stringify(out.shared)); }
// 17.11.2026: the head's new panels and the calendar file, on the live site
if (req.panels) { out.panels = {}; try {
  const J = Object.assign({ 'Content-Type': 'application/json' }, H);
  const w = await fetch(SITE + '/api/watch', { method: 'POST', headers: J, body: '{}' }); const wj = w.ok ? await w.json() : null;
  out.panels.watch = { status: w.status, last: wj && wj.last, changes: wj && (wj.changes || []).map(c => c.kind + ' ' + c.name).slice(0, 6), unreachable: wj && (wj.unreachable || []).length, sources: wj && wj.sources };
  const s1 = await fetch(SITE + '/api/stat', { method: 'POST', headers: J, body: JSON.stringify({ op: 'report' }) }); const sj = s1.ok ? await s1.json() : null;
  out.panels.stat = { status: s1.status, month: sj && sj.month, rows: sj && (sj.rows || []).slice(0, 12) };
  const nos = await fetch(SITE + '/api/stat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'report' }) }); out.panels.statNoSignIn = nos.status;
  const now = await fetch(SITE + '/api/watch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); out.panels.watchNoSignIn = now.status;
  const ic = await fetch(SITE + '/api/ics?d=2026-11-30&k=deadline&o=3.11&u=test1'); const it = await ic.text();
  out.panels.ics = { status: ic.status, type: ic.headers.get('content-type'), lines: it.split('\r\n').length, summary: (it.split('\r\n').find(l => l.startsWith('SUMMARY:')) || '') };
  const vl = await fetch(SITE + '/api/inbox', { method: 'POST', headers: J, body: JSON.stringify({ op: 'voice-list' }) }); const vj = vl.ok ? await vl.json() : null;
  out.panels.voice = { status: vl.status, rows: vj && (vj.rows || []).length, connected: vj && (vj.rows || []).filter(r => r.t).length, today: vj && vj.today };
} catch (e) { out.panels.error = String(e && e.message || e).slice(0, 200); } console.log('panels', JSON.stringify(out.panels)); }
if (req.dbg) { try { const r = await fetch(SITE + '/api/inbox', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, H), body: '{"op":"dbg"}' }); out.dbg = { status: r.status, j: r.ok ? await r.json() : null }; } catch (e) { out.dbg = { error: String(e).slice(0, 200) }; } }
try { const r = await fetch(SITE + '/api/human', { headers: H }); out.human = { status: r.status, body: (await r.text()).slice(0, 600) }; } catch (e) { out.human = { error: String(e).slice(0, 200) }; }
try { const r = await fetch(SITE + '/api/transcribe', { method: 'POST', body: 'x' }); out.noCode = r.status; } catch (_) {}
// 17.11.2026 23:35: a check notification to the signed-in one's own devices (the head's, with the workflow's code)
if (req.pushtest) { try { const r = await fetch(SITE + '/api/push', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, H), body: '{"op":"test"}' }); out.pushtest = { status: r.status, j: r.ok ? await r.json() : (await r.text()).slice(0, 120) }; } catch (e) { out.pushtest = { error: String(e).slice(0, 200) }; } console.log('pushtest', JSON.stringify(out.pushtest)); }
// 17.11.2026 23:30: is the tracking sheet's script connected (the mail on the head's remark goes through it)? only yes or no; and the push key's length
if (req.sheet) { try { const r = await fetch(SITE + '/api/sheet', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, H), body: '{"op":"status"}' }); const j = r.ok ? await r.json() : {}; out.sheet = { status: r.status, connected: !!j.connected }; const k = await fetch(SITE + '/api/push'); out.pushKey = { status: k.status, len: ((await k.json().catch(() => ({}))).key || '').length }; const st = await fetch(SITE + '/api/push', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, H), body: '{"op":"tick"}' }); out.tick = { status: st.status, body: (await st.text()).slice(0, 80) }; } catch (e) { out.sheet = { error: String(e).slice(0, 200) }; } console.log('sheet', JSON.stringify(out.sheet), JSON.stringify(out.pushKey), JSON.stringify(out.tick)); }
// 17.11.2026 18:40: the calendar feed: an address for the signed-in one, the feed read with no sign-in; only counts are kept, never the address
if (req.cal) { try { const r = await fetch(SITE + '/api/cal', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, H), body: '{"op":"link"}' }); const j = r.ok ? await r.json() : {}; out.cal = { link: r.status, shape: String(j.url || '').replace(/[a-f0-9]{40}/, '<key>') };
  if (j.url) { const f = await fetch(j.url), t = await f.text(); out.cal.feed = { status: f.status, type: f.headers.get('content-type'), starts: t.slice(0, 15), events: (t.match(/BEGIN:VEVENT/g) || []).length }; }
  const g = await fetch(SITE + '/api/cal?k=' + 'a'.repeat(40)); out.cal.guess = g.status; const n = await fetch(SITE + '/api/cal', { method: 'POST', body: '{"op":"link"}' }); out.cal.noSignIn = n.status;
} catch (e) { out.cal = { error: String(e).slice(0, 200) }; } console.log('cal', JSON.stringify(out.cal)); }
fs.writeFileSync('ask/results_' + tag + '.json', JSON.stringify(out, null, 1));
console.log('done');
