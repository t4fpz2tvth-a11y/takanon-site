// 22.11.2026: shared by the pages of /forum/: time on the page (a report every fifteen seconds while the page is on screen)
// and the watching of one video element. Nothing is sent before the visitor gave a name (the server refuses it).
window.ForumSite = (function () {
  function post(body, last) {
    var s = JSON.stringify(body);
    if (last && navigator.sendBeacon) { navigator.sendBeacon('/api/forum', new Blob([s], { type: 'application/json' })); return; }
    fetch('/api/forum', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: s, credentials: 'same-origin', keepalive: true }).catch(function () {});
  }
  var on = false;
  function presence() {
    if (on) return; on = true;
    var seen = 0, last = document.visibilityState === 'visible' ? Date.now() : 0;
    function tick() { var now = Date.now(); if (last) seen += Math.min(5, (now - last) / 1000); last = document.visibilityState === 'visible' ? now : 0; }
    function send(final) { tick(); var n = Math.floor(seen); if (!n && final) return; seen -= n; post({ op: 'here', t: n }, final); }
    post({ op: 'here', t: 0 });
    setInterval(function () { tick(); if (seen >= 15) send(); }, 1000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') send(true); else last = Date.now(); });
    window.addEventListener('pagehide', function () { send(true); });
  }
  function track(v, id) {
    var played = 0, last = 0, opened = false, timer = null;
    function tick() { var now = Date.now(); if (!v.paused && !v.ended && last) played += Math.min(2, (now - last) / 1000); last = now; }
    function send(final) {
      tick();
      var n = Math.floor(played), open = !opened && (n > 0 || final === 'play');
      if (!n && !open) return;
      played -= n; if (open) opened = true;
      post({ op: 'beat', v: id, played: n, pos: Math.floor(v.currentTime || 0), open: open }, final === true);
    }
    v.addEventListener('play', function () { last = Date.now(); send('play'); if (!timer) timer = setInterval(function () { tick(); if (played >= 10) send(); }, 1000); });
    v.addEventListener('pause', function () { send(); });
    v.addEventListener('ended', function () { send(); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') send(true); });
    window.addEventListener('pagehide', function () { send(true); });
  }
  return { presence: presence, track: track };
})();
