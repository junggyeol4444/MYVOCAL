#!/usr/bin/env python3
"""Extend existing Demucs integration to real 4/6-stem local inference.

Only changes the cumulative candidate files; does not touch recordings.
"""
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def once(s,old,new,path):
    if s.count(old)!=1:raise ValueError(f'{path}: expected one matching anchor, got {s.count(old)}: {old[:80]}')
    return s.replace(old,new,1)

def update():
    p=ROOT/'desktop/music_stems_worker.py';s=p.read_text()
    s=once(s,"STEMS = ('drums', 'bass', 'other', 'vocals')","STEMS = ('drums', 'bass', 'other', 'vocals')\nEXTRA_STEMS = ('guitar', 'piano')",str(p))
    s=once(s,'    frames = None\n    for name in STEMS:', '''    extras = {p.name for p in base.glob('*.wav')} - {s + '.wav' for s in STEMS}
    if extras == {s + '.wav' for s in EXTRA_STEMS}:
        names = STEMS + EXTRA_STEMS
    elif extras:
        raise RuntimeError('Demucs 신경망 출력은 정확한 4개 또는 6개 stem이어야 합니다')
    else:
        names = STEMS
    frames = None
    for name in names:''',str(p))
    s=once(s,'''    # Reject incompatible 6-stem models rather than silently discarding guitar/piano.
    extras = {p.name for p in base.glob('*.wav')} - {s + '.wav' for s in STEMS}
    if extras:
        raise RuntimeError('선택한 Demucs 모델은 정확한 4-stem 모델이 아닙니다')
    print('[MYVOCAL] 신경망 4트랙 생성 및 WAV 형식 검사 완료 (분리 품질은 별도 검증)', flush=True)''',
    "    print(f'[MYVOCAL] 신경망 {len(names)}트랙 생성 및 WAV 형식 검사 완료 (분리 품질은 별도 검증)', flush=True)",str(p))
    p.write_text(s)

    p=ROOT/'desktop/music_stems.go';s=p.read_text()
    s=once(s,'const maxStemResponse = 300 << 20','const maxStemResponse = 450 << 20',str(p))
    s=once(s,'var stemNames = []string{"drums", "bass", "other", "vocals"}',
      'var stemNames = []string{"drums", "bass", "other", "vocals"}\nvar stemExtras = []string{"guitar", "piano"}',str(p))
    s=once(s,'''items := make([]item, 0, 4)
	var expected int64 = -1
	for _, name := range stemNames {''',
    '''names := append([]string(nil), stemNames...)
    guitar, gErr := os.Lstat(filepath.Join(base, "guitar.wav"))
    piano, pErr := os.Lstat(filepath.Join(base, "piano.wav"))
    if gErr == nil && pErr == nil && guitar.Mode().IsRegular() && piano.Mode().IsRegular() {
        names = append(names, stemExtras...)
    } else if gErr == nil || pErr == nil {
        return errors.New("Demucs 6트랙 출력 중 기타 또는 피아노 WAV가 누락됐습니다")
    }
    entries, err := os.ReadDir(base)
    if err != nil { return err }
    for _, entry := range entries {
        if !strings.HasSuffix(strings.ToLower(entry.Name()), ".wav") { continue }
        found := false
        for _, name := range names { if entry.Name() == name+".wav" { found=true;break } }
        if !found { return errors.New("Demucs 출력에 알 수 없는 추가 WAV가 있습니다") }
    }
    items := make([]item, 0, len(names))
	var expected int64 = -1
	for _, name := range names {''',str(p))
    s=once(s,'}{"MYVOCAL_NEURAL_STEMS", 1, "Demucs", model, stemNames, expected, 44100, 2, 16}',
      '}{"MYVOCAL_NEURAL_STEMS", 1, "Demucs", model, names, expected, 44100, 2, 16}',str(p))
    p.write_text(s)

    p=ROOT/'MYVOCAL-Studio-source/src/lib/musicStemZip.js';s=p.read_text()
    s=once(s,"const STEMS=['drums','bass','other','vocals'];",
      "const FOUR=['drums','bass','other','vocals'];\nconst SIX=[...FOUR,'guitar','piano'];",str(p))
    s=once(s,'300*1024*1024','450*1024*1024',str(p))
    s=once(s,''' if(read16(v,end+4)||read16(v,end+6)||read16(v,end+8)!==5||read16(v,end+10)!==5)throw Error('분리 ZIP은 정확히 4개 WAV와 manifest만 포함해야 합니다.');''',
    ''' const count=read16(v,end+10);
 if(read16(v,end+4)||read16(v,end+6)||![5,7].includes(count)||read16(v,end+8)!==count)throw Error('분리 ZIP은 정확히 4개 또는 6개 WAV와 manifest만 포함해야 합니다.');''',str(p))
    s=once(s,'for(let i=0;i<5;i++){','for(let i=0;i<count;i++){',str(p))
    s=once(s,"...STEMS.map(s=>`stems/${s}.wav`)","...SIX.map(s=>`stems/${s}.wav`)",str(p))
    s=once(s,''' if(manifest?.format!=='MYVOCAL_NEURAL_STEMS'||manifest.version!==1||manifest.engine!=='Demucs'||manifest.sampleRate!==44100||manifest.channels!==2||manifest.bits!==16||!Array.isArray(manifest.stems)||manifest.stems.join(',')!==STEMS.join(',')||!Number.isSafeInteger(manifest.frames)||manifest.frames<4410||manifest.frames>44100*360)throw Error('분리 ZIP manifest가 올바르지 않습니다.');
 const stems=STEMS.map(name=>{''',
    ''' const expected=count===5?FOUR:SIX;
 if(manifest?.format!=='MYVOCAL_NEURAL_STEMS'||manifest.version!==1||manifest.engine!=='Demucs'||manifest.sampleRate!==44100||manifest.channels!==2||manifest.bits!==16||!Array.isArray(manifest.stems)||manifest.stems.join(',')!==expected.join(',')||!Number.isSafeInteger(manifest.frames)||manifest.frames<4410||manifest.frames>44100*360)throw Error('분리 ZIP manifest가 올바르지 않습니다.');
 const stems=expected.map(name=>{''',str(p))
    p.write_text(s)

    p=ROOT/'MYVOCAL-Studio-source/src/lib/musicStemsClient.js';s=p.read_text()
    s=once(s,'300*1024*1024','450*1024*1024',str(p))
    p.write_text(s)

    p=ROOT/'tools/extend_main_with_demucs.py';s=p.read_text()
    s=once(s,'setProgress(\'로컬 Demucs 신경망으로 실제 악기 4개 분리 중\')',"setProgress('로컬 Demucs 신경망으로 실제 악기 분리 중')",str(p))
    s=once(s,"notify('로컬 Demucs 신경망으로 드럼·베이스·기타 악기·보컬 WAV 4개를 생성했습니다.');",
      "notify(`로컬 Demucs 신경망으로 ${result.stems.length}개 악기·보컬 WAV를 생성했습니다.`);",str(p))
    s=once(s,"'vocals':'Demucs 보컬'}[item.name]","'vocals':'Demucs 보컬','guitar':'Demucs 기타','piano':'Demucs 피아노'}[item.name]",str(p))
    s=once(s,"notify('분리한 4개 WAV를 편집 가능한 별도 프로젝트 트랙으로 추가했습니다. 기존 트랙은 유지됩니다.');",
      "notify(`분리한 ${tracks.length}개 WAV를 편집 가능한 별도 프로젝트 트랙으로 추가했습니다. 기존 트랙은 유지됩니다.`);",str(p))
    s=once(s,'드럼·베이스·기타 악기·보컬 4개로 분리합니다.',
      '드럼·베이스·기타 악기·보컬 4개 또는 기타·피아노 포함 6개로 분리합니다.',str(p))
    s=once(s,'실제 AI 악기 4트랙 분리','실제 AI 악기 4/6트랙 분리',str(p))
    p.write_text(s)

if __name__=='__main__':update()
