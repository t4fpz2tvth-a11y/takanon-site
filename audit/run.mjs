// 6.11.2026 (Yoni): the UX/UI audit brief run by other models, through the site's own server (the key stays there).
// audit/request.json: { "run": n, "models": ["openai/gpt-6.1-sol", ...] }. Each model gets the packet (text + the 37
// screenshots by URL) and writes audit/results_<slug>.md; a .meta.json keeps the usage. Needs BENCH_CODE (the bench code).
import fs from 'node:fs';
const SITE = process.env.AUDIT_SITE || 'https://takanon-site.pages.dev';
const CODE = process.env.BENCH_CODE || '';
if (!CODE) { console.log('BENCH_CODE secret is missing'); process.exit(1); }
const req = JSON.parse(fs.readFileSync('audit/request.json', 'utf8'));
const packet = fs.readFileSync('audit/packet.md', 'utf8');
const caps = JSON.parse(fs.readFileSync('audit/captions.json', 'utf8')).captions;
const slug = m => m.replace(/[^a-z0-9.]+/gi, '-').replace(/^-|-$/g, '');
const parts = [{ type: 'text', text: packet + '\n\n## הצילומים (26), לפי הסדר והכיתוב שבחלק ב\n' }];
for (const [k, v] of Object.entries(caps)) {
  parts.push({ type: 'text', text: '\n' + v + ':' });
  parts.push({ type: 'image_url', image_url: { url: SITE + '/audit/img/' + k + '.jpg' } });
}
parts.push({ type: 'text', text: '\n\nכתוב עכשיו את מסמך האבחון המלא בעברית, לפי ההנחיה שבחלק א.' });
// 6.11.2026 (run 2): some models refuse reasoning off ("Reasoning is mandatory"); those get the default low effort, kept hidden
async function ask(model, exp = 'reasonoff') {
  const t0 = Date.now();
  const r = await fetch(SITE + '/api/chat?test=1&exp=' + exp, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Code': encodeURIComponent(CODE) },
    body: JSON.stringify({ model, stream: true, max_tokens: 32000, input: [{ role: 'user', content: parts }] }),   // reasoning counts inside; two documents were cut at 16000
  });
  if (!r.ok) { const t = await r.text(); if (exp === 'reasonoff' && /Reasoning is mandatory/.test(t)) { console.log('  reasoning stays on for', model); return ask(model, ''); } throw new Error(model + ': HTTP ' + r.status + ' ' + t.slice(0, 300)); }
  const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '', text = '', usage = null, finish = '';
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue; const d = line.slice(5).trim(); if (d === '[DONE]') continue;
      try { const j = JSON.parse(d); const c = j.choices && j.choices[0]; if (c && c.delta && c.delta.content) text += c.delta.content; if (c && c.finish_reason) finish = c.finish_reason; if (j.usage) usage = j.usage; if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 300)); } catch (e) { if (!(e instanceof SyntaxError)) throw e; }
    }
  }
  return { text, usage, finish, secs: Math.round((Date.now() - t0) / 1000) };
}
const meta = { run: req.run, t: new Date().toISOString(), site: SITE, models: {} };
for (const model of req.models || []) {
  console.log('asking', model);
  try {
    const out = await ask(model);
    fs.writeFileSync('audit/results_' + slug(model) + '.md', '<!-- ' + model + ' · ' + new Date().toISOString().slice(0, 16) + ' · ' + (out.usage ? JSON.stringify(out.usage) : 'no usage') + ' · finish=' + out.finish + ' -->\n\n' + out.text.trim() + '\n');
    meta.models[model] = { ok: true, chars: out.text.length, usage: out.usage, finish: out.finish, secs: out.secs };
    console.log('  done:', out.text.length, 'chars,', out.secs, 's', out.usage ? JSON.stringify(out.usage) : '');
  } catch (e) { meta.models[model] = { ok: false, error: String(e.message).slice(0, 400) }; console.log('  failed:', e.message.slice(0, 300)); }
}
fs.writeFileSync('audit/results.meta.json', JSON.stringify(meta, null, 1));
