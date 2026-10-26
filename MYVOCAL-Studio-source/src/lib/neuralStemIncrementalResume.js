// Requirement #55: resume the six ORIGINAL locally generated MusicGen WAV
// stems after an interruption. Each successful role commits one new editable
// track to the existing project. A failed later role never erases earlier WAVs.
// Skipping a role requires the same MIDI notes, score revision, settings and
// SHA-256-verified stored WAV. Never silently rely on just a role name.
import {renderAndStoreNeuralAudioStems} from './neuralInstrumentAudioStems.js';
import {latestCompleteNeuralScore,NEURAL_SCORE_ROLES} from './neuralScoreBatch.js';
import {getFile} from './assetDb.js';
import {sha256File} from './voiceTraining.js';
import {assertUsableSingingWav} from './singingOutputValidation.js';

export async function renderRemainingNeuralAudioStems(project,opts={}){
 const {python,modelDir,segments,seconds=18,crossfadeSec=.5,signal,
  current,onChange,readInfo,onProgress=()=>{},
  readAsset=getFile,hash=sha256File,render=renderAndStoreNeuralAudioStems}=opts;
 if(!project?.id||!Array.isArray(project.tracks)||
  typeof current!=='function'||typeof onChange!=='function'||
  typeof readInfo!=='function'||typeof readAsset!=='function'||
  typeof hash!=='function'||typeof render!=='function')
  throw Error('기존 프로젝트·WAV 자산 및 실제 MusicGen 재개 연결이 필요합니다.');
 const score=latestCompleteNeuralScore(project);
 const version=String(project.neuralAutoScore?.at||'');
 const expectedDuration=Number(project.neuralAutoScore?.durationSec)||
  Number(project.neuralAutoScore?.bars)*4*60/Number(project.bpm);
 if(!score||!version||!Number.isFinite(expectedDuration)||
  expectedDuration<150||expectedDuration>360)
  throw Error('저장된 3~6분 원곡 MIDI 버전이 없으면 신경망 악기를 안전하게 재개할 수 없습니다.');
 if(![11,20].includes(segments)||seconds!==18||crossfadeSec!==.5)
  throw Error('원본 독립 MusicGen 3~6분 악기 생성 설정을 유지하세요.');
 let working=project,previous=project;
 const ensure=()=>{
  if(signal?.aborted)throw Error('독립 악기 재개 취소. 이미 저장한 WAV는 그대로 유지합니다.');
  const visible=current();
  if(visible!==working&&visible!==previous)
   throw Error('재개 중 원본 프로젝트가 변경되어 기존 WAV와 새 결과를 보존하고 중단했습니다.');
  if(visible===working)previous=working;
 };
 const reused=[],generated=[],diagnostics=[];
 for(const role of NEURAL_SCORE_ROLES){
  ensure();
  const midi=score.get(role);
  if(!midi?.id||!Array.isArray(midi.midiNotes))
   throw Error('원본 신경망 MIDI 악기 기록이 누락됐습니다: '+role);
  const midiHash=await hash(new Blob([JSON.stringify(midi.midiNotes)]));
  ensure();
  const candidates=working.tracks.filter(t=>
   t?.generatedBy==='musicgen-independent-audio'&&
   t.sourceRole===role&&t.sourceMidiTrackId===midi.id&&
   t.sourceScoreVersion===version&&
   t.sourceMidiSha256===midiHash&&
   t.sourceMusicGenModelDir===modelDir&&
   t.sourceMusicGenSegments===segments&&
   t.sourceMusicGenCrossfadeSec===crossfadeSec&&
   t.sourceRoleSeed===4200+NEURAL_SCORE_ROLES.indexOf(role)*100&&
   t.sourceBpm===Number(working.bpm)&&
   Math.abs(Number(t.sourceScoreDurationSec)-expectedDuration)<=.12);
  const candidate=candidates.at(-1);
  if(candidate){
   const clips=Array.isArray(candidate.clips)?candidate.clips:[];
   if(clips.length!==1||clips[0].startBar!==1||
      typeof clips[0].assetId!=='string'||!clips[0].assetId)
    throw Error('보존된 '+role+' 악기 트랙의 WAV 연결이 변경됐습니다. 자동 건너뛰기를 중단합니다.');
   const file=await readAsset(clips[0].assetId);
   ensure();
   if(!(file instanceof Blob)||file.size<44||file.size>90*1024*1024||
       !/^[a-f0-9]{64}$/i.test(candidate.sourceWavSha256||'')||
       await hash(file)!==candidate.sourceWavSha256)
    throw Error('보존된 '+role+' 악기 WAV의 원본 SHA-256이 일치하지 않습니다. 재사용하지 않습니다.');
   const bytes=await file.arrayBuffer();
   assertUsableSingingWav(bytes,{maxDurationSec:360});
   const info=await readInfo(file);
   ensure();
   const duration=Number(info?.duration??info?.durationSec);
   if(!Number.isFinite(duration)||Math.abs(duration-expectedDuration)>.12)
    throw Error('보존된 '+role+' 악기 WAV가 현재 MIDI 길이와 다릅니다.');
   reused.push(role);
   onProgress('보존한 '+role+' MusicGen WAV 확인 · 새 생성 없이 재사용 '+(reused.length+generated.length)+'/6');
   continue;
  }
  onProgress('중단 지점부터 실제 MusicGen '+role+' 악기 생성 '+(reused.length+generated.length+1)+'/6');
  const before=working;
  const result=await render(before,{
   ...opts,roles:[role],
   current:()=>{ensure();return working;},
   onChange:async changed=>{
    ensure();
    if(changed?.id!==before.id||!Array.isArray(changed.tracks)||
       changed.tracks.length!==before.tracks.length+1)
     throw Error('독립 악기 1개 결과가 기존 프로젝트에 안전하게 추가되지 않았습니다.');
    await Promise.resolve(onChange(changed));
    previous=before;
    working=changed;
   }
  });
  ensure();
  if(result.tracks!==1||result.roles?.[0]!==role)
   throw Error('MusicGen 신경망 악기의 신규 생성 결과가 일치하지 않습니다.');
  generated.push(role);
  diagnostics.push(...(result.midiWavAlignment||[]));
 }
 return {project:working,reused,roles:generated,tracks:generated.length,
  durationSec:expectedDuration,midiWavAlignment:diagnostics,
  source:'real-musicgen-independent-resume'};
}
