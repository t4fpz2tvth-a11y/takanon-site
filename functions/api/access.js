// 18.11.2026 00:00 (Yoni: leads over coordinators, and single cases shared with someone, "רק לשיקול דעתי"): who may read
// whose cases, beyond the rule that a coordinator reads their own and the head reads all. Only the head sets it.
//   POST { op: 'get' }                         (the head) -> { leads, shares, people: [{ uid, name }] }
//   POST { op: 'set', leads, shares }          (the head) keeps it. leads: { <uid>: { of: [uid…], write: bool } };
//                                              shares: { '<owner uid>/<case id>': [uid…] }
//   POST { op: 'mine' }                        (signed in) -> { of: [{ uid, name }], write, shares: [{ owner, id }] }: what I may read
//   POST { op: 'remark', owner, id, text }     (a lead the head allowed to write) adds a remark to a case of one of their
//                                              coordinators; nothing else of the case is touched
// The reading itself is done by /api/db, which checks this record (see the note there).
import { who, setup } from '../_lib.js';
const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const UID = /^[A-Za-z0-9_-]{1,60}$/, PATH = 'config/access';
async function read(env) { try { const r = await env.DB.prepare('SELECT data FROM docs WHERE path = ?').bind(PATH).first(); const a = r ? JSON.parse(r.data) : {}; return { leads: a.leads || {}, shares: a.shares || {} }; } catch (_) { return { leads: {}, shares: {} }; } }
export function cleanAccess(b) {
  const uids = l => [...new Set((Array.isArray(l) ? l : []).map(String).filter(x => UID.test(x)))].slice(0, 100);
  const leads = {}, shares = {};
  for (const [k, v] of Object.entries((b && b.leads) || {}).slice(0, 60)) { const of = uids(v && v.of).filter(x => x !== k); if (UID.test(k) && of.length) leads[k] = { of, write: !!(v && v.write) }; }
  for (const [k, v] of Object.entries((b && b.shares) || {}).slice(0, 500)) { const m = /^([A-Za-z0-9_-]{1,60})\/([A-Za-z0-9_-]{1,60})$/.exec(k), who = uids(v).filter(x => m && x !== m[1]); if (m && who.length) shares[k] = who; }
  return { leads, shares };
}
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'not set up' }, 503);
  const u = await who(request, env); if (!u || u.notify || u.bench) return json({ error: 'sign in' }, 401);
  let b = {}; try { b = await request.json(); } catch (_) {}
  await setup(env);
  const acc = await read(env);
  const names = async () => Object.fromEntries((((await env.DB.prepare('SELECT uid, name FROM codes').all()).results) || []).map(r => [r.uid, r.name]));
  if (b.op === 'mine') {
    const lead = acc.leads[u.uid], nm = lead || Object.values(acc.shares).some(l => l.includes(u.uid)) ? await names() : {};
    return json({ of: lead ? lead.of.map(x => ({ uid: x, name: nm[x] || '' })) : [], write: !!(lead && lead.write),
      shares: Object.entries(acc.shares).filter(([, l]) => l.includes(u.uid)).map(([k]) => ({ owner: k.split('/')[0], id: k.split('/')[1], name: nm[k.split('/')[0]] || '' })) });
  }
  if (b.op === 'remark') {
    const lead = acc.leads[u.uid], owner = String(b.owner || ''), id = String(b.id || '');
    if (!(lead && lead.write && lead.of.includes(owner)) || !UID.test(owner) || !UID.test(id)) return json({ error: 'not allowed' }, 403);
    const text = String(b.text || '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, 600); if (!text) return json({ error: 'empty' }, 400);
    const path = 'log/' + owner + '/cases/' + id, r = await env.DB.prepare('SELECT data FROM docs WHERE path = ?').bind(path).first(); if (!r) return json({ error: 'no such case' }, 404);
    const d = JSON.parse(r.data), list = (Array.isArray(d.headNotes) ? d.headNotes : []).concat([{ id: Date.now().toString(36), t: new Date().toISOString(), text, seen: false, by: String(u.name || '').slice(0, 60) }]).slice(-20);
    await env.DB.prepare('UPDATE docs SET data = ? WHERE path = ?').bind(JSON.stringify(Object.assign({}, d, { headNotes: list })), path).run();
    return json({ ok: true });
  }
  if (!u.admin) return json({ error: 'head only' }, 403);
  if (b.op === 'get') { const nm = await names(); return json({ leads: acc.leads, shares: acc.shares, people: Object.entries(nm).map(([uid, name]) => ({ uid, name })) }); }
  if (b.op === 'set') {
    const v = cleanAccess({ leads: b.leads !== undefined ? b.leads : acc.leads, shares: b.shares !== undefined ? b.shares : acc.shares });
    await env.DB.prepare('INSERT OR REPLACE INTO docs (path, coll, data, t) VALUES (?, ?, ?, ?)').bind(PATH, 'config', JSON.stringify(v), Date.now()).run();
    return json(Object.assign({ ok: true }, v));
  }
  return json({ error: 'unknown op' }, 400);
}
