"""Apply only 13th-round SoundFont files to an existing MYVOCAL main checkout.
Does not touch user data, model folders, IndexedDB, recordings or backups.
Preflights paths/anchors before writing; refuses divergent existing source files.
"""
from pathlib import Path
import argparse
import hashlib
import shutil
from turn13_main_route import apply as apply_route
from turn13_workspace_integration import apply as apply_workspace

ADDITIONS = (
    'desktop/midi_soundfont_worker.py',
    'desktop/midi_soundfont.go',
    'desktop/midi_soundfont_test.go',
    'MYVOCAL-Studio-source/src/lib/midiSoundFontClient.js',
    'MYVOCAL-Studio-source/src/components/MidiSoundFontPanel.jsx',
    'MYVOCAL-Studio-source/tests/midi-soundfont-client.test.mjs',
    'tests/test_midi_soundfont_worker.py',
)

def apply(source, checkout):
    source, checkout = Path(source).resolve(), Path(checkout).resolve()
    main = checkout/'desktop/main.go'
    workspace = checkout/'MYVOCAL-Studio-source/src/pages/Workspace.jsx'
    if not main.is_file() or not workspace.is_file():
        raise RuntimeError('기존 Windows EXE main.go/Workspace.jsx가 없습니다. 새로운 프로젝트를 만들지 않습니다.')
    old_main, old_workspace = main.read_text(encoding='utf-8'), workspace.read_text(encoding='utf-8')
    if '/api/music/midi/soundfont' not in old_main and old_main.count(' mux.HandleFunc("/api/music/generate", a.musicGenGenerate)') != 1:
        raise RuntimeError('기존 main.go 라우트가 달라져 병합을 중단합니다.')
    if 'MidiSoundFontPanel project={p}' not in old_workspace and old_workspace.count("{tab==='midi'&&<MidiEditor project={p} onChange={change} notify={notify}/>}") != 1:
        raise RuntimeError('기존 Workspace MIDI 탭이 달라져 병합을 중단합니다.')
    for name in ADDITIONS:
        src,dst=source/name,checkout/name
        if not src.is_file():raise RuntimeError(f'누적 후보의 파일이 없습니다: {name}')
        if dst.exists() and dst.read_bytes()!=src.read_bytes():
            raise RuntimeError(f'기존 파일과 내용이 다릅니다. 덮어쓰지 않습니다: {name}')
    for name in ADDITIONS:
        src,dst=source/name,checkout/name
        if not dst.exists():
            dst.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(src,dst)
    apply_route(checkout)
    apply_workspace(checkout)
    return len(ADDITIONS)

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('checkout',help='실제 MYVOCAL main 체크아웃')
    args=p.parse_args()
    count=apply(Path(__file__).resolve().parents[1],args.checkout)
    print(f'기존 프로젝트에 신규 소스 {count}개 및 두 연결부 추가 완료 (Windows 실기기 검증은 별도 필요)')
