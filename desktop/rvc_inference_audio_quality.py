"""공식 RVC 추론으로 새로 생성된 PCM16 WAV의 실제 파형 품질 검사.

파일을 읽기만 하며 입력 녹음·원본 모델·기존 사용자 프로젝트는 변경하지 않는다.
음질·음색 유사도·한국어 발음 평가가 아닌 무음/직류/클리핑/손상 검사이다.
"""
import math
import struct
import wave


def verify_rvc_inference_wav(path):
    try:
        with wave.open(str(path), 'rb') as audio:
            channels, rate, width = audio.getnchannels(), audio.getframerate(), audio.getsampwidth()
            frames = audio.getnframes()
            if (channels not in (1, 2) or width != 2 or audio.getcomptype() != 'NONE'
                    or not 8000 <= rate <= 96000 or not .1 <= frames / rate <= 90):
                raise RuntimeError('RVC 실제 추론 WAV의 길이·채널·PCM 형식이 올바르지 않습니다')
            stride = max(1, frames // 65536)
            total = active = clipped = 0
            sums = square_sum = peak = 0.0
            block = 8192
            for start in range(0, frames, block):
                count = min(block, frames - start)
                raw = audio.readframes(count)
                if len(raw) != count * channels * width:
                    raise RuntimeError('RVC 실제 추론 WAV가 중간에서 잘렸습니다')
                for frame in range(0, count, stride):
                    for channel in range(channels):
                        sample = struct.unpack_from('<h', raw, (frame * channels + channel) * 2)[0]
                        value = sample / 32768.0
                        total += 1
                        sums += value
                        square_sum += value * value
                        peak = max(peak, abs(value))
                        active += abs(value) >= .008
                        clipped += abs(value) >= .999
            if not total:
                raise RuntimeError('RVC 실제 추론 WAV에 오디오 샘플이 없습니다')
            mean = sums / total
            rms = math.sqrt(square_sum / total)
            std = math.sqrt(max(0.0, square_sum / total - mean * mean))
            if rms < .003 or active / total < .01:
                raise RuntimeError('RVC 실제 추론 WAV가 무음 또는 거의 무음입니다')
            if std < .002:
                raise RuntimeError('RVC 실제 추론 WAV가 직류 신호에 가깝습니다')
            if clipped / total > .15:
                raise RuntimeError('RVC 실제 추론 WAV에 심각한 클리핑이 있습니다')
            return {'channels': channels, 'sample_rate': rate, 'duration_sec': frames / rate,
                    'rms': rms, 'peak': peak, 'active_ratio': active / total,
                    'clipped_ratio': clipped / total}
    except (wave.Error, EOFError, struct.error) as error:
        raise RuntimeError('RVC 실제 추론이 올바른 PCM16 WAV를 생성하지 못했습니다') from error
