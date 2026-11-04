import { who } from '../_lib.js';
// "מה אומר התקנון?" — the site's own small server function (Cloudflare Pages Function, 3.11.2026), at /api/chat.
// It keeps the OpenRouter key (the secret OPENROUTER_KEY, set in the Cloudflare project's settings, never in this code),
// answers only the site itself, limits each visitor's questions, and passes the model's answer back as it is written.
// Settings (Variables and Secrets): OPENROUTER_KEY (secret), MODEL, MODEL_QUICK, PER_HOUR (default 40),
// TEST_MODELS (comma-separated: the models test.html may compare; empty = the comparison page is off).
const hits = new Map();   // per visitor (IP), this server copy only: a first guard; the key's own spending limit is the real one
function limited(ip, perHour) {
  const now = Date.now(), h = (hits.get(ip) || []).filter(t => now - t < 3600e3);
  h.push(now); hits.set(ip, h);
  if (hits.size > 5000) hits.clear();
  return h.length > perHour;
}
const json = (s, status) => new Response(s, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
export async function onRequestPost({ request, env }) {
  const url = new URL(request.url), origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return json('forbidden', 403);   // only the site itself
  // 4.11.2026 (security review): a browser always sends Origin on these calls; a call without one is not the site's page
  if (!origin && request.headers.get('Sec-Fetch-Site') !== 'same-origin' && !url.searchParams.has('test')) return json('forbidden', 403);
  if (!env.OPENROUTER_KEY || !env.MODEL) return json('the server is not set up yet (OPENROUTER_KEY, MODEL)', 503);
  const test = url.searchParams.has('test');
  if ((test || 'model' in Object.fromEntries(url.searchParams)) && !(await who(request, env) || {}).admin) return json('the comparison runs for the head only', 403);
  const ip = request.headers.get('CF-Connecting-IP') || 'x';
  if (limited(ip, test ? 100000 : Number(env.PER_HOUR || 40))) return json('too many', 429);
  let body;
  try { body = await request.json(); } catch (_) { return json('bad request', 400); }
  const messages = typeof body.input === 'string' ? [{ role: 'user', content: body.input }] : body.input;
  // 4.11.2026: the page's own limit is 256 KB of prompt (sample.limits); a little more for the message wrapper, no more
  if (!Array.isArray(messages) || messages.length > 40 || JSON.stringify(messages).length > 300000) return json('bad request', 400);
  // the models the comparison page may ask for (3.11.2026): this fixed list, and any in TEST_MODELS
  const BUILTIN_TESTS = ['anthropic/claude-haiku-5.5', 'openai/gpt-6-luna', 'deepseek/deepseek-v4.1-flash', 'minimax/minimax-m3.1-flash', 'z-ai/glm-5.3-flash', 'xiaomi/mimo-v2.6-flash', 'qwen/qwen3.8-flash', 'inception/mercury-3', 'google/gemini-3.8-flash', 'openai/gpt-6.1-terra', 'anthropic/claude-sonnet-5.5',
    'deepseek/deepseek-v4.1-flash-1017', '~deepseek/deepseek-pro-latest', 'openai/gpt-6-luna-pro', 'xiaomi/mimo-v2.6-pro', 'z-ai/glm-5.3-flashx', 'cohere/command-a-plus', 'mistralai/mistral-large-4-0', 'nvidia/nemotron-3.5-super-vl', 'meta/muse-spark-1.3', 'qwen/qwen3.8-max-0902', 'google/gemini-4-argon', 'x-ai/grok-4.7', 'moonshotai/kimi-k3.1-pro', 'inclusionai/ling-3.1-flash', 'reflection/beam-1.0-501b-a23b', 'stepfun/step-5-preview', 'openai/gpt-6.1-sol'];
  const tests = BUILTIN_TESTS.concat((env.TEST_MODELS || '').split(',').map(s => s.trim()).filter(Boolean));
  if (body.model && !(test && tests.includes(body.model))) return json('model not allowed', 403);
  const model = body.model || (body.tier === 'quick' ? (env.MODEL_QUICK || env.MODEL) : env.MODEL);
  // 4.11.2026, speed experiments (comparison calls only, ?exp=a,b): live = the live answer length limits; noreason = no hidden
  // reasoning step; cache = the fixed rules at the start of the prompt (up to the page's mark U+2063) are cached by the provider
  const exp = test ? new Set((url.searchParams.get('exp') || '').split(',').filter(Boolean)) : new Set();
  const MARK = '\u2063';
  // a page without the mark yet: for the experiment, the fixed rules end where the student's details begin
  if (exp.has('cache')) for (const m of messages) if (m && typeof m.content === 'string' && m.content.indexOf(MARK) < 0) {
    const j = m.content.search(/\n\n(?:Student details \(given by the student\)|Details of the student's case)/);
    if (j > 0) m.content = m.content.slice(0, j) + MARK + m.content.slice(j);
  }
  for (const m of messages) if (m && typeof m.content === 'string' && m.content.indexOf(MARK) >= 0) {
    const i = m.content.indexOf(MARK), head = m.content.slice(0, i), tail = m.content.slice(i + 1).split(MARK).join('');
    m.content = exp.has('cache') && /^anthropic\//.test(model) ? [{ type: 'text', text: head, cache_control: { type: 'ephemeral' } }, { type: 'text', text: tail }] : head + tail;
  }
  // noask (comparison only): the answer is asked not to stop at a clarifying question, appended to the answer's own prompt
  if (exp.has('noask') && body.stream) { const m = messages[messages.length - 1]; if (m && typeof m.content === 'string') m.content += '\n\nDo not reply with a clarifying question or [[ASK]] alone: answer now, for each case the excerpts settle, and put at most one short question about a missing fact at the end.'; }
  const big = test && !exp.has('live');
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + env.OPENROUTER_KEY, 'Content-Type': 'application/json', 'HTTP-Referer': url.origin, 'X-Title': 'Ma Omer HaTakanon' },
    // 4.11.2026 (security review): answers are a few thousand tokens; the comparison keeps its larger room. PRIVACY=1 (a setting)
    // asks OpenRouter for providers that keep no data; ?private=1 on a comparison call tries it before the setting is turned on
    body: JSON.stringify(Object.assign({ model, messages, stream: !!body.stream, max_tokens: big ? (body.stream ? 16000 : 8000) : (body.stream ? 6000 : 2000), temperature: 0.2, usage: { include: true } }, exp.has('noreason') ? {} : exp.has('reasonoff') ? { reasoning: { enabled: false } } : exp.has('reasonmin') ? { reasoning: { effort: 'minimal', exclude: true } } : { reasoning: { effort: 'low', exclude: true } },
      env.PRIVACY === '1' || (test && url.searchParams.has('private')) ? { provider: { data_collection: 'deny' } } : {}))
  });
  return new Response(r.body, { status: r.status, headers: { 'Content-Type': r.headers.get('Content-Type') || 'application/json', 'Cache-Control': 'no-store' } });
}
