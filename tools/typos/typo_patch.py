import sys
LAYER = r'''
/* ---------- Typing slips (22.11.2026, Yoni: "תיצור מערכת... אותיות שמתבלבלים בהן... אבל עדיין לשמור על זה שתענה מדויק") ----------
   A word of the question that is nowhere in the regulations (in none of its forms) may be a slip of the keyboard. The slips
   looked for are ONE step from a word the regulations do have: a neighbouring key (ו typed as ן, פ as ם), letters that sound
   alike (ט/ת, כ/ק, ח/כ, א/ע/ה, ס/ש, ב/ו), two letters swapped, a letter doubled, dropped or added. Three levels, by how sure:
     A. the name of a faculty or a school (a short closed list): any one slip, always, so that its rules are loaded;
     B. a final letter in the middle of a word (ן ם ך ף ץ): never right in Hebrew, so always a slip; fixed by that key alone.
        Also the last letter, when it is מ נ פ or צ and the key beside it gives a word (ף for ם);
     C. a neighbouring or like-sounding key, a swap, a doubled letter, in any word: only when the search by the question's own words was not good enough (the ladder's step 2 on),
        only when there is exactly one reading, and at half weight.
   Everyday words the regulations simply do not have ("ועכשיו", "אחזור") are therefore left alone in an ordinary search.
   A word the regulations have is never touched, the first letter is never changed, the question goes to the model exactly
   as typed, and the answer is still written only from the clauses found. */
const TY_ROWS = ["/'קראטוןםפ", 'שדגכעיחלךף', 'זסבהנמצתץ'];
const TY_HEB = 'אבגדהוזחטיכלמנסעפצקרשת';
const TY_NEAR = (() => {
  const m = new Map(), add = (a, b) => { a = FINALS[a] || a; b = FINALS[b] || b; if (a === b || !TY_HEB.includes(a) || !TY_HEB.includes(b)) return; if (!m.has(a)) m.set(a, new Set()); m.get(a).add(b); };
  TY_ROWS.forEach((row, r) => [...row].forEach((ch, i) => {
    for (const [dr, di] of [[0, -1], [0, 1], [1, -1], [1, 0], [-1, 0], [-1, 1]]) { const rw = TY_ROWS[r + dr], o = rw && [...rw][i + di]; if (o) add(ch, o); }
  }));
  for (const [a, b] of ['טת', 'כק', 'חכ', 'אע', 'אה', 'הע', 'סש', 'בו']) { add(a, b); add(b, a); }
  return m;
})();
// the neighbours of a final letter's own key (the key that was hit), for level B
const TY_FINAL_KEY = (() => {
  const m = new Map();
  TY_ROWS.forEach((row, r) => [...row].forEach((ch, i) => {
    if (!FINALS[ch]) return; const s = new Set([FINALS[ch]]);
    for (const [dr, di] of [[0, -1], [0, 1], [1, -1], [1, 0], [-1, 0], [-1, 1]]) { const rw = TY_ROWS[r + dr], o = rw && [...rw][i + di]; if (o && TY_HEB.includes(FINALS[o] || o)) s.add(FINALS[o] || o); }
    m.set(ch, s);
  }));
  return m;
})();
const TY_PACK_LEX = new Set(('שיניימ רוקחות סיעוד אחיות ריפוי בעיסוק בריאות הציבור רפואה רפואי קליני קלינית משפטימ חקלאות רחובות תזונה מתמטיקה פיזיקה פיסיקה כימיה ביולוגיה המחשב ' +
  'סוציאלית עסקימ חשבונאות פסיכולוגיה סוציולוגיה אנתרופולוגיה המדינה בינלאומיימ תקשורת עיתונאות גאוגרפיה גיאוגרפיה כלכלה היסטוריה פילוסופיה בלשנות ארכאולוגיה ארכיאולוגיה ' +
  'תלמוד מוזיקולוגיה קלאסיימ האמנות לחינוכ הוראה דוקטורט דוקטור מלווה').split(' '));
const TY_OFF = () => typeof window !== 'undefined' && window.__noTypo;
const TY_CACHE = new Map();
// the regulations' words as they are written (not their stems), counted once for the sections now loaded
let TY_SURF = null, TY_SURF_N = -1;
function tySurface() {
  if (TY_SURF && TY_SURF_N === SECS.length) return TY_SURF;
  TY_SURF = new Set(); TY_SURF_N = SECS.length;
  for (const s of SECS) { for (const w of words(s.t || '')) TY_SURF.add(w); for (const p of s.p) for (const w of words(p)) TY_SURF.add(w); }
  return TY_SURF;
}
let TY_LEX = null;
function tyKnown(w) {
  if (!TY_LEX) { TY_LEX = new Set(); for (const [keys, adds] of SYN) for (const k of keys.concat(adds)) for (const x of words(k)) TY_LEX.add(x); }
  if (TY_LEX.has(w) || TY_PACK_LEX.has(w) || PREF.some(p => w.startsWith(p) && TY_PACK_LEX.has(w.slice(p.length)))) return true;
  for (const st of stems(w)) if (DF.has(st) || TY_LEX.has(st)) return true;
  return false;
}
// the forms one slip away from w (the first letter stays); at >= 0: only that place, only the letters of `only`
function tyCands(w, at, only) {
  const out = new Map(), put = (c, kind) => { if (c !== w && !out.has(c)) out.set(c, kind); };
  const L = [...w];
  if (at >= 0) { for (const c of only) put(w.slice(0, at) + c + w.slice(at + 1), 'key'); return out; }
  for (let i = 1; i < L.length; i++) for (const c of (TY_NEAR.get(L[i]) || [])) put(w.slice(0, i) + c + w.slice(i + 1), 'key');
  for (let i = 1; i + 1 < L.length; i++) if (L[i] !== L[i + 1]) put(w.slice(0, i) + L[i + 1] + L[i] + w.slice(i + 2), 'swap');
  for (let i = 1; i < L.length; i++) put(w.slice(0, i) + w.slice(i + 1), L[i] === L[i - 1] ? 'double' : 'extra');
  for (let i = 1; i <= L.length; i++) for (const c of TY_HEB) put(w.slice(0, i) + c + w.slice(i), 'missing');
  return out;
}
// [{ from, to: [word], level: 'A' | 'B' | 'C' }] for the words of a text that the regulations do not have.
// loose: level C too (the search by the question's own words was not good enough)
function typoFixes(text, loose) {
  if (TY_OFF()) return [];
  const key = SECS.length + (loose ? '|L|' : '|S|') + text;
  if (TY_CACHE.has(key)) return TY_CACHE.get(key);
  const fixes = [], seen = new Set(), surf = tySurface();
  for (const raw of (String(text).replace(/[֑-ׇ]/g, '').match(/[א-ת]+/g) || [])) {
    const w = norm(raw);
    if (w.length < 5 || seen.has(w) || STOP.has(w)) continue;
    seen.add(w);
    const mid = raw.slice(0, -1).search(/[ךםןףץ]/);   // a final letter that is not the last: a sure slip, whatever the stems say
    if (mid >= 0 ? surf.has(w) : tyKnown(w)) continue;
    const one = (cands, ok) => { const g = new Set(); for (const [c, kind] of cands) if (ok(c, kind)) g.add(c); return g.size === 1 ? [...g][0] : ''; };
    let to = '', level = '';
    // A: a faculty's or a school's name (also behind a prefix letter: "בסיעןד")
    { const all = tyCands(w, -1); to = one(all, c => TY_PACK_LEX.has(c) || PREF.some(p => c.startsWith(p) && TY_PACK_LEX.has(c.slice(p.length)))); if (to) level = 'A'; }
    // B: the key of the final letter, or one of the keys around it
    if (!to && mid >= 0) { to = one(tyCands(w, mid, TY_FINAL_KEY.get(raw[mid]) || []), c => surf.has(c) && !STOP.has(c)); if (to) level = 'B'; }
    // B, at the end of the word: מ נ פ צ typed for the one on the key beside it (מילואיף for מילואים); not כ, the ending of בקשתך
    if (!to && mid < 0 && 'מנפצ'.includes(w[w.length - 1])) { const end = w.length - 1; to = one(tyCands(w, end, [...(TY_NEAR.get(w[end]) || [])].filter(c => 'מנפצ'.includes(c))), c => surf.has(c) && !STOP.has(c)); if (to) level = 'B'; }
    // C: a neighbouring or like-sounding key, two letters swapped, or a letter doubled; a word the regulations write exactly so; one reading only.
    // A letter dropped or added is not tried here: that is how one real word becomes another (התנגשה / הנגשה)
    if (!to && loose && w.length >= 6) { to = one(tyCands(w, -1), (c, kind) => kind !== 'extra' && kind !== 'missing' && c.length >= 5 && surf.has(c) && !STOP.has(c)); if (to) level = 'C'; }
    if (to) fixes.push({ from: raw, to: [to], level });
  }
  if (TY_CACHE.size > 300) TY_CACHE.clear();
  TY_CACHE.set(key, fixes);
  return fixes;
}
// the text with the sure slips (levels A and B) written right: the faculties' names are matched as phrases
function typoApply(text) {
  let t = String(text);
  for (const f of typoFixes(t, false)) t = t.split(f.from).join(f.to[0]);
  return t;
}
function typoNote() {
  const el = document.getElementById('typo-note'); if (el) el.remove();
  const fx = (typeof currentQP === 'object' && currentQP && currentQP.typos) || [];
  if (!fx.length) return;
  const host = document.getElementById('results-title'); if (!host) return;
  const p = document.createElement('p'); p.id = 'typo-note'; p.className = 'ai-note'; p.setAttribute('role', 'status');
  p.textContent = 'ייתכן שיש שגיאת הקלדה. החיפוש כולל גם: ' + fx.map(f => '״' + f.to[0] + '״ (נכתב: ״' + f.from + '״)').join('; ') + '.';
  host.after(p);
}
'''
def rep(s,a,b,p):
    assert s.count(a)==1,(p,a[:70],s.count(a)); return s.replace(a,b)
for p in sys.argv[1:]:
    s=open(p,encoding='utf8').read()
    if 'function typoFixes' in s: print('already',p); continue
    s=rep(s,"function parseQuery(q, wide) {",LAYER+"function parseQuery(q, wide) {",p)
    s=rep(s,"  const nq = ' ' + norm(textOnly).replace(/[\"']/g, '').replace(/[^\\u05d0-\\u05ea0-9a-z]+/g, ' ').trim() + ' ';",
            "  const tyFix = typoFixes(textOnly, (wide.step || 1) >= 2), tyOne = tyFix.map(f => f.to[0]).join(' ');\n  const nq = ' ' + norm(textOnly + ' ' + tyOne).replace(/[\"']/g, '').replace(/[^\\u05d0-\\u05ea0-9a-z]+/g, ' ').trim() + ' ';",p)
    s=rep(s,"    terms.push({ w, weight: 1, st: [...stems(w)] });\n  }\n  for (const [keys, adds] of SYN) {",
            "    terms.push({ w, weight: 1, st: [...stems(w)] });\n  }\n  for (const f of tyFix) for (const c of f.to) {   // 22.11.2026: the regulations' word one slip away from a word they do not have\n    const w = norm(c); if (seen.has(w)) continue;\n    seen.add(w);\n    terms.push({ w, weight: f.level === 'C' ? 0.5 : 1, st: [...stems(w)], typo: f.from });\n  }\n  for (const [keys, adds] of SYN) {",p)
    s=rep(s,"  const t = faqText(foreignToHebrew(q || '').text);\n  return PACK_WORDS.filter(","  const t = faqText(foreignToHebrew(typoApply(q || '')).text);\n  return PACK_WORDS.filter(",p)
    s=rep(s,"  renderResultList(q, opts);\n  aiReset();\n}","  renderResultList(q, opts);\n  typoNote();\n  aiReset();\n}",p)
    s=rep(s,"  return { terms, nums, exact, refs, raw: String(q), foreign: fx.foreign, step: wide.step || 1 };","  return { terms, nums, exact, refs, raw: String(q), foreign: fx.foreign, step: wide.step || 1, typos: tyFix };",p)
    open(p,'w',encoding='utf8').write(s); print('patched',p)
