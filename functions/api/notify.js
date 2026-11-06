// For the e-mail alerts to the head of academics (3.11.2026): which coordinators' cases exist, without their content.
// GET with the head's X-Code. Returns each case as a short hash of its storage path plus whether it is a general question,
// Since 6.11.2026 it also keeps the model credit left (dollars) in the storage, for the e-mail alert.
import { json, setup, who, sha } from '../_lib.js';
export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'storage not connected' }, 503);
  const u = await who(request, env);
  if (!u || !(u.admin || u.notify)) return json({ error: 'head only' }, 403);
  await setup(env);
  const { results } = await env.DB.prepare("SELECT path, data FROM docs WHERE coll LIKE 'log/%/cases'").all();
  const cases = [];
  for (const r of results || []) {
    let g = false; try { g = JSON.parse(r.data).general === true; } catch (_) {}
    cases.push({ h: (await sha(r.path)).slice(0, 16), g });
  }
  // 6.11.2026 19:02 (Yoni: "בואו נתחיל רק ממספר 1"): how much model credit is left, so the head is warned before both bots stop.
  // Numbers only (dollars), from OpenRouter: the key's own cap and the account's balance. Kept in the site's storage
  // (config/credit), not in the public repository; the e-mail task reads it with one fixed query and warns once for each new low
  if (env.OPENROUTER_KEY) try {
    const get = async u => { try { const r = await fetch(u, { headers: { Authorization: 'Bearer ' + env.OPENROUTER_KEY } }); return r.ok ? (await r.json()).data || null : null; } catch (_) { return null; } };
    const num = v => typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : null;
    const c = {};
    const k = (await get('https://openrouter.ai/api/v1/key')) || (await get('https://openrouter.ai/api/v1/auth/key'));
    if (k) { c.key_limit = num(k.limit); c.key_left = num(k.limit_remaining != null ? k.limit_remaining : (k.limit != null && k.usage != null ? k.limit - k.usage : null)); }
    const a = await get('https://openrouter.ai/api/v1/credits');
    if (a && a.total_credits != null) c.account_left = num(a.total_credits - (a.total_usage || 0));
    const lefts = [c.key_left, c.account_left].filter(v => typeof v === 'number');
    if (lefts.length) {
      const LOW = Number(env.CREDIT_LOW || 5), now = new Date().toISOString(), left = Math.min(...lefts);
      let prev = {}; try { const r = await env.DB.prepare("SELECT data FROM docs WHERE path = 'config/credit'").first(); prev = r ? JSON.parse(r.data) : {}; } catch (_) {}
      const low = left < LOW;
      const rec = Object.assign(c, { at: now, left, low, low_threshold: LOW, low_since: low ? (prev.low && prev.low_since ? prev.low_since : now) : null });
      await env.DB.prepare("INSERT INTO docs (path, coll, data, t) VALUES ('config/credit', 'config', ?, ?) ON CONFLICT(path) DO UPDATE SET data = excluded.data, t = excluded.t").bind(JSON.stringify(rec), Date.now()).run();
    }
  } catch (_) {}   // the cases' count must not fail because of the credit
  return json({ cases, at: Date.now() });
}
