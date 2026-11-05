// The head's list of access codes (3.11.2026): POST { op: 'list' | 'create' | 'reset' | 'revoke', name?, uid? } with the head's X-Code.
// A new code is shown once, when it is created; only its hash is kept.
import { text, json, setup, who, sha, normCode } from '../_lib.js';
// an easy code (3.11.2026, Yoni: the random ones were hard to remember; then: "a word that rhymes with the name"): the
// coordinator's first name, a common word that rhymes with it when one does (the same last two letters, else the last
// one), and a two-digit number, e.g. "נועה-תנועה-47", "דניאל-מזל-23"; wrong guesses are limited per address (see who)
const WORDS = ('שעה תנועה הפתעה תרועה גבעה מנורה דבורה סירה מערה פרה מדורה קערה מנהרה תשורה תמונה מכונה שושנה גינה מדינה ' +
  'תאנה לבנה מנגינה ספינה פינה בננה שמלה נמלה מגילה מסילה תהילה סלסלה עגלה אריה מטריה ספרייה חמנייה שקדייה מאפייה ' +
  'חנוכה ברכה נסיכה מלכה סוכה מוזיקה אבקה עוגה חגיגה מדרגה פסגה גלידה חידה אגדה פיצה חולצה ביצה קפיצה גלישה מגלשה ' +
  'ריבה תיבה אהבה מחשבה חכמה נשמה אדמה חומה רקמה מראה קריאה כיתה פיתה מיטה חיטה תקווה מצווה כיפה חופה קופה טיפה ' +
  'קופסה כניסה טיסה מזוזה אחוזה שמחה מנוחה ארוחה מזל גמל דגל גלגל מגדל כרמל חשמל פסל שביל מעיל פתיל תבשיל נעל ' +
  'שועל מפעל אוכל מאכל היכל חבל כבל נחל רגל עגל כינור תנור ציפור מגדלור דרור זמר צמר חדר סדר גדר מחר שיר קיר עיר ' +
  'אוויר עכבר מדבר באר תואר פאר הר נהר זוהר פרפר ספר שופר גשר אושר בלון חלון ארמון שעון עיתון לווייתן חתן אורן ' +
  'גורן מעדן יין גרעין בניין שולחן לחן טעם פעם חותם כתם ים מים שמיים שלום יום חלום מרום צבי דלי כלי פרי גדי שי ' +
  'קיווי סוד כבוד מועד הד זאב כוכב דב ענב לב רכב מכתב כסף חוף עוף מטע כובע צבע אצבע ארז תפוז אגוז חרוז חג דג שלג ' +
  'פלא כפית מכונית חבית זית בית שקית מחברת צלחת טבעת תפוח לוח רוח ברק דבש שמש עץ מיץ קיץ').split(' ');
const pick = n => crypto.getRandomValues(new Uint32Array(1))[0] % n;
const FIN = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' }, plain = w => w.replace(/[ךםןףץ]/g, c => FIN[c]);
export function rhymeFor(name) {
  const n = plain(name), ok = w => plain(w) !== n;
  for (const k of [2, 1]) {
    const end = n.slice(-k), hits = WORDS.filter(w => ok(w) && plain(w).endsWith(end));
    if (end.length === k && hits.length) return hits[pick(hits.length)];
  }
  return WORDS[pick(WORDS.length)];
}
function easyCode(name, env) {
  const first = (String(name).trim().split(/\s+/)[0] || 'רכז').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 12) || 'רכז';
  // 5.11.2026 (the blind review: a known first name left about 90–2,000 possible codes): with STRONG_CODES=1 a new code has the
  // name, the rhyme, two more random words and a four-digit number (about 10^10 possibilities, still words to type on a phone)
  if (env && env.STRONG_CODES === '1') return normCode(first + '-' + rhymeFor(first) + '-' + WORDS[pick(WORDS.length)] + '-' + WORDS[pick(WORDS.length)] + '-' + (1000 + pick(9000)));
  return normCode(first + '-' + rhymeFor(first) + '-' + (10 + pick(90)));
}
export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return text('forbidden', 403);
  if (!env.DB) return text('the storage is not connected yet (binding DB)', 503);
  const u = await who(request, env);
  if (!u || !u.admin) return text('the head only', 403);
  await setup(env);
  let b; try { b = await request.json(); } catch (_) { return text('bad request', 400); }
  if (b.op === 'list') return json({ codes: ((await env.DB.prepare('SELECT uid, name, created FROM codes ORDER BY created').all()).results || []) });
  if (b.op === 'create') {
    const name = String(b.name || '').trim().slice(0, 80); if (!name) return text('a name', 400);
    const uid = 'u_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
    for (let t = 0; t < 5; t++) {   // a code already in use (very rare) is drawn again
      const code = easyCode(name, env);
      try { await env.DB.prepare('INSERT INTO codes (hash, uid, name, created) VALUES (?, ?, ?, ?)').bind(await sha(code), uid, name, Date.now()).run(); return json({ uid, name, code }); } catch (_) {}
    }
    return text('try again', 500);
  }
  // a new code for the same coordinator: the same uid, so their log stays theirs; the old code stops working
  if (b.op === 'reset') {
    const row = await env.DB.prepare('SELECT name, created FROM codes WHERE uid = ?').bind(String(b.uid || '')).first();
    if (!row) return text('no such coordinator', 404);
    for (let t = 0; t < 5; t++) {
      const code = easyCode(row.name, env);
      try {
        await env.DB.batch([env.DB.prepare('DELETE FROM codes WHERE uid = ?').bind(String(b.uid)), env.DB.prepare('INSERT INTO codes (hash, uid, name, created) VALUES (?, ?, ?, ?)').bind(await sha(code), String(b.uid), row.name, row.created)]);
        return json({ uid: b.uid, name: row.name, code });
      } catch (_) {}
    }
    return text('try again', 500);
  }
  if (b.op === 'revoke') { await env.DB.prepare('DELETE FROM codes WHERE uid = ?').bind(String(b.uid || '')).run(); return json({ ok: true }); }
  return text('unknown op', 400);
}
