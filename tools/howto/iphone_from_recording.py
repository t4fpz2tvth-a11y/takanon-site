# iPhone how-to films cut from Yoni's own screen recording: pauses with a caption and a highlight ring.
import subprocess, os, sys, html, hashlib
from playwright.sync_api import sync_playwright
SRC='/mnt/user-data/uploads/RecordIt-1795264748_6.mov'
PX,PY,PW,PH=107,180,506,1100
CSS="""@font-face{font-family:F;font-weight:700 900;src:url(file:///home/claude/takanon-site/public/fonts/frank-ruhl-libre-v1.woff)}@font-face{font-family:P;font-weight:400;src:url(file:///home/claude/takanon-site/public/fonts/ibm-plex-sans-hebrew-400-v1.woff)}@font-face{font-family:P;font-weight:500;src:url(file:///home/claude/takanon-site/public/fonts/ibm-plex-sans-hebrew-500-v1.woff)}
*{box-sizing:border-box}html,body{margin:0;background:transparent}body{width:720px;height:1280px;font-family:P,Arial,sans-serif;color:#F6F3E7;direction:rtl;overflow:hidden}
.cap{height:180px;padding:12px 24px;display:flex;align-items:center;gap:16px}.n{flex:none;width:60px;height:60px;border-radius:50%;background:#F6F3E7;color:#1F5A34;font:800 32px F,serif;display:grid;place-items:center}.t{font-size:28px;line-height:1.28;font-weight:500}
.full{height:1280px;background:#F4F1E6;color:#1D2A22;padding:70px 56px;display:flex;flex-direction:column;justify-content:center;gap:26px}.k{color:#8A6A12;font-size:26px;font-weight:500}.h{font:800 50px/1.15 F,serif}.s{font-size:33px;line-height:1.45}"""
pw=sync_playwright().start(); br=pw.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']); pg=br.new_page(viewport={'width':720,'height':1280})
def cap_png(n,text):
    f='out/cap-'+hashlib.md5((str(n)+text).encode()).hexdigest()[:10]+'.png'
    if not os.path.exists(f):
        num=f'<div class="n">{html.escape(str(n))}</div>' if n!='' else ''
        pg.set_content(f'<!doctype html><html lang="he"><head><meta charset="utf-8"><style>{CSS}</style></head><body><div class="cap">{num}<div class="t">{html.escape(text)}</div></div></body></html>'); pg.wait_for_timeout(250); pg.screenshot(path=f,omit_background=True)
    return f
def full_png(kick,head,body):
    f='out/full-'+hashlib.md5((head+body).encode()).hexdigest()[:10]+'.png'
    pg.set_content(f'<!doctype html><html lang="he"><head><meta charset="utf-8"><style>{CSS}</style></head><body><div class="full"><div class="k">{html.escape(kick)}</div><div class="h">{html.escape(head)}</div><div class="s">{html.escape(body)}</div></div></body></html>'); pg.wait_for_timeout(250); pg.screenshot(path=f); return f
ENC=['-c:v','libx264','-crf','21','-preset','veryfast','-pix_fmt','yuv420p','-r','30','-an']
def vf(rings,blur=None,blur_all_except=None,blur_all=False):
    v='[0:v]fps=30,scale=%d:%d,setsar=1'%(PW,PH)
    if blur: x,y,w,h=blur; v+=',split[q1][q2];[q2]crop=%d:%d:%d:%d,boxblur=14:3[qb];[q1][qb]overlay=%d:%d'%(w,h,x,y,x,y)
    if blur_all: v+=',boxblur=22:4'
    if blur_all_except: x,y,w,h=blur_all_except; v+=',split[q1][q2];[q1]boxblur=16:3[qa];[q2]crop=%d:%d:%d:%d[qc];[qa][qc]overlay=%d:%d'%(w,h,x,y,x,y)
    v+='[v];color=c=0x1F5A34:s=720x1280:r=30[bg];[bg][v]overlay=%d:%d:shortest=1[a];[a][1:v]overlay=0:0'%(PX,PY)
    for (x,y,w,h) in rings:
        x-=8; y-=8; w+=16; h+=16; v+=',drawbox=x=%d:y=%d:w=%d:h=%d:color=0x1D2A22@0.85:t=3,drawbox=x=%d:y=%d:w=%d:h=%d:color=0xFFC400:t=5'%(PX+x-3,PY+y-3,w+6,h+6,PX+x,PY+y,w,h)
    return v+',format=yuv420p[o]'
def run(args):
    r=subprocess.run(['ffmpeg','-nostdin','-v','error','-y']+args,capture_output=True,text=True)
    if r.returncode: print(r.stderr[-600:]); sys.exit(1)
def seg(out,op):
    kind=op[0]; tmp=out[:-4]+'.tmp.mp4'
    if kind=='play':
        _,t0,t1,n,text,rings,kw=op; run(['-ss',str(t0),'-t',str(t1-t0),'-i',SRC,'-loop','1','-i',cap_png(n,text),'-filter_complex',vf(rings,**kw),'-map','[o]','-t',str(round(t1-t0,3))]+ENC+[tmp])
    elif kind=='hold':
        _,t,dur,n,text,rings,kw=op; fr=out[:-4]+'.png'; run(['-ss',str(t),'-i',SRC,'-frames:v','1',fr]); run(['-loop','1','-framerate','30','-i',fr,'-loop','1','-i',cap_png(n,text),'-filter_complex',vf(rings,**kw),'-map','[o]','-t',str(dur),'-tune','stillimage']+ENC+[tmp])
    else:
        _,dur,kick,head,body=op; run(['-loop','1','-framerate','30','-i',full_png(kick,head,body),'-vf','format=yuv420p','-t',str(dur),'-tune','stillimage']+ENC+[tmp])
    os.rename(tmp,out)
def build(name,ops):
    d='out/'+name; os.makedirs(d,exist_ok=True); lst=[]
    for i,op in enumerate(ops): seg(f'{d}/{i:02d}.mp4',op); lst.append(f"file '{i:02d}.mp4'")
    open(d+'/l.txt','w').write('\n'.join(lst)); run(['-f','concat','-safe','0','-i',d+'/l.txt','-c','copy','-movflags','+faststart',f'out/{name}.mp4'])
    dur=subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',f'out/{name}.mp4'],capture_output=True,text=True).stdout.strip()
    print(name,len(ops),'parts',dur,'s',os.path.getsize(f'out/{name}.mp4')//1024,'KB')
P=lambda t0,t1,n,text,rings=[],**kw: ('play',t0,t1,n,text,rings,kw)
H=lambda t,dur,n,text,rings=[],**kw: ('hold',t,dur,n,text,rings,kw)
CON=(0,570,506,170)   # the contacts row of the share sheet: blurred
A=[H(6.6,3.5,1,'פותחים את הבוט בספארי, מקלידים את קוד הגישה ולוחצים ״כניסה״'),
   P(47.7,49.5,1,'פותחים את הבוט בספארי, מקלידים את קוד הגישה ולוחצים ״כניסה״'),
   H(49.5,3.5,2,'בכרטיס ״מצטיידים״ לוחצים על ״אייקון במסך הבית״',[(255,538,215,50)]),
   P(53.4,55.4,2,'בכרטיס ״מצטיידים״ לוחצים על ״אייקון במסך הבית״'),
   H(56.0,4.5,2,'הבוט מסביר מה לעשות. עכשיו פותחים את התפריט של ספארי, למטה',[(55,592,415,120),(340,993,52,46)]),
   P(61.6,62.8,3,'בתפריט של ספארי לוחצים ״Share״ (שיתוף)'),
   H(62.8,3.5,3,'בתפריט של ספארי לוחצים ״Share״ (שיתוף)',[(118,497,160,50)]),
   H(79.8,3.5,4,'נפתח חלון השיתוף. גוללים בו למטה',[],blur=CON),
   H(83.2,4,4,'לוחצים ״Add to Home Screen״ (הוספה למסך הבית)',[(25,700,440,56)]),
   P(83.35,85.3,5,'משאירים את ״Open as Web App״ דלוק ולוחצים ״Add״ (הוספה)'),
   H(86.0,4.5,5,'משאירים את ״Open as Web App״ דלוק ולוחצים ״Add״ (הוספה)',[(392,92,96,66),(10,358,484,52)]),
   H(90.0,4,'✓','האייקון ״אקדמיה רכזים״ נוסף למסך הבית',[(372,602,100,122)],blur_all_except=(372,602,100,122)),
   H(94.0,3.5,6,'חוזרים לבוט בספארי ולוחצים ״עשיתי״',[(304,670,68,36)]),
   P(94.2,96.4,6,'חוזרים לבוט בספארי ולוחצים ״עשיתי״'),
   H(96.4,4,'✓','השורה מסומנת ״מחובר״. מעכשיו נכנסים לבוט מהאייקון',[(212,536,255,50)])]
B=[H(96.4,3.5,1,'בכרטיס ״מצטיידים״ לוחצים על ״העברה מווטסאפ״',[(280,590,190,50)]),
   P(96.6,98.6,1,'בכרטיס ״מצטיידים״ לוחצים על ״העברה מווטסאפ״'),
   H(98.8,4.5,2,'נפתח הסבר. לוחצים ״התקנת קיצור הדרך״',[(262,735,200,72)]),
   P(100.0,100.9,3,'מאשרים לפתוח את אפליקציית קיצורי הדרך: ״Open״'),
   H(100.9,3.5,3,'מאשרים לפתוח את אפליקציית קיצורי הדרך: ״Open״',[(392,526,76,48)]),
   P(101.75,102.5,4,'קיצור הדרך ״לבוט הרכזים״ נפתח'),
   P(105.3,106.2,4,'קיצור הדרך ״לבוט הרכזים״ נפתח'),
   H(106.2,4.5,4,'לוחצים ״Add Shortcut״ (הוספת קיצור דרך)',[(28,985,450,66)]),
   H(112.6,5,5,'מעכשיו, בווטסאפ: לחיצה ארוכה על הודעה, ואז ״העברה״',[(92,428,378,66)]),
   H(112.6,4.5,5,'לוחצים על סמל השיתוף, ואז על ״לבוט הרכזים״',[(160,497,310,36)]),
   H(112.6,4.5,5,'הבוט נפתח, והטקסט כבר בתיבת השאלה',[(66,535,404,66)]),
   H(112.6,5,5,'בפעם הראשונה האייפון מבקש אישור לשלוח: בוחרים ״Allow״',[(48,612,422,92)]),
   P(112.9,114.6,6,'סוגרים את החלון, ובבוט לוחצים ״עשיתי״'),
   H(115.4,3.5,6,'סוגרים את החלון, ובבוט לוחצים ״עשיתי״',[(366,672,70,36)]),
   P(115.6,116.6,6,'סוגרים את החלון, ובבוט לוחצים ״עשיתי״'),
   H(116.6,4,'✓','השורה ״העברה מווטסאפ״ מסומנת ״מחובר״',[(212,590,255,50)])]
C=[H(116.6,3.5,1,'בכרטיס ״מצטיידים״ לוחצים על ״יומן והתראות״',[(300,646,168,48)]),
   P(117.0,118.8,1,'בכרטיס ״מצטיידים״ לוחצים על ״יומן והתראות״'),
   H(119.8,4.5,2,'בוחרים את היומן שלכם: ״יומן אפל (אייפון, מק)״',[(252,600,210,76)]),
   P(121.2,122.3,3,'מאשרים לפתוח את היומן: ״Open״'),
   H(122.3,3.5,3,'מאשרים לפתוח את היומן: ״Open״',[(392,526,76,48)]),
   H(124.0,4.5,4,'אפליקציית היומן נפתחת: מאשרים בה את ההרשמה ליומן המקרים',[],blur_all=True),
   H(127.2,3.5,5,'חוזרים לבוט ולוחצים ״סגירה״',[(60,754,96,56)]),
   P(127.7,129.2,5,'חוזרים לבוט ולוחצים ״סגירה״'),
   H(129.2,4,'✓','הכול מחובר: הכרטיס ״מצטיידים״ נעלם'),
   ('full',9,'ומה עם ההתראות? (הסבר, לא צילום)','באייפון ההתראות פועלות רק מתוך האייקון','פותחים את הבוט מהאייקון ״אקדמיה רכזים״ שבמסך הבית, לוחצים שם על ״יומן והתראות״, ומאשרים את ההתראות בחלון שהאייפון פותח.')]
for name,ops in [('iphone-app',A),('iphone-whatsapp',B),('iphone-alerts',C)]:
    if len(sys.argv)<2 or name in sys.argv[1:]: build(name,ops)
br.close(); pw.stop()
