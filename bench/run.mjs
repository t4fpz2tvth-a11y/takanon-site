// Runs the model comparison page (bench.html) in a headless browser and saves the results to bench/results.json.
import { createRequire } from 'node:module';
const { chromium } = createRequire('/tmp/')('playwright');
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const SITE = 'https://takanon-site.pages.dev';
const req = JSON.parse(fs.readFileSync('bench/request.json', 'utf8'));
const TARGET = req.target || '', TAG = req.tag || '', SET = req.set || '', OUT = 'bench/results' + (TARGET ? '_' + TARGET.replace(/-/g, '_') : '') + (TAG ? '_' + TAG : '') + '.json', RKEY = 'bench-R' + (TARGET ? '-' + TARGET : '') + (TAG ? '-' + TAG : '');
const CODE = process.env.BENCH_CODE || '';
if (!CODE) { console.log('BENCH_CODE secret is missing'); process.exit(1); }
// answers that failed (an error, a cut-off or an empty answer) are dropped, so this run asks them again
const seed = (fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : []).filter(r => !r.err && r.answer && !/נקטעה/.test(r.answer));
const sh = c => execSync(c, { stdio: 'inherit' });

function commit(R, done) {
  fs.writeFileSync(OUT, JSON.stringify(R, null, 1));
  sh('git config user.name "bench" && git config user.email "bench@users.noreply.github.com"');
  sh('git add ' + OUT);
  try { execSync('git diff --cached --quiet'); return; } catch (_) {}
  sh(`git commit -qm "${done ? 'השוואה הסתיימה' : 'תוצאות ביניים'}: ${R.length} תשובות [CI Skip]"`);
  for (let t = 0; t < 4; t++) { try { sh('git pull -q --rebase -X theirs origin main && git push -q origin HEAD:main'); return; } catch (e) { execSync('sleep 5'); } }
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(([c, s]) => {
  try {
    localStorage.setItem('takanon-code', c); localStorage.setItem('reg-bot-tour-v3', '1');
    if (location.pathname.startsWith('/bench') && !sessionStorage.getItem('seeded')) { localStorage.setItem(s[0], s[1]); sessionStorage.setItem('seeded', '1'); }
  } catch (_) {}
}, [CODE, [RKEY, JSON.stringify(seed)]]);
const page = await ctx.newPage();
await page.goto(SITE + '/bench.html?ci=' + Date.now() + (TARGET ? '&target=' + TARGET : '') + (TAG ? '&tag=' + TAG : '') + (SET ? '&set=' + SET : ''));
if (req.judges) {   // only more judges on the answers already here; no model is asked again
  console.log('left without a score:', await page.evaluate(j => multijudge(j), req.judges));
  commit(await page.evaluate(() => R), true);
  await browser.close(); process.exit(0);
}
await page.evaluate(({ models, batch, judge, k }) => {
  window.BENCH_K = k;
  if (judge) document.getElementById('judge').value = judge;
  const orig = runOne;
  runOne = async (f, m, c) => { let r; for (let t = 0; t < 4; t++) { r = await orig(f, m, c); if (!r.err) return r; await sleep(60000); } return r; };
  window.FIN = false;
  (async () => { for (let i = 0; i < models.length; i += batch) { document.getElementById('models').value = models.slice(i, i + batch).join('\n'); await document.getElementById('go').onclick(); } window.FIN = true; })();
}, { models: req.models, batch: req.batch || 5, judge: req.judge || '', k: req.k || 3 });

const t0 = Date.now(); let last = Date.now();
while (Date.now() - t0 < 330 * 60000) {
  await page.waitForTimeout(60000);
  const st = await page.evaluate(() => ({ fin: window.FIN, n: R.length, st: document.getElementById('st').textContent }));
  console.log(new Date().toISOString(), st.n, st.st);
  if (st.fin) break;
  if (Date.now() - last > 10 * 60000) { commit(await page.evaluate(() => R), false); last = Date.now(); }
}
// a second pass of the judge, one answer at a time, for every answer it did not score
if (await page.evaluate(() => window.FIN)) console.log('not scored after the second pass:', await page.evaluate(j => rejudge(j), req.judge || ''));
const R = await page.evaluate(() => R);
commit(R, await page.evaluate(() => window.FIN));
console.log(await page.evaluate(() => document.getElementById('sum').innerText));
await browser.close();
