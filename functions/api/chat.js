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
  if (!env.OPENROUTER_KEY || !env.MODEL) return json('the server is not set up yet (OPENROUTER_KEY, MODEL)', 503);
  const test = url.searchParams.has('test');
  const ip = request.headers.get('CF-Connecting-IP') || 'x';
  if (limited(ip, Number(env.PER_HOUR || 40) * (test ? 10 : 1))) return json('too many', 429);
  let body;
  try { body = await request.json(); } catch (_) { return json('bad request', 400); }
  const messages = typeof body.input === 'string' ? [{ role: 'user', content: body.input }] : body.input;
  if (!Array.isArray(messages) || JSON.stringify(messages).length > 400000) return json('bad request', 400);
  // the models the comparison page may ask for (3.11.2026): this fixed list, and any in TEST_MODELS
  const BUILTIN_TESTS = ['anthropic/claude-haiku-5.5', 'openai/gpt-6-luna', 'deepseek/deepseek-v4.1-flash', 'minimax/minimax-m3.1-flash', 'z-ai/glm-5.3-flash', 'xiaomi/mimo-v2.6-flash', 'qwen/qwen3.8-flash', 'inception/mercury-3', 'google/gemini-3.8-flash', 'openai/gpt-6.1-terra', 'anthropic/claude-sonnet-5.5',
    'deepseek/deepseek-v4.1-flash-1017', '~deepseek/deepseek-pro-latest', 'openai/gpt-6-luna-pro', 'xiaomi/mimo-v2.6-pro', 'z-ai/glm-5.3-flashx', 'cohere/command-a-plus', 'mistralai/mistral-large-4-0', 'nvidia/nemotron-3.5-super-vl', 'meta/muse-spark-1.3', 'qwen/qwen3.8-max-0902', 'google/gemini-4-argon', 'x-ai/grok-4.7', 'moonshotai/kimi-k3.1-pro', 'inclusionai/ling-3.1-flash', 'reflection/beam-1.0-501b-a23b', 'stepfun/step-5-preview'];
  const tests = BUILTIN_TESTS.concat((env.TEST_MODELS || '').split(',').map(s => s.trim()).filter(Boolean));
  if (body.model && !tests.includes(body.model)) return json('model not allowed', 403);
  const model = body.model || (body.tier === 'quick' ? (env.MODEL_QUICK || env.MODEL) : env.MODEL);
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + env.OPENROUTER_KEY, 'Content-Type': 'application/json', 'HTTP-Referer': url.origin, 'X-Title': 'Ma Omer HaTakanon' },
    body: JSON.stringify({ model, messages, stream: !!body.stream, max_tokens: body.stream || body.model ? 8000 : 2000, temperature: 0.2, reasoning: { effort: 'low', exclude: true }, usage: { include: true } })
  });
  return new Response(r.body, { status: r.status, headers: { 'Content-Type': r.headers.get('Content-Type') || 'application/json', 'Cache-Control': 'no-store' } });
}
