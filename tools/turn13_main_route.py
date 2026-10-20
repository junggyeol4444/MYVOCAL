"""Idempotently add SoundFont API route to existing MYVOCAL main checkout.
Preserves every existing route; no source assets are touched.
"""
from pathlib import Path
import argparse

def apply(root):
    file = Path(root)/'desktop/main.go'
    text = file.read_text(encoding='utf-8')
    target = ' mux.HandleFunc("/api/music/midi/soundfont", a.midiSoundfont)'
    if target in text:
        return 'SoundFont API 라우트 이미 연결됨'
    anchor = ' mux.HandleFunc("/api/music/generate", a.musicGenGenerate)'
    if text.count(anchor) != 1:
        raise RuntimeError('원본 MusicGen 라우트를 정확히 찾지 못했습니다. 기존 파일 변경 없음.')
    file.write_text(text.replace(anchor, anchor+'\n'+target, 1), encoding='utf-8')
    return '기존 MYVOCAL Windows EXE에 SoundFont 라우트 추가 완료'

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('checkout')
    print(apply(parser.parse_args().checkout))
