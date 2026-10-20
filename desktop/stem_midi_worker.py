#!/usr/bin/env python3
"""Offline neural transcription of a permitted Demucs stem using installed Basic Pitch.

Produces a *new* MIDI file. Never downloads weights or edits the source WAV.
The result is a transcription estimate, not the original composer's MIDI.
"""
import argparse
import os
from pathlib import Path
import sys
import wave


def execute(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--onset', type=float, default=.5)
    parser.add_argument('--frame', type=float, default=.3)
    parser.add_argument('--min-note-ms', type=float, default=127.7)
    args = parser.parse_args(argv)
    source = Path(args.input).resolve(strict=True)
    target = Path(args.output)
    if not source.is_file() or source.is_symlink() or source.suffix.lower() != '.wav':
        raise RuntimeError('입력은 실제 PCM WAV 파일이어야 합니다')
    if not target.is_absolute() or target.exists() or target.is_symlink() or target.suffix.lower() != '.mid':
        raise RuntimeError('새 MIDI 출력 경로가 올바르지 않습니다 (덮어쓰기 금지)')
    if not (.1 <= args.onset <= .95 and .1 <= args.frame <= .95 and 50 <= args.min_note_ms <= 2000):
        raise RuntimeError('음표 감지 임계값 범위가 올바르지 않습니다')
    with wave.open(str(source), 'rb') as audio:
        duration = audio.getnframes() / audio.getframerate()
        if not .2 <= duration <= 360 or audio.getsampwidth() != 2 or audio.getnchannels() not in (1, 2):
            raise RuntimeError('음원 길이(0.2~360초) 또는 PCM16 형식이 올바르지 않습니다')
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TRANSFORMERS_OFFLINE'] = '1'
    try:
        from basic_pitch import ICASSP_2022_MODEL_PATH
        from basic_pitch.inference import Model, predict
    except ImportError as error:
        raise RuntimeError('선택한 Python에 Basic Pitch 신경망 패키지가 설치되지 않았습니다') from error
    # Verify installed weights before inference, never fetch them implicitly.
    model_path = Path(ICASSP_2022_MODEL_PATH)
    if not model_path.exists():
        raise RuntimeError('Basic Pitch 로컬 신경망 가중치를 찾지 못했습니다')
    model = Model(model_path)
    _, midi, events = predict(str(source), model,
                              onset_threshold=args.onset,
                              frame_threshold=args.frame,
                              minimum_note_length=args.min_note_ms)
    if not events or not any(instrument.notes for instrument in midi.instruments):
        raise RuntimeError('신경망이 검출한 음표가 없습니다. 악기 WAV 또는 임계값을 확인하세요')
    # Write exclusively to avoid overwriting an existing user's MIDI file.
    # pretty_midi.write takes a path; the output is in a private job folder.
    with target.open('xb'):
        pass
    try:
        midi.write(str(target))
        data = target.read_bytes()
        if not data.startswith(b'MThd') or len(data) < 26 or len(data) > 4 * 1024 * 1024:
            raise RuntimeError('Basic Pitch MIDI 결과 형식 또는 크기 오류')
    except Exception:
        target.unlink(missing_ok=True)
        raise
    print(f'[MYVOCAL] Basic Pitch 신경망 MIDI 변환: {len(events)}개 음표 추정 (정확도 별도 확인)', flush=True)


def main():
    try:
        execute()
    except (OSError, ValueError, RuntimeError, wave.Error) as error:
        print('악기 신경망 MIDI 변환 실패: ' + str(error)[:400], file=sys.stderr, flush=True)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
