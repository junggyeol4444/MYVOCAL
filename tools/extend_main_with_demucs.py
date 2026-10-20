#!/usr/bin/env python3
"""Extend the existing MYVOCAL main with offline Demucs stem generation/import.

Works with the previous cumulative patcher's update plan. Does not create a
standalone app, does not overwrite user data, and checks anchors exactly once.
"""
import sys
from pathlib import Path

HERE=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(HERE/'tools'))
from apply_official_rvc_to_existing_main import replace_once


def patch_main(s,p):
    return replace_once(s,' mux.HandleFunc("/api/music/generate", a.musicGenGenerate)',
                        ' mux.HandleFunc("/api/music/generate", a.musicGenGenerate)\n mux.HandleFunc("/api/music/stems/split", a.musicStemsSplit)',p)


def patch_musicgen_panel(s,p):
    s=replace_once(s,"import {generateMusicGenAudio} from '../lib/musicGenClient.js';",
                   "import {generateMusicGenAudio} from '../lib/musicGenClient.js';\nimport {splitMusicGenStems} from '../lib/musicStemsClient.js';",p)
    s=replace_once(s,"import {readAudioInfo} from '../lib/audioEngine';",
                   "import {readAudioInfo} from '../lib/audioEngine';\nimport {renderStemRemixMaster} from '../lib/stemRemixMaster.js';\nimport {runMusicProductionPipeline} from '../lib/musicProductionPipeline.js';",p)
    s=replace_once(s,"import {putFileNew,removeFile} from '../lib/assetDb';",
                   "import {putFileNew,removeFile,putFilesAtomic,deleteFilesAtomic} from '../lib/assetDb';",p)
    s=replace_once(s," const [wav,setWav]=useState(null),[url,setUrl]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');",
                   " const [wav,setWav]=useState(null),[url,setUrl]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');\n const [demucsRepo,setDemucsRepo]=useState(''),[demucsModel,setDemucsModel]=useState('htdemucs'),[demucsDevice,setDemucsDevice]=useState('auto'),[stems,setStems]=useState(null);",p)
    s=replace_once(s," const [sequence,setSequence]=useState(false),[continuation,setContinuation]=useState(false),[segments,setSegments]=useState('4'),[fade,setFade]=useState('0.5'),[partPrompts,setPartPrompts]=useState(''),[progress,setProgress]=useState('');",
                   " const [sequence,setSequence]=useState(false),[continuation,setContinuation]=useState(false),[segments,setSegments]=useState('4'),[fade,setFade]=useState('0.5'),[partPrompts,setPartPrompts]=useState(''),[progress,setProgress]=useState('');\n const [stemMix,setStemMix]=useState({}),[remix,setRemix]=useState(null);",p)
    s=replace_once(s," useEffect(()=>{setWav(null);setUrl('');setError('')},[project.id]);",
                   " useEffect(()=>{setWav(null);setUrl('');setStems(null);setRemix(null);setStemMix({});setError('')},[project.id]);",p)
    s=replace_once(s," const clear=()=>{setWav(null);setUrl('')};",
                   " const clear=()=>{setWav(null);setUrl('');setStems(null);setRemix(null);setStemMix({})};",p)
    s=replace_once(s,"track.name='MusicGen 신경망 반주';",
                   "track.name=wav.fromLocal?'사용자 WAV 반주':'MusicGen 신경망 반주';",p)
    s=replace_once(s,"notify('MusicGen WAV를 별도 반주 트랙에 저장했습니다. 기존 트랙은 유지됩니다.');",
                   "notify(wav.fromLocal?'선택한 WAV를 별도 반주 트랙에 저장했습니다. 기존 트랙은 유지됩니다.':'MusicGen WAV를 별도 반주 트랙에 저장했습니다. 기존 트랙은 유지됩니다.');",p)
    anchor=' const attach=async()=>{'
    functions=''' const oneClickProduction=async()=>{
  if(busy||!python||!modelDir||!demucsRepo)return;
  const initial=latest.current,controller=new AbortController();active.current=controller;
  setBusy(true);setError('');setProgress('실제 AI 반주 원클릭 제작 준비 중');
  let newAsset='';
  try{
   const result=await runMusicProductionPipeline({
    settings:{python,modelDir,prompt,seconds:Number(seconds),seed:Number(seed)},
    sequence,segments:Number(segments),crossfadeSec:Number(fade),continuation,
    prompts:partPrompts.split(/\\r?\\n/),demucs:{python,repo:demucsRepo,model:demucsModel,device:demucsDevice},
    stemMix,signal:controller.signal,onProgress:setProgress
   });
   if(controller.signal.aborted||latest.current!==initial)throw Error('프로젝트 변경 또는 제작 취소');
   const info=await readAudioInfo(result.master);
   if(controller.signal.aborted||latest.current!==initial)throw Error('프로젝트 변경 또는 제작 취소');
   newAsset=genId('musicmaster');
   const track=makeImportedVocalTrack(initial,result.master,newAsset,info.duration);
   track.id=genId('trk');track.name='AI 반주·악기 분리 PCM 마스터';track.type='instrument';track.volume=75;
   await putFileNew(newAsset,result.master);
   if(controller.signal.aborted||latest.current!==initial)throw Error('프로젝트 변경 또는 제작 취소');
   await Promise.resolve(onChange({...initial,tracks:[...(initial.tracks||[]),track]}));
   newAsset='';
   setWav({file:result.wav,projectId:initial.id});
   setStems({...result.stems,projectId:initial.id});
   setRemix({file:result.master,projectId:initial.id});
   setUrl(URL.createObjectURL(result.wav));
   notify('실제 MusicGen 생성→Demucs 악기 분리→PCM 마스터링을 완료하고 새 편집 트랙에 저장했습니다. 기존 자산은 유지됩니다.');
  }catch(e){if(newAsset)await removeFile(newAsset).catch(()=>{});setError(e.message)}
  finally{active.current=null;setBusy(false);setProgress('')}
 };
 const separate=async()=>{
  if(!wav||busy||wav.projectId!==latest.current.id)return;
  const initial=latest.current,controller=new AbortController();active.current=controller;setBusy(true);setError('');setProgress('로컬 Demucs 신경망으로 실제 악기 분리 중');setStems(null);setRemix(null);
  try{
   const result=await splitMusicGenStems(wav.file,{python,repo:demucsRepo,model:demucsModel,device:demucsDevice},{signal:controller.signal});
   if(controller.signal.aborted||latest.current!==initial)throw Error('프로젝트 변경 또는 분리 취소');
   setStems({...result,projectId:initial.id});notify(`로컬 Demucs 신경망으로 ${result.stems.length}개 악기·보컬 WAV를 생성했습니다.`);
  }catch(e){setError(e.message)}finally{active.current=null;setBusy(false);setProgress('')}
 };
 const attachStems=async()=>{
  if(!stems||busy)return;setBusy(true);setError('');const ids=[];
  try{
   const original=latest.current;if(original.id!==stems.projectId)throw Error('프로젝트가 변경됐습니다.');
   const entries=[],tracks=[];
   for(const item of stems.stems){
    const assetId=genId('demucs'),track=makeImportedVocalTrack(original,item.file,assetId,item.info.durationSec);
    track.id=genId('trk');track.name={'drums':'Demucs 드럼','bass':'Demucs 베이스','other':'Demucs 기타 악기','vocals':'Demucs 보컬','guitar':'Demucs 기타','piano':'Demucs 피아노'}[item.name];track.type=item.name==='vocals'?'vocal':'instrument';track.volume=75;
    ids.push(assetId);entries.push([assetId,item.file]);tracks.push(track);
   }
   await putFilesAtomic(entries);
   if(original!==latest.current)throw Error('분리 트랙 저장 중 프로젝트가 변경됐습니다.');
   await Promise.resolve(onChange({...original,tracks:[...(original.tracks||[]),...tracks]}));
   ids.length=0;setStems(null);notify(`분리한 ${tracks.length}개 WAV를 편집 가능한 별도 프로젝트 트랙으로 추가했습니다. 기존 트랙은 유지됩니다.`);
  }catch(e){if(ids.length)await deleteFilesAtomic(ids).catch(()=>{});setError(e.message)}finally{setBusy(false)}
 };
 const remixStems=async()=>{
  if(!stems||busy||stems.projectId!==latest.current.id)return;
  const initial=latest.current,controller=new AbortController();active.current=controller;
  setBusy(true);setError('');setRemix(null);setProgress('실제 WAV 스테레오 믹싱·마스터링 중');
  try{
   const file=await renderStemRemixMaster(stems.stems,stemMix,{signal:controller.signal,onProgress:(done,total)=>setProgress(`실제 PCM 믹싱 ${done}/${total}프레임`)});
   if(controller.signal.aborted||latest.current!==initial)throw Error('믹싱이 취소되거나 프로젝트가 변경됐습니다.');
   setRemix({file,projectId:initial.id});notify('분리 WAV의 실제 샘플을 믹싱해 -1dBFS 피크 제한 마스터 WAV를 만들었습니다.');
  }catch(e){setError(e.message)}finally{active.current=null;setBusy(false);setProgress('')}
 };
 const attachRemix=async()=>{
  if(!remix||busy)return;setBusy(true);setError('');let id='';
  try{
   const original=latest.current;if(original.id!==remix.projectId)throw Error('프로젝트가 변경됐습니다.');
   const info=await readAudioInfo(remix.file);id=genId('stemremix');
   const track=makeImportedVocalTrack(original,remix.file,id,info.duration);
   track.id=genId('trk');track.name='Demucs 분리 트랙 스테레오 믹스';track.type='instrument';track.volume=75;
   await putFileNew(id,remix.file);
   if(original!==latest.current)throw Error('믹스 저장 중 프로젝트가 변경됐습니다.');
   await Promise.resolve(onChange({...original,tracks:[...(original.tracks||[]),track]}));
   id='';setRemix(null);notify('실제 믹싱 WAV를 새 편집 트랙으로 추가했습니다. 기존 WAV·트랙은 그대로입니다.');
  }catch(e){if(id)await removeFile(id).catch(()=>{});setError(e.message)}finally{setBusy(false)}
 };
'''
    s=replace_once(s,anchor,functions+anchor,p)
    anchor='    {wav&&<Button disabled={busy} onClick={attach}>확인한 반주 WAV를 프로젝트 트랙에 추가</Button>}</div>'
    replacement='''    {wav&&<Button disabled={busy} onClick={attach}>확인한 반주 WAV를 프로젝트 트랙에 추가</Button>}</div>
   <div className="mv7-item">
    <Field label="기존 WAV 불러와서 분리"><input type="file" accept=".wav,audio/wav" disabled={busy} onChange={async e=>{
     const file=e.target.files?.[0];e.target.value='';if(!file)return;
     try{if(file.size<44||file.size>72*1024*1024)throw Error('WAV 크기는 최대 72MiB입니다.');
      const decoded=await readAudioInfo(file);if(!Number.isFinite(decoded.duration)||decoded.duration<.1||decoded.duration>360)throw Error('분리할 WAV는 0.1~360초입니다.');
      if(latest.current.id!==project.id)throw Error('프로젝트가 변경됐습니다.');
      clear();setStems(null);setWav({file,projectId:project.id,fromLocal:true});setUrl(URL.createObjectURL(file));setError('');
     }catch(err){setError(err.message)}
    }}/></Field>
    <div className="mv7-actions"><Button variant="primary" disabled={busy||!python||!modelDir||!demucsRepo} onClick={oneClickProduction}>실제 AI 반주 생성→악기 분리→믹싱·프로젝트 저장 원클릭</Button></div>
    {wav&&<p className="muted">MusicGen 결과 또는 직접 불러온 WAV를 로컬 Demucs 신경망으로 드럼·베이스·기타 악기·보컬 4개 또는 기타·피아노 포함 6개로 분리합니다. 사용자 PC에 설치된 가중치만 사용하며 자동 다운로드하지 않습니다. 원본 WAV·기존 트랙은 변경하지 않습니다.</p>}
    <div className="mv10-grid">
     <Field label="로컬 Demucs 가중치 폴더"><input value={demucsRepo} disabled={busy} onChange={e=>setDemucsRepo(e.target.value)} placeholder="D:\\\\AI\\\\demucs-models"/></Field>
     <Field label="설치된 모델 이름"><input value={demucsModel} disabled={busy} onChange={e=>setDemucsModel(e.target.value)}/></Field>
     <Field label="분리 실행 장치"><select value={demucsDevice} disabled={busy} onChange={e=>setDemucsDevice(e.target.value)}><option value="auto">자동</option><option value="cuda">CUDA GPU</option><option value="cpu">CPU</option></select></Field>
    </div>
    <div className="mv7-actions"><Button disabled={busy||!demucsRepo||!wav} onClick={separate}>실제 AI 악기 4/6트랙 분리</Button>
     {stems?.projectId===project.id&&<Button disabled={busy} onClick={attachStems}>분리된 WAV {stems.stems.length}개를 프로젝트에 추가</Button>}
     {stems?.projectId===project.id&&<Button disabled={busy} onClick={()=>{const link=URL.createObjectURL(stems.zip),a=document.createElement('a');a.href=link;a.download='MYVOCAL-Demucs-Stems.zip';a.click();setTimeout(()=>URL.revokeObjectURL(link),4000)}}>신경망 악기 WAV ZIP 저장</Button>}
    </div>
    {stems?.projectId===project.id&&<div className="mv7-item">
     <p className="muted">분리된 WAV를 실제 PCM으로 믹싱·마스터링합니다. 각 트랙의 음량(-60~+12dB), 좌우 밸런스(-100~100), 음소거를 설정할 수 있습니다. 원본은 변경되지 않습니다.</p>
     {stems.stems.map(item=><div key={item.name} className="mv10-grid">
      <span>{item.name}</span>
      <Field label="음량 dB"><input type="number" min="-60" max="12" step="1" disabled={busy} value={stemMix[item.name]?.gainDb??0} onChange={e=>{const v=Number(e.target.value);setStemMix(m=>({...m,[item.name]:{...m[item.name],gainDb:v}}));setRemix(null)}}/></Field>
      <Field label="좌우 밸런스"><input type="number" min="-100" max="100" step="10" disabled={busy} value={Math.round((stemMix[item.name]?.balance??0)*100)} onChange={e=>{const v=Number(e.target.value);setStemMix(m=>({...m,[item.name]:{...m[item.name],balance:v/100}}));setRemix(null)}}/></Field>
      {['eqLowDb','eqMidDb','eqHighDb'].map((key,i)=><Field key={key} label={['저음 160Hz EQ(dB)','중음 1kHz EQ(dB)','고음 6kHz EQ(dB)'][i]}><input type="number" min="-12" max="12" step="1" disabled={busy} value={stemMix[item.name]?.[key]??0} onChange={e=>{const v=Number(e.target.value);setStemMix(m=>({...m,[item.name]:{...m[item.name],[key]:v}}));setRemix(null)}}/></Field>)}
      <label><input type="checkbox" disabled={busy} checked={!!stemMix[item.name]?.mute} onChange={e=>{const v=e.target.checked;setStemMix(m=>({...m,[item.name]:{...m[item.name],mute:v}}));setRemix(null)}}/> 음소거</label>
     </div>)}
     <div className="mv10-grid">{['fadeInSec','fadeOutSec'].map((key,i)=><Field key={key} label={['마스터 페이드 인(초)','마스터 페이드 아웃(초)'][i]}><input type="number" min="0" max="10" step="0.1" disabled={busy} value={stemMix._master?.[key]??0} onChange={e=>{const v=Number(e.target.value);setStemMix(m=>({...m,_master:{...m._master,[key]:v}}));setRemix(null)}}/></Field>)}</div>
     <div className="mv7-actions"><Button disabled={busy} onClick={remixStems}>실제 WAV 믹싱·마스터링</Button>
      {remix?.projectId===project.id&&<Button disabled={busy} onClick={attachRemix}>믹스 WAV를 새 프로젝트 트랙에 추가</Button>}
      {remix?.projectId===project.id&&<Button disabled={busy} onClick={()=>{const link=URL.createObjectURL(remix.file),a=document.createElement('a');a.href=link;a.download='MYVOCAL-Stems-Master.wav';a.click();setTimeout(()=>URL.revokeObjectURL(link),4000)}}>마스터 WAV 저장</Button>}
     </div>
    </div>}
   </div>'''
    return replace_once(s,anchor,replacement,p)

PATCHERS={'desktop/main.go':patch_main,'MYVOCAL-Studio-source/src/components/MusicGenPanel.jsx':patch_musicgen_panel}
NEW_FILES={
 'desktop/music_stems.go':'desktop/music_stems.go',
 'desktop/music_stems_worker.py':'desktop/music_stems_worker.py',
 'MYVOCAL-Studio-source/src/lib/musicStemZip.js':'MYVOCAL-Studio-source/src/lib/musicStemZip.js',
 'MYVOCAL-Studio-source/src/lib/musicStemsClient.js':'MYVOCAL-Studio-source/src/lib/musicStemsClient.js',
 'desktop/music_stems_test.go':'desktop/music_stems_test.go',
 'MYVOCAL-Studio-source/tests/music-stems.test.mjs':'MYVOCAL-Studio-source/tests/music-stems.test.mjs',
 'MYVOCAL-Studio-source/src/lib/stemRemixMaster.js':'MYVOCAL-Studio-source/src/lib/stemRemixMaster.js',
 'MYVOCAL-Studio-source/tests/stem-remix-master.test.mjs':'MYVOCAL-Studio-source/tests/stem-remix-master.test.mjs',
 'MYVOCAL-Studio-source/src/lib/musicProductionPipeline.js':'MYVOCAL-Studio-source/src/lib/musicProductionPipeline.js',
 'MYVOCAL-Studio-source/tests/music-production-pipeline.test.mjs':'MYVOCAL-Studio-source/tests/music-production-pipeline.test.mjs',
 'MYVOCAL-Studio-source/tests/stem-eq-fades.test.mjs':'MYVOCAL-Studio-source/tests/stem-eq-fades.test.mjs',
 'tests/test_music_stems_worker.py':'tests/test_music_stems_worker.py',
}

def plan(checkout):
    root=Path(checkout);changes={}
    for rel,fn in PATCHERS.items():
        old=(root/rel).read_text(encoding='utf-8');changes[rel]=(old,fn(old,rel))
    for rel,source in NEW_FILES.items():
        if (root/rel).exists():raise ValueError('기존 파일이 존재하여 덮어쓰지 않습니다: '+rel)
        changes[rel]=('',(HERE/source).read_text(encoding='utf-8'))
    return changes

if __name__=='__main__':
    import argparse,difflib
    parser=argparse.ArgumentParser();parser.add_argument('checkout');parser.add_argument('--diff',default='');args=parser.parse_args()
    updates=plan(args.checkout)
    if args.diff:
        output=''.join(line for rel,(old,new) in updates.items() for line in difflib.unified_diff(old.splitlines(keepends=True),new.splitlines(keepends=True),fromfile='a/'+rel,tofile='b/'+rel))
        Path(args.diff).write_text(output,encoding='utf-8')
    print('기존 main 대상 변경 후보',len(updates),'파일. 원본 변경 없음.')
