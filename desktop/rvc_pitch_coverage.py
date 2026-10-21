"""공식 RVC F0 추출 결과(2b-f0nsf/*.npy)의 실제 음역 분포 분석.

학습용 원본/전처리된 WAV·F0·체크포인트는 읽기만 한다.
2a_f0의 1~255 양자화된 값이 아닌 2b-f0nsf의 실제 Hz를 사용한다.
"""
from pathlib import Path
import numpy as np


def inspect_rvc_pitch_coverage(folder):
    """학습 가능한 음성의 음역·유성 비율을 요약하고 추가 녹음 권장사항을 반환한다."""
    root = Path(folder)
    if not root.is_dir() or root.is_symlink():
        raise RuntimeError('RVC 실제 F0(Hz) 결과 폴더가 없습니다')
    paths = sorted(root.glob('*.wav.npy'))
    if not paths:
        raise RuntimeError('RVC F0 추출 결과가 없습니다. 실제 음성 녹음·추출 설정을 확인하세요')
    total = voiced = 0
    bins = np.zeros(128, dtype=np.int64)
    fine_bins = np.zeros(1280, dtype=np.int64)
    for path in paths:
        if path.is_symlink() or not path.is_file() or path.stat().st_size > 128 * 1024 * 1024:
            raise RuntimeError('RVC F0 결과 파일이 안전하지 않습니다: ' + path.name)
        try:
            values = np.load(path, allow_pickle=False, mmap_mode='r')
        except (OSError, ValueError, EOFError) as error:
            raise RuntimeError('RVC F0 결과가 손상됐습니다: ' + path.name) from error
        if values.ndim != 1 or values.size == 0 or values.size > 12_000_000 or values.dtype.kind not in 'fiu':
            raise RuntimeError('RVC F0 배열 구조가 올바르지 않습니다: ' + path.name)
        for at in range(0, values.size, 65536):
            chunk = np.asarray(values[at:at + 65536], dtype=np.float64)
            if not np.all(np.isfinite(chunk)):
                raise RuntimeError('RVC F0 결과에 NaN/Inf가 포함됐습니다: ' + path.name)
            if np.any(chunk < 0):
                raise RuntimeError('RVC F0 결과에 음수 주파수가 있습니다: ' + path.name)
            total += int(chunk.size)
            active = chunk[(chunk >= 50) & (chunk <= 1600)]
            voiced += int(active.size)
            if active.size:
                midi = 69 + 12 * np.log2(active / 440)
                notes = np.clip(np.rint(midi).astype(np.int32), 0, 127)
                bins += np.bincount(notes, minlength=128)
                tenths = np.clip(np.rint(midi * 10).astype(np.int32), 0, 1279)
                fine_bins += np.bincount(tenths, minlength=1280)
    if not voiced or not total:
        raise RuntimeError('RVC F0 추출에 유성 음높이가 없습니다. 학습용 녹음을 확인하세요')
    cumulative = np.cumsum(fine_bins)
    def percentile(p):
        rank = max(1, int(np.ceil(voiced * p)))
        slot = int(np.searchsorted(cumulative, rank, side='left'))
        return 440 * 2 ** ((slot / 10 - 69) / 12)
    p10, p50, p90 = (percentile(p) for p in (.1, .5, .9))
    semitone_count = int(np.count_nonzero(bins))
    recommendations = []
    if p90 < 392:
        recommendations.append('G4 이상 고음 가창 녹음을 추가하면 고음 음역 학습에 도움이 됩니다.')
    if p10 > 196:
        recommendations.append('G3 이하 저음 가창 녹음을 추가하면 저음 음역 학습에 도움이 됩니다.')
    if voiced / total < .25:
        recommendations.append('유성 구간이 적습니다. 실제 노래하는 음성 녹음 비중을 확인하세요.')
    if semitone_count < 10:
        recommendations.append('음높이 종류가 적습니다. 여러 음정으로 부른 녹음을 추가하세요.')
    return {
        'files': len(paths), 'frames': total, 'voiced_frames': voiced,
        'voiced_ratio': round(voiced / total, 5),
        'pitch_hz_p10': round(p10, 2), 'pitch_hz_median': round(p50, 2),
        'pitch_hz_p90': round(p90, 2), 'distinct_semitones': semitone_count,
        'recommendations': recommendations,
    }
