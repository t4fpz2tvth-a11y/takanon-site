// 17.11.2026 (Yoni: "תעשה את 6"): the calendar file of a case's target date, for the coordinators' page. A whole-day event with
// two reminders (9:00 three days before, and the day before). It is made only from what the address says: the date, the
// kind (a deadline or a follow-up), the day the case was opened and the case's own id; nothing of the student, nothing is
// read from the log and nothing is kept. The same file the page makes by itself (icsHref in the template).
//   GET ?d=2026-11-30&k=deadline|followup&o=3.11&u=<case id>
export async function onRequestGet({ request }) {
  const u = new URL(request.url), d = u.searchParams.get('d') || '', k = u.searchParams.get('k') === 'deadline' ? 'deadline' : 'followup';
  const o = (u.searchParams.get('o') || '').replace(/[^0-9.]/g, '').slice(0, 5), id = (u.searchParams.get('u') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'case';
  const dt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d), t = dt ? new Date(Date.UTC(+dt[1], +dt[2] - 1, +dt[3])) : null;
  if (!t || isNaN(t) || t.getUTCDate() !== +dt[3]) return new Response('bad date', { status: 400 });
  const ymd = x => x.getUTCFullYear() + String(x.getUTCMonth() + 1).padStart(2, '0') + String(x.getUTCDate()).padStart(2, '0');
  const day = ymd(t), end = ymd(new Date(t.getTime() + 864e5));
  const title = (k === 'deadline' ? 'מועד אחרון במקרה' : 'מעקב במקרה') + (o ? ' מ-' + o : '') + ' (בוט הרכזים)';
  const text = x => String(x).replace(/[\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const alarm = (trig, w) => ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + text(title + ': ' + w), 'TRIGGER:' + trig, 'END:VALARM'];
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//takanon//coord//HE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    'UID:' + id + '-' + day + '@takanon-site.pages.dev', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''), 'DTSTART;VALUE=DATE:' + day, 'DTEND;VALUE=DATE:' + end,
    'SUMMARY:' + text(title), 'DESCRIPTION:' + text('הפרטים בבוט הרכזים, ב"המקרים שלי".\n' + u.origin + '/coord/'), 'TRANSP:TRANSPARENT',
    ...alarm('-P2DT15H', 'בעוד שלושה ימים'), ...alarm('-PT15H', 'מחר'), 'END:VEVENT', 'END:VCALENDAR'];
  return new Response(lines.join('\r\n') + '\r\n', { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="moed-' + d + '.ics"', 'Cache-Control': 'no-store' } });
}
