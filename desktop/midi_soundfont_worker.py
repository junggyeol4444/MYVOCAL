#!/usr/bin/env python3
"""Offline MIDI -> actual SoundFont PCM rendering via installed libFluidSynth.

A user-supplied, licensed SoundFont and local shared library are required.
Input MIDI/SoundFont are read-only; output is created exclusively in a job folder.
This is sample synthesis, NOT neural composition or singing synthesis.
"""
import argparse
import ctypes as C
import math
import os
import re
from pathlib import Path
import sys
import wave


def _api(lib, name, result, *args):
    func = getattr(lib, name)
    func.restype = result
    func.argtypes = list(args)
    return func


def render(args):
    import pretty_midi
    midi_path = Path(args.input).resolve(strict=True)
    soundfont = Path(args.soundfont).resolve(strict=True)
    library = Path(args.library).resolve(strict=True)
    output = Path(args.output)
    if not midi_path.is_file() or midi_path.suffix.lower() not in ('.mid', '.midi') or midi_path.stat().st_size > 4*1024*1024:
        raise ValueError('MIDI 파일 경로 또는 크기가 올바르지 않습니다')
    if not soundfont.is_file() or soundfont.suffix.lower() not in ('.sf2', '.sf3') or soundfont.stat().st_size > 2*1024**3:
        raise ValueError('로컬 SoundFont SF2/SF3 파일이 올바르지 않습니다')
    if not library.is_file() or not re.search(r'(?:\.dll|\.dylib|\.so(?:\.\d+)*)$', library.name, re.I):
        raise ValueError('설치된 FluidSynth 라이브러리 경로가 올바르지 않습니다')
    if not output.is_absolute() or output.exists() or output.is_symlink() or output.suffix.lower() != '.wav':
        raise ValueError('새 WAV 출력 경로가 올바르지 않습니다 (기존 파일 덮어쓰기 금지)')
    if args.rate not in (44100, 48000):
        raise ValueError('샘플레이트는 44100/48000Hz만 허용합니다')
    if not math.isfinite(args.gain) or not .01 <= args.gain <= 1:
        raise ValueError('합성 음량은 0.01~1 범위여야 합니다')
    midi = pretty_midi.PrettyMIDI(str(midi_path))
    instruments = [x for x in midi.instruments if x.notes]
    if not instruments or len(instruments) > 16 or sum(len(x.notes) for x in instruments) > 12000:
        raise ValueError('MIDI 악기(1~16개) 또는 음표(최대 12000개)를 확인하세요')
    if sum(x.is_drum for x in instruments) > 1 or sum(not x.is_drum for x in instruments) > 15:
        raise ValueError('드럼은 1트랙, 일반 악기는 15트랙까지 지원합니다')
    end = max(note.end for ins in instruments for note in ins.notes)
    if not .02 <= end <= 360:
        raise ValueError('MIDI 길이는 0.02~360초여야 합니다')
    # No implicit model download; the user selects both local assets.
    # On Windows the installed DLL may depend on sibling libsndfile/glib DLLs.
    # Add only the user-selected FluidSynth installation directory for this process.
    dll_dir = os.add_dll_directory(str(library.parent)) if os.name == 'nt' and hasattr(os, 'add_dll_directory') else None
    try:
        lib = C.CDLL(str(library))
    except Exception:
        if dll_dir:
            dll_dir.close()
        raise
    ptr, integer, real, string = C.c_void_p, C.c_int, C.c_double, C.c_char_p
    new_settings = _api(lib, 'new_fluid_settings', ptr)
    settings_num = _api(lib, 'fluid_settings_setnum', integer, ptr, string, real)
    settings_int = _api(lib, 'fluid_settings_setint', integer, ptr, string, integer)
    new_synth = _api(lib, 'new_fluid_synth', ptr, ptr)
    load_sf = _api(lib, 'fluid_synth_sfload', integer, ptr, string, integer)
    program = _api(lib, 'fluid_synth_program_select', integer, ptr, integer, integer, integer, integer)
    on = _api(lib, 'fluid_synth_noteon', integer, ptr, integer, integer, integer)
    off = _api(lib, 'fluid_synth_noteoff', integer, ptr, integer, integer)
    write = _api(lib, 'fluid_synth_write_s16', integer, ptr, integer, ptr, integer, integer, ptr, integer, integer)
    delete_synth = _api(lib, 'delete_fluid_synth', None, ptr)
    delete_settings = _api(lib, 'delete_fluid_settings', None, ptr)
    settings = new_settings()
    if not settings:
        raise RuntimeError('FluidSynth 설정 생성 실패')
    synth = None
    try:
        settings_num(settings, b'synth.sample-rate', args.rate)
        settings_num(settings, b'synth.gain', args.gain)
        settings_int(settings, b'synth.reverb.active', 0)
        settings_int(settings, b'synth.chorus.active', 0)
        synth = new_synth(settings)
        if not synth:
            raise RuntimeError('FluidSynth 합성기 초기화 실패')
        sfid = load_sf(synth, os.fsencode(soundfont), 1)
        if sfid < 0:
            raise RuntimeError('SoundFont를 로드할 수 없습니다')
        melodic = 0
        events = []
        for ins in instruments:
            channel = 9 if ins.is_drum else melodic
            if not ins.is_drum:
                melodic += 1
                if melodic == 9:
                    melodic += 1
            bank = 128 if ins.is_drum else 0
            if program(synth, channel, sfid, bank, int(ins.program)) != 0:
                raise RuntimeError('SoundFont 악기 프리셋을 선택하지 못했습니다')
            for note in ins.notes:
                if not (0 <= note.pitch <= 127 and 1 <= note.velocity <= 127 and
                        math.isfinite(note.start) and math.isfinite(note.end) and
                        0 <= note.start < note.end <= 360):
                    raise ValueError('MIDI 음표 시간·음높이·세기가 올바르지 않습니다')
                events.append((round(note.start*args.rate), 1, channel, note.pitch, note.velocity))
                events.append((round(note.end*args.rate), 0, channel, note.pitch, 0))
        events.sort(key=lambda e: (e[0], e[1]))  # note-off before note-on
        last = min(round((end+1)*args.rate), round(360*args.rate))
        with output.open('xb') as stream:
            with wave.open(stream, 'wb') as wav:
                wav.setnchannels(2)
                wav.setsampwidth(2)
                wav.setframerate(args.rate)
                pos = 0
                idx = 0
                while pos < last:
                    while idx < len(events) and events[idx][0] <= pos:
                        _, kind, channel, pitch, velocity = events[idx]
                        rc = on(synth, channel, pitch, velocity) if kind else off(synth, channel, pitch)
                        if rc != 0 and not (channel == 9 and kind == 0):
                            raise RuntimeError(f'FluidSynth 음표 합성 실패 channel={channel} kind={kind} pitch={pitch} rc={rc}')
                        idx += 1
                    until = min(last, pos+2048, events[idx][0] if idx < len(events) else last)
                    if until <= pos:
                        raise RuntimeError('MIDI 음표 시간축 처리 오류')
                    count = until-pos
                    buf = (C.c_int16 * (count*2))()
                    if write(synth, count, C.cast(buf, ptr), 0, 2, C.cast(buf, ptr), 1, 2) != 0:
                        raise RuntimeError('FluidSynth PCM 합성 실패')
                    wav.writeframesraw(bytes(buf))
                    pos = until
    except BaseException:
        output.unlink(missing_ok=True)
        raise
    finally:
        if synth:
            delete_synth(synth)
        delete_settings(settings)
        if dll_dir:
            dll_dir.close()
    with wave.open(str(output), 'rb') as result:
        if (result.getnchannels(), result.getsampwidth(), result.getframerate()) != (2, 2, args.rate) or result.getnframes() < 100:
            output.unlink(missing_ok=True)
            raise RuntimeError('SoundFont PCM 출력 WAV 형식 오류')
    print(f'MYVOCAL 실제 SoundFont PCM 렌더링: {len(instruments)}개 악기 / {len(events)//2}개 음표', flush=True)


def main():
    parser = argparse.ArgumentParser()
    for name in ('input', 'output', 'soundfont', 'library'):
        parser.add_argument('--'+name, required=True)
    parser.add_argument('--rate', type=int, default=44100)
    parser.add_argument('--gain', type=float, default=.2)
    args = parser.parse_args()
    try:
        render(args)
        return 0
    except (OSError, ValueError, RuntimeError, ImportError, wave.Error) as exc:
        print('SoundFont 합성 실패: '+str(exc)[:450], file=sys.stderr, flush=True)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
