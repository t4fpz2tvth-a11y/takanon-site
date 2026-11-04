// The tracking sheet (3.11.2026): the coordinators' page asks to read and write the tab "מקרים מהכלי" of the department's
// tracking sheet. The calls go to a small Apps Script that the head put inside the sheet (its web-app link is kept in the
// storage, never in the code, since this repository is public). Only the head may call it.
// POST { op: 'status' } | { op: 'config', url } | { op: 'call', tool, args } with X-Code.
import { text, json, setup, who } from '../_lib.js';
const PATH = 'config/sheet';
// 4.11.2026 (security review): every call carries the shared secret SHEET_SECRET (a Cloudflare secret, set by the head); the
// script in the sheet answers nothing without it, so its link alone gives no access
async function pass(url, body, env) {
  if (!env.SHEET_SECRET || String(env.SHEET_SECRET).length < 24) return { error: 'הסוד המשותף SHEET_SECRET עוד לא הוגדר בהגדרות האתר' };
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(Object.assign({}, body, { secret: env.SHEET_SECRET })), redirect: 'follow' });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {}
  if (!r.ok || !j) return { error: 'הסקריפט בטבלה לא ענה כמצופה (' + r.status + ')' };
  return j;
}
export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return text('forbidden', 403);
  if (!env.DB) return text('the storage is not connected yet (binding DB)', 503);
  const u = await who(request, env);
  if (!u || !u.admin) return text('head only', 403);
  await setup(env);
  let b = {}; try { b = await request.json(); } catch (_) {}
  const row = await env.DB.prepare('SELECT data FROM docs WHERE path = ?').bind(PATH).first();
  const url = row ? JSON.parse(row.data).url : '';
  if (b.op === 'status') return json({ connected: !!url });
  if (b.op === 'config') {
    const v = String(b.url || '').trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(v)) return text('הקישור צריך להתחיל ב־https://script.google.com/macros/s/ ולהסתיים ב־/exec', 400);
    const ping = await pass(v, { tool: 'ping' }, env);
    if (!ping.ok) return text(ping.error || 'הסקריפט לא ענה', 400);
    await env.DB.prepare('INSERT OR REPLACE INTO docs (path, coll, data, t) VALUES (?, ?, ?, ?)').bind(PATH, 'config', JSON.stringify({ url: v }), Date.now()).run();
    return json({ ok: true, tab: ping.tab });
  }
  if (b.op === 'call') {
    if (!url) return text('not connected', 412);
    if (!['get_values', 'update_values', 'append_values'].includes(b.tool)) return text('unknown tool', 400);
    return json(await pass(url, { tool: b.tool, args: b.args || {} }, env));
  }
  return text('unknown op', 400);
}
