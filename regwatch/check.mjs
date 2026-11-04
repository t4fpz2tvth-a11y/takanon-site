// Once a week on GitHub (4.11.2026, Yoni: "איך אני יכול לדעת על עדכונים בתקנונים"): the official pages and files the bot's
// database is built from are fetched and compared with last week's. A PDF is compared byte for byte; a web page by its text
// only (no scripts, styles or markup), so a new layout alone does not count. regwatch/state.json keeps a fingerprint per
// address; regwatch/changes.json lists {at, url, docs, kind} for each change found, and the Claude scheduled task that
// e-mails the academic office about new cases reports them too. Nothing here is personal data.
import fs from 'node:fs';
import crypto from 'node:crypto';
const read = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return d; } };
const urls = read('regwatch/urls.json', []), state = read('regwatch/state.json', {}), changes = read('regwatch/changes.json', []);
const first = !Object.keys(state).length, now = new Date().toISOString();
const textOf = html => html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ')
  // dates and counters that change on every visit (a "last updated" line, a view count) are left out
  .replace(/\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/g, ' ').replace(/\s+/g, ' ').trim();
let ok = 0, bad = 0, found = 0;
for (const { url, docs } of urls) {
  let r;
  try { r = await fetch(url, { headers: { 'User-Agent': 'takanon-site regwatch (weekly check of public regulation pages)' }, redirect: 'follow', signal: AbortSignal.timeout(45000) }); }
  catch (e) { console.log('fail', url, String(e.message || e)); bad++; continue; }
  if (!r.ok) { console.log('status', r.status, url); bad++; continue; }
  const buf = Buffer.from(await r.arrayBuffer()), type = r.headers.get('content-type') || '';
  const pdf = /pdf/i.test(type) || /\.pdf$/i.test(url);
  const body = pdf ? buf : Buffer.from(textOf(buf.toString('utf8')));
  const h = crypto.createHash('sha256').update(body).digest('hex').slice(0, 24);
  const old = state[url];
  if (old && old.h !== h) { changes.push({ at: now, url, docs, kind: pdf ? 'pdf' : 'page', size: [old.n, body.length] }); found++; console.log('CHANGED', url); }
  state[url] = { h, n: body.length, at: now };
  ok++;
}
fs.writeFileSync('regwatch/state.json', JSON.stringify(state, null, 1));
fs.writeFileSync('regwatch/changes.json', JSON.stringify(changes.slice(-300), null, 1));
fs.writeFileSync('regwatch/last_check.txt', now + ' ok ' + ok + ' failed ' + bad + ' changed ' + found + (first ? ' (first run: fingerprints recorded)' : '') + '\n');
console.log(now, 'ok', ok, 'failed', bad, 'changed', found, first ? '(first run)' : '');
