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
// 5.11.2026 (bench hygiene): the same infrastructure rule as the bench page (bench_template.html, infraOf): error banner, timeout,
// the page's cut-off note, or fewer than 20 non-space characters of answer. Such rows are never judged and never in the mean.
const CUT_RE = /התשובה נקטעה לפני סופה|The answer was cut off before its end|انقطعت الإجابة قبل نهايتها/;
const infraOf = r => r.infra || (r.err ? 'error' : (r.answer || '').replace(/\s/g, '').length < 20 ? 'empty' : CUT_RE.test(r.answer) ? 'truncated' : '');
// answers that failed (an error, a cut-off or an empty answer) are dropped, so this run asks them again; the dropped rows are counted, never silent
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
const seed = prev.filter(r => !infraOf(r));
if (prev.length) {
  const by = {}; prev.filter(r => infraOf(r)).forEach(r => { const k = infraOf(r); by[k] = (by[k] || 0) + 1; });
  console.log('earlier rows in ' + OUT + ': ' + prev.length + '; kept ' + seed.length + '; asked again (infrastructure failures): ' + (prev.length - seed.length) + (prev.length - seed.length ? ' ' + JSON.stringify(by) : ''));
  const b = [...new Set(seed.map(r => r.build || '(no build)'))]; if (b.length > 1) console.log('WARNING: the kept rows come from more than one build: ' + b.join(', '));
}
const sh = c => execSync(c, { stdio: 'inherit' });
const META = OUT.replace(/\.json$/, '.meta.json'), STARTED = new Date().toISOString();

// 5.11.2026: per-model summary computed here, independently of the page: scored n, infrastructure failures n (by class),
// unscored n (judge gave no score), mean over scored rows only, the mean without "seen" cases, and the builds the rows came from
function stats(R) {
  const out = {};
  for (const m of [...new Set(R.map(r => r.model))]) {
    const rs = R.filter(r => r.model === m), inf = rs.filter(r => infraOf(r)), q = rs.filter(r => !infraOf(r)), j = q.filter(r => r.score != null), js = j.filter(r => !r.seen);
    const by = {}; inf.forEach(r => { const k = infraOf(r); by[k] = (by[k] || 0) + 1; });
    const mean = a => a.length ? Math.round(a.reduce((s, r) => s + r.score, 0) / a.length * 1000) / 1000 : null;
    out[m] = { rows: rs.length, scored: j.length, infra: inf.length, infra_by: by, unscored: q.length - j.length, mean: mean(j), mean_unseen: mean(js), scored_unseen: js.length,
      no_serious: j.length ? Math.round(j.filter(r => r.score > 0).length / j.length * 1000) / 1000 : null, reps: Math.max(1, ...rs.map(r => (r.rep || 0) + 1)),
      left_out_share: rs.length ? Math.round((inf.length + q.length - j.length) / rs.length * 1000) / 1000 : 0, builds: [...new Set(rs.map(r => r.build || '(no build)'))] };
  }
  return out;
}
function printStats(R) {
  const s = stats(R);
  console.log('model | rows | scored | mean 0-2 (scored only) | no serious error | infra failures | unscored | mean without seen | builds');
  for (const [m, x] of Object.entries(s)) console.log([m, x.rows, x.scored, x.mean, x.no_serious, x.infra + ' ' + JSON.stringify(x.infra_by), x.unscored, x.mean_unseen + ' (n=' + x.scored_unseen + ')', x.builds.join(' ')].join(' | ') + (x.left_out_share > 0.05 ? '   <- more than 5% of rows not scored: the mean is not reliable' : ''));
  return s;
}

function commit(R, done) {
  fs.writeFileSync(OUT, JSON.stringify(R, null, 1));
  // 5.11.2026: a side file with the run's stamp (set, target, timestamps, builds, judge) and the summary; the results file keeps its old format (an array of rows)
  fs.writeFileSync(META, JSON.stringify({ out: OUT, set: SET || 'cases', target: TARGET || 'public', tag: TAG, exp: req.exp || '', judge: req.judge || 'openai/gpt-6.1-sol', judges: req.judges || null, reps: req.reps || 1, site: SITE, started: STARTED, written: new Date().toISOString(), finished: !!done, builds: [...new Set(R.map(r => r.build || '(no build)'))], summary: stats(R) }, null, 1));
  sh('git config user.name "bench" && git config user.email "bench@users.noreply.github.com"');
  sh('git add ' + OUT + ' ' + META);
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
await page.goto(SITE + '/bench.html?ci=' + Date.now() + (TARGET ? '&target=' + TARGET : '') + (TAG ? '&tag=' + TAG : '') + (SET ? '&set=' + SET : '') + (req.exp ? '&exp=' + encodeURIComponent(req.exp) : '') + (req.rmodel ? '&rmodel=' + encodeURIComponent(req.rmodel) : ''));
if (req.judges) {   // only more judges on the answers already here; no model is asked again
  console.log('left without a score (infrastructure failures not counted):', await page.evaluate(j => multijudge(j), req.judges));
  const R = await page.evaluate(() => R); printStats(R); commit(R, true);
  await browser.close(); process.exit(0);
}
await page.evaluate(({ models, batch, judge, k, reps }) => {
  window.BENCH_K = k; window.BENCH_REPS = reps;
  if (judge) document.getElementById('judge').value = judge;
  const orig = runOne;
  // retries: an error or a timeout up to 4 tries; a cut-off or empty answer one more try (it is often the same again, and each try costs a model call)
  runOne = async (f, m, c) => { let r; for (let t = 0; t < 4; t++) { r = await orig(f, m, c); r.tries = t + 1; const k = r.infra || (r.err ? 'error' : ''); if (!k) return r; if ((k === 'truncated' || k === 'empty') && t >= 1) return r; await sleep(60000); } return r; };
  window.FIN = false;
  (async () => { for (let i = 0; i < models.length; i += batch) { document.getElementById('models').value = models.slice(i, i + batch).join('\n'); await document.getElementById('go').onclick(); } window.FIN = true; })();
}, { models: req.models, batch: req.batch || 5, judge: req.judge || '', k: req.k || 3, reps: req.reps || 1 });

const t0 = Date.now(); let last = Date.now();
while (Date.now() - t0 < 330 * 60000) {
  await page.waitForTimeout(60000);
  const st = await page.evaluate(() => ({ fin: window.FIN, n: R.length, st: document.getElementById('st').textContent }));
  console.log(new Date().toISOString(), st.n, st.st);
  if (st.fin) break;
  if (Date.now() - last > 10 * 60000) { commit(await page.evaluate(() => R), false); last = Date.now(); }
}
// a second pass of the judge, one answer at a time, for every answer it did not score
if (await page.evaluate(() => window.FIN)) console.log('not scored after the second pass (infrastructure failures not counted):', await page.evaluate(j => rejudge(j), req.judge || ''));
const R = await page.evaluate(() => R);
printStats(R);
commit(R, await page.evaluate(() => window.FIN));
console.log(await page.evaluate(() => document.getElementById('sum').innerText));
await browser.close();
