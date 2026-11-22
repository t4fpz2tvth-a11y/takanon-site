// 20.11.2026 (Yoni: "צור דף נפרד בתוך אתר הבוט... תחייב את מי שנכנס להזדהות בשם [מלא] בפעם הראשונה שנכנס דרך דפדפן חדש...
// גישה שבה אני יכול לראות מי נכנס לאיזה סרטון וכמה צפה"): the four videos of the academy forum of 19.11.2026 (/forum/).
// A browser gives a full name once and gets a random token of its own in a cookie (only the token's hash is kept); the
// name is what the visitor typed, not a checked identity. The videos themselves are NOT in the public repository: they
// are read from a private R2 bucket (binding VIDEOS, objects forum-1.mp4 ... forum-4.mp4) and only for a browser that
// gave a name. While a video plays the page reports, about every ten seconds, how many seconds were played and how far
// the viewer got; the head (signed in to the coordinators' bot with his own code) reads the totals.
//   GET  ?op=me                        -> { name, ready, videos: [{ v, title, by, secs, about }] }   (name is '' before the first visit)
//   GET  ?v=1..4                       -> the video (Range supported), for a browser that gave a name
//   POST { op: 'hello', name }         -> { name } and the cookie
//   POST { op: 'bye' }                 -> the cookie removed ("זה לא אני")
//   POST { op: 'beat', v, played, pos, open } -> 204
//   POST { op: 'here', t }              -> 204   (time on the pages and visits; see below)
//   POST { op: 'report' } (the head)   -> { videos, howto, rows: [{ id, name, created, v, secs, maxpos, opens, first, last }], time: [{ id, secs, visits, last }] }
// 22.11.2026 (Yoni: "תוסיף גם מעקב של סרטוני ההדרכה של האייפון והאנדרואיד, וגם כמה זמן בכללי אותו אדם היה וגם כמה פעמים
// נכנס. הוא צריך להזין את השם רק בכניסה הראשונה מאותו מכשיר"): the short how-to films of /forum/connect/ are counted like
// the four parts (numbers 11 to 15), and the three pages report, while they are on screen, how long the visitor stayed.
// A visit is counted when a page reports after half an hour of silence, so moving between the pages is one visit.
import { json, text, who, setup, sha } from '../_lib.js';
const VIDEOS = [
  { v: 1, title: 'היכרות ותיאום ציפיות', by: 'יוני רעם, רמ"ח אקדמיה', secs: 663, about: 'מה זה רכז אקדמיה, ייצוג מול ליווי, מה מצפים מכם, מתי מטפלים לבד ומתי יחד, תרגול קצר ואיך נשארים בקשר.' },
  { v: 2, title: 'ראייה רחבה של תפקיד הרכז ובעיות רוחביות', by: 'אריק, יו"ר האגודה', secs: 1299, about: 'הגופים הארציים (ור״ה, מל״ג, ות״ת), מבנה האקדמיה באוניברסיטה, מתי בעיה היא רוחבית ואיך מקדמים מדיניות.' },
  { v: 3, title: 'איך פועלים מול המערכת האוניברסיטאית', by: 'אלעד, רכז אקדמי לשעבר', secs: 1451, about: 'מול מי עובדים באוניברסיטה, שבע טעויות נפוצות, מה חשוב להכיר בנה״ל, ושני תרגולים: בוחן עם ממוצע נמוך וחשד להעתקה.' },
  { v: 4, title: 'תהליך העבודה, הבוט והכלים', by: 'יוני רעם, רמ"ח אקדמיה', secs: 1636, about: 'למה בוט, הדגמה חיה, כללי העבודה איתו, שאלות הרכזים על פרטיות והרשאות, והמשימות לשבוע הקרוב.' }
];
const HOWTO = [
  { v: 11, file: 'iphone-app', title: 'אייפון: הבוט כאפליקציה', secs: 48 },
  { v: 12, file: 'iphone-alerts', title: 'אייפון: יומן והתראות', secs: 37 },
  { v: 13, file: 'iphone-whatsapp', title: 'אייפון: הודעות מוואטסאפ', secs: 49 },
  { v: 14, file: 'android-app', title: 'אנדרואיד: הבוט כאפליקציה', secs: 45 },
  { v: 15, file: 'android-alerts', title: 'אנדרואיד: יומן והתראות', secs: 39 }
];
const TOKEN = /^v\.[0-9a-f]{64}$/, YEAR = 31536000;
// Lax, not Strict: a link opened from WhatsApp or an e-mail must carry the cookie, or the name would be asked every time
const cookie = v => 'tkf=' + v + '; Path=/; Max-Age=' + (v ? YEAR : 0) + '; HttpOnly; Secure; SameSite=Lax';
const sent = request => { const m = String(request.headers.get('Cookie') || '').match(/(?:^|;\s*)tkf=([^;]*)/); return m && TOKEN.test(m[1].trim()) ? m[1].trim() : ''; };
let made = false;
async function tables(env) {
  if (made) return;
  await setup(env);
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS forum_viewers (h TEXT PRIMARY KEY, name TEXT NOT NULL, created INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS forum_views (h TEXT NOT NULL, v INTEGER NOT NULL, secs INTEGER NOT NULL, maxpos INTEGER NOT NULL, opens INTEGER NOT NULL, first INTEGER NOT NULL, last INTEGER NOT NULL, PRIMARY KEY (h, v))'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS forum_time (h TEXT PRIMARY KEY, secs INTEGER NOT NULL, visits INTEGER NOT NULL, last INTEGER NOT NULL)')
  ]);
  made = true;
}
async function viewer(request, env) {
  const t = sent(request); if (!t || !env.DB) return null;
  await tables(env);
  const h = await sha('forum|' + t), r = await env.DB.prepare('SELECT name FROM forum_viewers WHERE h = ?').bind(h).first();
  return r ? { h, name: r.name } : null;
}
// a full name: two words or more, of letters (any script), with ' " - . allowed inside; 5 to 60 characters
const cleanName = s => String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
const fullName = n => n.length >= 5 && n.split(' ').filter(w => /^[\p{L}][\p{L}\p{M}'"׳״.\-]*$/u.test(w) && (w.match(/\p{L}/gu) || []).length >= 2).length >= 2 && n.split(' ').every(w => /^[\p{L}][\p{L}\p{M}'"׳״.\-]*$/u.test(w));

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url), v = Number(url.searchParams.get('v') || 0);
  if (url.searchParams.get('op') === 'me') {
    let name = ''; try { const w = await viewer(request, env); name = w ? w.name : ''; } catch (_) {}
    return json({ name, ready: !!env.VIDEOS, videos: VIDEOS, howto: HOWTO });
  }
  const item = VIDEOS.find(x => x.v === v);
  if (!item) return text('not found', 404);
  const w = await viewer(request, env);
  if (!w) return text('name first', 403);
  if (!env.VIDEOS) return text('the videos are not connected yet (binding VIDEOS)', 503);
  const key = 'forum-' + v + '.mp4', head = await env.VIDEOS.head(key);
  if (!head) return text('not uploaded yet', 404);
  const size = head.size, H = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600', 'X-Robots-Tag': 'noindex, nofollow', 'ETag': head.httpEtag };
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(request.headers.get('Range') || '').trim());
  if (m && (m[1] || m[2])) {
    let a, b;
    if (m[1]) { a = Number(m[1]); b = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1; }
    else { const n = Math.min(Number(m[2]), size); a = size - n; b = size - 1; }
    if (!(a >= 0 && a <= b && a < size)) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
    const part = await env.VIDEOS.get(key, { range: { offset: a, length: b - a + 1 } });
    if (!part) return text('not found', 404);
    return new Response(part.body, { status: 206, headers: Object.assign({}, H, { 'Content-Range': 'bytes ' + a + '-' + b + '/' + size, 'Content-Length': String(b - a + 1) }) });
  }
  const all = await env.VIDEOS.get(key);
  if (!all) return text('not found', 404);
  return new Response(all.body, { headers: Object.assign({}, H, { 'Content-Length': String(size) }) });
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url), origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return text('forbidden', 403);
  if (!env.DB) return text('no storage', 503);
  let b; try { b = await request.json(); } catch (_) { return text('bad request', 400); }
  const op = b && b.op;
  await tables(env);
  if (op === 'report') {
    const u = await who(request, env);
    if (!u || !u.admin) return text('forbidden', 403);
    const rows = (await env.DB.prepare('SELECT w.h AS id, w.name, w.created, x.v, x.secs, x.maxpos, x.opens, x.first, x.last FROM forum_viewers w LEFT JOIN forum_views x ON x.h = w.h ORDER BY w.created').all()).results || [];
    const time = (await env.DB.prepare('SELECT h AS id, secs, visits, last FROM forum_time').all()).results || [];
    return json({ videos: VIDEOS, howto: HOWTO, rows: rows.map(r => Object.assign(r, { id: String(r.id).slice(0, 8) })), time: time.map(r => Object.assign(r, { id: String(r.id).slice(0, 8) })) });
  }
  if (op === 'hello') {
    const name = cleanName(b.name);
    if (!fullName(name)) return json({ error: 'name' }, 400);
    const ip = request.headers.get('CF-Connecting-IP') || 'x';
    const n = await env.DB.prepare('INSERT INTO hits (k, h, n) VALUES (?, ?, 1) ON CONFLICT (k, h) DO UPDATE SET n = n + 1 RETURNING n').bind('fh:' + (await sha(ip)).slice(0, 24), Math.floor(Date.now() / 3600e3)).first();
    if (n && n.n > 30) return json({ error: 'many' }, 429);
    const token = 'v.' + [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2, '0')).join('');
    await env.DB.prepare('INSERT INTO forum_viewers (h, name, created) VALUES (?, ?, ?)').bind(await sha('forum|' + token), name, Date.now()).run();
    return new Response(JSON.stringify({ name }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': cookie(token) } });
  }
  if (op === 'bye') return new Response(null, { status: 204, headers: { 'Set-Cookie': cookie('') } });
  if (op === 'here') {   // a page on screen: every fifteen seconds or so, with the seconds since the last report (more than thirty is not believed)
    const w = await viewer(request, env); if (!w) return text('name first', 403);
    const t = Math.max(0, Math.min(30, Math.floor(Number(b.t) || 0))), now = Date.now();
    await env.DB.prepare('INSERT INTO forum_time (h, secs, visits, last) VALUES (?, ?, 1, ?) ON CONFLICT (h) DO UPDATE SET visits = visits + (CASE WHEN excluded.last - last > 1800000 THEN 1 ELSE 0 END), secs = secs + excluded.secs, last = excluded.last')
      .bind(w.h, t, now).run();
    return new Response(null, { status: 204 });
  }
  if (op === 'beat') {
    const w = await viewer(request, env); if (!w) return text('name first', 403);
    const item = VIDEOS.find(x => x.v === Number(b.v)) || HOWTO.find(x => x.v === Number(b.v)); if (!item) return text('bad request', 400);
    const num = (x, max) => Math.max(0, Math.min(max, Math.floor(Number(x) || 0)));
    const played = num(b.played, 20), pos = num(b.pos, item.secs), open = b.open ? 1 : 0, now = Date.now();   // a call covers about ten seconds; more than twenty is not believed
    if (!played && !open) return new Response(null, { status: 204 });
    await env.DB.prepare('INSERT INTO forum_views (h, v, secs, maxpos, opens, first, last) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (h, v) DO UPDATE SET secs = MIN(secs + excluded.secs, ?), maxpos = MAX(maxpos, excluded.maxpos), opens = opens + excluded.opens, last = excluded.last')
      .bind(w.h, item.v, played, pos, open, now, now, item.secs * 5).run();
    return new Response(null, { status: 204 });
  }
  return text('bad request', 400);
}
