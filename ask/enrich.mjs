// 16.11.2026 (Yoni: "כן להכל"): everyday search words for each clause, written once by a model. The regulations' wording is not
// touched: the words are kept beside the clause as hidden search words. Reads ask/enrich_in.json (batches of clauses: id, document,
// title, the opening of the text), asks through the site's comparison route, writes ask/results_<tag>.json { words: { id: "..." } }.
// The code comes from the workflow's secret, goes only as a header, and is never printed or saved.
import fs from 'node:fs';
const CODE = process.env.BENCH_CODE || '';
if (!CODE) { console.log('BENCH_CODE secret is missing'); process.exit(1); }
const req = JSON.parse(fs.readFileSync('ask/request.json', 'utf8'));
const model = String(req.model || 'anthropic/claude-haiku-5.5'), K = Math.max(1, Math.min(6, Number(req.k) || 4));
const tag = String(req.tag || 'enrich').replace(/[^A-Za-z0-9_-]/g, '');
const prompt = fs.readFileSync('ask/enrich_prompt.md', 'utf8');
const batches = JSON.parse(fs.readFileSync('ask/enrich_in.json', 'utf8')).batches.slice(0, Number(req.limit) || 1e9);
const SITE = 'https://takanon-site.pages.dev';
const outFile = 'ask/results_' + tag + '.json';
const out = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : { tag, model, words: {}, failed: [], cost: 0 };
out.at = new Date().toISOString(); out.failed = [];
async function once(text) {
  const r = await fetch(SITE + '/api/chat?test=1', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Code': encodeURIComponent(CODE) },
    body: JSON.stringify({ model, stream: true, input: [{ role: 'user', content: text }] }) });
  if (!r.ok) return { error: r.status + ' ' + (await r.text()).slice(0, 200), stop: r.status === 403 || r.status === 402 };
  const dec = new TextDecoder(); let buf = '', t = '', usage = null;
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const d = line.slice(5).trim(); if (d === '[DONE]') continue;
      try { const j = JSON.parse(d); const c = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content; if (c) t += c; if (j.usage) usage = j.usage; if (j.error) return { error: JSON.stringify(j.error).slice(0, 200) }; } catch (_) {}
    }
  }
  return t ? { text: t, usage } : { error: 'empty answer' };
}
let stop = false, next = 0, done = 0;
async function worker() {
  while (!stop && next < batches.length) {
    const bi = next++, b = batches[bi];
    if (b.every(x => x.id in out.words)) { done++; continue; }   // a rerun asks only for what is missing
    const text = prompt + '\n' + b.map(x => 'id: ' + x.id + '\nמסמך: ' + x.doc + '\nכותרת: ' + x.t + '\nנוסח: ' + x.x).join('\n\n');
    let ok = false;
    for (let n = 0; n < 3 && !ok && !stop; n++) {
      let a; try { a = await once(text); } catch (e) { a = { error: String(e).slice(0, 200) }; }
      if (a.stop) { stop = true; console.log('stopped:', a.error); break; }
      if (a.text) {
        if (a.usage && a.usage.cost) out.cost += Number(a.usage.cost) || 0;
        const i = a.text.indexOf('{'), j = a.text.lastIndexOf('}');
        try { const o = JSON.parse(a.text.slice(i, j + 1)); for (const x of b) if (typeof o[x.id] === 'string') out.words[x.id] = o[x.id].slice(0, 400); ok = b.filter(x => x.id in out.words).length >= b.length * 0.8; } catch (_) {}
      }
      if (!ok) await new Promise(r => setTimeout(r, 5000));
    }
    if (!ok) out.failed.push(bi);
    done++;
    if (done % 10 === 0) { console.log(done + '/' + batches.length, 'cost', out.cost.toFixed(3)); fs.writeFileSync(outFile, JSON.stringify(out)); }
  }
}
await Promise.all(Array.from({ length: K }, worker));
fs.writeFileSync(outFile, JSON.stringify(out));
console.log('clauses with words:', Object.keys(out.words).length, 'failed batches:', out.failed.length, 'cost $' + out.cost.toFixed(3));
