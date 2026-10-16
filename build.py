# Builds the standalone pages (index.html, print.html, puzzles.html) from src/.
# Usage: python3 build.py
import re, os, sys
d=os.path.dirname(os.path.abspath(__file__)); os.chdir(d)
SRC='src/'
fr=open(SRC+'fonts/f_reg.b64').read().strip(); fb=open(SRC+'fonts/f_bold.b64').read().strip()
HEAD='''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="%s">
<style>:root{color-scheme:light}html,body{margin:0}[hidden]{display:none!important}img{max-width:100%%}</style>
'''
BLOB='''function blobSaver(){
  return { save: async function(r){
    const url = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url; a.download = r.filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { status: 'saved' };
  } };
}
let dlPromise = null;'''
def standalone(t, mode, title, desc):
    t=t.replace("Promise.resolve(null))\n      .catch","Promise.resolve(blobSaver()))\n      .catch").replace("let dlPromise = null;",BLOB,1)
    t=re.sub(r"<title>[^<]*</title>","<title>%s</title>"%title,t,count=1)
    i=t.index("</style>\n\n<div class=\"app\">")
    t=t[:i]+"</style>\n</head>\n<body class=\"mode-%s\">"%mode+t[i+8:]
    return HEAD%desc+t+"\n</body>\n</html>\n"
# maze pages
s=open(SRC+'maze.template.html').read(); p=open(SRC+'pdf-maze.js').read().rstrip()
t=s.replace('//__PDFREGION__',p).replace('__FONT_REG__',fr).replace('__FONT_BOLD__',fb)
desc="Maze Factory: a kid-friendly maze generator and printable puzzles, in Hungarian and English."
open('index.html','w').write(standalone(t,'play','Maze Factory',desc))
open('print.html','w').write(standalone(t,'print','Maze Factory · Print',desc))
# puzzle page
if os.path.exists(SRC+'puzzles.template.html'):
    r=open(SRC+'puzzles.template.html').read()
    css=s[s.index('<style>')+7:s.index('</style>')]
    r=r.replace('/*__SHARED_CSS__*/',css)
    r=r.replace('__FONT_REG__',fr).replace('__FONT_BOLD__',fb)
    for k in ('puzzle-core.js','puzzle-words.js','puzzle-wordsearch.js','puzzle-dots.js','puzzle-math.js','puzzle-scramble.js','puzzle-spot.js'):
        r=r.replace('//__%s__'%k, open(SRC+k).read().rstrip())
    r=r.replace('Promise.resolve(null))\n      .catch','Promise.resolve(blobSaver()))\n      .catch').replace("let dlPromise = null;",BLOB,1)
    i=r.index("</style>\n\n<div class=\"app")
    r=HEAD%desc+r[:i]+"</style>\n</head>\n<body class=\"mode-puzzles\">"+r[i+8:]+"\n</body>\n</html>\n"
    open('puzzles.html','w').write(r)
print('built')
