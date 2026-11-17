// 17.11.2026 18:05 (Yoni: "האם יש דרך לחבר את הבוט גם לקלנדר", "וגם את היומן"): a coordinator's own calendar feed. The phone's
// calendar subscribes once to a personal address, and from then on every open case's target date is there by itself, and
// changes when the date changes or the case closes.
//   POST { op: 'link' }   (signed in) -> { url }: this coordinator's address (made on first use)
//   POST { op: 'reset' }  (signed in) -> { url }: a new address; the old one stops working
//   GET  ?k=<key>         -> the calendar (text/calendar). No sign-in: a calendar app cannot sign in; the key is the secret.
// What an event says: the kind of date (a deadline or a follow-up), the faculty when the case has one, and the day the case
// was opened. Never the student's name or anything of the case's content: the calendar is kept by Apple or Google.
import { who, setup } from '../_lib.js';
const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const tables = env => env.DB.prepare('CREATE TABLE IF NOT EXISTS cal_keys (uid TEXT PRIMARY KEY, k TEXT NOT NULL, t INTEGER NOT NULL)').run();
const newKey = () => { const a = new Uint8Array(20); crypto.getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2, '0')).join(''); };
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'not set up' }, 503);
  const u = await who(request, env); if (!u || u.notify || u.bench) return json({ error: 'sign in' }, 401);
  let b = {}; try { b = await request.json(); } catch (_) {}
  await tables(env);
  let row = b.op === 'reset' ? null : await env.DB.prepare('SELECT k FROM cal_keys WHERE uid = ?').bind(u.uid).first();
  if (!row) { row = { k: newKey() }; await env.DB.prepare('INSERT INTO cal_keys (uid, k, t) VALUES (?, ?, ?) ON CONFLICT (uid) DO UPDATE SET k = excluded.k, t = excluded.t').bind(u.uid, row.k, Date.now()).run(); }
  return json({ url: new URL(request.url).origin + '/api/cal?k=' + row.k });
}
const esc = x => String(x).replace(/[\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
export function calendarOf(cases, origin, now) {
  const ymd = x => x.getUTCFullYear() + String(x.getUTCMonth() + 1).padStart(2, '0') + String(x.getUTCDate()).padStart(2, '0');
  const stamp = new Date(now || Date.now()).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//takanon//coord-feed//HE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:בוט הרכזים: מועדים', 'X-WR-TIMEZONE:Asia/Jerusalem', 'REFRESH-INTERVAL;VALUE=DURATION:PT2H', 'X-PUBLISHED-TTL:PT2H'];
  for (const { id, c } of cases) {
    if (!c || c.general || c.status === 'closed') continue;
    // 17.11.2026 22:05 (Yoni: three days after a case was opened, "גם כאירוע"): a case with no target date, still open and not
    // updated, gets one event on the day it turns three days old (the same rule as the page's openStale)
    if (!c.due) {
      const t0 = new Date(c.t0 || 0).getTime(), t1 = new Date(c.t1 || c.t0 || 0).getTime(), D = 864e5, nowT = now || Date.now();
      if (!t0 || isNaN(t0) || (c.status && c.status !== 'open') || c.statusT || t1 > t0 + 3 * D || nowT - t0 > 14 * D) continue;
      const d3 = new Date(t0 + 3 * D), day = new Date(Date.UTC(d3.getUTCFullYear(), d3.getUTCMonth(), d3.getUTCDate()));
      const o3 = new Date(t0).getUTCDate() + '.' + (new Date(t0).getUTCMonth() + 1), fac3 = c.student && typeof c.student.faculty === 'string' ? c.student.faculty.replace(/[\u0000-\u001f]/g, '').slice(0, 40) : '';
      const title3 = 'מקרה מ-' + o3 + ' פתוח שלושה ימים בלי עדכון' + (fac3 ? ' (' + fac3 + ')' : '');
      out.push('BEGIN:VEVENT', 'UID:' + String(id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) + '-3d@takanon-site.pages.dev', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + ymd(day), 'DTEND;VALUE=DATE:' + ymd(new Date(day.getTime() + D)),
        'SUMMARY:' + esc(title3), 'DESCRIPTION:' + esc('הפרטים בבוט הרכזים, ב"המקרים שלי".\n' + origin + '/coord/?my=1'), 'URL:' + origin + '/coord/?my=1', 'TRANSP:TRANSPARENT',
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(title3), 'TRIGGER:PT9H', 'END:VALARM', 'END:VEVENT');
      continue;
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(c.due || '')); if (!m) continue;
    const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); if (isNaN(t) || t.getUTCDate() !== +m[3]) continue;
    const o = (() => { try { const d = new Date(c.t0); return isNaN(d) ? '' : d.getUTCDate() + '.' + (d.getUTCMonth() + 1); } catch (_) { return ''; } })();
    const fac = c.student && typeof c.student.faculty === 'string' ? c.student.faculty.replace(/[\u0000-\u001f]/g, '').slice(0, 40) : '';
    const title = (c.dueKind === 'deadline' ? 'מועד אחרון במקרה' : 'מעקב במקרה') + (o ? ' מ-' + o : '') + (fac ? ' (' + fac + ')' : '');
    const alarm = (trig, w) => ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(title + ': ' + w), 'TRIGGER:' + trig, 'END:VALARM'];
    out.push('BEGIN:VEVENT', 'UID:' + String(id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) + '@takanon-site.pages.dev', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + ymd(t), 'DTEND;VALUE=DATE:' + ymd(new Date(t.getTime() + 864e5)),
      'SUMMARY:' + esc(title), 'DESCRIPTION:' + esc('הפרטים בבוט הרכזים, ב"המקרים שלי".\n' + origin + '/coord/?my=1'), 'URL:' + origin + '/coord/?my=1', 'TRANSP:TRANSPARENT',
      ...alarm('-PT15H', 'מחר'), ...alarm('PT9H', 'היום'), 'END:VEVENT');
  }
  out.push('END:VCALENDAR');
  return out.join('\r\n') + '\r\n';
}
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url), k = String(url.searchParams.get('k') || '').toLowerCase();
  if (!env.DB || !/^[a-f0-9]{40}$/.test(k)) return new Response('not found', { status: 404 });
  await setup(env); await tables(env);
  const row = await env.DB.prepare('SELECT uid FROM cal_keys WHERE k = ?').bind(k).first();
  if (!row) return new Response('not found', { status: 404 });
  const rs = (await env.DB.prepare('SELECT path, data FROM docs WHERE coll = ?').bind('log/' + row.uid + '/cases').all()).results || [];
  const cases = rs.map(r => { try { return { id: r.path.split('/').pop(), c: JSON.parse(r.data) }; } catch (_) { return null; } }).filter(Boolean);
  return new Response(calendarOf(cases, url.origin), { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=900' } });
}
