"""Attach MIDI SoundFont rendering to existing MYVOCAL Windows EXE MIDI tab.
Idempotent; refuses unexpected upstream changes rather than overwriting them.
"""
from pathlib import Path
import argparse

def apply(root):
    file=Path(root)/'MYVOCAL-Studio-source/src/pages/Workspace.jsx'
    content=file.read_text(encoding='utf-8')
    import_line="import MidiSoundFontPanel from '../components/MidiSoundFontPanel.jsx';"
    anchor="import MidiEditor from '../components/MidiEditor';"
    if import_line not in content:
        if content.count(anchor)!=1:raise RuntimeError('기존 MIDI 편집기 import를 찾지 못했습니다. 변경 없음.')
        content=content.replace(anchor,anchor+'\n'+import_line,1)
    old="{tab==='midi'&&<MidiEditor project={p} onChange={change} notify={notify}/> }"
    # Actual upstream JSX has no extra space before closing fragment.
    old="{tab==='midi'&&<MidiEditor project={p} onChange={change} notify={notify}/>}"
    new="{tab==='midi'&&<><MidiEditor project={p} onChange={change} notify={notify}/><MidiSoundFontPanel project={p} onChange={onChange} notify={notify}/></>}"
    if new not in content:
        if content.count(old)!=1:raise RuntimeError('기존 MIDI 탭 위치를 찾지 못했습니다. 변경 없음.')
        content=content.replace(old,new,1)
    file.write_text(content,encoding='utf-8')
    return '기존 Windows EXE MIDI 탭에 SoundFont WAV 렌더러 연결 완료'

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('checkout')
    print(apply(parser.parse_args().checkout))
