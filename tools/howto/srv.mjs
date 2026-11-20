// local copy of the site: static files + every functions/api/*.js, on an in-memory D1 look-alike. Invented test coordinator only.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { DatabaseSync } from 'node:sqlite';
const ROOT='/home/claude/takanon-site'; const db=new DatabaseSync(':memory:');
const fix=a=>a.map(x=>x===undefined?null:typeof x==='boolean'?(x?1:0):x);
const stmt=(sql,args=[])=>({ bind:(...a)=>stmt(sql,fix(a)), run:async()=>{const r=db.prepare(sql).run(...args);return{meta:{changes:r.changes},success:true}}, first:async(c)=>{const r=db.prepare(sql).get(...args)??null; return r&&c?r[c]:r}, all:async()=>({results:db.prepare(sql).all(...args)}), _run:()=>{ if(/^\s*(select|with)/i.test(sql)) return {results:db.prepare(sql).all(...args)}; const r=db.prepare(sql).run(...args); return {meta:{changes:r.changes},results:[]} } });
const DB={ prepare:s=>stmt(s), batch:async l=>l.map(s=>s._run()), exec:async s=>db.exec(s) };
const env={ DB, ADMIN_CODE:'admin-test-1', SHEET_SECRET:'local-test-secret' };
const lib=await import(ROOT+'/functions/_lib.js'); await lib.setup(env);
const CODE='דנה-בננה-77'; db.prepare('INSERT INTO codes (hash,uid,name,created) VALUES (?,?,?,?)').run(await lib.sha(lib.normCode(CODE)),'u-test-dana','דנה לדוגמה',Date.now());
const mods={};
http.createServer(async (q,s)=>{ const u=new URL(q.url,'http://localhost:8790');
  const m=/^\/api\/([a-z]+)$/.exec(u.pathname);
  if(m && fs.existsSync(`${ROOT}/functions/api/${m[1]}.js`)){ const chunks=[]; for await(const c of q) chunks.push(c);
    const h=new Headers(); for(const [k,v] of Object.entries(q.headers)) if(!/^(host|connection|content-length)$/.test(k)) h.set(k,String(v)); h.set('CF-Connecting-IP','127.0.0.1');
    const req=new Request(u,{ method:q.method, headers:h, body:/POST|PUT/.test(q.method)?Buffer.concat(chunks):undefined });
    let r; try{ const mod=mods[m[1]]||(mods[m[1]]=await import(`${ROOT}/functions/api/${m[1]}.js`)); const f=mod['onRequest'+q.method[0]+q.method.slice(1).toLowerCase()]||mod.onRequest; r=f?await f({request:req,env,waitUntil:p=>{Promise.resolve(p).catch(()=>{})},params:{}}):new Response('no',{status:405}); }catch(e){ console.error(m[1],e.message); r=new Response('err '+e.message,{status:500}); }
    const hh={}; r.headers.forEach((v,k)=>hh[k]=k==='set-cookie'?v.replace('; Secure',''):v); s.writeHead(r.status,hh); s.end(Buffer.from(await r.arrayBuffer())); console.log(q.method,u.pathname,r.status); return; }
  let p=path.join(ROOT,'public',decodeURIComponent(u.pathname)); if(fs.existsSync(p)&&fs.statSync(p).isDirectory()) p=path.join(p,'index.html');
  if(!fs.existsSync(p)){ s.writeHead(404); s.end('nf'); return; }
  const t={'.html':'text/html; charset=utf-8','.woff':'font/woff','.js':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'}[path.extname(p)]||'application/octet-stream'; s.writeHead(200,{'Content-Type':t}); s.end(fs.readFileSync(p)); }).listen(8790,()=>console.log('up'));
