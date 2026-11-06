// 6.11.2026 (Yoni): the UX/UI audit brief run by other models with hands: a browser on the live bots (public and
// coordinators', signed in with the bench code the runner holds; the model never sees it) and the built code. Each model
// calls tools in a loop, then hands in the audit. audit/agent_request.json: { "run": n, "models": [...], "steps": 40 }.
// The models run side by side, each in its own browser context. Needs BENCH_CODE. AUDIT_DRY='[["open",{"path":"/"}],…]'
// runs the tools alone, without a model (a local check: AUDIT_SITE=http://localhost:8800 PW_DIR=/opt/npm-tools/).
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { chromium } = createRequire(process.env.PW_DIR || '/tmp/')('playwright');
const SITE = process.env.AUDIT_SITE || 'https://takanon-site.pages.dev';
const CODE = process.env.BENCH_CODE || '';   // the comparison calls (?test=1) and the codes API: the head's code (or the bench token)
if (!CODE) { console.log('BENCH_CODE secret is missing'); process.exit(1); }
// the browser's sign-in on /coord/ (6.11.2026, Yoni): a coordinator code of the run's own, made through /api/codes at the start and
// revoked at the end with everything it logged; the models never see any code. AUDIT_COORD_CODE, when set, is used instead.
let COORD = process.env.AUDIT_COORD_CODE || '', coordUid = null;
const api = (path, body, code, extra) => fetch(SITE + path, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', 'X-Code': encodeURIComponent(code) }, extra || {}), body: JSON.stringify(body) });
const req = JSON.parse(fs.readFileSync('audit/agent_request.json', 'utf8'));
const STEPS = req.steps || 40;
const packet = fs.readFileSync('audit/packet.md', 'utf8');
const brief = packet.split('## חלק א: הנחיית האבחון (כפי שנכתבה)')[1].split('## חלק ב: צילומי המסך')[0].trim();
const intro = packet.split('## מה בחבילה')[0].replace('# חבילת העבודה לאבחון חיצוני: "מה אומר התקנון?"', '').trim();
const CODE_FILES = { 'public/index.html': 'הבוט הציבורי, הדף הבנוי המלא (HTML+CSS+JS בקובץ אחד)', 'public/coord/index.html': 'בוט הרכזים, הדף הבנוי המלא (כולל קוד האתר שעוטף אותו)', 'functions/api/chat.js': 'שרת: הקריאה למודל', 'functions/api/db.js': 'שרת: יומן המקרים', 'functions/api/feedback.js': 'שרת: המשובים', 'functions/_lib.js': 'שרת: זיהוי המשתמש' };
const slug = m => m.replace(/[^a-z0-9.]+/gi, '-').replace(/^-|-$/g, '');
const clip = (s, n) => s.length > n ? s.slice(0, n) + '\n…[עוד ' + (s.length - n) + ' תווים נחתכו]' : s;
const TOOLS = [
  { type: 'function', function: { name: 'open', description: 'פותח דף של האתר בדפדפן (טלפון, 390 פיקסלים). נתיבים: "/" הבוט הציבורי, "/coord/" בוט הרכזים (הכניסה כבר בוצעה בשבילך). מחזיר את הטקסט הנראה.', parameters: { type: 'object', properties: { path: { type: 'string' }, desktop: { type: 'boolean', description: 'true = מסך מחשב ברוחב 1280' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'text', description: 'הטקסט הנראה בדף עכשיו, כמו שקורא מסך פוגש אותו ([כפתור: …], [שדה: …], [בחירה: …], [קיפול: …]).', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'screenshot', description: 'צילום מסך של מה שרואים עכשיו (מצורף כתמונה בהודעה הבאה). חוסך: עד כ-8 צילומים בכל הבדיקה.', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'click', description: 'לוחץ על כפתור/קישור/קיפול לפי הטקסט שלו (או לפי בורר CSS אם מתחיל ב-css:). מחזיר את הטקסט הנראה אחרי הלחיצה.', parameters: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] } } },
  { type: 'function', function: { name: 'type', description: 'מקליד טקסט בשדה (לפי placeholder, תווית, או בורר css:), ואם submit=true שולח (כפתור השליחה של הטופס או Enter) וממתין לתשובה (עד 30 שניות).', parameters: { type: 'object', properties: { field: { type: 'string' }, value: { type: 'string' }, submit: { type: 'boolean' } }, required: ['field', 'value'] } } },
  { type: 'function', function: { name: 'wait', description: 'ממתין (עד 30 שניות), למשל לתשובה שמוזרמת. מחזיר את הטקסט הנראה.', parameters: { type: 'object', properties: { seconds: { type: 'number' } }, required: ['seconds'] } } },
  { type: 'function', function: { name: 'scroll', description: 'גולל בפיקסלים (חיובי = למטה).', parameters: { type: 'object', properties: { dy: { type: 'number' } }, required: ['dy'] } } },
  { type: 'function', function: { name: 'press', description: 'מקש (Escape, Tab, Enter, ArrowDown…), לבדיקת מקלדת ונגישות. מחזיר מה במיקוד.', parameters: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] } } },
  { type: 'function', function: { name: 'a11y', description: 'בדיקת נגישות מהירה של הדף הנוכחי: הרכיב שבמיקוד, כותרות, אזורי landmark, כפתורים בלי שם, ניגודיות של טקסטים (דגימה), פקדים קטנים.', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'code_ls', description: 'רשימת קובצי הקוד שאפשר לקרוא, עם מספר שורות.', parameters: { type: 'object', properties: {}, required: [] } } },
  { type: 'function', function: { name: 'code_grep', description: 'חיפוש ביטוי רגולרי בקובץ קוד (עד 40 תוצאות עם מספרי שורות).', parameters: { type: 'object', properties: { file: { type: 'string' }, pattern: { type: 'string' } }, required: ['file', 'pattern'] } } },
  { type: 'function', function: { name: 'code_read', description: 'קריאת שורות מקובץ קוד (עד 160 שורות בקריאה).', parameters: { type: 'object', properties: { file: { type: 'string' }, from: { type: 'number' }, to: { type: 'number' } }, required: ['file', 'from', 'to'] } } },
  { type: 'function', function: { name: 'finish', description: 'מסיים: מוסר את מסמך האבחון המלא (markdown, בעברית). קרא לזה פעם אחת, בסוף.', parameters: { type: 'object', properties: { document: { type: 'string' } }, required: ['document'] } } },
];
const WALK = `(() => { const walk = n => { if (n.nodeType === 3) return n.nodeValue; if (n.nodeType !== 1) return ''; const cs = getComputedStyle(n); if (n.hidden || cs.display === 'none' || cs.visibility === 'hidden' || n.closest('[aria-hidden="true"]')) return ''; const tag = n.tagName.toLowerCase(); if (tag === 'script' || tag === 'style') return ''; let s = [...n.childNodes].map(walk).join(''); const nm = () => s.trim() || n.getAttribute('aria-label') || n.title || ''; if (tag === 'button') s = '[כפתור: ' + nm() + ']'; else if (tag === 'a') s = '[קישור: ' + nm() + ']'; else if (tag === 'input' && (n.type === 'checkbox' || n.type === 'radio')) s = '[' + (n.type === 'checkbox' ? 'תיבת סימון' : 'בחירה') + (n.checked ? ' מסומן' : '') + ']'; else if (tag === 'input' || tag === 'textarea') s = '[שדה: ' + (n.placeholder || n.getAttribute('aria-label') || n.type) + (n.value ? ' = ' + n.value.slice(0, 80) : '') + ']'; else if (tag === 'select') s = '[בחירה: ' + [...n.options].map(o => o.textContent.trim()).filter(Boolean).slice(0, 8).join(' / ') + ']'; else if (tag === 'summary') s = '[קיפול' + (n.parentElement.open ? ' פתוח' : '') + ': ' + s.trim() + ']'; else if (/^h[1-6]$/.test(tag)) s = '\\n## ' + s.trim() + '\\n'; else if (tag === 'dialog' && n.open) s = '\\n[חלון: ' + s.trim() + ']\\n'; if (/^(p|div|li|section|article|details|form|label|tr|figure|header|footer|nav|main|aside)$/.test(tag)) s = '\\n' + s + '\\n'; return s; }; const el = document.querySelector('details.browse-all'); const t = walk(document.body).replace(/[ \\t]+/g, ' ').replace(/\\n\\s*\\n+/g, '\\n').trim(); const i = t.indexOf('[קיפול: עיון בכל התקנונים]'); return i > 0 && !(el && el.open) ? t.slice(0, i + 26) + ' (סגור; בתוכו 12 תקנונים)' : t; })()`;
const A11Y = `(() => { const r = []; const e = document.activeElement; r.push('במיקוד: ' + (e ? e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') : 'none')); r.push('כותרות: ' + [...document.querySelectorAll('h1,h2,h3')].filter(h => h.offsetParent).map(h => h.tagName + ' ' + h.textContent.trim().slice(0, 40)).join(' | ')); r.push('landmarks: ' + [...document.querySelectorAll('main,nav,header,footer,[role=main],[role=navigation],[role=dialog],[role=alertdialog],[role=status],[aria-live]')].map(x => x.tagName.toLowerCase() + (x.getAttribute('role') ? '[' + x.getAttribute('role') + ']' : '') + (x.getAttribute('aria-live') ? '[live=' + x.getAttribute('aria-live') + ']' : '')).join(', ')); const unnamed = [...document.querySelectorAll('button,a,[role=button]')].filter(b => b.offsetParent && !(b.textContent.trim() || b.getAttribute('aria-label') || b.title)).length; r.push('כפתורים/קישורים בלי שם נגיש (נראים): ' + unnamed); const lum = c => { const m = c.match(/\\d+/g); if (!m) return null; const [R, G, B] = m.slice(0, 3).map(v => { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * R + 0.7152 * G + 0.0722 * B; }; const bg = el => { let n = el; while (n) { const c = getComputedStyle(n).backgroundColor; if (c && !/rgba\\(0, 0, 0, 0\\)|transparent/.test(c)) return c; n = n.parentElement; } return 'rgb(255,255,255)'; }; const low = []; [...document.querySelectorAll('p,span,button,a,label,summary,li,small')].filter(x => x.offsetParent && x.textContent.trim()).slice(0, 400).forEach(x => { const cs = getComputedStyle(x); const l1 = lum(cs.color), l2 = lum(bg(x)); if (l1 == null || l2 == null) return; const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); const big = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && parseInt(cs.fontWeight) >= 700); if (ratio < (big ? 3 : 4.5)) low.push(x.tagName.toLowerCase() + ' "' + x.textContent.trim().slice(0, 30) + '" ' + ratio.toFixed(2)); }); r.push('ניגודיות טקסט מתחת ל-AA (דגימה של עד 400 רכיבים, בלי שקיפויות): ' + (low.length ? low.slice(0, 15).join(' | ') + (low.length > 15 ? ' | …' + low.length : '') : 'לא נמצאו')); const small = [...document.querySelectorAll('button,a,input,select')].filter(x => x.offsetParent && !/^rect\\(/.test(getComputedStyle(x).clip)).map(x => { const b = x.getBoundingClientRect(); return { s: x.tagName.toLowerCase() + ' "' + (x.textContent || x.getAttribute('aria-label') || '').trim().slice(0, 20) + '" ' + Math.round(b.width) + '×' + Math.round(b.height), w: b.width, h: b.height }; }).filter(o => o.w > 0 && (o.w < 24 || o.h < 24)).map(o => o.s); r.push('פקדים נראים שגובהם או רוחבם מתחת ל-24 פיקסלים: ' + (small.length ? small.length + ' · ' + small.slice(0, 10).join(' | ') : '0')); return r.join('\\n'); })()`;
let browser;
async function newPage(st, wide) {
  if (st.ctx) await st.ctx.close();
  st.desktop = !!wide;
  st.ctx = await browser.newContext({ viewport: wide ? { width: 1280, height: 900 } : { width: 390, height: 844 }, isMobile: !wide, hasTouch: !wide, locale: 'he-IL' });
  await st.ctx.addInitScript(c => { try { localStorage.setItem('takanon-code', c); } catch (_) {} }, COORD);
  st.page = await st.ctx.newPage();
}
const vis = async st => { try { return clip(await st.page.evaluate(WALK), 7000); } catch (e) { return 'הדף לא נקרא: ' + e.message; } };
async function locate(page, target) {
  if (target.startsWith('css:')) return page.locator(target.slice(4)).first();
  const t = target.trim();
  for (const l of [page.getByRole('button', { name: t, exact: true }), page.getByRole('link', { name: t, exact: true }), page.locator('summary', { hasText: t }), page.getByText(t, { exact: true }), page.getByRole('button', { name: t }), page.getByText(t)]) { try { if (await l.count()) return l.first(); } catch (_) {} }
  return null;
}
async function tool(st, name, a) {
  const page = st.page;
  if (!page && name !== 'open' && !/^code_/.test(name)) return 'אין דף פתוח: קרא ל-open קודם.';
  switch (name) {
    case 'open': { const p = a.path || '/'; if (!/^\/[a-z0-9\-\/.]*$/i.test(p) || p.includes('..')) return 'נתיב לא מותר: רק נתיבים באתר (/ או /coord/).'; await newPage(st, a.desktop); await st.page.goto(SITE + p, { waitUntil: 'load' }); await st.page.waitForTimeout(2500); return 'נפתח ' + SITE + p + (st.desktop ? ' (מחשב)' : ' (טלפון)') + '\n\n' + await vis(st); }
    case 'text': return await vis(st);
    case 'screenshot': { const b = await page.screenshot({ type: 'jpeg', quality: 70 }); return { image: b.toString('base64'), note: 'צולם' }; }
    case 'click': { const l = await locate(page, a.target || ''); if (!l) return 'לא נמצא: ' + a.target; try { await l.scrollIntoViewIfNeeded(); await l.click({ timeout: 5000 }); } catch (e) { return 'הלחיצה נכשלה: ' + e.message.split('\n')[0]; } await page.waitForTimeout(1200); return await vis(st); }
    case 'type': { let l = null; const f = (a.field || '').trim(); if (f.startsWith('css:')) l = page.locator(f.slice(4)).first(); else { for (const c of [page.getByPlaceholder(f), page.getByLabel(f), page.locator('textarea, input[type=text], input:not([type])')]) { try { if (await c.count()) { l = c.first(); break; } } catch (_) {} } } if (!l) return 'שדה לא נמצא: ' + f; try { await l.scrollIntoViewIfNeeded(); await l.fill(a.value || ''); } catch (e) { return 'ההקלדה נכשלה: ' + e.message.split('\n')[0]; } if (a.submit) { try { const form = l.locator('xpath=ancestor::form[1]'); const btn = form.locator('button[type=submit], button:not([type])').first(); if (await btn.count()) await btn.click(); else await l.press('Enter'); } catch (_) { await l.press('Enter'); } for (let i = 0; i < 30; i++) { await page.waitForTimeout(1000); const busy = await page.evaluate(() => { try { return !!(aiCtl || (typeof letterCtl !== 'undefined' && letterCtl)); } catch (_) { return false; } }).catch(() => false); if (!busy && i >= 2) break; } } return await vis(st); }
    case 'wait': { await page.waitForTimeout(Math.min(30, Math.max(1, a.seconds || 3)) * 1000); return await vis(st); }
    case 'scroll': { await page.mouse.wheel(0, a.dy || 600); await page.waitForTimeout(500); return await vis(st); }
    case 'press': { await page.keyboard.press(a.key || 'Tab'); await page.waitForTimeout(500); const f = await page.evaluate(() => { const e = document.activeElement; return e ? e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + ' "' + (e.textContent || e.value || e.getAttribute('aria-label') || '').trim().slice(0, 60) + '"' : 'none'; }); return 'המיקוד: ' + f + '\n\n' + await vis(st); }
    case 'a11y': return await page.evaluate(A11Y);
    case 'code_ls': return Object.entries(CODE_FILES).map(([f, d]) => f + ' · ' + d + ' · ' + fs.readFileSync(f, 'utf8').split('\n').length + ' שורות').join('\n');
    case 'code_grep': { if (!CODE_FILES[a.file]) return 'קובץ לא ברשימה. code_ls מציג את הרשימה.'; let re; try { re = new RegExp(a.pattern, 'i'); } catch (e) { return 'ביטוי לא תקין: ' + e.message; } const lines = fs.readFileSync(a.file, 'utf8').split('\n'); const out = []; for (let i = 0; i < lines.length && out.length < 40; i++) if (re.test(lines[i])) out.push((i + 1) + ': ' + lines[i].trim().slice(0, 220)); return out.length ? out.join('\n') : 'אין תוצאות'; }
    case 'code_read': { if (!CODE_FILES[a.file]) return 'קובץ לא ברשימה. code_ls מציג את הרשימה.'; const lines = fs.readFileSync(a.file, 'utf8').split('\n'); const from = Math.max(1, a.from | 0), to = Math.min(lines.length, Math.max(from, a.to | 0), from + 159); return lines.slice(from - 1, to).map((l, i) => (from + i) + ': ' + l.slice(0, 400)).join('\n'); }
    default: return 'כלי לא מוכר';
  }
}
const EXP = {};   // per model: 'reasonoff', or '' once the model refused ("Reasoning is mandatory": the default low effort, hidden)
async function chat(model, messages) {
  if (!(model in EXP)) EXP[model] = 'reasonoff';
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(SITE + '/api/chat?test=1&exp=' + EXP[model], { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Code': encodeURIComponent(CODE) }, body: JSON.stringify({ model, input: messages, tools: TOOLS, tool_choice: 'auto', max_tokens: 16000 }) });
    const t = await r.text();
    let j = null; try { j = JSON.parse(t); } catch (_) {}
    if (r.ok && j && !j.error && j.choices) return j;
    const msg = 'HTTP ' + r.status + ' ' + (j && j.error ? JSON.stringify(j.error) : t).slice(0, 300);
    if (EXP[model] === 'reasonoff' && /Reasoning is mandatory/.test(t)) { EXP[model] = ''; console.log('   reasoning stays on for', model); continue; }
    if (attempt < 2 && (r.status >= 500 || r.status === 429 || !j)) { console.log('   retry:', msg); await new Promise(res => setTimeout(res, 20000)); continue; }
    throw new Error(msg);
  }
}
async function runModel(model) {
  const st = { ctx: null, page: null, desktop: false };
  const sys = 'אתה צוות מומחים רב-תחומי לחוויית משתמש שמבצע אבחון של מוצר חי. יש לך דפדפן על המוצר (טלפון; אפשר גם מחשב) וגישה לקוד. עבוד בעצמך: פתח את שני הבוטים, שאל שאלות אמיתיות (סטודנט: מילואים, ערעור, שכר לימוד; רכז: הדבק הודעה של סטודנט/ית, נסח תשובה ופנייה, סמן וסגור מקרה), נסה מצבי קצה (שאלה לא קשורה, "לא נמצא", מקלדת בלבד), הצץ בקוד כשמשהו מעניין אותך. הקפד לא להמציא: כתוב רק מה שראית או קראת, וציין בכל ממצא איפה ראית אותו. יש לך עד ' + STEPS + ' קריאות לכלים; תכנן אותן (כל קריאה מחזירה את טקסט הדף, אז צילומי מסך רק כשהמראה עצמו חשוב). בסוף קרא ל-finish עם מסמך האבחון המלא בעברית, בדיוק במבנה שהבעלים ביקש.';
  const user = intro + '\n\nההנחיה של בעל המוצר:\n\n' + brief + '\n\nהערות: השמות והמספרים שתקליד הם בדויים (למשל דנה כהן, 123456782). בבוט הרכזים אתה מחובר כמשתמש בדיקה; מקרים שתפתח יימחקו אחר כך. בפתיחה הראשונה מופיע סיור קצר (אפשר לדלג); בבוט הרכזים מתבקש שם: הקלד שם בדוי. אל תנסה להיכנס לדפים מחוץ לאתר. כשתשובה מוזרמת, השתמש ב-wait. התחל.';
  const messages = [{ role: 'system', content: sys }, { role: 'user', content: user }];
  const log = []; const usage = { prompt_tokens: 0, completion_tokens: 0, cost: 0 }; let doc = null; let images = 0;
  for (let step = 0; step < STEPS + 3; step++) {
    const j = await chat(model, messages); const u = j.usage || {}; usage.prompt_tokens += u.prompt_tokens || 0; usage.completion_tokens += u.completion_tokens || 0; usage.cost += u.cost || 0;
    const m = j.choices && j.choices[0] && j.choices[0].message; if (!m) throw new Error('no message');
    const calls = m.tool_calls || [];
    messages.push(Object.assign({ role: 'assistant', content: m.content || '' }, calls.length ? { tool_calls: calls } : {}));
    if (!calls.length) {
      if (m.content && m.content.length > 2000) { doc = m.content; break; }   // wrote the audit without finish
      messages.push({ role: 'user', content: step < STEPS ? 'המשך בבדיקה דרך הכלים, ובסוף finish.' : 'סיים עכשיו: קרא ל-finish עם המסמך המלא.' }); continue;
    }
    const shots = [];
    for (const c of calls) {
      let a = {}; try { a = JSON.parse(c.function.arguments || '{}'); } catch (_) {}
      if (c.function.name === 'finish') { doc = a.document || ''; messages.push({ role: 'tool', tool_call_id: c.id, content: 'התקבל' }); continue; }
      if (doc !== null) { messages.push({ role: 'tool', tool_call_id: c.id, content: 'הסתיים' }); continue; }
      let out; try { out = await tool(st, c.function.name, a); } catch (e) { out = 'שגיאה: ' + e.message.split('\n')[0]; }
      log.push({ step, tool: c.function.name, args: a, out: typeof out === 'string' ? out.slice(0, 300) : 'image' });
      console.log('  ', slug(model), step, c.function.name, JSON.stringify(a).slice(0, 100));
      if (typeof out === 'object' && out.image) { messages.push({ role: 'tool', tool_call_id: c.id, content: out.note }); shots.push(out.image); images++; }
      else messages.push({ role: 'tool', tool_call_id: c.id, content: String(out) });
    }
    if (doc !== null) break;
    for (const im of shots) messages.push({ role: 'user', content: [{ type: 'text', text: 'צילום המסך:' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + im } }] });
    if (step >= STEPS) messages.push({ role: 'user', content: 'נגמרו הצעדים. קרא עכשיו ל-finish עם מסמך האבחון המלא.' });
    // the context budget: older tool results shrink, older screenshots go
    const toolMsgs = messages.filter(x => x.role === 'tool'); toolMsgs.slice(0, -8).forEach(x => { if (x.content.length > 400) x.content = x.content.slice(0, 400) + '\n…[נחתך: פלט ישן]'; });
    const imgMsgs = messages.filter(x => x.role === 'user' && Array.isArray(x.content)); imgMsgs.slice(0, -2).forEach(x => { x.content = [{ type: 'text', text: '[צילום מסך ישן הוסר מהזיכרון]' }]; });
  }
  if (st.ctx) await st.ctx.close();
  return { doc: doc || '', usage, log, images };
}
(async () => {
  browser = await chromium.launch();
  if (process.env.AUDIT_DRY) {   // the tools alone, scripted, no model
    const st = { ctx: null, page: null, desktop: false };
    for (const [name, a] of JSON.parse(process.env.AUDIT_DRY)) { const out = await tool(st, name, a || {}); console.log('\n### ' + name + ' ' + JSON.stringify(a || {}) + '\n' + (typeof out === 'string' ? out.slice(0, 1500) : 'image ' + out.image.length)); }
    await browser.close(); return;
  }
  const t0 = Date.now();
  if (!COORD) {
    const r = await api('/api/codes', { op: 'create', name: 'סוכני בדיקה ' + new Date().toISOString().slice(0, 16).replace('T', ' ') }, CODE);
    if (r.ok) { const j = await r.json(); COORD = j.code; coordUid = j.uid; console.log('a coordinator code for this run was made; it is revoked at the end'); }
    else { COORD = CODE; console.log('no coordinator code could be made (HTTP ' + r.status + '): the browser signs in with the main code'); }
  }
  const meta = { run: req.run, t: new Date().toISOString(), steps: STEPS, models: {} };
  await Promise.all((req.models || []).map(async model => {
    console.log('agent', model);
    try { const r = await runModel(model); fs.writeFileSync('audit/agent_run' + req.run + '_' + slug(model) + '.md', '<!-- ' + model + ' · ' + new Date().toISOString().slice(0, 16) + ' · ' + JSON.stringify(r.usage) + ' · steps=' + r.log.length + ' images=' + r.images + ' -->\n\n' + r.doc.trim() + '\n'); fs.writeFileSync('audit/agent_run' + req.run + '_' + slug(model) + '.log.json', JSON.stringify(r.log, null, 1)); meta.models[model] = { ok: true, chars: r.doc.length, usage: r.usage, steps: r.log.length }; console.log('  done:', model, r.doc.length, 'chars', JSON.stringify(r.usage)); }
    catch (e) { meta.models[model] = { ok: false, error: String(e.message).slice(0, 400) }; console.log('  failed:', model, e.message.slice(0, 300)); }
  }));
  fs.writeFileSync('audit/agent_run' + req.run + '.meta.json', JSON.stringify(meta, null, 1));
  await browser.close();
  // the run's traces go: its cases and private records (as the coordinator), its public feedback (as the head), then its code
  if (coordUid) {
    try {
      await api('/api/db', { op: 'delete', path: 'log/' + coordUid }, COORD);
      await api('/api/db', { op: 'delete', path: 'data/users/' + coordUid }, COORD);
      const fb = await api('/api/db', { op: 'list', path: 'fb' }, CODE); let n = 0;
      if (fb.ok) for (const d of ((await fb.json()).docs || [])) if (d.data && ((d.data.from || '').startsWith('סוכני בדיקה') || (d.data.t0 && Date.parse(d.data.t0) >= t0))) { await api('/api/db', { op: 'delete', path: 'fb/' + d.id }, CODE); n++; }
      await api('/api/codes', { op: 'revoke', uid: coordUid }, CODE);
      console.log('cleaned: the run\'s cases, ' + n + ' feedback rows, and its code');
    } catch (e) { console.log('cleanup failed: ' + e.message.slice(0, 200)); }
  }
})();
