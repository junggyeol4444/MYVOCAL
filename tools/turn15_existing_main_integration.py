"""Non-destructive 14+15th-turn additive integration into existing MYVOCAL main.

Run only on a clean checkout of the exact current main after reconciling prior
candidate sources. Never creates a separate application or touches user data.
"""
from pathlib import Path
import argparse
import os
import shutil
import tempfile

NEW = (
 'desktop/viseme_2d_worker.py',
 'desktop/viseme_2d.go',
 'MYVOCAL-Studio-source/src/lib/viseme2DClient.js',
 'MYVOCAL-Studio-source/src/components/Viseme2DPanel.jsx',
 'MYVOCAL-Studio-source/tests/viseme-2d-client.test.mjs',
 'tests/test_viseme_2d_worker.py',
)
ANCHOR_ROUTE='mux.HandleFunc("/api/singing/rvc/convert", a.rvcConvert)'
SCORE_ROUTE='mux.HandleFunc("/api/singing/score-vocal", a.scoreVocalRender)'
VISEME_ROUTE='mux.HandleFunc("/api/mv/lipsync2d", a.viseme2DRender)'
ANCHOR_IMPORT="import SingingWorkbench from '../components/SingingWorkbench';"
SCORE_IMPORT="import ScoreVocalPanel from '../components/ScoreVocalPanel.jsx';"
VISEME_IMPORT="import Viseme2DPanel from '../components/Viseme2DPanel.jsx';"
ANCHOR_PANEL="{tab==='singing'&&<SingingWorkbench project={p} data={data} onChange={onChange} notify={notify}/> }".replace('/> }','/>}')
SCORE_PANEL="{tab==='singing'&&<><SingingWorkbench project={p} data={data} onChange={onChange} notify={notify}/><ScoreVocalPanel project={p} onChange={onChange} notify={notify}/></>}"
FULL_PANEL="{tab==='singing'&&<><SingingWorkbench project={p} data={data} onChange={onChange} notify={notify}/><ScoreVocalPanel project={p} onChange={onChange} notify={notify}/><Viseme2DPanel project={p} onChange={onChange} notify={notify}/></>}"

def one(text,anchor,replacement):
 if replacement in text:return text
 if text.count(anchor)!=1:raise RuntimeError('기존 Windows EXE 연결 위치 변경/중복: '+anchor[:100])
 return text.replace(anchor,replacement,1)

def integrate(source,checkout):
 source,checkout=Path(source).resolve(),Path(checkout).resolve()
 main=checkout/'desktop/main.go'
 ws=checkout/'MYVOCAL-Studio-source/src/pages/Workspace.jsx'
 if not main.is_file() or not ws.is_file():raise RuntimeError('기존 main.go와 Workspace.jsx가 필요합니다')
 old_main,old_ws=main.read_text(encoding='utf-8'),ws.read_text(encoding='utf-8')
 new_main=old_main
 for route in (SCORE_ROUTE,VISEME_ROUTE):
  if route not in new_main:new_main=one(new_main,ANCHOR_ROUTE,ANCHOR_ROUTE+'\n\t'+route)
 new_ws=old_ws
 for imp in (SCORE_IMPORT,VISEME_IMPORT):
  if imp not in new_ws:new_ws=one(new_ws,ANCHOR_IMPORT,ANCHOR_IMPORT+'\n'+imp)
 if FULL_PANEL not in new_ws:
  if SCORE_PANEL in new_ws:new_ws=one(new_ws,SCORE_PANEL,FULL_PANEL)
  else:new_ws=one(new_ws,ANCHOR_PANEL,FULL_PANEL)
 all_files=list(NEW)
 # Include 14th-turn implementation if it has not been merged.
 if SCORE_ROUTE not in old_main:
  all_files += [
   'desktop/score_vocal_worker.py','desktop/score_vocal.go',
   'desktop/score_vocal_test.go','tests/test_score_vocal_worker.py',
   'MYVOCAL-Studio-source/src/lib/scoreVocalClient.js',
   'MYVOCAL-Studio-source/src/components/ScoreVocalPanel.jsx',
   'MYVOCAL-Studio-source/tests/score-vocal-client.test.mjs'
  ]
 for name in all_files:
  a,b=source/name,checkout/name
  if not a.is_file():raise RuntimeError('누적 개발 파일이 없습니다: '+name)
  if b.exists() and b.read_bytes()!=a.read_bytes():raise RuntimeError('기존 소스와 달라 덮어쓰기를 거부합니다: '+name)
 # Complete preflight first. No user asset/data paths are included.
 added=[]
 try:
  for name in all_files:
   a,b=source/name,checkout/name
   if not b.exists():
    b.parent.mkdir(parents=True,exist_ok=True)
    with b.open('xb') as out,a.open('rb') as src:
     shutil.copyfileobj(src,out)
    added.append(b)
  for path,content,original in ((main,new_main,old_main),(ws,new_ws,old_ws)):
   if content!=original:
    fd,tmp=tempfile.mkstemp(prefix='.myvocal-stage-',dir=str(path.parent))
    try:
     with os.fdopen(fd,'w',encoding='utf-8') as f:f.write(content)
     os.replace(tmp,path)
    finally:
     if os.path.exists(tmp):os.unlink(tmp)
 except BaseException:
  for path,original in ((main,old_main),(ws,old_ws)):
   if path.exists() and path.read_text(encoding='utf-8')!=original:path.write_text(original,encoding='utf-8')
  for path in added:path.unlink(missing_ok=True)
  raise
 return {'newFiles':len(added),'mainChanged':new_main!=old_main,'workspaceChanged':new_ws!=old_ws}

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('checkout');print(integrate(Path(__file__).resolve().parents[1],p.parse_args().checkout))
