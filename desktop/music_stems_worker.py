#!/usr/bin/env python3
"""MYVOCAL: offline local Demucs 4/6-stem separation in an existing Windows EXE.

Uses only the user's installed Demucs package and local model repository.
Never downloads weights, touches source audio, or changes project files.
"""
import argparse
import os
from pathlib import Path
import subprocess
import sys
import wave

MAX_STEM_SECONDS = 360

STEMS = ('drums', 'bass', 'other', 'vocals')
EXTRA_STEMS = ('guitar', 'piano')


def execute(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--repo', required=True)
    parser.add_argument('--model', default='htdemucs')
    parser.add_argument('--input', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--device', choices=('auto', 'cpu', 'cuda'), default='auto')
    opts = parser.parse_args(argv)
    repo = Path(opts.repo).resolve(strict=True)
    source = Path(opts.input).resolve(strict=True)
    out = Path(opts.out).resolve(strict=True)
    if not repo.is_dir() or not source.is_file() or source.is_symlink() or not out.is_dir() or out.is_symlink():
        raise RuntimeError('로컬 모델·입력 WAV·출력 폴더가 올바르지 않습니다')
    try:
        with wave.open(str(source), 'rb') as original:
            source_seconds = original.getnframes() / original.getframerate()
            if not 0.1 <= source_seconds <= MAX_STEM_SECONDS:
                raise RuntimeError('분리할 WAV 길이는 0.1~360초여야 합니다')
    except (wave.Error, EOFError, ZeroDivisionError) as exc:
        raise RuntimeError('분리할 원본 WAV를 읽을 수 없습니다') from exc
    if not opts.model.isascii() or not opts.model.replace('_', '').replace('-', '').isalnum():
        raise RuntimeError('Demucs 모델 이름이 올바르지 않습니다')
    # Demucs LocalRepo resolves a signature.th or signature-CHECKSUM.th;
    # BagOnlyRepo resolves model.yaml with 'models: [signature, ...]'.
    # A random .th is NOT sufficient to run --repo -n htdemucs.
    weights = {p.name.split('-', 1)[0].removesuffix('.th')
               for p in repo.iterdir() if p.is_file() and not p.is_symlink() and p.suffix == '.th'}
    if not weights:
        raise RuntimeError('로컬 Demucs .th 가중치가 없습니다 (자동 다운로드 금지)')
    bag = repo / (opts.model + '.yaml')
    if bag.is_file() and not bag.is_symlink():
        try:
            import yaml
            config = yaml.safe_load(bag.read_text(encoding='utf-8'))
            signatures = config['models']
        except Exception as exc:
            raise RuntimeError('Demucs 모델 YAML을 읽을 수 없습니다') from exc
        if not isinstance(signatures, list) or not signatures or any(
                not isinstance(sig, str) or sig not in weights for sig in signatures):
            raise RuntimeError('Demucs YAML이 참조하는 로컬 .th 가중치가 없습니다')
    elif opts.model not in weights:
        raise RuntimeError('선택한 Demucs 모델 이름과 일치하는 로컬 YAML 또는 .th가 없습니다')
    # --repo forces demucs.pretrained.LocalRepo, not RemoteRepo.
    command = [sys.executable, '-m', 'demucs.separate', '--repo', str(repo),
               '-n', opts.model, '-o', str(out), '--filename', '{stem}.{ext}',
               '--shifts', '1', '--overlap', '0.25', '--clip-mode', 'clamp']
    if opts.device != 'auto':
        command.extend(['--device', opts.device])
    command.append(str(source))
    env = os.environ.copy()
    env.update({'HF_HUB_OFFLINE': '1', 'TRANSFORMERS_OFFLINE': '1', 'HF_DATASETS_OFFLINE': '1'})
    print('[MYVOCAL] 로컬 Demucs 4/6트랙 신경망 분리 시작', flush=True)
    subprocess.run(command, check=True, env=env, cwd=str(out))
    # Explicit --filename {stem}.{ext} writes directly under <out>/<model>.
    base = out / opts.model
    extras = {p.name for p in base.glob('*.wav')} - {s + '.wav' for s in STEMS}
    if extras == {s + '.wav' for s in EXTRA_STEMS}:
        names = STEMS + EXTRA_STEMS
    elif extras:
        raise RuntimeError('Demucs 신경망 출력은 정확한 4개 또는 6개 stem이어야 합니다')
    else:
        names = STEMS
    frames = None
    for name in names:
        path = base / (name + '.wav')
        if not path.is_file() or path.is_symlink():
            raise RuntimeError('Demucs 신경망이 %s.wav 파일을 생성하지 않았습니다' % name)
        with wave.open(str(path), 'rb') as wav:
            if wav.getcomptype() != 'NONE' or wav.getsampwidth() != 2 or wav.getnchannels() != 2 or wav.getframerate() != 44100:
                raise RuntimeError('Demucs 출력이 44.1kHz 스테레오 PCM16이 아닙니다: ' + name)
            count = wav.getnframes()
            if count < 4410 or count > 44100 * MAX_STEM_SECONDS:
                raise RuntimeError('Demucs 출력 길이(0.1~360초) 오류: ' + name)
            if frames is not None and frames != count:
                raise RuntimeError('Demucs 분리 트랙 간 길이가 일치하지 않습니다')
            frames = count
    if abs(frames / 44100 - source_seconds) > 0.1:
        raise RuntimeError('Demucs 신경망 출력이 입력 WAV보다 0.1초 이상 길거나 짧습니다')
    print(f'[MYVOCAL] 신경망 {len(names)}트랙 생성 및 WAV 형식 검사 완료 (분리 품질은 별도 검증)', flush=True)


if __name__ == '__main__':
    try:
        execute()
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        print('Demucs 분리 실패: ' + str(error)[:400], file=sys.stderr, flush=True)
        raise SystemExit(1)
