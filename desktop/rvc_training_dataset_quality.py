"""MYVOCAL Studio 공식 RVC 학습 전 음성 녹음 복사본 품질 확인.

PCM16 WAV만 샘플 검사를 실시하며 입력 파일은 절대 수정하지 않는다.
다른 지원 음성 형식은 기존 공식 전처리에 위임한다.
"""
from pathlib import Path
import math
import struct
import wave


def inspect_training_dataset(samples):
    if not samples:
        raise RuntimeError('RVC 학습 녹음 복사본이 없습니다')
    reports = []
    for source in samples:
        path = Path(source)
        if not path.is_file() or path.is_symlink() or path.stat().st_size <= 0:
            raise RuntimeError('RVC 학습 녹음 파일이 비어 있거나 안전하지 않습니다: ' + path.name)
        if path.suffix.lower() != '.wav':
            reports.append({'file': path.name, 'checked': False, 'reason': '비-WAV: 공식 RVC 전처리에서 검사'})
            continue
        try:
            with wave.open(str(path), 'rb') as audio:
                channels, rate, width = audio.getnchannels(), audio.getframerate(), audio.getsampwidth()
                frames = audio.getnframes()
                if audio.getcomptype() != 'NONE' or channels not in (1, 2) or not 8000 <= rate <= 192000 or frames < rate // 2:
                    raise RuntimeError('RVC 녹음 채널·샘플레이트·길이가 올바르지 않습니다: ' + path.name)
                if width != 2:
                    reports.append({'file': path.name, 'checked': False, 'reason': 'PCM16 이외 형식: 공식 RVC 전처리에서 검사'})
                    continue
                count = 0
                total = square = 0.0
                clip = active = 0
                while True:
                    raw = audio.readframes(4096)
                    if not raw:
                        break
                    if len(raw) % 2:
                        raise RuntimeError('RVC WAV PCM이 잘렸습니다: ' + path.name)
                    for (sample,) in struct.iter_unpack('<h', raw):
                        value = sample / 32768.0
                        count += 1
                        total += value
                        square += value * value
                        clip += abs(value) >= .999
                        active += abs(value) >= .008
                if count != frames * channels:
                    raise RuntimeError('RVC 녹음 PCM 프레임이 잘렸습니다: ' + path.name)
                mean = total / count
                rms = math.sqrt(square / count)
                std = math.sqrt(max(0.0, square / count - mean * mean))
                if rms < .002 or active / count < .01:
                    raise RuntimeError('RVC 학습 녹음이 무음 또는 거의 무음입니다: ' + path.name)
                if std < .0015:
                    raise RuntimeError('RVC 학습 녹음에 직류 신호가 많습니다: ' + path.name)
                if clip / count > .20:
                    raise RuntimeError('RVC 학습 녹음에 심각한 클리핑이 있습니다: ' + path.name)
                reports.append({'file': path.name, 'checked': True, 'duration_sec': round(frames / rate, 3),
                                'rms': round(rms, 6), 'clip_ratio': round(clip / count, 6)})
        except (wave.Error, EOFError, struct.error) as error:
            raise RuntimeError('RVC 학습 WAV 파일이 손상됐습니다: ' + path.name) from error
    return reports
