#!/usr/bin/env python3
"""Offline inference using an already installed local MusicGen model.

No downloads, network APIs, implicit training, or automatic model installation.
This file is embedded into the MYVOCAL Windows EXE and run by a user-selected
local Python with torch + transformers installed. Output is an actual PCM WAV.
"""
import argparse
import math
import os
import pathlib
import struct
import sys
import wave


def check_arguments(args):
    model = pathlib.Path(args.model_dir)
    if not model.is_absolute() or not model.is_dir() or not (model / 'config.json').is_file():
        raise ValueError('MusicGen 로컬 모델 폴더에 config.json이 없습니다')
    if not 3 <= args.seconds <= 28 or len(args.prompt.strip()) < 2 or len(args.prompt) > 600:
        raise ValueError('MusicGen 생성 요청: 3~28초, 2~600자 프롬프트가 필요합니다')
    if not 0 <= args.seed <= 2147483647:
        raise ValueError('시드 범위가 올바르지 않습니다')
    if not pathlib.Path(args.output).is_absolute():
        raise ValueError('출력 WAV 절대 경로가 필요합니다')
    if getattr(args,'audio_prompt',None):
        path=pathlib.Path(args.audio_prompt)
        if not path.is_absolute() or not path.is_file():
            raise ValueError('연속 생성 원본 WAV 경로가 유효하지 않습니다')
        if args.seconds>20:
            raise ValueError('연속 MusicGen 추론은 최대 20초입니다')
    return model


def load_prompt_pcm(path):
    """Input is a locally created short 16-bit PCM WAV, never a remote URL."""
    with wave.open(str(path), 'rb') as reader:
        channels=reader.getnchannels()
        rate=reader.getframerate()
        width=reader.getsampwidth()
        count=reader.getnframes()
        if channels not in (1,2) or width!=2 or not 3*rate<=count<=8*rate:
            raise ValueError('연속 MusicGen 원본은 3~8초 PCM WAV여야 합니다')
        frame=reader.readframes(count)
    if len(frame)!=count*channels*2:
        raise ValueError('MusicGen 연결 WAV가 잘렸습니다')
    return frame,rate,channels,count


def write_pcm_wave(path, audio, rate):
    """Write mono/stereo float channels; reject empty, NaN and invalid layouts."""
    if not isinstance(rate, int) or not 8000 <= rate <= 96000 or not isinstance(audio, (list, tuple)):
        raise ValueError('모델 오디오 레이트 또는 채널이 올바르지 않습니다')
    if not 1 <= len(audio) <= 2 or not all(isinstance(c, (list, tuple)) for c in audio):
        raise ValueError('MusicGen 오디오 채널 형식 오류')
    n = len(audio[0])
    if n < rate or n > 30 * rate or any(len(c) != n for c in audio):
        raise ValueError('모델 오디오 길이 또는 채널 길이 오류')
    out = pathlib.Path(path)
    with wave.open(str(out), 'wb') as wav:
        wav.setnchannels(len(audio))
        wav.setsampwidth(2)
        wav.setframerate(rate)
        block = bytearray(n * len(audio) * 2)
        offset = 0
        for i in range(n):
            for channel in audio:
                v = float(channel[i])
                if not math.isfinite(v):
                    raise ValueError('모델 오디오에 NaN/Inf가 포함되어 있습니다')
                v = max(-1., min(1., v))
                struct.pack_into('<h', block, offset, max(-32768, min(32767, round(v * 32767))))
                offset += 2
        wav.writeframes(block)
    return out.stat().st_size


def generate(args):
    model_path = check_arguments(args)
    # Explicit offline mode prevents HF libraries from fetching unspecified data.
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TRANSFORMERS_OFFLINE'] = '1'
    import torch
    from transformers import AutoProcessor, MusicgenForConditionalGeneration
    torch.manual_seed(args.seed)
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    processor = AutoProcessor.from_pretrained(str(model_path), local_files_only=True, trust_remote_code=False)
    model = MusicgenForConditionalGeneration.from_pretrained(str(model_path), local_files_only=True, trust_remote_code=False).to(device)
    model.eval()
    prompt_frames=0
    if args.audio_prompt:
        import numpy as np
        raw,source_rate,channels,prompt_frames=load_prompt_pcm(args.audio_prompt)
        if source_rate!=int(model.config.audio_encoder.sampling_rate):
            raise ValueError('연속 생성 오디오 레이트가 로컬 MusicGen 모델과 다릅니다')
        pcm=np.frombuffer(raw,dtype='<i2').astype('float32').reshape((-1,channels))
        # Processor audio prompting uses one mono reference waveform.
        mono=pcm.mean(axis=1)/32768.0
        inputs=processor(text=[args.prompt], audio=mono, sampling_rate=source_rate,padding=True,return_tensors='pt')
    else:
        inputs=processor(text=[args.prompt], padding=True, return_tensors='pt')
    inputs = {k: v.to(device) for k,v in inputs.items()}
    # MusicGen uses 50 audio tokens/s and its native model limit is ~30 s.
    with torch.inference_mode():
        samples = model.generate(**inputs, do_sample=True, guidance_scale=3, max_new_tokens=args.seconds * 50)
    rate = int(model.config.audio_encoder.sampling_rate)
    if samples.ndim != 3 or samples.shape[0] != 1 or samples.shape[1] not in (1,2):
        raise ValueError('MusicGen 오디오 출력이 지원 형식이 아닙니다')
    result=samples[0].detach().cpu().float()
    if args.audio_prompt:
        # MusicGen returns prompt+newly generated audio. Never report the old
        # prompt as newly generated music. Reject short or incompatible output.
        new_frames=args.seconds*rate
        if result.shape[-1] < prompt_frames+new_frames-rate:
            raise ValueError('MusicGen 연속 생성 출력이 요청보다 짧습니다')
        result=result[:,-new_frames:]
    arrays=result.tolist()
    write_pcm_wave(args.output, arrays, rate)


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--model-dir', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--prompt', required=True)
    parser.add_argument('--seconds', type=int, required=True)
    parser.add_argument('--seed', type=int, required=True)
    parser.add_argument('--audio-prompt', default=None)
    args = parser.parse_args(argv)
    try:
        generate(args)
    except Exception as exc:
        print('MusicGen 로컬 추론 실패: ' + str(exc)[:300], file=sys.stderr)
        return 1
    return 0

if __name__ == '__main__':
    raise SystemExit(main())