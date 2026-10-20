"""Apply ONLY the new MIDI route to the user's existing MYVOCAL main checkout.
Requires that the previous Demucs candidate route has been integrated.
Does not overwrite source media, existing routes, or project data.
"""
from pathlib import Path
import argparse

def apply(root):
    main=Path(root)/'desktop/main.go'
    original=main.read_text(encoding='utf-8')
    old=' mux.HandleFunc("/api/music/stems/split", a.musicStemsSplit)'
    new=old+'\n mux.HandleFunc("/api/music/stems/midi", a.musicStemMidi)'
    if new in original:
        print('MIDI route already present');return
    if original.count(old)!=1:
        raise RuntimeError('기존 Demucs main route를 찾지 못했습니다. 원본 변경 금지.')
    main.write_text(original.replace(old,new,1),encoding='utf-8')
    print('기존 main에 MIDI route 추가 완료')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('checkout');apply(parser.parse_args().checkout)
