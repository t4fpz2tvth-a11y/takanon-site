// Sends one prompt to a few models through the site's comparison route (/api/chat?test=1) and saves what each one wrote.
// The code comes from the workflow's secret and is sent only as a header; it is never printed or saved.
import fs from 'node:fs';
const CODE = process.env.BENCH_CODE || '';
if (!CODE) { console.log('BENCH_CODE secret is missing'); process.exit(1); }
const req = JSON.parse(fs.readFileSync('ask/request.json', 'utf8'));
// 16.11.2026: mode "enrich" = everyday search words for the clauses (ask/enrich.mjs), through the same route and secret
if (req.mode === 'enrich') { await import('./enrich.mjs'); process.exit(0); }
// 17.11.2026: mode "embed" = the meaning search's clause vectors (ask/embed.mjs)
if (req.mode === 'embed') { await import('./embed.mjs'); process.exit(0); }
const prompt = fs.readFileSync('ask/' + String(req.prompt).replace(/[^A-Za-z0-9_.-]/g, ''), 'utf8');
const SITE = 'https://takanon-site.pages.dev';
const out = { tag: req.tag, at: new Date().toISOString(), answers: {} };
async function once(model) {
  const r = await fetch(SITE + '/api/chat?test=1', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Code': encodeURIComponent(CODE) },
    body: JSON.stringify({ model, stream: true, input: [{ role: 'user', content: prompt }] }) });
  if (!r.ok) return { error: r.status + ' ' + (await r.text()).slice(0, 200), stop: r.status === 403 };
  const dec = new TextDecoder(); let buf = '', text = '', usage = null;
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const d = line.slice(5).trim(); if (d === '[DONE]') continue;
      try { const j = JSON.parse(d); const c = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content; if (c) text += c; if (j.usage) usage = j.usage; if (j.error) return { error: JSON.stringify(j.error).slice(0, 200) }; } catch (_) {}
    }
  }
  return text ? { text, usage } : { error: 'empty answer' };
}
async function ask(model) {
  for (let n = 0; n < 3; n++) {
    let a; try { a = await once(model); } catch (e) { a = { error: String(e).slice(0, 200) }; }
    out.answers[model] = a;
    if (a.text || a.stop) return;
    await new Promise(r => setTimeout(r, 8000));
  }
}
await Promise.all(req.models.map(ask));
fs.writeFileSync('ask/results_' + String(req.tag).replace(/[^A-Za-z0-9_-]/g, '') + '.json', JSON.stringify(out, null, 1));
for (const m of req.models) { const a = out.answers[m] || {}; console.log(m, a.error ? 'ERROR ' + a.error : 'ok, ' + a.text.length + ' chars, cost ' + (a.usage && a.usage.cost)); }
