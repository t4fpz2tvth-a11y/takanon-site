# how-to films from the REAL coordinators' page (local copy, invented coordinator), as an iPhone and as an Android phone.
# Screens of the page are real screenshots; steps that happen in the phone's own screens are plain text cards, marked as such.
import sys, os, subprocess, time, html, base64
from playwright.sync_api import sync_playwright
IOS='Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'
AND='Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
NO_PUSH="delete window.Notification; delete window.PushManager;"
def stub(host): return "if(window.PushManager){const s={endpoint:'https://%s/local-test',toJSON(){return{endpoint:this.endpoint,keys:{p256dh:'x',auth:'y'}}}};PushManager.prototype.subscribe=async()=>s;PushManager.prototype.getSubscription=async()=>s;}"%host
SA_IOS="Object.defineProperty(navigator,'standalone',{get:()=>true});"+stub('web.push.apple.com')
SA_AND="const mm=window.matchMedia.bind(window); window.matchMedia=q=>/display-mode:\\s*standalone/.test(q)?{matches:true,media:q,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}:mm(q);"+stub('fcm.googleapis.com')
MODES={'ios-safari':(IOS,NO_PUSH,[]),'ios-app':(IOS,SA_IOS,['notifications']),'and-chrome':(AND,None,[]),'and-app':(AND,SA_AND,['notifications'])}
VW,VH=360,560   # x2 = 720x1120, plus a 160px caption strip = 720x1280
class Phone:
    def __init__(s,p,mode):
        subprocess.run(['pkill','-f','node srv.mjs']); time.sleep(.4); subprocess.Popen('node srv.mjs > srv.log 2>&1',shell=True); time.sleep(2)
        ua,init,perms=MODES[mode]; s.b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
        s.c=s.b.new_context(viewport={'width':VW,'height':VH},device_scale_factor=2,user_agent=ua,has_touch=True,is_mobile=True,locale='he-IL',permissions=perms,color_scheme='light')
        if init: s.c.add_init_script(init)
        s.pg=s.c.new_page(); s.pg.goto('http://localhost:8790/coord/'); s.pg.wait_for_selector('#tk-code')
    def ring(s,sel):
        s.pg.evaluate("""sel=>{document.querySelectorAll('.x-ring').forEach(e=>e.remove()); if(!sel) return; const el=[...document.querySelectorAll(sel)].filter(e=>e.getClientRects().length)[0]; if(!el) throw new Error('no '+sel);
          el.scrollIntoView({block:'center'}); const r=el.getBoundingClientRect(), d=document.createElement('div'); d.className='x-ring';
          d.style.cssText='position:fixed;z-index:99999;pointer-events:none;border:3px solid #E0A100;border-radius:12px;box-shadow:0 0 0 4px rgba(224,161,0,.3);left:'+(r.left-6)+'px;top:'+(r.top-5)+'px;width:'+(r.width+12)+'px;height:'+(r.height+10)+'px'; document.body.appendChild(d);}""",sel)
    def shot(s,path,sel=None,top=None):
        if top: s.pg.evaluate("sel=>{const e=document.querySelector(sel); if(e) e.scrollIntoView({block:'start'}); window.scrollBy(0,-12)}",top)
        s.ring(sel); s.pg.wait_for_timeout(250); s.pg.screenshot(path=path,type='jpeg',quality=92); s.ring(None)
    def signin(s):
        s.pg.fill('#tk-code','דנה-בננה-77')
    def enter(s):
        s.pg.click('button:has-text("כניסה")'); s.pg.wait_for_selector('.pca-save',state='visible'); s.pg.wait_for_timeout(700)
    def details(s):
        pg=s.pg; pg.select_option('.pca-role-kind',label='רכזת פקולטה'); pg.wait_for_timeout(300); pg.check('.pca-unit-ck >> nth=2'); pg.fill('.pca-role-campus','הר הצופים'); pg.fill('.pca-mail','dana@example.org'); pg.fill('.pca-phone','050-0000000')
    def save(s):
        s.pg.click('.pca-save'); s.pg.wait_for_selector('#setup-card'); s.pg.wait_for_timeout(1500)
    def quick(s): s.signin(); s.enter(); s.details(); s.save()
    def go(s,k): s.pg.click(f'.setup-go[data-k="{k}"]'); s.pg.wait_for_timeout(2200)
    def close(s):
        for x in ['#tk-vo-x','#tk-cal-x']:
            if s.pg.query_selector(x): s.pg.click(x)
        s.pg.wait_for_timeout(300)
    def did(s,k): s.pg.click(f'.setup-did[data-k="{k}"]'); s.pg.wait_for_timeout(900)
    def end(s): s.b.close()
CSS="""@font-face{font-family:F;font-weight:700 900;src:url(file:///home/claude/takanon-site/public/fonts/frank-ruhl-libre-v1.woff)}@font-face{font-family:P;font-weight:400;src:url(file:///home/claude/takanon-site/public/fonts/ibm-plex-sans-hebrew-400-v1.woff)}@font-face{font-family:P;font-weight:500;src:url(file:///home/claude/takanon-site/public/fonts/ibm-plex-sans-hebrew-500-v1.woff)}
*{box-sizing:border-box}body{margin:0;width:720px;height:1280px;background:#1F5A34;font-family:P,Arial,sans-serif;color:#F6F3E7;direction:rtl;overflow:hidden}
.cap{height:160px;padding:14px 26px;display:flex;align-items:center;gap:18px}.n{flex:none;width:64px;height:64px;border-radius:50%;background:#F6F3E7;color:#1F5A34;font:800 34px F,serif;display:grid;place-items:center}.t{font-size:29px;line-height:1.3;font-weight:500}
img{display:block;width:720px;height:1120px}
.full{height:1280px;padding:70px 56px;display:flex;flex-direction:column;justify-content:center;gap:26px}.k{color:#E9C46A;font-size:26px;font-weight:500}.h{font:800 62px/1.12 F,serif}.s{font-size:32px;line-height:1.4}
.os{background:#F4F1E6;color:#1D2A22}.os .k{color:#8A6A12}.os li{font-size:34px;line-height:1.4;margin-bottom:18px}.os ol{margin:0;padding-inline-start:1.3em}.os .f{font-size:24px;color:#5B665E;border-top:2px solid #DDD8C6;padding-top:18px}"""
def frame(pw_page,out,kind,n,text,img=None,extra=''):
    e=html.escape
    if kind=='real': body=f'<div class="cap"><div class="n">{n}</div><div class="t">{e(text)}</div></div><img src="data:image/jpeg;base64,{base64.b64encode(open(img,"rb").read()).decode()}">'
    elif kind=='title': body=f'<div class="full"><div class="k">{e(extra)}</div><div class="h">{e(text)}</div><div class="s">{e(n)}</div></div>'
    else: body=f'<div class="full os"><div class="k">צעד {n} · במסכים של הטלפון עצמו (הסבר, לא צילום)</div><div class="h" style="font-size:46px">{e(text)}</div><ol>{"".join("<li>"+e(x)+"</li>" for x in extra)}</ol><div class="f">הניסוח של הכפתורים יכול להשתנות מעט בין גרסאות וטלפונים.</div></div>'
    pw_page.set_content(f'<!doctype html><html lang="he"><head><meta charset="utf-8"><style>{CSS}</style></head><body>{body}</body></html>'); pw_page.wait_for_timeout(350); pw_page.screenshot(path=out,type='jpeg',quality=92)
def build(name,scenes,p):
    d=f'out/{name}'; os.makedirs(d,exist_ok=True); b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']); pg=b.new_page(viewport={'width':720,'height':1280}); lst=[]
    for i,(kind,n,text,img,extra,dur) in enumerate(scenes):
        f=f'{d}/{i:02d}.jpg'; frame(pg,f,kind,n,text,img,extra); t=f'{d}/{i:02d}.tmp.mp4'
        subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-framerate','30','-i',f,'-vf',f'format=yuv420p,loop=-1:1,trim=duration={dur}','-c:v','libx264','-crf','20','-preset','veryfast','-tune','stillimage','-pix_fmt','yuv420p','-r','30',t],check=True)
        os.rename(t,f'{d}/{i:02d}.mp4'); lst.append(f"file '{i:02d}.mp4'")
    open(f'{d}/l.txt','w').write('\n'.join(lst)); subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-f','concat','-safe','0','-i',f'{d}/l.txt','-c','copy','-movflags','+faststart',f'out/{name}.mp4'],check=True)
    b.close(); print(name,len(scenes),'scenes',sum(s[5] for s in scenes),'s',os.path.getsize(f'out/{name}.mp4')//1024,'KB')
R=lambda n,text,img,dur=6: ('real',n,text,img,'',dur)
O=lambda n,text,steps,dur=9: ('os',n,text,None,steps,dur)
T=lambda text,sub,kick,dur=3.5: ('title',sub,text,None,kick,dur)
S='out/s'; os.makedirs(S,exist_ok=True)
def first_steps(ph,pre):   # code + details, real
    ph.signin(); ph.shot(f'{S}/{pre}-code.jpg','#tk-code'); ph.enter(); ph.shot(f'{S}/{pre}-det.jpg'); ph.details(); ph.shot(f'{S}/{pre}-det2.jpg','.pca-save'); ph.save(); ph.shot(f'{S}/{pre}-card.jpg','.setup-go[data-k="icon"]','#setup-card')
with sync_playwright() as p:
    which=sys.argv[1:]
    if 'iphone-app' in which:
        ph=Phone(p,'ios-safari'); first_steps(ph,'ia'); ph.go('icon'); ph.shot(f'{S}/ia-say.jpg','.setup-say[data-for="icon"]','#setup-card'); ph.end()
        ph=Phone(p,'ios-app'); ph.quick(); ph.shot(f'{S}/ia-done.jpg','.setup-row.done >> nth=1' if False else '.setup-list','#setup-card'); ph.end()
        build('iphone-app',[T('הבוט כאפליקציה במסך הבית','4 צעדים, פעם אחת','בוט הרכזים · אייפון'),
          R(1,'פותחים את הבוט בספארי ומקלידים את קוד הגישה האישי',f'{S}/ia-code.jpg'),
          R(2,'ממלאים פעם אחת את הפרטים ולוחצים ״שמירה והמשך״',f'{S}/ia-det2.jpg'),
          R(3,'בכרטיס ״מצטיידים״ לוחצים על ״אייקון במסך הבית״',f'{S}/ia-card.jpg'),
          R(3,'הבוט מראה מה לעשות בספארי',f'{S}/ia-say.jpg',7),
          O(4,'בספארי',['לוחצים על סמל השיתוף (ריבוע עם חץ), למטה או למעלה','גוללים ובוחרים ״הוספה למסך הבית״','לוחצים ״הוספה״','האייקון ״אקדמיה רכזים״ מופיע במסך הבית'],11),
          R('✓','פותחים את הבוט מהאייקון: השורה מסומנת ״מחובר״',f'{S}/ia-done.jpg',6)],p)
    if 'iphone-alerts' in which:
        ph=Phone(p,'ios-safari'); ph.quick(); ph.go('cal'); ph.close(); ph.shot(f'{S}/il-no.jpg','.setup-say[data-for="cal"]','#setup-card'); ph.end()
        ph=Phone(p,'ios-app'); ph.quick(); ph.shot(f'{S}/il-card.jpg','.setup-go[data-k="cal"]','#setup-card'); ph.go('cal'); ph.shot(f'{S}/il-dlg.jpg','#tk-cal-a'); ph.close(); ph.shot(f'{S}/il-say.jpg','.setup-did[data-k="cal"]','#setup-card'); print('cal say:',ph.pg.inner_text('.setup-say[data-for="cal"]')); ph.did('cal'); ph.shot(f'{S}/il-done.jpg','.setup-list','#setup-card'); ph.end()
        build('iphone-alerts',[T('התראות ויומן','רק מתוך האייקון שבמסך הבית','בוט הרכזים · אייפון'),
          R('!','בספארי זה לא יעבוד: באייפון ההתראות פועלות רק מתוך האייקון',f'{S}/il-no.jpg',7),
          R(1,'פותחים את הבוט מהאייקון ולוחצים על ״יומן והתראות״',f'{S}/il-card.jpg'),
          O(2,'האייפון שואל אם לאפשר התראות',['מאשרים את ההתראות בחלון שהאייפון פותח','אם סירבתם בטעות: אפשר לאשר בהגדרות הטלפון'],8),
          R(3,'נפתח חלון היומן: בוחרים ״יומן אפל״ (או ״יומן גוגל״)',f'{S}/il-dlg.jpg',7),
          O(4,'אפליקציית היומן נפתחת',['מאשרים את ההרשמה ליומן','חוזרים לבוט וסוגרים את החלון'],7),
          R(5,'בחזרה בבוט: ההתראות פועלות. לוחצים ״עשיתי״',f'{S}/il-say.jpg',7),
          R('✓','השורה מסומנת ״מחובר״',f'{S}/il-done.jpg',5)],p)
    if 'iphone-whatsapp' in which:
        ph=Phone(p,'ios-app'); ph.quick(); ph.shot(f'{S}/iw-card.jpg','.setup-go[data-k="wa"]','#setup-card'); ph.go('wa'); ph.shot(f'{S}/iw-dlg.jpg','#tk-vo-sc'); ph.close(); ph.shot(f'{S}/iw-say.jpg','.setup-say[data-for="wa"]','#setup-card'); ph.end()
        build('iphone-whatsapp',[T('הודעות מוואטסאפ ישר לבוט','קיצור דרך שמתקינים פעם אחת','בוט הרכזים · אייפון'),
          R(1,'בכרטיס ״מצטיידים״ לוחצים על ״העברה מווטסאפ״',f'{S}/iw-card.jpg'),
          R(2,'קוראים את ההסבר ולוחצים ״התקנת קיצור הדרך״',f'{S}/iw-dlg.jpg',8),
          O(3,'אפליקציית ״קיצורי דרך״ נפתחת',['מוסיפים את קיצור הדרך ״לבוט הרכזים״','צריך להיות מחוברים לבוט גם בספארי'],8),
          O(4,'בוואטסאפ',['לחיצה ארוכה על ההודעה, ואז ״העברה״','סמל השיתוף, ואז ״לבוט הרכזים״','בפעם הראשונה האייפון מבקש אישור לשלוח לאתר: בוחרים ״Allow״','הבוט נפתח, והטקסט כבר בתיבת השאלה'],12),
          R('✓','אחרי ההודעה הראשונה השורה מסומנת לבד',f'{S}/iw-say.jpg',7)],p)
    if 'android-app' in which:
        ph=Phone(p,'and-chrome'); first_steps(ph,'aa'); ph.go('icon'); ph.shot(f'{S}/aa-say.jpg','.setup-say[data-for="icon"]','#setup-card'); ph.end()
        ph=Phone(p,'and-app'); ph.quick(); ph.shot(f'{S}/aa-done.jpg','.setup-list','#setup-card'); ph.end()
        build('android-app',[T('הבוט כאפליקציה במסך הבית','4 צעדים, פעם אחת','בוט הרכזים · אנדרואיד'),
          R(1,'פותחים את הבוט בכרום ומקלידים את קוד הגישה האישי',f'{S}/aa-code.jpg'),
          R(2,'ממלאים פעם אחת את הפרטים ולוחצים ״שמירה והמשך״',f'{S}/aa-det2.jpg'),
          R(3,'בכרטיס ״מצטיידים״ לוחצים על ״אייקון במסך הבית״',f'{S}/aa-card.jpg'),
          O(4,'כרום מציע להתקין',['ברוב הטלפונים נפתח מיד חלון של כרום: לוחצים ״התקנה״','אם לא נפתח חלון, הבוט מראה את הדרך הידנית (בשקף הבא)'],8),
          R(4,'הדרך הידנית: שלוש הנקודות ← ״הוספה למסך הבית״ ← ״התקנה״',f'{S}/aa-say.jpg',8),
          R('✓','פותחים מהאייקון: האייקון וההעברה מוואטסאפ מסומנים ״מחובר״',f'{S}/aa-done.jpg',7)],p)
    if 'android-alerts' in which:
        ph=Phone(p,'and-app'); ph.quick(); ph.shot(f'{S}/al-card.jpg','.setup-go[data-k="cal"]','#setup-card'); ph.go('cal'); ph.shot(f'{S}/al-dlg.jpg','#tk-cal-g'); ph.close(); ph.shot(f'{S}/al-say.jpg','.setup-did[data-k="cal"]','#setup-card'); print('cal say:',ph.pg.inner_text('.setup-say[data-for="cal"]')); ph.did('cal'); ph.pg.wait_for_timeout(800)
        gone=ph.pg.query_selector('#setup-card') is None; print('card gone after all four:',gone); ph.shot(f'{S}/al-done.jpg'); ph.end()
        build('android-alerts',[T('התראות ויומן','3 צעדים, פעם אחת','בוט הרכזים · אנדרואיד'),
          R(1,'פותחים את הבוט מהאייקון ולוחצים על ״יומן והתראות״',f'{S}/al-card.jpg'),
          O(2,'הטלפון שואל אם לאפשר התראות',['מאשרים את ההתראות בחלון שנפתח','אם סירבתם בטעות: אפשר לאשר בהגדרות הטלפון'],8),
          R(3,'נפתח חלון היומן: בוחרים ״יומן גוגל״ ומאשרים שם את ההוספה',f'{S}/al-dlg.jpg',8),
          R(4,'בחזרה בבוט: ההתראות פועלות. לוחצים ״עשיתי״',f'{S}/al-say.jpg',7),
          R('✓','הכול מחובר: הכרטיס ״מצטיידים״ נעלם',f'{S}/al-done.jpg',6)],p)
subprocess.run(['pkill','-f','node srv.mjs'])
