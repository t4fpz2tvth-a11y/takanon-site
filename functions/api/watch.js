// 17.11.2026 (Yoni: "תעשה את 4"): the weekly look at the regulations' source pages, for the head's panel. The look itself runs
// on GitHub (watch/run.mjs, .github/workflows/watch.yml) and writes its findings to the site's public repository; this
// only reads them from there (the files are public) and hands them to the signed-in head.
//   POST {} (the head) -> { last, changes: [...newest first], unreachable: [...] }
import { json, text, who } from '../_lib.js';
const RAW = 'https://raw.githubusercontent.com/t4fpz2tvth-a11y/takanon-site/main/watch/';
export async function onRequestPost({ request, env }) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return text('forbidden', 403);
  const w = await who(request, env);
  if (!w || !w.admin) return text('forbidden', 403);
  const get = async (f, d) => { try { const r = await fetch(RAW + f + '?t=' + Math.floor(Date.now() / 6e5), { cf: { cacheTtl: 300 } }); return r.ok ? await r.json() : d; } catch (_) { return d; } };
  const [last, changes, state, sources] = await Promise.all([get('last.json', null), get('changes.json', []), get('state.json', {}), get('sources.json', [])]);
  const names = Object.fromEntries((sources || []).map(s => [s.url, (s.names || [])[0] || s.url]));
  const unreachable = Object.entries(state || {}).filter(([, v]) => v && v.down > 0).map(([url, v]) => ({ url, name: names[url] || url, why: v.why || '', times: v.down, never: !v.hash }));
  return json({ last, changes: (changes || []).slice().reverse().slice(0, 200), unreachable, sources: (sources || []).length });
}
