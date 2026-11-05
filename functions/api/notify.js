// For the e-mail alerts to the head of academics (3.11.2026): which coordinators' cases exist, without their content.
// GET with the head's X-Code. Returns each case as a short hash of its storage path plus whether it is a general question.
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
  return json({ cases, at: Date.now() });
}
