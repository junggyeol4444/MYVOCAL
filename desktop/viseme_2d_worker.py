#!/usr/bin/env python3
"""MYVOCAL native offline 2D Korean viseme animation -> real WebM.

Uses user-owned image + vocal WAV + existing lyric alignment; not a neural
identity-lock, automatic 3D rig, or facial reenactment model. Original assets
are read-only. A new output is created exclusively after successful encoding.
"""
import argparse
import bisect
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unicodedata

import numpy as np
import soundfile as sf
from PIL import Image, ImageDraw, ImageOps

MAX_SECONDS = 360
MAX_CUES = 400
MAX_IMAGE = 12 * 1024 * 1024
MAX_AUDIO = 90 * 1024 * 1024
MOUTH_VOWELS = {
    'a': {0, 1, 2, 3, 4, 5},        # ㅏ ㅐ ㅑ ㅒ ㅓ ㅔ
    'o': {8, 9, 10, 11, 12},           # ㅗ ㅘ ㅙ ㅚ
    'u': {13, 14, 15, 16, 17},     # ㅜ ㅝ ㅞ ㅟ ㅠ
    'i': {6, 7, 20},               # ㅕ ㅖ ㅣ
    'eu': {18, 19},                # ㅡ ㅢ
}


def validate_cues(document):
    if not isinstance(document, dict) or document.get('format') != 'MYVOCAL_LYRIC_ALIGNMENT' or document.get('version') != 1:
        raise ValueError('기존 MYVOCAL 가사·MIDI 싱크 JSON이 필요합니다')
    cues = document.get('cues')
    if not isinstance(cues, list) or not 1 <= len(cues) <= MAX_CUES:
        raise ValueError('가사 싱크 구간은 1~400개여야 합니다')
    normalized = []
    previous = -1.0
    for cue in cues:
        if not isinstance(cue, dict):
            raise ValueError('가사 싱크 구간 형식 오류')
        a, b, lyric = cue.get('startSec'), cue.get('endSec'), cue.get('lyric')
        if not all(isinstance(x, (float, int)) and not isinstance(x, bool) and math.isfinite(x) for x in (a, b)):
            raise ValueError('가사 싱크 시간이 숫자가 아닙니다')
        if not (0 <= a < b <= MAX_SECONDS and a >= previous and b - a >= .05):
            raise ValueError('가사 싱크 구간의 시간·순서가 올바르지 않습니다')
        if not isinstance(lyric, str) or len(lyric) > 100 or any(unicodedata.category(c) == 'Cc' for c in lyric):
            raise ValueError('가사 문자가 올바르지 않습니다')
        normalized.append((float(a), float(b), lyric))
        previous = a
    return normalized


def vowel_shape(letter):
    if not letter or letter in ('—', '-'):
        return 'closed'
    code = ord(letter[0])
    if 0xAC00 <= code <= 0xD7A3:
        medial = ((code - 0xAC00) % 588) // 28
        for shape, indices in MOUTH_VOWELS.items():
            if medial in indices:
                return shape
        return 'a'
    if letter.lower() in 'ae':
        return 'a'
    if letter.lower() in 'ou':
        return 'o'
    if letter.lower() in 'iy':
        return 'i'
    return 'closed'


def mouth_at(cues, starts, t):
    index = bisect.bisect_right(starts, t) - 1
    if index < 0:
        return 'closed'
    a, b, lyric = cues[index]
    if t >= b:
        return 'closed'
    letters = [c for c in lyric if c.isalnum()]
    if not letters:
        return 'closed'
    # Preserve syllable order for multi-character cues.
    part = (t - a) / (b - a) * len(letters)
    letter_index = min(len(letters)-1, int(part))
    phase = part - letter_index
    if phase < .16 or phase > .92:
        return 'closed'
    return vowel_shape(letters[letter_index])


def make_frame(base, shape, x, y, width):
    frame = base.copy()
    draw = ImageDraw.Draw(frame, 'RGBA')
    cx, cy, mw = round(x * frame.width), round(y * frame.height), max(8, round(width * frame.width))
    mh = max(4, round(mw * .38))
    if shape == 'closed':
        draw.arc((cx-mw//2, cy-mh//3, cx+mw//2, cy+mh//3), 5, 175, fill=(65, 20, 35, 245), width=max(2,mw//13))
    elif shape == 'i':
        draw.rounded_rectangle((cx-mw//2,cy-mh//4,cx+mw//2,cy+mh//4),radius=max(2,mh//5),fill=(75,15,30,225),outline=(130,48,58,255),width=2)
    elif shape == 'o':
        r=max(5,mw//4)
        draw.ellipse((cx-r,cy-r,cx+r,cy+r),fill=(70,10,30,235),outline=(155,55,65,255),width=max(2,mw//20))
    elif shape == 'u':
        draw.ellipse((cx-mw//4,cy-mh//2,cx+mw//4,cy+mh//2),fill=(65,12,32,235),outline=(155,55,65,255),width=2)
    elif shape == 'eu':
        draw.rounded_rectangle((cx-mw//2,cy-mh//5,cx+mw//2,cy+mh//5),radius=max(2,mh//6),fill=(60,12,30,235),outline=(155,55,65,255),width=2)
    else: # 'a' broad open mouth
        draw.ellipse((cx-mw//2,cy-mh,cx+mw//2,cy+mh),fill=(65,10,28,245),outline=(155,55,65,255),width=max(2,mw//20))
    return frame


def build_shot_starts(cues, duration):
    """Use actual lyric starts as scene boundaries rather than invented timestamps."""
    boundaries = [0.0]
    candidates = sorted({float(c[0]) for c in cues if float(c[0]) > 0})
    for start in candidates:
        if start - boundaries[-1] >= 4.0 and duration - start >= 1.0:
            boundaries.append(start)
    return boundaries


def scene_camera(base, time_sec, mode, cue_starts, fps):
    """Render bounded, deterministic 2D storyboard motion from existing cue times.

    No new identity is invented: the same user-owned portrait is reused in
    every shot. Changes at lyric-aligned scene boundaries are hard cuts.
    """
    if mode == 'static':
        return base
    # Candidate shot boundaries come from actual project lyric-alignment starts.
    # Cutting on the next lyric keeps changes synchronized with the song.
    shot = max(0, bisect.bisect_right(cue_starts, max(0.0,time_sec)) - 1)
    t = max(0., time_sec - cue_starts[shot])
    shot_duration = cue_starts[shot+1] - cue_starts[shot] if shot + 1 < len(cue_starts) else 4.0
    progress = min(1.0, t / max(1.0, shot_duration))
    if mode == 'performance':
        amount = .018
        offset = math.sin(2 * math.pi * progress) * .012
    elif mode == 'story':
        amount = .095 + .035 * progress
        offset = (progress - .5) * (.045 if shot % 2 else -.045)
    elif mode == 'mixed':
        amount = (.018 if shot % 2 else .075) + .018 * progress
        offset = math.sin(progress * math.pi) * (.04 if shot % 2 else -.04)
    else:
        raise ValueError('2D 장면 모드는 static/performance/story/mixed만 허용됩니다')
    scale = 1 + amount
    extent = max(1, round(base.width / scale))
    max_off = (base.width - extent) // 2
    x = max(0, min(base.width - extent, round(max_off + offset * base.width)))
    y = max(0, min(base.height - extent, round(max_off * (.8 if shot % 2 else 1.2))))
    return base.crop((x, y, x + extent, y + extent)).resize(base.size, Image.Resampling.BICUBIC)


def render(image_path, audio_path, alignment_path, output_path, *, python_ffmpeg='ffmpeg', x=.5, y=.72, mouth_width=.12, fps=12, size=512, soundtrack_path=None, scene_mode='static'):
    src_image = Path(image_path).resolve(strict=True)
    src_audio = Path(audio_path).resolve(strict=True)
    src_align = Path(alignment_path).resolve(strict=True)
    src_soundtrack = Path(soundtrack_path).resolve(strict=True) if soundtrack_path else src_audio
    if scene_mode not in ('static','performance','story','mixed'):
        raise ValueError('2D 장면 모드가 올바르지 않습니다')
    dest = Path(output_path)
    if not dest.is_absolute() or dest.suffix.lower() != '.webm' or dest.exists() or dest.is_symlink():
        raise ValueError('새 WebM 절대 경로가 필요합니다 (기존 파일 덮어쓰기 금지)')
    if any(not math.isfinite(z) for z in (x,y,mouth_width)) or not (.1 <= x <= .9 and .1 <= y <= .9 and .03 <= mouth_width <= .30):
        raise ValueError('입 위치는 화면 비율 0.1~0.9, 입 너비 0.03~0.30이어야 합니다')
    if fps not in (12, 24) or size not in (512, 720):
        raise ValueError('영상은 12/24fps, 512/720px만 지원합니다')
    if src_image.suffix.lower() not in ('.png','.jpg','.jpeg') or src_image.stat().st_size > MAX_IMAGE:
        raise ValueError('12MB 이하의 PNG/JPEG 캐릭터 이미지가 필요합니다')
    if src_audio.suffix.lower() != '.wav' or src_audio.stat().st_size > MAX_AUDIO:
        raise ValueError('90MB 이하의 보컬 PCM WAV가 필요합니다')
    if src_soundtrack.suffix.lower() != '.wav' or src_soundtrack.stat().st_size > MAX_AUDIO or src_soundtrack.is_symlink():
        raise ValueError('음악 전체 WAV는 90MB 이하의 PCM WAV여야 합니다')
    if src_align.stat().st_size > 1024*1024:
        raise ValueError('가사 싱크 JSON은 1MB 이하여야 합니다')
    cues = validate_cues(json.loads(src_align.read_text(encoding='utf-8')))
    info = sf.info(str(src_audio))
    if info.channels not in (1,2) or not 16000 <= info.samplerate <= 96000 or not .2 <= info.duration <= MAX_SECONDS:
        raise ValueError('WAV는 모노/스테레오, 16~96kHz, 0.2~360초여야 합니다')
    music_info = sf.info(str(src_soundtrack))
    if music_info.channels not in (1, 2) or not 16000 <= music_info.samplerate <= 96000 or not .2 <= music_info.duration <= MAX_SECONDS:
        raise ValueError('완성 음악 WAV의 채널·길이·샘플레이트가 올바르지 않습니다')
    if abs(music_info.duration - info.duration) > .08:
        raise ValueError('보컬 WAV와 완성 음악 WAV의 길이가 0.08초 이상 다릅니다')
    if cues[-1][1] > info.duration + .05:
        raise ValueError('가사 싱크가 실제 보컬 WAV 길이를 초과했습니다')
    audio, rate = sf.read(str(src_audio), dtype='float32', always_2d=True)
    if not np.isfinite(audio).all():
        raise ValueError('보컬 WAV에 비정상 샘플이 있습니다')
    mono = audio.mean(axis=1)
    # Robust per-song noise gate: true silence closes the mouth, with a low floor.
    global_rms = float(np.sqrt(np.mean(mono * mono)))
    if global_rms < .0015:
        raise ValueError('보컬 WAV가 무음이거나 소리가 너무 작습니다')
    gate = max(.0015, global_rms * .055)
    with Image.open(src_image) as im:
        if im.width * im.height > 16_000_000:
            raise ValueError('이미지 해상도는 1600만 픽셀 이하여야 합니다')
        base = ImageOps.pad(im.convert('RGB'), (size,size), method=Image.Resampling.LANCZOS, color=(10,10,10))
    executable = shutil.which(python_ffmpeg) if not Path(python_ffmpeg).is_absolute() else python_ffmpeg
    if not executable or not Path(executable).is_file():
        raise ValueError('설치된 FFmpeg 실행 파일을 찾지 못했습니다')
    starts = [c[0] for c in cues]
    shots = build_shot_starts(cues, info.duration)
    nframes = math.ceil(info.duration * fps)
    # Encode to a random, private temporary path. Never write to the user's output
    # until the complete video passes checks. A pre-existing output is untouched.
    with tempfile.TemporaryDirectory(prefix='myvocal-viseme-', dir=str(dest.parent)) as work:
        temp_video = Path(work) / 'render.webm'
        command = [str(executable),'-hide_banner','-loglevel','error','-nostdin','-y',
                   '-f','rawvideo','-pix_fmt','rgb24','-s',f'{size}x{size}','-r',str(fps),'-i','pipe:0',
                   '-i',str(src_soundtrack),'-map','0:v:0','-map','1:a:0',
                   '-c:v','libvpx','-deadline','realtime','-cpu-used','8','-b:v','650k',
                   '-c:a','libopus','-b:a','96k','-shortest','-f','webm',str(temp_video)]
        process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        try:
            for i in range(nframes):
                t = (i+.5)/fps
                shape = mouth_at(cues, starts, t)
                a = max(0,round((t-.025)*rate));b = min(len(mono),round((t+.025)*rate))
                if b <= a or float(np.sqrt(np.mean(mono[a:b]**2))) < gate:
                    shape = 'closed'
                image_frame = scene_camera(make_frame(base,shape,x,y,mouth_width), t, scene_mode, shots, fps)
                process.stdin.write(image_frame.tobytes())
            process.stdin.close()
            process.stdin = None
            _, err = process.communicate(timeout=max(90, int(info.duration*5)))
        except BaseException:
            if process.poll() is None:
                process.kill()
            process.communicate()
            raise
        if process.returncode != 0:
            raise RuntimeError('FFmpeg WebM 렌더링 실패: ' + err.decode('utf-8','replace')[-600:])
        if not temp_video.is_file() or temp_video.stat().st_size < 1000:
            raise RuntimeError('실제 WebM 결과가 생성되지 않았습니다')
        with temp_video.open('rb') as check:
            if check.read(4) != b'\x1aE\xdf\xa3':
                raise RuntimeError('WebM 파일 형식 오류')
        # Exclusive-create after all checks. Only remove a file created by us.
        created = False
        try:
            with dest.open('xb') as target, temp_video.open('rb') as source:
                created = True
                shutil.copyfileobj(source,target,1024*1024)
        except BaseException:
            if created:
                dest.unlink(missing_ok=True)
            raise
    print(f'한국어 가사·보컬 MIDI 싱크 2D 립싱크 WebM 생성: {nframes}프레임, {fps}fps, {info.duration:.2f}초',flush=True)
    return {'frames':nframes,'duration':info.duration,'size':dest.stat().st_size}


def main():
    p=argparse.ArgumentParser()
    for n in ('image','audio','alignment','output'):
        p.add_argument('--'+n,required=True)
    p.add_argument('--ffmpeg',default='ffmpeg')
    p.add_argument('--x',type=float,default=.5)
    p.add_argument('--y',type=float,default=.72)
    p.add_argument('--mouth-width',type=float,default=.12)
    p.add_argument('--fps',type=int,default=12)
    p.add_argument('--size',type=int,default=512)
    p.add_argument('--soundtrack',default='')
    p.add_argument('--scene-mode',choices=('static','performance','story','mixed'),default='static')
    args=p.parse_args()
    try:
        render(args.image,args.audio,args.alignment,args.output,python_ffmpeg=args.ffmpeg,x=args.x,y=args.y,mouth_width=args.mouth_width,fps=args.fps,size=args.size,soundtrack_path=args.soundtrack or None,scene_mode=args.scene_mode)
        return 0
    except (OSError,ValueError,RuntimeError,ImportError,subprocess.TimeoutExpired,json.JSONDecodeError) as e:
        print('2D 가사·립싱크 렌더링 실패: '+str(e)[:800],file=sys.stderr,flush=True)
        return 1

if __name__=='__main__':
    raise SystemExit(main())
