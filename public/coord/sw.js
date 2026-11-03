/* The app's service worker (3.11.2026): pages always come from the network, so every visit gets the current version; when
   there is no network, a short Hebrew note instead of the browser's error page. Nothing else is stored. */
const OFF = '<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>אין חיבור</title><body style="font:17px/1.6 system-ui,Arial,sans-serif;padding:2rem;max-width:30rem;margin:auto"><h1 style="font-size:1.3rem">אין חיבור לאינטרנט</h1><p>הכלי צריך חיבור כדי לחפש בתקנונים ולענות. בדקו את החיבור ונסו שוב.</p><button onclick="location.reload()" style="font:inherit;min-height:44px;padding:6px 16px;border:0;border-radius:8px;background:#2747B8;color:#fff">ניסיון חוזר</button></body></html>';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => new Response(OFF, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
