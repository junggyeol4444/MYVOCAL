#!/usr/bin/env python3
"""Local recorded-guide WAV -> MIDI-score pitch/timing correction.

This is REAL DSP using librosa/soundfile, not a neural singing model. A guide
recording containing the intended lyrics is required. No synthetic lyrics,
voice cloning, model download, or modification of original recordings occurs.
"""
import argparse
import json
import math
from pathlib import Path
import sys
import numpy as np
import soundfile as sf

MAX_SECONDS = 360
MAX_NOTES = 400
RATE = 44100


def validate_score(payload):
    if not isinstance(payload, dict) or not isinstance(payload.get('notes'), list):
        raise ValueError('가사·MIDI 음표 목록이 필요합니다')
    notes = payload['notes']
    if not 1 <= len(notes) <= MAX_NOTES:
        raise ValueError('MIDI 음표는 1~400개여야 합니다')
    previous = -1.0
    for note in notes:
        if not isinstance(note, dict):
            raise ValueError('MIDI 음표 형식 오류')
        start, end, pitch = note.get('startSec'), note.get('endSec'), note.get('pitch')
        if not all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in (start, end, pitch)):
            raise ValueError('MIDI 음표의 시간·높이가 숫자가 아닙니다')
        if not (0 <= start < end <= MAX_SECONDS and .07 <= end-start <= 12 and 24 <= pitch <= 108):
            raise ValueError('MIDI 음표 시간·음역 제한 위반')
        if start < previous:
            raise ValueError('MIDI 음표는 시작 시간 순서여야 합니다')
        previous = start
        for key in ('sourceStartSec', 'sourceEndSec'):
            if key in note and (not isinstance(note[key], (int, float)) or not math.isfinite(note[key])):
                raise ValueError('녹음 구간 시간이 올바르지 않습니다')
        if ('sourceStartSec' in note) != ('sourceEndSec' in note):
            raise ValueError('녹음 시작·종료 시간은 함께 지정하세요')
        if 'sourceStartSec' in note and not (0 <= note['sourceStartSec'] < note['sourceEndSec'] <= MAX_SECONDS):
            raise ValueError('녹음 구간 범위 오류')
    return notes


def estimate_pitch(samples, rate):
    """Robust voiced median of a REAL recording; return None for silence."""
    import librosa
    if len(samples) < int(.075*rate):
        return None
    # Discard attack/release where consonants and noise dominate.
    a = int(.06*len(samples))
    y = np.asarray(samples[a:len(samples)-a] if a else samples, dtype=np.float32)
    if len(y) < 2048 or float(np.sqrt(np.mean(y*y))) < .003:
        return None
    # Downsample for pitch analysis, leaving the original samples untouched.
    if rate != 22050:
        y = librosa.resample(y, orig_sr=rate, target_sr=22050)
    f0 = librosa.yin(y, fmin=70, fmax=1100, sr=22050, frame_length=2048, hop_length=256)
    energy = librosa.feature.rms(y=y, frame_length=2048, hop_length=256)[0]
    n = min(len(f0), len(energy))
    voiced = f0[:n][(energy[:n] > max(.004, np.percentile(energy[:n], 35))) & np.isfinite(f0[:n])]
    if len(voiced) < 2:
        return None
    return float(np.median(voiced))


def render(input_path, score_path, output_path, interval=0, strength=1.0):
    import librosa
    src = Path(input_path).resolve(strict=True)
    score = Path(score_path).resolve(strict=True)
    dest = Path(output_path)
    if not src.is_file() or src.suffix.lower() != '.wav' or src.stat().st_size > 90*1024*1024:
        raise ValueError('90MB 이하의 실제 녹음 WAV만 허용합니다')
    if not score.is_file() or score.stat().st_size > 1024*1024:
        raise ValueError('MIDI 음표 JSON 크기가 올바르지 않습니다')
    if not dest.is_absolute() or dest.suffix.lower() != '.wav' or dest.exists() or dest.is_symlink():
        raise ValueError('새 출력 WAV 경로가 올바르지 않습니다 (기존 파일 덮어쓰기 금지)')
    if not isinstance(interval, int) or not -12 <= interval <= 12:
        raise ValueError('화음 반음 이동은 -12~12입니다')
    if not math.isfinite(strength) or not 0 <= strength <= 1:
        raise ValueError('음정 보정 강도는 0~1입니다')
    notes = validate_score(json.loads(score.read_text(encoding='utf-8')))
    info = sf.info(str(src))
    if info.samplerate < 16000 or info.samplerate > 96000 or info.channels not in (1, 2) or not .1 <= info.duration <= MAX_SECONDS:
        raise ValueError('입력 WAV는 16~96kHz, 모노/스테레오, 최대 360초여야 합니다')
    audio, sample_rate = sf.read(str(src), dtype='float32', always_2d=True)
    if not np.all(np.isfinite(audio)):
        raise ValueError('입력 WAV에 비정상 샘플이 있습니다')
    if sample_rate != RATE:
        mono = librosa.resample(np.mean(audio, axis=1), orig_sr=sample_rate, target_sr=RATE)
    else:
        mono = np.mean(audio, axis=1)
    if float(np.max(np.abs(mono))) < .003:
        raise ValueError('녹음 WAV가 무음입니다')
    duration = max(max(float(note['endSec']) for note in notes)+.2, float(info.duration))
    if duration > MAX_SECONDS:
        duration = MAX_SECONDS
    total = int(math.ceil(duration*RATE))
    mix = np.zeros(total, dtype=np.float32)
    valid, unvoiced = 0, 0
    for index, note in enumerate(notes):
        begin = note.get('sourceStartSec', note['startSec'])
        end = note.get('sourceEndSec', note['endSec'])
        left, right = round(begin*RATE), min(len(mono), round(end*RATE))
        if right-left < int(.07*RATE):
            unvoiced += 1
            continue
        sample = np.asarray(mono[left:right], dtype=np.float32)
        fundamental = estimate_pitch(sample, RATE)
        if fundamental is None:
            unvoiced += 1
            continue
        target = librosa.midi_to_hz(int(note['pitch']))
        shift = float(np.clip(12*np.log2(target/fundamental)*strength+interval, -36, 36))
        # True phase-vocoder pitch shifting, not a frequency-labelled sine wave.
        processed = librosa.effects.pitch_shift(sample, sr=RATE, n_steps=shift, bins_per_octave=12) if abs(shift)>.05 else sample.copy()
        frames = max(1, round((note['endSec']-note['startSec'])*RATE))
        if abs(len(processed)-frames)>2:
            processed = librosa.effects.time_stretch(processed, rate=len(processed)/frames)
        if len(processed)<frames:
            processed = np.pad(processed, (0,frames-len(processed)))
        processed = processed[:frames]
        # Avoid note boundary clicks without deleting the user's recording.
        fade = min(round(.018*RATE), len(processed)//4)
        if fade:
            envelope = np.ones(len(processed),dtype=np.float32)
            envelope[:fade] = np.linspace(0,1,fade,endpoint=False)
            envelope[-fade:] = np.linspace(1,0,fade,endpoint=True)
            processed *= envelope
        at = round(note['startSec']*RATE)
        size = min(len(processed),len(mix)-at)
        if size > 0:
            mix[at:at+size] += processed[:size]
            valid += 1
    if not valid:
        raise RuntimeError('음높이를 분석할 수 있는 녹음 구간이 없습니다. 실제 가창/발화 WAV를 확인하세요')
    peak = float(np.max(np.abs(mix)))
    if peak < .0002:
        raise RuntimeError('음정 보정 결과가 무음입니다')
    if peak > .891:
        mix *= .891/peak  # -1 dBFS safety attenuation
    # Explicit stereo PCM16 output, and exclusive creation of a NEW file only.
    stereo = np.column_stack((mix,mix))
    # Exclusive creation happens BEFORE cleanup scope: an existing user file
    # must never be unlinked when open('xb') fails.
    stream = dest.open('xb')
    try:
        with stream:
            sf.write(stream, stereo, RATE, subtype='PCM_16', format='WAV')
    except BaseException:
        # Only the output successfully created by this invocation is removed.
        dest.unlink(missing_ok=True)
        raise
    output_info = sf.info(str(dest))
    if output_info.samplerate != RATE or output_info.channels != 2 or abs(output_info.duration-duration)>.02:
        dest.unlink(missing_ok=True)
        raise RuntimeError('출력 PCM WAV 형식·길이 검증 실패')
    print(f'녹음 기반 MIDI 음정 보정 WAV 생성: 유효 음표 {valid}/{len(notes)}, 무성/무음 {unvoiced}, 길이 {duration:.2f}초',flush=True)
    return valid


def main():
    p = argparse.ArgumentParser()
    for name in ('input','score','output'):
        p.add_argument('--'+name, required=True)
    p.add_argument('--interval', type=int, default=0)
    p.add_argument('--strength', type=float, default=1)
    a = p.parse_args()
    try:
        render(a.input,a.score,a.output,a.interval,a.strength)
        return 0
    except (OSError, ValueError, RuntimeError, ImportError, json.JSONDecodeError) as error:
        print('MIDI 녹음 보컬 음정 보정 실패: '+str(error)[:500],file=sys.stderr,flush=True)
        return 1

if __name__=='__main__':
    raise SystemExit(main())
