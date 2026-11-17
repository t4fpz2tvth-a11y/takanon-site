/* The app's service worker. 3.11.2026: pages always came from the network. 4.11.2026 (Yoni: "לוקח לדף כמה שניות להיטען"):
   the app's page, once visited, opens at once from this device's copy. Each visit also asks the site for its small
   version.json; when the version there differs from the stored copy's, the current page is fetched and stored for the next
   visit (the open page itself checks version.json too and offers "יש גרסה חדשה · רענון"). The faculty rule files
   (packs/*.json) are kept the same way: the stored copy at once, the network's copy stored for next time. Questions to the
   model, sign-in and the log (/api/) never pass through here, nor the test pages or any address with a query. */
const CACHE = 'takanon-pages-v2';
const OFF = '<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>אין חיבור</title><body style="font:17px/1.6 system-ui,Arial,sans-serif;padding:2rem;max-width:30rem;margin:auto"><h1 style="font-size:1.3rem">אין חיבור לאינטרנט</h1><p>הכלי צריך חיבור כדי לחפש בתקנונים ולענות. בדקו את החיבור ונסו שוב.</p><button onclick="location.reload()" style="font:inherit;min-height:44px;padding:6px 16px;border:0;border-radius:8px;background:#2747B8;color:#fff">ניסיון חוזר</button></body></html>';
const ROOT = () => new URL(self.registration.scope).pathname;
const META = () => self.registration.scope + '__version';
const buildOf = t => (/const BUILD = ["']([0-9a-f]{6,12})["']/.exec(t) || [])[1] || '';
async function storePage(cache, res) {
  const t = await res.clone().text();
  await cache.put(self.registration.scope, res);
  await cache.put(META(), new Response(buildOf(t)));
}
async function refresh() {
  try {
    const cache = await caches.open(CACHE);
    const v = await (await fetch(self.registration.scope + 'version.json', { cache: 'no-store' })).json();
    const meta = await cache.match(META()), had = meta ? await meta.text() : '';
    if (v && v.build && v.build === had) return;
    const res = await fetch(self.registration.scope, { cache: 'no-cache' });
    if (res.ok) await storePage(cache, res);
  } catch (_) {}
}
self.addEventListener('install', (e) => e.waitUntil((async () => {   // the app's page stored at once, so the next visit is fast
  try { const c = await caches.open(CACHE); const r = await fetch(self.registration.scope, { cache: 'no-cache' }); if (r.ok) await storePage(c, r); } catch (_) {}
  await self.skipWaiting();
})()));
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE && k !== SHARED) await caches.delete(k);
  await self.clients.claim();
})()));
/* 17.11.2026 (Yoni: "להעביר הודעות קוליות של הווטסאפ ישירות לבוט, מהווטסאפ בטלפון"): the coordinators' app, installed on an
   Android phone, is offered in the "share" list (the manifest's share_target). What was shared (a voice message, a
   picture, a document, a text) arrives here as a form; the files are put aside on this device only (the cache below),
   and the app opens with ?shared=1, takes them as attached files and removes them. Whatever was left is dropped after an hour. */
const SHARED = 'takanon-shared-v1';
async function takeShare(req) {
  const root = ROOT();
  try {
    const form = await req.formData(), cache = await caches.open(SHARED);
    for (const k of await cache.keys()) await cache.delete(k);
    let i = 0;
    for (const f of form.getAll('files')) {
      if (!f || typeof f === 'string' || !f.size || f.size > 40 * 1048576 || i >= 10) continue;
      await cache.put(root + '__shared/' + (i++), new Response(f, { headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-Name': encodeURIComponent(f.name || 'file'), 'X-At': String(Date.now()) } }));
    }
    const text = [form.get('title'), form.get('text'), form.get('url')].filter(x => typeof x === 'string' && x.trim()).join('\n').slice(0, 20000);
    if (text) await cache.put(root + '__shared/text', new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-At': String(Date.now()) } }));
  } catch (_) {}
  return Response.redirect(root + '?shared=1', 303);
}
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method === 'POST' && new URL(req.url).origin === self.location.origin && new URL(req.url).pathname === ROOT() + 'share') { e.respondWith(takeShare(req)); return; }
  if (req.method !== 'GET') return;
  const u = new URL(req.url), root = ROOT();
  if (u.origin !== self.location.origin || u.search || /^\/api\//.test(u.pathname)) return;
  if (req.mode === 'navigate' && (u.pathname === root || u.pathname === root + 'index.html')) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE), old = await cache.match(self.registration.scope);
      if (old) { e.waitUntil(refresh()); return old; }
      try { const res = await fetch(req); if (res.ok) e.waitUntil(storePage(cache, res.clone())); return res; }
      catch (_) { return new Response(OFF, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }); }
    })());
    return;
  }
  if (u.pathname.indexOf(root + 'packs/') === 0 && /\.json$/.test(u.pathname)) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE), old = await cache.match(req.url);
      const fresh = fetch(req, { cache: 'no-cache' }).then(async (res) => { if (res.ok) await cache.put(req.url, res.clone()); return res; });
      if (old) { e.waitUntil(fresh.catch(() => {})); return old; }
      return fresh;
    })());
    return;
  }
  if (req.mode === 'navigate') e.respondWith(fetch(req).catch(() => new Response(OFF, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
