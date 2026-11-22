import json,sys
from playwright.sync_api import sync_playwright
qs=json.load(open('qs.json',encoding='utf8'))
JS=r"""
async (qs) => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // all packs loaded, so the vocabulary is the whole corpus (the strictest test for false corrections is done both ways below)
  const res = { clean: [], near: null };
  const LOOSE = window.__loose; const top = async (q, off) => { window.__noTypo = !!off; queryPacks = new Set(packsInText(q)); await Promise.all([...queryPacks].map(loadPack)); const r = ladder(q).res.slice(0, 6).map(x => x.s.id); window.__noTypo = false; return r; };
  // 1. clean questions: what does the layer touch?
  let touched = 0; const list = [];
  for (const q of qs) { const f = typoFixes(q, false); if (f.length) { touched++; list.push('[' + f.map(x => x.level).join('') + '] ' + f.map(x => x.from + ' -> ' + x.to.join('/')).join(' ; ')); } }
  res.cleanTouched = touched; res.cleanList = list;
  let t2 = 0; const l2 = []; for (const q of qs) { const f = typoFixes(q, true); if (f.length) { t2++; l2.push(f.map(x => x.from + ' -> ' + x.to.join('/')).join(' ; ')); } } res.looseTouched = t2; res.looseList = l2;
  res.near = [...TY_NEAR].map(([k, v]) => k + ': ' + [...v].join('')).join(' | ');
  // 2. slips put into a meaningful word of each question
  const HEB = 'אבגדהוזחטיכלמנסעפצקרשת';
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const kinds = {
    finalkey: w => { for (let t = 0; t < 12; t++) { const i = 1 + Math.floor(rnd() * (w.length - 2)); for (const [f, set] of TY_FINAL_KEY) if (set.has(norm(w[i])) && FINALS[f] !== norm(w[i]) && rnd() < 0.5) return w.slice(0, i) + f + w.slice(i + 1); } return null; },
    key: w => { const i = 1 + Math.floor(rnd() * (w.length - 1)), n = [...(TY_NEAR.get(w[i]) || [])]; return n.length ? w.slice(0, i) + n[Math.floor(rnd() * n.length)] + w.slice(i + 1) : null; },
    swap: w => { const i = 1 + Math.floor(rnd() * (w.length - 2)); return w[i] === w[i + 1] ? null : w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2); },
    drop: w => { const i = 1 + Math.floor(rnd() * (w.length - 1)); return w.slice(0, i) + w.slice(i + 1); },
    double: w => { const i = 1 + Math.floor(rnd() * (w.length - 1)); return w.slice(0, i) + w[i] + w.slice(i); },
    extra: w => { const i = 1 + Math.floor(rnd() * (w.length - 1)); return w.slice(0, i) + HEB[Math.floor(rnd() * 22)] + w.slice(i); }
  };
  const stat = {}; const samples = [];
  for (const kind of Object.keys(kinds)) stat[kind] = { n: 0, stillKnown: 0, fixedRight: 0, fixedAmong: 0, fixedWrong: 0, notFixed: 0, topSame_off: 0, topSame_on: 0, overlap_off: 0, overlap_on: 0 };
  let qi = 0;
  for (const q of qs) {
    qi++; if (qi % 3) continue;   // a third of the questions, every kind of slip
    const ws = (q.match(/[א-ת]+/g) || []).filter(w => w.length >= 6 && !STOP.has(norm(w)) && tyKnown(norm(w)));
    if (!ws.length) continue;
    // the rarest word of the question: the one the search leans on most
    ws.sort((a, b) => Math.min(...[...stems(norm(a))].map(s => DF.get(s) || 1e9)) - Math.min(...[...stems(norm(b))].map(s => DF.get(s) || 1e9)));
    const w = ws[0], base = await top(q);
    for (const kind of Object.keys(kinds)) {
      const bad = kinds[kind](w); if (!bad || bad === w) continue;
      const q2 = q.replace(w, bad), st = stat[kind]; st.n++;
      if (tyKnown(norm(bad))) { st.stillKnown++; continue; }   // the slip made another real word: nothing can tell
      const f = typoFixes(q2, LOOSE).find(x => x.from === bad);
      const want = new Set(stems(norm(w)));
      const hit = c => [...stems(norm(c))].some(s => want.has(s));
      if (!f) st.notFixed++; else if (f.to.length === 1 && hit(f.to[0])) st.fixedRight++; else if (f.to.some(hit)) st.fixedAmong++; else { st.fixedWrong++; if (samples.length < 14) samples.push(kind + ': ' + w + ' -> ' + bad + ' -> ' + f.to.join('/')); }
      const off = await top(q2, true), on = await top(q2);
      const ov = r => r.filter(x => base.includes(x)).length / Math.max(1, base.length);
      st.topSame_off += off[0] === base[0] ? 1 : 0; st.topSame_on += on[0] === base[0] ? 1 : 0; st.overlap_off += ov(off); st.overlap_on += ov(on);
    }
  }
  res.stat = stat; res.samples = samples;
  return res;
}
"""
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']); c=b.new_context(locale='he-IL'); pg=c.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)[:160]))
    pg.goto('http://localhost:8790/coord/'); pg.wait_for_selector('#tk-code'); pg.fill('#tk-code','דנה-בננה-77'); pg.click('button:has-text("כניסה")'); pg.wait_for_timeout(3500)
    if sys.argv[1:]==['allpacks']: pg.evaluate("Promise.all(Object.keys(PACKS).map(loadPack))"); pg.wait_for_timeout(2500)
    pg.set_default_timeout(600000)
    pg.evaluate("window.__loose = %s" % ('true' if 'loose' in sys.argv else 'false'))
    r=pg.evaluate(JS,qs); print('errors',errs)
    print('keyboard/sound map:',r['near']); print()
    print('CLEAN questions touched, ordinary search (levels A,B):',r['cleanTouched'],'of',len(qs))
    for x in r['cleanList'][:60]: print('   ',x)
    print('CLEAN questions touched when the search is weak (level C too):',r['looseTouched']); [print('   ',x) for x in r['looseList'][:40]]
    print()
    for k,s in r['stat'].items():
        m=s['n']-s['stillKnown']
        print(f"{k:7s} n={s['n']:3d} real-word={s['stillKnown']:3d} | fixed right={s['fixedRight']} among={s['fixedAmong']} wrong={s['fixedWrong']} none={s['notFixed']} | top-1 same: off {s['topSame_off']}/{m} on {s['topSame_on']}/{m} | top-6 overlap: off {s['overlap_off']/max(1,m):.2f} on {s['overlap_on']/max(1,m):.2f}")
    print('wrong samples:'); [print('   ',x) for x in r['samples']]
    b.close()
