// 17.11.2026 (Yoni: "תעשה את 4", a weekly look at the regulations' own pages): each address in watch/sources.json (the university
// pages and files the bot's regulations were taken from) is fetched; a page's readable text, or a file's bytes, is hashed and
// compared with last time (watch/state.json). What changed, vanished or came back is added to watch/changes.json (kept 180
// days). The first look at an address only records it. A page that cannot be reached is reported after two looks in a row,
// not one. Nothing here changes the bot's regulations: it only tells the head that a source should be looked at.
import fs from 'node:fs';
import crypto from 'node:crypto';
const SRC = JSON.parse(fs.readFileSync('watch/sources.json', 'utf8'));
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return d; } };
const state = read('watch/state.json', {}), changes = read('watch/changes.json', []);
const now = new Date().toISOString();
// a page's own words: no scripts, styles or markup; no line that only says when the whole site was last updated; no
// tokens that differ on every load
function pageText(html) {
  return html.replace(/<(script|style|noscript|svg|head)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d|td|th)>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l && !/^(עדכון אחרון|תאריך עדכון אחרון באתר|last updated)\b/i.test(l) && !/^©|כל הזכויות שמורות/.test(l)).join('\n');
}
async function look(url) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), 45000);
  try {
    const r = await fetch(encodeURI(decodeURI(url)), { signal: c.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; takanon-watch/1.0; student union regulations bot)', 'Accept-Language': 'he,en;q=0.8' } });
    if (!r.ok) return { ok: false, why: 'HTTP ' + r.status };
    const type = r.headers.get('content-type') || '', buf = Buffer.from(await r.arrayBuffer());
    const isPage = /html|text\//i.test(type) && buf.slice(0, 5).toString() !== '%PDF-';
    const body = isPage ? pageText(buf.toString('utf8')) : buf;
    if (isPage && body.length < 200) return { ok: false, why: 'an almost empty page (' + body.length + ' characters): perhaps a block or a sign-in' };
    return { ok: true, kind: isPage ? 'page' : 'file', len: body.length, hash: crypto.createHash('sha256').update(body).digest('hex').slice(0, 24), text: isPage ? body : null };
  } catch (e) { return { ok: false, why: String(e && e.name === 'AbortError' ? 'no answer in 45 seconds' : (e && e.cause && e.cause.code) || (e && e.message) || e).slice(0, 80) }; }
  finally { clearTimeout(t); }
}
fs.mkdirSync('watch/text', { recursive: true });
const key = u => crypto.createHash('sha1').update(u).digest('hex').slice(0, 16);
let n = 0, changed = 0, lost = 0, first = 0;
const queue = SRC.slice();
async function worker() {
  for (;;) {
    const s = queue.shift(); if (!s) return;
    const r = await look(s.url), old = state[s.url] || null, name = s.names[0] || s.url; n++;
    if (r.ok) {
      if (!old || !old.hash) { first++; }
      else if (old.hash !== r.hash) {
        changed++;
        // for a page: how many lines were added and removed, and the first few of each (the regulations are public)
        let note = '';
        if (r.text) { const prev = (() => { try { return fs.readFileSync('watch/text/' + key(s.url) + '.txt', 'utf8'); } catch (_) { return null; } })();
          if (prev !== null) { const a = new Set(prev.split('\n')), b = new Set(r.text.split('\n')); const add = [...b].filter(x => !a.has(x)), del = [...a].filter(x => !b.has(x)); note = '+' + add.length + ' / -' + del.length + ' שורות' + (add.length ? ' · נוסף: ' + add.slice(0, 2).map(x => x.slice(0, 120)).join(' | ') : '') + (del.length ? ' · הוסר: ' + del.slice(0, 2).map(x => x.slice(0, 120)).join(' | ') : ''); } }
        else note = 'הקובץ השתנה (' + (old.len || '?') + ' ← ' + r.len + ' בתים)';
        changes.push({ t: now, kind: 'changed', url: s.url, name, docs: s.docs, note });
      }
      if (old && old.down >= 2) changes.push({ t: now, kind: 'back', url: s.url, name, docs: s.docs, note: 'העמוד חזר לעלות' });
      state[s.url] = { hash: r.hash, len: r.len, kind: r.kind, seen: now, since: old && old.hash === r.hash ? (old.since || now) : now, down: 0 };
      if (r.text) fs.writeFileSync('watch/text/' + key(s.url) + '.txt', r.text);
    } else {
      const down = ((old && old.down) || 0) + 1;
      state[s.url] = Object.assign({}, old || {}, { down, why: r.why, tried: now });
      if (down === 2) { lost++; changes.push({ t: now, kind: 'lost', url: s.url, name, docs: s.docs, note: r.why }); }
    }
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);
const keep = Date.now() - 180 * 864e5;
const out = changes.filter(c => Date.parse(c.t) > keep);
fs.writeFileSync('watch/state.json', JSON.stringify(state, null, 1));
fs.writeFileSync('watch/changes.json', JSON.stringify(out, null, 1));
const down1 = Object.values(state).filter(x => x.down > 0).length;
fs.writeFileSync('watch/last.json', JSON.stringify({ t: now, looked: n, first, changed, lost, unreachable: down1, sources: SRC.length }, null, 1));
console.log('looked', n, 'first', first, 'changed', changed, 'lost', lost, 'unreachable now', down1);
