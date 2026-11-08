import urllib.request, os, re, shutil, sys
OUT=sys.argv[1]; B='http://localhost:3100'; BASE='/academy'
shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
courses="embedded-systems internet-of-things full-stack-web-development app-development robotics prompt-engineering".split()
pages=['/','/courses','/live','/categories','/about','/faq','/contact','/terms','/privacy','/refund-policy','/verify','/login','/register','/instructors']+['/courses/'+c for c in courses]
known=set(p.rstrip('/') or '/' for p in pages)
ASSET=re.compile(r'\.(css|js|webp|jpg|jpeg|png|svg|ico|ttf|woff2?|webmanifest|mp4|pdf|txt|xml)$')
def mapurl(u):
    if not u.startswith('/') or u.startswith('//') or u.startswith(BASE+'/'): return u
    m=re.match(r'([^?#]*)(.*)',u); path,sep,rest=m.group(1),'',m.group(2)
    if ASSET.search(path): return BASE+path+sep+rest
    p=path.rstrip('/') or '/'
    if p not in known: return BASE+'/login/'            # backend-only routes (dashboard, admin, checkout, auth flows)
    return BASE+('/' if p=='/' else p+'/')+sep+rest
THEME="""<script>(function(){var d=document.documentElement;try{var t=localStorage.getItem("ta_theme");if(t==="light"||t==="dark")d.dataset.theme=t;}catch(e){}
document.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest('button[title="Toggle theme"]');if(!b)return;e.preventDefault();var n=d.dataset.theme==="dark"?"light":"dark";d.dataset.theme=n;
try{localStorage.setItem("ta_theme",n);}catch(x){}b.setAttribute("aria-label","Switch to "+(n==="dark"?"light":"dark")+" theme");window.dispatchEvent(new CustomEvent("ta:theme",{detail:n}));},true);})();</script>"""
STATIC="""<script>document.addEventListener("DOMContentLoaded",function(){document.querySelectorAll("main form").forEach(function(f){f.removeAttribute("action");
if(f.getAttribute("role")==="search"){f.style.display="none";return;}
f.querySelectorAll("input,select,textarea,button").forEach(function(el){el.disabled=true;});
var n=document.createElement("p");n.setAttribute("role","note");n.style.cssText="margin:0 0 16px;padding:10px 14px;border-radius:12px;border:1px solid var(--line-strong);background:var(--surface-2);color:var(--fg-2);font-size:14px";
n.textContent="Online accounts and enrollment open soon. To join a course now, email info@tierraautomation.in or call +91 91000 11109.";f.parentNode.insertBefore(n,f);});
document.addEventListener("submit",function(e){e.preventDefault();},true);});</script>"""
for p in pages:
    html=urllib.request.urlopen(B+p).read().decode()
    html=re.sub(r'(href|src|action|poster)="(/[^"]*)"',lambda m:f'{m.group(1)}="{mapurl(m.group(2))}"',html)
    html=re.sub(r'<meta name="robots"[^>]*>','',html)
    html=html.replace('<head>','<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+THEME,1).replace('</body>',STATIC+'</body>',1)
    d=os.path.join(OUT,p.strip('/')); os.makedirs(d,exist_ok=True); open(os.path.join(d,'index.html'),'w',encoding='utf-8').write(html)
pub='/home/claude/verify/preview/public'
css=open(pub+'/app.css').read().replace('url(/fonts/',f'url({BASE}/fonts/').replace('url(/brand/',f'url({BASE}/brand/')
open(OUT+'/app.css','w').write(css); shutil.copy(pub+'/islands.js',OUT+'/islands.js')
shutil.copytree('/home/claude/tierra-academy/showcase/fonts',OUT+'/fonts')
shutil.copytree('/home/claude/tierra-academy/public/brand',OUT+'/brand')
print(len(pages),'pages')
