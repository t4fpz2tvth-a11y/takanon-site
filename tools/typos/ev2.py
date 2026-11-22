import json,sys
from playwright.sync_api import sync_playwright
qs=json.load(open('qs.json',encoding='utf8'))
paths=sys.argv[1:] or ['/coord/']
EX=['סטודנט מגברם שואל על מעונות','מה שעות הספרייה בגבר"ם','סטודנט למזה"ת שואל על סמינריון','סטודנטית לאמל״ט','סטודנט ממחשבת ישראל','סטודנטית לביוטכנולוגיה בגבעת רם נכשלה','סטודנט מעין כרם שואל על מועד מיוחד','סטודנטית לסטטיסטיקה','סטודנט למדעי בעלי החיים','שאלה על חפיפת בחינןת','סטודנטית לעו"ס שואלת על הכשרה מעשית','סטודנטית לעו״ס שואלת על הכשרה','סטודנט לעוס שואל','הוא עוסק בזה ושואל על ערעור','סטודנטית לריב"ע','סטודנט למדמ"ח נכשל בקורס','סטודנט ליחב"ל',
    'nugs nhujs cdkk nhkutho','vhh nv eurv go grgur gk mhui','what is the deadline for an appeal','ערעור על ציון GPA','בקשה למועדמיוחד בגלל מחלה','שאלה על ריפויבעיסוק','שאלה על חפי פת בחינות','בקשה למו עד מיוחד','סטו דנטית שואלת על שכר לימוד','מה עושים עם ציוץ בקורס','ערעור על ציונ בבחינה','זכאות להארכת זמן בבחינב']
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    for path in paths:
        c=b.new_context(locale='he-IL'); pg=c.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)[:160])); pg.set_default_timeout(600000)
        pg.goto('http://localhost:8790'+path); pg.wait_for_timeout(2500)
        if 'coord' in path: pg.fill('#tk-code','דנה-בננה-77'); pg.click('button:has-text("כניסה")'); pg.wait_for_timeout(3500)
        r=pg.evaluate("""async ([qs, EX]) => {
          const top = async (q, off) => { window.__noTypo = !!off; queryPacks = new Set(packsInText(q)); await Promise.all([...queryPacks].map(loadPack)); const l = ladder(q); window.__noTypo = false; return l.res.slice(0, 6).map(x => x.s.id).join(); };
          let diff = 0; const touched = [], asked = [], lay = [], loose = [], al = [];
          for (const q of qs) {
            const f = typoFixes(q, false); if (f.length) touched.push(f.map(x => x.from + '>' + x.to.join(' ') + ':' + x.level).join()); if ((f.ask || []).length) asked.push(f.ask.map(x => x.from + '?' + x.to.join('/')).join());
            const g = typoFixes(q, true); if (g.length || (g.ask || []).length) loose.push(g.map(x => x.from + '>' + x.to.join(' ') + ':' + x.level).concat((g.ask || []).map(x => x.from + '?' + x.to.join('/'))).join());
            const L = layoutFix(q); if (L.fixed.length) lay.push(L.fixed.map(x => x.from + '>' + x.to).join());
            const A = aliasHits(q); if (A.length) al.push(A.map(x => x[3]).join() + ' | ' + q.slice(0, 40));
            if (await top(q, true) !== await top(q, false)) diff++;
          }
          const ex = EX.map(q => { const f = typoFixes(layoutFix(q).text, false); return q + '  =>  ' + JSON.stringify({ lay: layoutFix(q).fixed.map(x => x.to).join(' '), fix: f.map(x => x.from + '>' + x.to.join(' ') + ':' + x.level), ask: (f.ask || []).map(x => x.from + '?' + x.to.join('/')), packs: packsInText(q), alias: aliasHits(q).map(x => x[2]) }); });
          return { diff, touched, asked, lay, loose, al, ex };
        }""",[qs,EX])
        print(path,'errors',errs); print(' clean: fixed',r['touched'],'| asked',r['asked'],'| layout',r['lay'],'| short names',r['al'],'| top-6 changed',r['diff'],'of',len(qs)); print(' clean when search is weak:',len(r['loose']),r['loose'][:12])
        if path==paths[0]: [print('   ',x) for x in r['ex']]
        c.close()
    b.close()
