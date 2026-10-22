#!/usr/bin/env python3
"""MYVOCAL Studio: installed RVC v2 48k offline training (not a demo).

Runs the official repository's preprocess, F0, HuBERT, and train scripts using
user-installed Python/CUDA and weights. No downloads, shell, or model fabrication.
Only newly created experiment scratch data is removed; source audio, installed
RVC files, and previously trained models are never overwritten or deleted.
"""
import argparse
import json
import hashlib
import wave
import os
import re
from pathlib import Path
import shutil
import subprocess
import sys
import uuid
from rvc_pitch_coverage import inspect_rvc_pitch_coverage
from rvc_training_dataset_quality import inspect_training_dataset
from rvc_inference_audio_quality import verify_rvc_inference_wav


REQUIRED = (
    'train/preprocess.py', 'train/dataset/extract_f0.py',
    'train/dataset/extract_hubert_feature.py', 'train/train.py',
    'configs/v2/48k.json', 'assets/hubert_base/config.json',
    'assets/hubert_base/pytorch_model.bin', 'train/train_index.py',
    'infer/cli.py',
    'assets/pretrained_v2/f0G48k.pth', 'assets/pretrained_v2/f0D48k.pth',
)
AUDIO_EXTENSIONS = {'.wav', '.mp3', '.m4a', '.ogg', '.flac', '.webm', '.aac'}


def require_file(path, label):
    if not path.is_file() or path.is_symlink():
        raise RuntimeError(f'{label} 파일을 찾을 수 없거나 심볼릭 링크입니다: {path.name}')


def run_stage(root, label, args):
    print(f'[MYVOCAL RVC] {label} 시작', flush=True)
    subprocess.run([sys.executable, *map(str, args)], cwd=str(root), check=True)
    print(f'[MYVOCAL RVC] {label} 완료', flush=True)


def collect_filelist(expdir):
    gt = expdir / '0_gt_wavs'
    f0 = expdir / '2a_f0'
    f0nsf = expdir / '2b-f0nsf'
    features = expdir / '3_feature768'
    for folder in (gt, f0, f0nsf, features):
        if not folder.is_dir():
            raise RuntimeError(f'RVC 단계별 결과 폴더가 없습니다: {folder.name}')
    rows = []
    for wav in sorted(gt.glob('*.wav')):
        name = wav.stem
        feat = features / (name + '.npy')
        pitch = f0 / (name + '.wav.npy')
        pitchnsf = f0nsf / (name + '.wav.npy')
        if all(p.is_file() and p.stat().st_size > 0 for p in (wav, feat, pitch, pitchnsf)):
            # Forward slashes are valid Windows paths and avoid ambiguous escapes.
            rows.append('|'.join([p.as_posix() for p in (wav, feat, pitch, pitchnsf)] + ['0']))
    if not rows:
        raise RuntimeError('전처리·F0·HuBERT 결과가 연결되는 학습 샘플이 없습니다')
    (expdir / 'filelist.txt').write_text('\n'.join(rows) + '\n', encoding='utf-8')
    print(f'[MYVOCAL RVC] 학습 가능한 구간 {len(rows)}개', flush=True)
    return len(rows)


def safe_remove_experiment(expdir, marker):
    """Remove only our newly created scratch folder, not user-owned RVC data."""
    if not expdir or not expdir.is_dir() or expdir.is_symlink():
        return
    proof = expdir / '.myvocal-experiment'
    try:
        if not proof.is_file() or proof.is_symlink() or proof.read_text(encoding='ascii') != marker:
            print('[MYVOCAL RVC] 임시 폴더 식별 불일치: 사용자 데이터 보호를 위해 유지', flush=True)
            return
        # Never follow symlinks inside the scratch directory while deleting.
        shutil.rmtree(expdir)
    except OSError as error:
        print(f'[MYVOCAL RVC] 임시 실험 데이터 정리 실패: {error}', file=sys.stderr, flush=True)


def execute(args):
    root = Path(args.root).resolve(strict=True)
    dataset = Path(args.dataset).resolve(strict=True)
    output = Path(args.output)
    index_output = output.with_suffix('.index')
    if not root.is_dir() or not (dataset / 'audio').is_dir() or not output.is_absolute():
        raise RuntimeError('RVC 설치 폴더·복사된 데이터셋·출력 절대 경로가 올바르지 않습니다')
    if output.exists() or output.is_symlink() or index_output.exists() or index_output.is_symlink():
        raise RuntimeError('기존 체크포인트 또는 인덱스는 덮어쓸 수 없습니다')
    if dataset == root or root in dataset.parents:
        raise RuntimeError('RVC 설치 폴더의 원본 음성을 학습 데이터로 직접 사용할 수 없습니다')
    for relative in REQUIRED:
        require_file(root / relative, '설치된 공식 RVC')
    try:
        import torch
    except ImportError as error:
        raise RuntimeError('선택한 RVC Python에 PyTorch가 설치되지 않았습니다') from error
    if not torch.cuda.is_available() or args.gpu >= torch.cuda.device_count():
        raise RuntimeError('선택한 GPU에서 CUDA RVC 학습을 실행할 수 없습니다')
    samples = [p for p in (dataset / 'audio').iterdir() if p.is_file() and not p.is_symlink()]
    if not samples or any(p.suffix.lower() not in AUDIO_EXTENSIONS for p in samples):
        raise RuntimeError('지원되는 학습 녹음 복사본이 없습니다')
    for result in inspect_training_dataset(samples):
        if result['checked']:
            print('[MYVOCAL RVC] 학습 녹음 품질: ' + result['file'] +
                  f" / {result['duration_sec']:.1f}초 / RMS={result['rms']:.4f}" +
                  f" / 클리핑={result['clip_ratio']:.1%}", flush=True)
        else:
            print('[MYVOCAL RVC] ' + result['file'] + ' / ' + result['reason'], flush=True)
    exp_name = args.experiment_name or ('myvocal_' + uuid.uuid4().hex)
    if not re.fullmatch(r'myvocal_[a-f0-9]{32}', exp_name):
        raise RuntimeError('새 RVC 실험 ID가 올바르지 않습니다')
    logs = root / 'logs'
    if logs.is_symlink():
        raise RuntimeError('RVC logs 폴더가 심볼릭 링크여서 안전한 실험 격리를 할 수 없습니다')
    logs.mkdir(exist_ok=True)
    expdir = logs / exp_name
    expdir.mkdir(exist_ok=False)
    # The marker prevents deleting an existing user experiment by mistake.
    (expdir / '.myvocal-experiment').write_text(exp_name, encoding='ascii')
    print(f'[MYVOCAL RVC] 새 실험 {exp_name} / 녹음 복사본 {len(samples)}개', flush=True)
    trained = root / 'assets' / 'weights' / (exp_name + '.pth')
    try:
        run_stage(root, '1/6 데이터 전처리', ['train/preprocess.py', dataset / 'audio',
                  '48000', '2', expdir, 'False', '3.7'])
        if not list((expdir / '0_gt_wavs').glob('*.wav')):
            raise RuntimeError('RVC 전처리가 유효한 음성 구간을 생성하지 못했습니다')
        run_stage(root, '2/6 F0 추출', ['train/dataset/extract_f0.py', 'cuda',
                  '1', '0', str(args.gpu), expdir, 'false'])
        pitch = inspect_rvc_pitch_coverage(expdir / '2b-f0nsf')
        print('[MYVOCAL RVC] 실제 F0 음역: ' +
              f"유성 {pitch['voiced_ratio']:.1%}, " +
              f"10~90백분위 {pitch['pitch_hz_p10']:.1f}~{pitch['pitch_hz_p90']:.1f}Hz, " +
              f"음정 {pitch['distinct_semitones']}종", flush=True)
        for recommendation in pitch['recommendations']:
            print('[MYVOCAL RVC] 녹음 권장: ' + recommendation, flush=True)
        run_stage(root, '3/6 HuBERT 특징 추출', ['train/dataset/extract_hubert_feature.py',
                  'cuda:' + str(args.gpu), '1', '0', str(args.gpu), expdir, 'v2', 'false'])
        collect_filelist(expdir)
        config = json.loads((root / 'configs/v2/48k.json').read_text(encoding='utf-8'))
        (expdir / 'config.json').write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding='utf-8')
        train_args = ['train/train.py', '-e', exp_name, '-sr', '48k', '-f0', '1',
                      '-bs', str(args.batch_size), '-g', str(args.gpu),
                      '-te', str(args.epochs), '-se', str(args.epochs),
                      '-l', '1', '-c', '0', '-sw', '1', '-v', 'v2',
                      '-pg', 'assets/pretrained_v2/f0G48k.pth',
                      '-pd', 'assets/pretrained_v2/f0D48k.pth']
        if trained.exists() or trained.is_symlink():
            raise RuntimeError('기존 RVC 가중치를 덮어쓸 수 없습니다')
        run_stage(root, '4/6 신경망 가중치 훈련', train_args)
        require_file(trained, '훈련 완료')
        if trained.stat().st_size < 1024:
            raise RuntimeError('RVC 훈련 결과 체크포인트가 비어 있습니다')
        # Build an actual retrieval index from the extracted HuBERT features.
        # This is a local FAISS operation; it never downloads a model or
        # modifies any existing user index. The index lives in our experiment
        # until both inference checks have succeeded.
        index_path = None
        if not args.no_index:
            index_dir = expdir / 'myvocal-index'
            index_dir.mkdir(exist_ok=False)
            run_stage(root, '5/6 HuBERT 검색 인덱스 학습', [
                'train/train_index.py', exp_name, 'v2', index_dir, '8', 'single',
            ])
            candidates = sorted(expdir.glob('added_*.index'))
            if len(candidates) != 1 or candidates[0].is_symlink() or candidates[0].stat().st_size < 1024:
                raise RuntimeError('RVC FAISS added 인덱스 생성 결과가 없거나 모호합니다')
            index_path = candidates[0]
        samples_for_check = sorted((expdir / '0_gt_wavs').glob('*.wav'),
                                   key=lambda wav: wav.stat().st_size, reverse=True)
        if not samples_for_check:
            raise RuntimeError('추론 검증에 사용할 전처리된 WAV가 없습니다')
        check_wav = expdir / 'myvocal-inference-check.wav'
        command = ['infer/cli.py', '--model', trained, '--input', samples_for_check[0],
                   '--output', check_wav, '--f0-method', 'pm',
                   '--index-rate', '0.5' if index_path else '0']
        if index_path:
            command.extend(['--index', index_path])
        run_stage(root, '6/6 실제 체크포인트·검색 인덱스 추론 검증', command)
        require_file(check_wav, '추론 검증 결과 WAV')
        quality = verify_rvc_inference_wav(check_wav)
        print('[MYVOCAL RVC] 실제 추론 PCM 검사: ' +
              f"{quality['duration_sec']:.2f}초, RMS={quality['rms']:.4f}, " +
              f"클리핑={quality['clipped_ratio']:.2%}", flush=True)
        # Publish new model and optional index with exclusive creation. Roll
        # back ONLY files created by this invocation if either copy fails.
        output.parent.mkdir(parents=True, exist_ok=True)
        created = []
        try:
            for source, destination in [(trained, output), *([(index_path, index_output)] if index_path else [])]:
                with source.open('rb') as inp, destination.open('xb') as target:
                    created.append(destination)
                    shutil.copyfileobj(inp, target, 1024 * 1024)
                    target.flush()
                    os.fsync(target.fileno())
        except Exception:
            for created_path in created:
                created_path.unlink(missing_ok=True)
            raise
        digest = hashlib.sha256()
        with output.open('rb') as checkpoint:
            for block in iter(lambda: checkpoint.read(1024 * 1024), b''):
                digest.update(block)
        print('[MYVOCAL RVC] 추론 성공 체크포인트 SHA256: ' + digest.hexdigest(), flush=True)
        if index_path:
            print('[MYVOCAL RVC] FAISS 인덱스 생성·실제 검색 추론 성공: ' + index_output.name, flush=True)
        print('[MYVOCAL RVC] 추론 WAV 구조 검사 통과 (실제 음색·한국어 발음 품질은 별도 검증)', flush=True)
        print('[MYVOCAL RVC] 신규 .pth 저장. 실제 한국어 가창·음색 유사도·고음 품질은 별도 검증 필요', flush=True)
    finally:
        safe_remove_experiment(expdir, exp_name)


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', required=True)
    parser.add_argument('--dataset', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--epochs', type=int, default=20)
    parser.add_argument('--batch-size', type=int, default=2)
    parser.add_argument('--gpu', type=int, default=0)
    parser.add_argument('--experiment-name', default='')
    parser.add_argument('--no-index', action='store_true', help='검색 인덱스 생성 없이 학습')
    args = parser.parse_args(argv)
    if not 1 <= args.epochs <= 1000 or not 1 <= args.batch_size <= 64 or not 0 <= args.gpu <= 15:
        parser.error('에포크·배치·GPU 범위가 올바르지 않습니다')
    try:
        execute(args)
    except (OSError, RuntimeError, subprocess.CalledProcessError, ValueError) as error:
        print('RVC 공식 단계별 학습 실패: ' + str(error)[:500], file=sys.stderr, flush=True)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
