#!/usr/bin/env python3
"""Add up-to-360s local MusicGen sequence inference to existing MYVOCAL source.

No stand-alone app, no destructive changes, no fake inference. Modifies the
existing native-EXE React UI and actual per-segment MusicGen generation logic.
"""
from apply_official_rvc_to_existing_main import replace_once


def patch_sequence(s, p):
    changes = [
        ('export const MAX_SEQUENCE_SEGMENTS=8;', 'export const MAX_SEQUENCE_SEGMENTS=20;'),
        ('export const MAX_SEQUENCE_BYTES=64*1024*1024;', 'export const MAX_SEQUENCE_BYTES=160*1024*1024;'),
        ('waves.length>MAX_SEQUENCE_SEGMENTS', 'waves.length>MAX_SEQUENCE_SEGMENTS'),
        ("throw Error('긴 반주 결합 조건(구간 2~8개, 크로스페이드 0.1~1.5초)이 올바르지 않습니다.');",
         "throw Error('긴 반주 결합 조건(구간 2~20개, 크로스페이드 0.1~1.5초)이 올바르지 않습니다.');"),
        ('frames/rate>240', 'frames/rate>360'),
        ("throw Error('완성 반주 길이 또는 WAV 용량이 240초/64MiB를 초과합니다.');",
         "throw Error('완성 반주 길이 또는 WAV 용량이 360초/160MiB를 초과합니다.');"),
        ('{maxDurationSec:240}', '{maxDurationSec:360}'),
        ("throw Error('긴 반주는 2~8구간이어야 합니다.');", "throw Error('긴 반주는 2~20구간이어야 합니다.');"),
    ]
    for old,new in changes:
        if old != new:
            s=replace_once(s,old,new,p)
    anchor=" if(!Number.isInteger(settings.seed)||settings.seed+segments-1>2147483647)throw Error('랜덤 시드 범위가 초과됐습니다.');"
    inserted=""" // Estimate duration BEFORE consuming any GPU inference or changing the project.
 const projectedSeconds=segments*settings.seconds-(segments-1)*crossfadeSec;
 if(projectedSeconds>360+1e-9)throw Error('긴 반주 예상 길이가 360초를 초과합니다. 구간 수나 길이를 줄이세요.');
"""
    s=replace_once(s,anchor,anchor+'\n'+inserted,p)
    return s


def patch_panel(s,p):
    s=replace_once(s,'연속 구간 수 (2~8)', '연속 구간 수 (2~20)',p)
    s=replace_once(s,'min="2" max="8" value={segments}', 'min="2" max="20" value={segments}',p)
    anchor='    <p className="muted">길이 설정은 구간 하나당 초이며, 긴 반주는 구간별 독립적인 AI 오디오를 이어 붙입니다.'
    s=replace_once(s,anchor,
        '    {sequence&&<p className="muted">예상 완성 길이: {Number.isFinite(Number(segments)*Number(seconds)-(Number(segments)-1)*Number(fade)) ? Math.max(0,Number(segments)*Number(seconds)-(Number(segments)-1)*Number(fade)).toFixed(1) : "계산 불가"}초 / 최대 360초. 실제 MusicGen 연속 생성은 설치된 모델에 따라 음악적 일관성이 달라집니다.</p>}\n'+anchor,p)
    return s

if __name__=='__main__':
    print('기존 main 통합 적용기에서 patch_sequence/patch_panel 함수를 호출하세요.')
