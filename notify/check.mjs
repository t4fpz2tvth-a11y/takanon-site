// Runs every half hour on GitHub: asks the site which cases exist (hashes only) and records the new ones as an event.
// notify/seen.json keeps the hashes already counted; notify/events.json lists {at, cases, general} for each check that found new ones.
import fs from 'node:fs';
const r = await fetch('https://takanon-site.pages.dev/api/notify', { headers: { 'X-Code': process.env.BENCH_CODE || '' } });
if (!r.ok) { console.log('site answered', r.status); process.exit(1); }
const { cases } = await r.json();
const read = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return d; } };
const seen = read('notify/seen.json', null), events = read('notify/events.json', []);
const now = new Date().toISOString();
if (seen === null) {
  fs.writeFileSync('notify/seen.json', JSON.stringify(cases.map(c => c.h)));
  console.log('first run: marked', cases.length, 'existing cases as seen');
} else {
  const s = new Set(seen), fresh = cases.filter(c => !s.has(c.h));
  if (fresh.length) {
    const g = fresh.filter(c => c.g).length;
    events.push({ at: now, cases: fresh.length - g, general: g });
    fs.writeFileSync('notify/events.json', JSON.stringify(events.slice(-500), null, 1));
    fs.writeFileSync('notify/seen.json', JSON.stringify([...s, ...fresh.map(c => c.h)]));
  }
  console.log(now, 'total', cases.length, 'new', fresh.length);
}
fs.writeFileSync('notify/last_check.txt', now + '\n');
