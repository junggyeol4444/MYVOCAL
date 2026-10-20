"""Safe additive integration for existing MYVOCAL Windows EXE main checkout.

Apply AFTER earlier 13-round cumulative files are reconciled. Refuse divergent
existing files or unexpected upstream anchors. Never touch user data folders.
"""
from pathlib import Path
import argparse
import shutil

NEW = (
 'desktop/score_vocal_worker.py',
 'desktop/score_vocal.go',
 'desktop/score_vocal_test.go',
 'MYVOCAL-Studio-source/src/lib/scoreVocalClient.js',
 'MYVOCAL-Studio-source/src/components/ScoreVocalPanel.jsx',
 'MYVOCAL-Studio-source/tests/score-vocal-client.test.mjs',
 'tests/test_score_vocal_worker.py',
)
ROUTE_ANCHOR='mux.HandleFunc("/api/singing/rvc/convert", a.rvcConvert)'
ROUTE_NEW='mux.HandleFunc("/api/singing/score-vocal", a.scoreVocalRender)'
IMPORT_ANCHOR="import SingingWorkbench from '../components/SingingWorkbench';"
IMPORT_NEW="import ScoreVocalPanel from '../components/ScoreVocalPanel.jsx';"
PANEL_ANCHOR="{tab==='singing'&&<SingingWorkbench project={p} data={data} onChange={onChange} notify={notify}/> }".replace('/> }','/>}')
PANEL_NEW="{tab==='singing'&&<><SingingWorkbench project={p} data={data} onChange={onChange} notify={notify}/><ScoreVocalPanel project={p} onChange={onChange} notify={notify}/></>}"

def patched(text,anchor,replacement):
 if replacement in text:return text
 if text.count(anchor)!=1:raise RuntimeError('기존 main 코드 연결 위치가 달라졌습니다: '+anchor[:80])
 return text.replace(anchor,replacement,1)

def apply(source,checkout):
 source,checkout=Path(source).resolve(),Path(checkout).resolve()
 main=checkout/'desktop/main.go'
 workspace=checkout/'MYVOCAL-Studio-source/src/pages/Workspace.jsx'
 if not main.is_file() or not workspace.is_file():raise RuntimeError('기존 Windows EXE main.go/Workspace.jsx가 없습니다')
 old_main=main.read_text(encoding='utf-8')
 old_ws=workspace.read_text(encoding='utf-8')
 new_main=patched(old_main,ROUTE_ANCHOR,ROUTE_ANCHOR+'\n '+ROUTE_NEW)
 new_ws=patched(old_ws,IMPORT_ANCHOR,IMPORT_ANCHOR+'\n'+IMPORT_NEW)
 new_ws=patched(new_ws,PANEL_ANCHOR,PANEL_NEW)
 for name in NEW:
  a,b=source/name,checkout/name
  if not a.is_file():raise RuntimeError('새 개발 소스가 없습니다: '+name)
  if b.exists() and b.read_bytes()!=a.read_bytes():raise RuntimeError('기존 소스가 달라 덮어쓰지 않습니다: '+name)
 # All preflights succeeded; write only the new files and the two additive links.
 for name in NEW:
  a,b=source/name,checkout/name
  if not b.exists():
   b.parent.mkdir(parents=True,exist_ok=True)
   shutil.copyfile(a,b)
 if new_main!=old_main:main.write_text(new_main,encoding='utf-8')
 if new_ws!=old_ws:workspace.write_text(new_ws,encoding='utf-8')
 return {'newFiles':len(NEW),'mainRoute':new_main!=old_main,'singingTab':new_ws!=old_ws}

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('checkout')
 print(apply(Path(__file__).resolve().parents[1],p.parse_args().checkout))
