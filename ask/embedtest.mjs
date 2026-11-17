// 17.11.2026 (Yoni: "תחקור יותר לעומק אם המודל הקיים שיש אצלנו מטפל בעברית"): a direct test of the embedding model on Hebrew.
// ask/embedtest_in.json = pairs [a, b, kind] that mean the same (synonyms, inflections, everyday wording against the
// regulations' wording, Hebrew against English, spelling variants). For each a: how like is it to its own b, and is its own
// b the nearest of all the b's? Writes ask/results_<tag>.json. No student data; the secret goes only as a header.
import fs from 'node:fs';
const CODE = process.env.BENCH_CODE || '';
if (!CODE) { console.log('BENCH_CODE secret is missing'); process.exit(1); }
const req = JSON.parse(fs.readFileSync('ask/request.json', 'utf8'));
const tag = String(req.tag || 'embedtest').replace(/[^A-Za-z0-9_-]/g, '');
const pairs = JSON.parse(fs.readFileSync('ask/embedtest_in.json', 'utf8')).pairs;
async function embed(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += 40) {
    const r = await fetch('https://takanon-site.pages.dev/api/embed', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Code': encodeURIComponent(CODE) }, body: JSON.stringify({ texts: texts.slice(i, i + 40) }) });
    if (!r.ok) { console.log('embed', r.status, (await r.text()).slice(0, 200)); process.exit(1); }
    for (const v of (await r.json()).vs) { const b = Buffer.from(v, 'base64'); out.push(new Int8Array(b.buffer, b.byteOffset, b.length)); }
  }
  return out;
}
const cos = (x, y) => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * y[i]; return s / 16129; };
const A = await embed(pairs.map(p => p[0])), B = await embed(pairs.map(p => p[1]));
const rows = pairs.map((p, i) => {
  const own = cos(A[i], B[i]), all = B.map((b, j) => [j, cos(A[i], b)]).sort((x, y) => y[1] - x[1]);
  const others = all.filter(([j]) => j !== i).map(([, s]) => s);
  return { a: p[0], b: p[1], kind: p[2], own: Math.round(own * 100) / 100, rank: all.findIndex(([j]) => j === i) + 1, nearest: pairs[all[0][0]][1], others: Math.round(others.reduce((x, y) => x + y, 0) / others.length * 100) / 100 };
});
fs.writeFileSync('ask/results_' + tag + '.json', JSON.stringify({ tag, at: new Date().toISOString(), n: rows.length, rows }));
console.log('pairs:', rows.length, 'first:', rows.filter(r => r.rank === 1).length);
