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
for (const aig of ['', '1', 'log']) for (const stream of [false, true]) {
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
for (const stream of [false, true]) {
  const t0 = Date.now(), row = { live: true, stream };
  try {
    const r = await fetch(SITE + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Origin': SITE, 'X-Preview': '1', 'X-Client': 'cftest0cftest0cftest0' },
      body: JSON.stringify({ input: 'ענו במילה אחת בלבד: כמה ימים יש בשבוע?', tier: 'default', stream }) });
    row.status = r.status; row.via = r.headers.get('X-Via'); const t = await r.text(); row.len = t.length; row.tail = t.slice(-200);
  } catch (e) { row.error = String(e && e.message || e).slice(0, 200); }
  row.ms = Date.now() - t0; out.chat.push(row); console.log('live', JSON.stringify(row).slice(0, 300));
}
for (const f of req.audio === false ? [] : fs.readdirSync('ask/audio').sort()) for (const lang of f.startsWith('s.') ? ['auto', 'he'] : ['he']) {
  const t0 = Date.now(), row = { file: f, lang, bytes: fs.statSync('ask/audio/' + f).size };
  try {
    const r = await fetch(SITE + '/api/transcribe?lang=' + lang, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/octet-stream' }, H), body: fs.readFileSync('ask/audio/' + f) });
    row.status = r.status; row.body = (await r.text()).slice(0, 600);
  } catch (e) { row.error = String(e && e.message || e).slice(0, 200); }
  row.ms = Date.now() - t0; out.audio.push(row); console.log('audio', JSON.stringify(row).slice(0, 300));
}
try { const r = await fetch(SITE + '/api/human', { headers: H }); out.human = { status: r.status, body: (await r.text()).slice(0, 600) }; } catch (e) { out.human = { error: String(e).slice(0, 200) }; }
try { const r = await fetch(SITE + '/api/transcribe', { method: 'POST', body: 'x' }); out.noCode = r.status; } catch (_) {}
fs.writeFileSync('ask/results_' + tag + '.json', JSON.stringify(out, null, 1));
console.log('done');
