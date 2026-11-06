// The tracking sheet (3.11.2026): the coordinators' page asks to read and write the tab "מקרים מהכלי" of the department's
// tracking sheet. The calls go to a small Apps Script that the head put inside the sheet (its web-app link is kept in the
// storage, never in the code, since this repository is public). Only the head may call it.
// POST { op: 'status' } | { op: 'config', url } | { op: 'call', tool, args } with X-Code.
import { text, json, setup, who } from '../_lib.js';
const PATH = 'config/sheet';
// 4.11.2026 (security review): every call carries a shared secret; the script in the sheet answers nothing without it, so its
// link alone gives no access. 4.11.2026 (Yoni: "אני רוצה שאתה תעשה את הכל"): no one copies the secret by hand. When the head
// connects the sheet, the site makes a random secret, keeps it in the storage next to the link (never in the code or the
// repository) and hands it to the script once ("pair"); the script keeps the first secret it is given and refuses any other.
// A secret set by hand in the site's settings (SHEET_SECRET) is still used when present.
const newSecret = () => [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2, '0')).join('');
const secretOf = (env, cfg) => (env.SHEET_SECRET && String(env.SHEET_SECRET).length >= 24) ? String(env.SHEET_SECRET) : (cfg && cfg.secret) || '';
async function pass(url, body, secret) {
  if (!secret || secret.length < 24) return { error: 'הטבלה עוד לא חוברה (אין סוד משותף)' };
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(Object.assign({}, body, { secret })), redirect: 'follow' });
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
  const cfg = row ? JSON.parse(row.data) : {}, url = cfg.url || '';
  // 6.11.2026 12:26 (Yoni): the dialog also opens the sheet itself and the department's Gmail; the links live here, not in the public code
  if (b.op === 'status') return json({ connected: !!url, view: /^https:\/\/docs\.google\.com\/spreadsheets\//.test(cfg.view || '') ? cfg.view : '', mail: /^https:\/\/mail\.google\.com\//.test(cfg.mail || '') ? cfg.mail : '' });
  if (b.op === 'config') {
    const v = String(b.url || '').trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(v)) return text('הקישור צריך להתחיל ב־https://script.google.com/macros/s/ ולהסתיים ב־/exec', 400);
    const secret = secretOf(env, cfg) || newSecret();
    const ping = await pass(v, { tool: 'pair' }, secret);
    if (!ping.ok) return text(ping.error || 'הסקריפט לא ענה', 400);
    await env.DB.prepare('INSERT OR REPLACE INTO docs (path, coll, data, t) VALUES (?, ?, ?, ?)').bind(PATH, 'config', JSON.stringify({ url: v, secret: cfg.secret || (env.SHEET_SECRET ? undefined : secret), view: cfg.view, mail: cfg.mail }), Date.now()).run();
    return json({ ok: true, tab: ping.tab });
  }
  if (b.op === 'call') {
    if (!url) return text('not connected', 412);
    if (!['get_values', 'update_values', 'append_values'].includes(b.tool)) return text('unknown tool', 400);
    return json(await pass(url, { tool: b.tool, args: b.args || {} }, secretOf(env, cfg)));
  }
  return text('unknown op', 400);
}
