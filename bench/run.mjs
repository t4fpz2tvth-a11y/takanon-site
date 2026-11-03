// Runs the model comparison page (bench.html) in a headless browser and saves the results to bench/results.json.
import { createRequire } from 'node:module';
const { chromium } = createRequire('/tmp/')('playwright');
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const SITE = 'https://takanon-site.pages.dev';
const req = JSON.parse(fs.readFileSync('bench/request.json', 'utf8'));
const COORD = req.target === 'coord', OUT = COORD ? 'bench/results_coord.json' : 'bench/results.json', RKEY = COORD ? 'bench-R-coord' : 'bench-R';
const CODE = process.env.BENCH_CODE || '';
if (!CODE) { console.log('BENCH_CODE secret is missing'); process.exit(1); }
const seed = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
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
await page.goto(SITE + '/bench.html?ci=' + Date.now() + (COORD ? '&target=coord' : ''));
await page.evaluate(({ models, batch, judge }) => {
  if (judge) document.getElementById('judge').value = judge;
  const orig = runOne;
  runOne = async (f, m, c) => { let r; for (let t = 0; t < 4; t++) { r = await orig(f, m, c); if (!r.err) return r; await sleep(60000); } return r; };
  window.FIN = false;
  (async () => { for (let i = 0; i < models.length; i += batch) { document.getElementById('models').value = models.slice(i, i + batch).join('\n'); await document.getElementById('go').onclick(); } window.FIN = true; })();
}, { models: req.models, batch: req.batch || 5, judge: req.judge || '' });

const t0 = Date.now(); let last = Date.now();
while (Date.now() - t0 < 330 * 60000) {
  await page.waitForTimeout(60000);
  const st = await page.evaluate(() => ({ fin: window.FIN, n: R.length, st: document.getElementById('st').textContent }));
  console.log(new Date().toISOString(), st.n, st.st);
  if (st.fin) break;
  if (Date.now() - last > 10 * 60000) { commit(await page.evaluate(() => R), false); last = Date.now(); }
}
const R = await page.evaluate(() => R);
commit(R, await page.evaluate(() => window.FIN));
console.log(await page.evaluate(() => document.getElementById('sum').innerText));
await browser.close();
