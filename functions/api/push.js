// 17.11.2026 22:45 (Yoni approved 26: notifications from the icon, in three cases): Web Push for the coordinators' app.
// Three cases, by his decision: (1) a case that was opened three days ago and not updated, (2) the head added a remark to a
// coordinator's case (sent at once), (3) the morning of a case's target date. (1) and (3) are joined into one notification
// a day. A notification never holds a student's name or anything of a case.
// 18.11.2026 23:30 (Yoni: "כשיש מקרה חדש... גם במייל וגם בהתראה, שניהם רק לי, ושיהיה שם האדם שהכניס את המקרה"): (4) a new
// case: a notification and a mail to the head alone, at once, with the name of the coordinator who opened it (their own
// name, as the head wrote it in the codes list) and a link to the case; still nothing of the student or of the case itself.
//   GET                          -> { key }: the public key a browser subscribes with
//   POST { op: 'sub', sub }      (signed in) keeps this device's subscription for this coordinator
//   POST { op: 'unsub', endpoint } (signed in) removes it
//   POST { op: 'state' }         (signed in) -> { n }: how many devices this coordinator has subscribed
//   POST { op: 'peek' }          (signed in, from the app's service worker) -> { title, body, url }: what to show now
//   POST { op: 'note', uid }     (the head) a remark was added to a case of this coordinator: notify them
//   POST { op: 'tick' }          (the head, or the scheduled check's token) the daily notification, once a day per coordinator
// The push itself carries no content (so nothing has to be encrypted and nothing of a case leaves the site): the app's
// service worker, woken by it, asks the site what to show (peek) with the device's own sign-in.
// The keys (VAPID) are made here at first use and kept in the database: nobody types or sees them.
import { who, setup } from '../_lib.js';
const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const b64u = b => btoa(String.fromCharCode.apply(null, new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const tables = env => env.DB.batch([
  env.DB.prepare('CREATE TABLE IF NOT EXISTS push_cfg (k TEXT PRIMARY KEY, v TEXT NOT NULL)'),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, uid TEXT NOT NULL, t INTEGER NOT NULL)'),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS push_msg (uid TEXT PRIMARY KEY, body TEXT NOT NULL, url TEXT NOT NULL, t INTEGER NOT NULL)'),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS push_day (uid TEXT NOT NULL, day TEXT NOT NULL, PRIMARY KEY (uid, day))')
]);
async function keys(env) {
  const r = await env.DB.prepare("SELECT v FROM push_cfg WHERE k = 'vapid'").first();
  if (r) return JSON.parse(r.v);
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const v = { jwk: await crypto.subtle.exportKey('jwk', kp.privateKey), pub: b64u(await crypto.subtle.exportKey('raw', kp.publicKey)) };
  await env.DB.prepare("INSERT INTO push_cfg (k, v) VALUES ('vapid', ?) ON CONFLICT (k) DO NOTHING").bind(JSON.stringify(v)).run();
  return JSON.parse((await env.DB.prepare("SELECT v FROM push_cfg WHERE k = 'vapid'").first()).v);   // the one that was kept, if two came at once
}
// only the push services of the browsers: nothing else is ever called
export const pushHost = u => { try { const x = new URL(u); return x.protocol === 'https:' && /(^|\.)(fcm\.googleapis\.com|push\.apple\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/.test(x.hostname); } catch (_) { return false; } };
async function sendOne(env, k, endpoint) {
  const aud = new URL(endpoint).origin, enc = o => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const head = enc({ typ: 'JWT', alg: 'ES256' }) + '.' + enc({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:r_academy@aguda.org.il' });
  const key = await crypto.subtle.importKey('jwk', k.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(head));
  const r = await fetch(endpoint, { method: 'POST', headers: { 'Authorization': 'vapid t=' + head + '.' + b64u(sig) + ', k=' + k.pub, 'TTL': '86400', 'Urgency': 'normal', 'Content-Length': '0' } });
  if (r.status === 404 || r.status === 410) await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(endpoint).run();   // the device unsubscribed
  return r.status;
}
async function notify(env, uid, body, url) {
  const subs = (await env.DB.prepare('SELECT endpoint FROM push_subs WHERE uid = ?').bind(uid).all()).results || [];
  if (!subs.length) return 0;
  await env.DB.prepare('INSERT INTO push_msg (uid, body, url, t) VALUES (?, ?, ?, ?) ON CONFLICT (uid) DO UPDATE SET body = excluded.body, url = excluded.url, t = excluded.t').bind(uid, body, url, Date.now()).run();
  const k = await keys(env); let ok = 0;
  for (const s of subs.slice(0, 8)) { try { const st = await sendOne(env, k, s.endpoint); if (st >= 200 && st < 300) ok++; } catch (_) {} }
  return ok;
}
// 17.11.2026 23:20 (Yoni: "אני רוצה מייל גם"): a mail to the coordinator when the head adds a remark. It goes out through the
// small script the head keeps in the department's tracking sheet (the same one the sheet's sync uses, with the same shared
// secret; see sheet.js), so it is sent from the department's own mailbox and no mail service or new account is needed. The
// site hands over the address alone: the subject and the text are fixed inside the script and hold nothing of the case.
// 17.11.2026 23:35 (Yoni: "שיגיד בדיוק באיזה מקרה, מה ההערה, וקישור ישיר"): the mail now names the case (as the head's page
// describes it), carries the remark and links straight to the case. So the remark and that description do pass through the
// department's mailbox to the coordinator's; that is the head's decision. A double tap within a minute sends one mail. Until the script is connected (or updated), nothing is sent
async function mailNote(env, uid, more) {
  try {
    const last = await env.DB.prepare('SELECT v FROM push_cfg WHERE k = ?').bind('mail:' + uid).first();
    if (last && Date.now() - Number(last.v) < 60e3) return false;   // 23:35: each remark has its own mail now (it carries the remark), so only a double tap is held back
    const row = await env.DB.prepare('SELECT data FROM docs WHERE path = ?').bind('config/sheet').first(), cfg = row ? JSON.parse(row.data) : {};
    const secret = (env.SHEET_SECRET && String(env.SHEET_SECRET).length >= 24) ? String(env.SHEET_SECRET) : cfg.secret || '';
    const rec = await env.DB.prepare('SELECT data FROM docs WHERE path = ?').bind('log/' + uid).first(), to = rec ? String(JSON.parse(rec.data).email || '').trim() : '';
    if (!cfg.url || secret.length < 24 || to.length > 120 || !/^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/.test(to)) return false;
    const r = await fetch(cfg.url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ tool: 'send_mail', args: Object.assign({ to }, more || {}), secret }), redirect: 'follow' });
    let j = null; try { j = JSON.parse(await r.text()); } catch (_) {}
    if (!(j && j.ok)) return false;
    await env.DB.prepare('INSERT INTO push_cfg (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v').bind('mail:' + uid, String(Date.now())).run();
    return true;
  } catch (_) { return false; }
}
// (4) a new case, to the head alone. Called by the log (db.js) when a coordinator's case is saved for the first time. The mail
// goes through the sheet's script (tool "new_case"), which sends it only to the department's mailbox: the address is fixed
// inside the script, the site hands over no address. Until the script is updated in the sheet, only the notification goes out
// 22.11.2026 (Yoni: a mail said "מקרה חדש" and no such case was in the list): a coordinator's general question is kept in the log
// like a case but listed apart, under "שאלות כלליות". The notification and the mail now say which of the two it is.
export async function newCase(env, origin, by, id, general) {
  const out = { sent: 0, mailed: false };
  try {
    await tables(env);
    const name = String(by && by.name || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 40) || 'רכז/ת';
    const cid = String(id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60), uid = String(by && by.uid || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
    if (!cid || !uid || uid === 'admin') return out;
    const link = origin + '/coord/?c=' + cid + '&u=' + uid;
    out.sent = await notify(env, 'admin', (general ? 'שאלה כללית חדשה מאת ' : 'מקרה חדש מאת ') + name, link);
    const row = await env.DB.prepare('SELECT data FROM docs WHERE path = ?').bind('config/sheet').first(), cfg = row ? JSON.parse(row.data) : {};
    const secret = (env.SHEET_SECRET && String(env.SHEET_SECRET).length >= 24) ? String(env.SHEET_SECRET) : cfg.secret || '';
    if (cfg.url && secret.length >= 24) {
      const r = await fetch(cfg.url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ tool: 'new_case', args: { name: general ? name + ' (שאלה כללית, לא מקרה של סטודנט)' : name, link }, secret }), redirect: 'follow' });
      let j = null; try { j = JSON.parse(await r.text()); } catch (_) {}
      out.mailed = !!(j && j.ok);
    }
  } catch (_) {}
  return out;
}
// what waits for a coordinator today: target dates that fall today, and cases that turn three days old today with no update
export function dueToday(cases, today, now) {
  const D = 864e5; let due = 0, stale = 0;
  for (const c of cases) {
    if (!c || c.general || c.status === 'closed') continue;
    if (c.due) { if (c.due === today) due++; continue; }
    const t0 = new Date(c.t0 || 0).getTime(), t1 = new Date(c.t1 || c.t0 || 0).getTime();
    if (!t0 || isNaN(t0) || (c.status && c.status !== 'open') || c.statusT || t1 > t0 + 3 * D) continue;
    if (Math.floor((now - t0) / D) === 3) stale++;
  }
  return { due, stale, n: due + stale };
}
const ilDay = t => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(t));
const ilHour = t => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false }).format(new Date(t)));
export async function onRequestGet({ env }) {
  if (!env.DB) return json({ error: 'not set up' }, 503);
  await setup(env); await tables(env);
  return json({ key: (await keys(env)).pub });
}
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'not set up' }, 503);
  const u = await who(request, env); if (!u) return json({ error: 'sign in' }, 401);
  let b = {}; try { b = await request.json(); } catch (_) {}
  await setup(env); await tables(env);
  const origin = new URL(request.url).origin;
  if (b.op === 'tick') {
    if (!(u.admin || u.notify)) return json({ error: 'not allowed' }, 403);
    const now = Date.now(), day = ilDay(now); if (ilHour(now) < 8 || ilHour(now) >= 20) return json({ sent: 0, quiet: true });
    const uids = ((await env.DB.prepare('SELECT DISTINCT uid FROM push_subs').all()).results || []).map(x => x.uid); let sent = 0;
    for (const uid of uids.slice(0, 200)) {
      if (await env.DB.prepare('SELECT 1 FROM push_day WHERE uid = ? AND day = ?').bind(uid, day).first()) continue;
      const rs = (await env.DB.prepare('SELECT data FROM docs WHERE coll = ?').bind('log/' + uid + '/cases').all()).results || [];
      const w = dueToday(rs.map(r => { try { return JSON.parse(r.data); } catch (_) { return null; } }), day, now);
      await env.DB.prepare('INSERT INTO push_day (uid, day) VALUES (?, ?) ON CONFLICT DO NOTHING').bind(uid, day).run();
      if (!w.n) continue;
      if (await notify(env, uid, w.n === 1 ? 'מקרה אחד למעקב היום' : w.n + ' מקרים למעקב היום', origin + '/coord/?my=1')) sent++;
    }
    await env.DB.prepare('DELETE FROM push_day WHERE day < ?').bind(ilDay(now - 7 * 864e5)).run();
    return json({ sent });
  }
  if (u.notify || u.bench) return json({ error: 'not allowed' }, 403);
  if (b.op === 'sub') {
    const ep = String(b.sub && b.sub.endpoint || ''); if (!pushHost(ep) || ep.length > 1000) return json({ error: 'bad subscription' }, 400);
    await env.DB.prepare('INSERT INTO push_subs (endpoint, uid, t) VALUES (?, ?, ?) ON CONFLICT (endpoint) DO UPDATE SET uid = excluded.uid, t = excluded.t').bind(ep, u.uid, Date.now()).run();
    return json({ ok: true });
  }
  if (b.op === 'unsub') { await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ? AND uid = ?').bind(String(b.endpoint || ''), u.uid).run(); return json({ ok: true }); }
  if (b.op === 'state') { const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE uid = ?').bind(u.uid).first(); return json({ n: r ? r.n : 0 }); }
  if (b.op === 'peek') {
    const m = await env.DB.prepare('SELECT body, url, t FROM push_msg WHERE uid = ?').bind(u.uid).first();
    const fresh = m && Date.now() - m.t < 36 * 3600e3;
    return json({ title: 'בוט הרכזים', body: fresh ? m.body : 'יש עדכון בבוט הרכזים', url: fresh ? m.url : origin + '/coord/' });
  }
  if (b.op === 'test') {   // 17.11.2026 23:30: a check notification to one's own devices; says what each push service answered
    const subs = (await env.DB.prepare('SELECT endpoint FROM push_subs WHERE uid = ?').bind(u.uid).all()).results || [];
    await env.DB.prepare('INSERT INTO push_msg (uid, body, url, t) VALUES (?, ?, ?, ?) ON CONFLICT (uid) DO UPDATE SET body = excluded.body, url = excluded.url, t = excluded.t').bind(u.uid, 'בדיקה: ההתראות פועלות', origin + '/coord/', Date.now()).run();
    const k = await keys(env), got = [];
    for (const x of subs.slice(0, 8)) { try { got.push({ host: new URL(x.endpoint).hostname, status: await sendOne(env, k, x.endpoint) }); } catch (e) { got.push({ host: new URL(x.endpoint).hostname, error: String(e && e.message || e).slice(0, 80) }); } }
    return json({ subs: subs.length, got });
  }
  if (b.op === 'mailtest') {   // 18.11.2026: after the sheet's script was replaced: one check mail, head only, always to the department's own mailbox and nowhere else; says what the script answered
    if (!u.admin) return json({ error: 'not allowed' }, 403);
    try {
      const row = await env.DB.prepare('SELECT data FROM docs WHERE path = ?').bind('config/sheet').first(), cfg = row ? JSON.parse(row.data) : {};
      const secret = (env.SHEET_SECRET && String(env.SHEET_SECRET).length >= 24) ? String(env.SHEET_SECRET) : cfg.secret || '';
      if (!cfg.url || secret.length < 24) return json({ ok: false, why: 'not connected' });
      const call = async (tool, args) => { const r = await fetch(cfg.url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ tool, args, secret }), redirect: 'follow' }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {} return { status: r.status, ok: !!(j && (j.ok || j.values)), error: j && j.error ? String(j.error).slice(0, 160) : (j ? '' : t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 160)) }; };
      const ping = await call('ping', {});
      const mail = await call('send_mail', { to: 'r_academy@aguda.org.il', label: 'בדיקה (מקרה לדוגמה, לא אמיתי)', text: 'זו הודעת בדיקה אחרי עדכון הסקריפט. אין צורך לעשות דבר.', link: origin + '/coord/' });
      return json({ ping, mail });
    } catch (e) { return json({ ok: false, why: String(e && e.message || e).slice(0, 160) }); }
  }
  if (b.op === 'note') {
    if (!u.admin) return json({ error: 'not allowed' }, 403);
    const uid = String(b.uid || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60); if (!uid || uid === u.uid) return json({ sent: 0 });
    const cid = String(b.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60), link = origin + '/coord/' + (cid ? '?c=' + cid + '&u=' + uid : '');
    const clean = (x, n) => String(x || '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, n);
    const sent = await notify(env, uid, 'רמ״ח הוסיף הערה למקרה שלך', link);   // the notification itself still says nothing of the case; a tap opens it
    return json({ sent, mailed: await mailNote(env, uid, { link, label: clean(b.label, 160), text: clean(b.text, 700) }) });
  }
  return json({ error: 'unknown op' }, 400);
}
