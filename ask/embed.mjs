// 17.11.2026: the meaning search's clause vectors, made once (and again when the regulations change). Reads ask/embed_in.json
// (every clause in pieces of about 700 characters: the clause's id and the text to embed: document, number, title, a piece of
// the text; the first piece also carries the clause's everyday words),
// asks /api/embed in batches with the comparison secret, and writes ask/vec/ids.json + ask/vec/vecs.bin (copied to public/vec/ by hand, so the site serves them; one row of
// signed bytes per piece, in the order of ids.json, where a clause's id repeats for each of its pieces). Also embeds the test questions in ask/embed_q.json and writes, for
// each, the clauses nearest by meaning: ask/results_<tag>.json. The secret goes only as a header and is never printed.
import fs from 'node:fs';
const CODE = process.env.BENCH_CODE || '';
if (!CODE) { console.log('BENCH_CODE secret is missing'); process.exit(1); }
const req = JSON.parse(fs.readFileSync('ask/request.json', 'utf8'));
const tag = String(req.tag || 'embed').replace(/[^A-Za-z0-9_-]/g, '');
const SITE = 'https://takanon-site.pages.dev';
const items = JSON.parse(fs.readFileSync('ask/embed_in.json', 'utf8')).items;
async function embed(texts) {
  for (let n = 0; n < 4; n++) {
    try {
      const r = await fetch(SITE + '/api/embed', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Code': encodeURIComponent(CODE) }, body: JSON.stringify({ texts }) });
      if (r.ok) { const j = await r.json(); if (j.vs && j.vs.length === texts.length) return j; }
      else { const t = (await r.text()).slice(0, 200); console.log('embed', r.status, t); if (r.status === 403 || r.status === 503) return null; }
    } catch (e) { console.log('embed error', String(e).slice(0, 120)); }
    await new Promise(r => setTimeout(r, 4000 * (n + 1)));
  }
  return null;
}
const B = 24, rows = [], ids = [];
let dim = 0, model = '';
for (let i = 0; i < items.length; i += B) {
  const part = items.slice(i, i + B), j = await embed(part.map(x => x.x));
  if (!j) { console.log('stopped at', i); process.exit(1); }
  dim = j.dim; model = j.model;
  part.forEach((x, k) => { ids.push(x.id); rows.push(Buffer.from(j.vs[k], 'base64')); });
  if ((i / B) % 10 === 0) console.log(ids.length + '/' + items.length);
}
fs.mkdirSync('ask/vec', { recursive: true });
fs.writeFileSync('ask/vec/vecs.bin', Buffer.concat(rows));
fs.writeFileSync('ask/vec/ids.json', JSON.stringify({ model, dim, n: ids.length, at: new Date().toISOString(), ids }));
console.log('clauses embedded:', ids.length, 'dim', dim);
// the test questions: the nearest clauses by meaning
const qs = fs.existsSync('ask/embed_q.json') ? JSON.parse(fs.readFileSync('ask/embed_q.json', 'utf8')) : [];
const out = { tag, model, dim, n: ids.length, at: new Date().toISOString(), q: [] };
const i8 = rows.map(b => new Int8Array(b.buffer, b.byteOffset, b.length));
for (let i = 0; i < qs.length; i += B) {
  const part = qs.slice(i, i + B), j = await embed(part.map(x => x.q));
  if (!j) break;
  part.forEach((x, k) => {
    const bb = Buffer.from(j.vs[k], 'base64'), v = new Int8Array(bb.buffer, bb.byteOffset, bb.length), sc = i8.map((r, n) => { let s = 0; for (let d = 0; d < r.length; d++) s += r[d] * v[d]; return [n, s]; });
    sc.sort((a, b) => b[1] - a[1]);
    // a clause is as near as its nearest piece
    const seen = new Set(), top = [];
    for (const [n, s] of sc) { if (seen.has(ids[n])) continue; seen.add(ids[n]); top.push([ids[n], Math.round(s / 161.29) / 100]); if (top.length >= 60) break; }
    out.q.push({ id: x.id, q: x.q, want: x.want || null, top });
  });
}
fs.writeFileSync('ask/results_' + tag + '.json', JSON.stringify(out));
console.log('questions:', out.q.length);
