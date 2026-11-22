# 22.11.2026, second round (Yoni: "תעשה את 3, את 5, את 6 ... וגם את 9"): on top of typo_patch.py.
#  3. two or three readings of a slip: buttons to choose from     5. a question typed with the keyboard left on English
#  6. the schools' short names, with and without the quotation marks    9. a space missing or one too many
import sys
def rep(s,a,b,p,n=1):
    assert s.count(a)==n,(p,a[:80],s.count(a)); return s.replace(a,b)
for p in sys.argv[1:]:
    s=open(p,encoding='utf8').read()
    if 'function layoutFix' in s: print('already',p); continue
    # --- the helper: all the readings, not only a single one
    s=rep(s,"    const one = (cands, ok) => { const g = new Set(); for (const [c, kind] of cands) if (ok(c, kind)) g.add(c); return g.size === 1 ? [...g][0] : ''; };\n    let to = '', level = '';",
            "    const all = (cands, ok) => { const g = new Set(); for (const [c, kind] of cands) if (ok(c, kind)) g.add(c); return [...g]; };\n    let opts = [];\n    const one = (cands, ok) => { const g = all(cands, ok); if (g.length > 1 && g.length <= 3 && !opts.length) opts = g; return g.length === 1 ? g[0] : ''; };\n    let to = '', level = '';",p)
    s=rep(s,"    { const all = tyCands(w, -1); to = one(all, c => TY_PACK_LEX.has(c) || PREF.some(p => c.startsWith(p) && TY_PACK_LEX.has(c.slice(p.length)))); if (to) level = 'A'; }",
            "    { const g = all(tyCands(w, -1), c => TY_PACK_LEX.has(c) || PREF.some(p => c.startsWith(p) && TY_PACK_LEX.has(c.slice(p.length)))); if (g.length === 1) { to = g[0]; level = 'A'; } }",p)
    # --- a space missing (level S) after the sure slips, before level C; the readings to ask about
    s=rep(s,"    // C: a neighbouring or like-sounding key, two letters swapped",
            "    // S: a space missing: the word is two of the regulations' words written as one (מועדמיוחד), in one way only\n    if (!to && mid < 0 && w.length >= 7) {\n      const cut = [];\n      for (let i = 3; i <= w.length - 3; i++) { const a = w.slice(0, i), b = w.slice(i); if ((a.length >= 4 || b.length >= 4) && surf.has(a) && surf.has(b) && !(STOP.has(a) && STOP.has(b))) cut.push([a, b]); }\n      if (cut.length === 1) { fixes.push({ from: raw, to: cut[0], level: 'S' }); continue; }\n    }\n    // C: a neighbouring or like-sounding key, two letters swapped",p)
    s=rep(s,"    if (to) fixes.push({ from: raw, to: [to], level });\n  }","    if (to) fixes.push({ from: raw, to: [to], level });\n    else if (opts.length) asks.push({ from: raw, to: opts });\n  }\n  fixes.ask = asks;",p)
    # --- a space too many (level J): two neighbours, one of them no word of the regulations, that together are one
    s=rep(s,"  const fixes = [], seen = new Set(), surf = tySurface();\n  for (const raw of (String(text).replace(/[֑-ׇ]/g, '').match(/[א-ת]+/g) || [])) {\n    const w = norm(raw);\n    if (w.length < 5 || seen.has(w) || STOP.has(w)) continue;",
            "  const fixes = [], asks = [], seen = new Set(), surf = tySurface();\n  const toks = String(text).replace(/[֑-ׇ]/g, '').match(/[א-ת]+/g) || [];\n  for (let i = 0; i + 1 < toks.length; i++) {\n    const a = norm(toks[i]), b = norm(toks[i + 1]), ab = a + b;\n    if (a.length < 2 || b.length < 2 || ab.length < 5 || seen.has(a) || seen.has(b)) continue;\n    if ((tyKnown(a) && tyKnown(b)) || !surf.has(ab) || STOP.has(ab) || String(text).indexOf(toks[i] + ' ' + toks[i + 1]) < 0) continue;\n    fixes.push({ from: toks[i] + ' ' + toks[i + 1], to: [ab], level: 'J' }); seen.add(a); seen.add(b);\n  }\n  for (const raw of toks) {\n    const w = norm(raw);\n    if (w.length < 5 || seen.has(w) || STOP.has(w)) continue;",p)
    s=rep(s,"  for (const f of typoFixes(t, false)) t = t.split(f.from).join(f.to[0]);","  for (const f of typoFixes(t, false)) t = t.split(f.from).join(f.to.join(' '));",p)
    s=rep(s,"  if (TY_LEX.has(w) || TY_PACK_LEX.has(w)","  if (TY_LEX.has(w) || TY_ALIAS_WORDS.has(w) || TY_PACK_LEX.has(w)",p)
    # --- the keyboard left on English, the short names, and the note with its buttons
    a=s.index("function typoNote() {"); b=s.index("function parseQuery(q, wide) {")
    NEW = r'''// 5. The keyboard left on English: "nugs nhujs" is "מועד מיוחד". A word is turned only when its Hebrew reading is a word of the
// regulations: two such words at least (or one long word that is the only Latin one), and no everyday English word in the question.
const TY_ENGLISH = new Set('the what is are for and how can do does my to of in on an if when who why where exam course grade appeal student it that this with have has get need about after before not you your from will would should could please thanks hello'.split(' '));
const TY_LAYOUT = { q: '/', w: "'", e: 'ק', r: 'ר', t: 'א', y: 'ט', u: 'ו', i: 'ן', o: 'ם', p: 'פ', a: 'ש', s: 'ד', d: 'ג', f: 'כ', g: 'ע', h: 'י', j: 'ח', k: 'ל', l: 'ך', ';': 'ף',
  z: 'ז', x: 'ס', c: 'ב', v: 'ה', b: 'נ', n: 'מ', m: 'צ', ',': 'ת', '.': 'ץ' };
function layoutFix(q) {
  const s = String(q);
  if (TY_OFF() || !/[a-z]/i.test(s)) return { text: s, fixed: [] };
  const key = 'LAY|' + SECS.length + '|' + s; if (TY_CACHE.has(key)) return TY_CACHE.get(key);
  const surf = tySurface(), parts = s.split(/(\s+)/), cand = [];
  const heb = t => [...t.toLowerCase()].map(ch => TY_LAYOUT[ch] || ch).join('');
  const good = h => /^[א-ת]{3,}$/.test(h) && (surf.has(norm(h)) || tyKnown(norm(h)));
  parts.forEach((tok, i) => {
    if (!/[a-z]/i.test(tok) || /[א-ת]/.test(tok) || (tok.match(/[a-z]/gi) || []).length < 2) return;
    const full = heb(tok), cut = /[.,;?!:]$/.test(tok) ? heb(tok.slice(0, -1)) : '';
    const c = { i, tok, to: '', known: false };
    if (good(full)) { c.to = full; c.known = true; } else if (cut && good(cut)) { c.to = cut + tok.slice(-1); c.known = true; } else if (/^[א-ת]+$/.test(full)) c.to = full; else if (cut && /^[א-ת]+$/.test(cut)) c.to = cut + tok.slice(-1);
    cand.push(c);
  });
  const known = cand.filter(c => c.known), out = { text: s, fixed: [] };
  const english = parts.some(tok => TY_ENGLISH.has(tok.toLowerCase().replace(/[^a-z]/g, '')));   // a sentence in English is left alone
  if (!english && known.length && (known.length >= 2 || (known[0].tok.length >= 5 && cand.length === 1))) {
    const take = cand.filter(c => c.to);
    for (const c of take) { parts[c.i] = c.to; out.fixed.push({ from: c.tok, to: c.to }); }
    out.text = parts.join('');
  }
  if (TY_CACHE.size > 300) TY_CACHE.clear();
  TY_CACHE.set(key, out);
  return out;
}
// 6. The schools' short names, written with the quotation marks or without (עו"ס, עו״ס, עוס). Tested on faqText (no quotation
// marks, final letters regular), as a whole word behind up to two prefix letters. Each loads its faculty's rules and adds the
// full name to the search.
const TY_ALIAS = [
  ['sw', 'עוס', 'עבודה סוציאלית'], ['med', 'ריבע', 'ריפוי בעיסוק'], ['science', 'מדמח', 'מדעי המחשב'], ['bschool', 'מנעס', 'מנהל עסקים'],
  ['social', 'יחבל', 'יחסים בינלאומיים'], ['social', 'מדמד', 'מדע המדינה'], ['social', 'פכמ', 'פילוסופיה כלכלה ומדע המדינה'],
  ['social', 'סוציו', 'סוציולוגיה'], ['social', 'פסיכו', 'פסיכולוגיה'],
  // 22.11.2026, second list (Yoni: "תיעזר בדרייב וג'ימייל ובטבלת המעקב"): the names the union itself writes, from its orientation
  // timetable (the departments of הר הצופים) and from the "פקולטה / יחידה" column of the cases sheet.
  ['hum', 'מזהת', 'לימודי האסלאם והמזרח התיכון'], ['hum', 'מזרח התיכונ', ''], ['hum', 'אמלט', 'אמריקה הלטינית'], ['hum', 'מחשבת ישראל', ''],
  ['hum', 'ספרות עברית', ''], ['hum', 'ספרות אנגלית', ''], ['hum', 'ספרות כללית', ''], ['hum', 'מדע הדתות', ''], ['hum', 'לימודי התיאטרונ', ''], ['hum', 'רביבימ', ''],
  ['science', 'ביוטכנולוגיה', ''], ['agri', 'בעלי החיימ', ''], ['agri', 'מדעי המזונ', '']
  // not here, after the test on the 288 questions: "סטטיסטיקה" (mostly the name of a course) and the campuses' names
  // (עין כרם, גבעת רם: they come up in questions about parking and dormitories, and brought faculties' rules that do not belong)
].map(([k, a, full]) => [k, new RegExp('(?<![א-ת])[ובלמשהכ]{0,2}' + a + '(?![א-ת])'), full, a]);
const TY_ALIAS_WORDS = new Set(TY_ALIAS.map(x => x[3]));
function aliasHits(q) { if (TY_OFF()) return []; const t = faqText(String(q || '')); return TY_ALIAS.filter(([k, rx]) => rx.test(t)); }
function aliasExpand(q) { const add = aliasHits(q).map(x => x[2]).filter(Boolean); return add.length ? String(q) + ' ' + add.join(' ') : String(q); }
let TY_LAST_ASK = '';
function typoNote() {
  const el = document.getElementById('typo-note'); if (el) el.remove();
  const qp = (typeof currentQP === 'object' && currentQP) || {}, fx = qp.typos || [], asks = fx.ask || [], lay = qp.layout || [];
  if (!fx.length && !asks.length && !lay.length) return;
  const title = document.getElementById('results-title'), ai = document.getElementById('ai');
  const above = ai && ai.parentElement ? ai : null;   // just above the answer: the chat layout hides the results' title
  if (!above && !title) return;
  const fin = w => w.replace(/[כמנפצ]$/, c => ({ 'כ': 'ך', 'מ': 'ם', 'נ': 'ן', 'פ': 'ף', 'צ': 'ץ' })[c]);
  const box = document.createElement('div'); box.id = 'typo-note'; box.className = 'ai-note'; box.setAttribute('role', 'status');
  const line = t => { const p = document.createElement('p'); p.style.margin = '0 0 .4em'; p.textContent = t; box.appendChild(p); return p; };
  // the button writes the choice into the question box; the coordinator sends it again
  const rewrite = (from, to) => {
    const q = document.getElementById('q'); if (!q) return;
    const base = q.value.indexOf(from) >= 0 ? q.value : TY_LAST_ASK;
    if (!base || base.indexOf(from) < 0) return;
    q.value = base.split(from).join(to); q.dispatchEvent(new Event('input', { bubbles: true })); q.focus();
    box.textContent = ''; line('השאלה תוקנה בתיבה. שלחו אותה שוב.');
  };
  const btn = (label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.style.cssText = 'font:inherit;font-size:.95em;min-height:44px;padding:6px 16px;margin:0 0 6px 8px;border:1px solid currentColor;border-radius:999px;background:transparent;color:inherit;cursor:pointer'; b.addEventListener('click', fn); return b; };
  if (lay.length) {
    line('נראה שהמקלדת הייתה באנגלית. החיפוש נעשה לפי: ' + lay.map(f => '״' + f.to + '״').join(' ') + '.');
    const all = (typeof qp.raw === 'string' && TY_LAST_ASK) ? layoutFix(TY_LAST_ASK).text : '';
    if (all && all !== TY_LAST_ASK) box.appendChild(btn('לכתוב את השאלה בעברית', () => { const q = document.getElementById('q'); if (!q) return; q.value = all; q.dispatchEvent(new Event('input', { bubbles: true })); q.focus(); box.textContent = ''; line('השאלה נכתבה בעברית בתיבה. שלחו אותה שוב.'); }));
  }
  if (fx.length) line('ייתכן שיש שגיאת הקלדה. החיפוש כולל גם: ' + fx.map(f => '״' + f.to.map(fin).join(' ') + '״ (נכתב: ״' + f.from + '״)').join('; ') + '.');
  for (const a of asks) {
    line('לא ברור מה נכתב ב״' + a.from + '״. האם התכוונתם ל:');
    const row = document.createElement('div'); for (const c of a.to) row.appendChild(btn(fin(c), () => rewrite(a.from, fin(c)))); box.appendChild(row);
  }
  if (above) above.parentElement.insertBefore(box, above); else title.after(box);
}
if (typeof document !== 'undefined') document.addEventListener('submit', e => { try { if (e.target && e.target.id === 'ask-form') { const q = document.getElementById('q'); if (q && q.value.trim()) TY_LAST_ASK = q.value; } } catch (_) {} }, true);
'''
    s=s[:a]+NEW+s[b:]
    # --- the hooks
    s=rep(s,"  const fx = foreignToHebrew(q);\n  q = fx.text;\n  // references like","  const lay = layoutFix(q);\n  const fx = foreignToHebrew(aliasExpand(lay.text));\n  q = fx.text;\n  // references like",p)
    s=rep(s,"tyOne = tyFix.map(f => f.to[0]).join(' ');","tyOne = tyFix.map(f => f.to.join(' ')).join(' ');",p)
    s=rep(s,"step: wide.step || 1, typos: tyFix };","step: wide.step || 1, typos: tyFix, layout: lay.fixed };",p)
    s=rep(s,"  const t = faqText(foreignToHebrew(typoApply(q || '')).text);\n  return PACK_WORDS.filter(([k, rx]) => PACKS[k] && rx.test(t)).map(([k]) => k);",
            "  const src = typoApply(layoutFix(q || '').text);\n  const t = faqText(foreignToHebrew(src).text);\n  const out = PACK_WORDS.filter(([k, rx]) => PACKS[k] && rx.test(t)).map(([k]) => k);\n  for (const [k] of aliasHits(src)) if (PACKS[k] && !out.includes(k)) out.push(k);   // 22.11.2026: the short names (עו\"ס, ריב\"ע)\n  return out;",p)
    open(p,'w',encoding='utf8').write(s); print('patched v2',p)
