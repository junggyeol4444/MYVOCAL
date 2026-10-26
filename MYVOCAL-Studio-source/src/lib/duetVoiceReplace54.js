// Original 21/24/54: replace only ONE singer in a two-character duet.
// Lead sings the original MIDI; harmony sings the recorded 3rd-above/below
// score. Real trained native DiffSinger generates NEW WAV files; existing
// two singers, old WAVs, character identities, scenes and clips are retained.
import {generateAndStoreDiffSingerMvSinging} from './diffSingerMvSinging.js';
import {listedDiffSingerModels} from './diffSingerVoiceRegistry.js';
import {makeDiatonicHarmonyAlignment} from './mvHarmonySinging.js';
import {diffSingerExpression} from './diffSingerExpressiveF0.js';
import {isAlignmentStale} from './lyricAlignment.js';

const allowed=v=>v&&['self','owned','licensed'].includes(v.rights)&&
 (v.rights!=='licensed'||!!String(v.rightsNote||'').trim());
export async function replaceOneDuetSinger54(project,{
 role,voice,model,confirmed=false,session,singingStyle='Natural',
 harmonyDirection='',convertRVC=false,rvcOptions=null,registeredRVCModel=null,
 signal,current,onChange,newId,readInfo,createTrack,store,rollback,
 synthesize=generateAndStoreDiffSingerMvSinging,onProgress=()=>{}
}={}){
 if(!project?.id||project.duetSingers?.version!==1||
  !['lead','harmony'].includes(role)||!allowed(voice)||confirmed!==true)
  throw Error('두 명이 독립 WAV로 녹음된 듀엣과 리드/화음 교체 대상·사용 권한을 확인하세요.');
 const duet=project.duetSingers,target=duet[role],other=duet[role==='lead'?'harmony':'lead'];
 if(!target?.voiceId||!target?.characterId||!target?.trackId||
  !other?.voiceId||!other?.characterId||!other?.trackId||
  target.trackId===other.trackId||target.characterId===other.characterId||
  voice.id===other.voiceId)
  throw Error('교체할 두 가수의 독립 Voice·Character·WAV 트랙을 확인하세요. 두 가수가 같은 목소리가 될 수 없습니다.');
 const track=project.tracks?.find(t=>t.id===target.trackId);
 const otherTrack=project.tracks?.find(t=>t.id===other.trackId);
 if(!track||track.type!=='vocal'||track.mute||
   !track.clips?.some(c=>c.assetId)||!otherTrack||
   otherTrack.type!=='vocal'||otherTrack.mute||
   !otherTrack.clips?.some(c=>c.assetId))
  throw Error('현재 리드·화음 모두 재생 가능한 원본 실제 WAV 트랙이어야 합니다.');
 if(!project.vocalAlignment||isAlignmentStale(project,project.vocalAlignment))
  throw Error('원곡 한국어 가사·MIDI 정렬이 먼저 필요합니다.');
 if(listedDiffSingerModels(voice,[model||{}]).length!==1||
  !model.dictionaryAssetId||
  !/^[a-f0-9]{64}$/i.test(String(model.dictionarySha256||'')))
  throw Error('새 가수의 실제 DiffSinger 체크포인트와 한국어 발음 사전을 선택하세요.');
 diffSingerExpression(singingStyle);
 if(typeof session!=='string'||session.length<8||
 [current,onChange,newId,readInfo,createTrack,store,rollback,synthesize].some(f=>typeof f!=='function'))
  throw Error('실제 Windows EXE 세션·저장 기능이 필요합니다.');
 const direction=harmonyDirection||track.harmonyDirection;
 if(role==='harmony'&&!['above','below'].includes(direction))
  throw Error('기존 듀엣 3도 화음의 위/아래 방향을 지정하세요.');
 const score=role==='harmony'?
  makeDiatonicHarmonyAlignment(project,{direction}):null;
 const originalScenes=JSON.stringify(project.scenes),originalCharacters=
  JSON.stringify({cast:project.cast,characterId:project.characterId});
 const guard=()=>{if(signal?.aborted||current()!==project)
  throw Error('듀엣 보컬 교체 중 취소·프로젝트 변경. 기존 음원·영상은 보존됩니다.');};
 guard();
 let published=null;
 const result=await synthesize(project,{
  voice,model,session,confirmed:true,singingStyle,
  ...(score?{scoreAlignment:score,scoreAlignmentKind:'harmony'}:{}),
  convertRVC,rvcOptions,registeredRVCModel,signal,onProgress,
  saveOptions:{current,newId,readInfo,createTrack,store,rollback,
   onChange:next=>{
    guard();
    if(next.id!==project.id||JSON.stringify(next.scenes)!==originalScenes||
      JSON.stringify({cast:next.cast,characterId:next.characterId})!==originalCharacters)
     throw Error('듀엣 기존 이미지·영상·캐릭터 원본이 변경돼 가창 적용을 중단합니다.');
    const ids=new Set(project.tracks.map(t=>t.id));
    const fresh=next.tracks.filter(t=>!ids.has(t.id));
    const audible=fresh.filter(t=>t.type==='vocal'&&!t.mute&&
      t.clips?.some(c=>c.assetId));
    if(audible.length!==1||fresh.length!==(convertRVC?2:1)||
      next.tracks.length!==project.tracks.length+fresh.length)
     throw Error('실제 듀엣 가수 새 WAV 트랙이 생성되지 않았습니다.');
    const replacement=audible[0];
    const updatedDuet={...duet,[role]:{...target,voiceId:voice.id,trackId:replacement.id},
     source:'real-trained-diffsinger-vocal-replacement',
     originalAudioPreserved:true,
     voiceReplace54At:new Date().toISOString()};
    published={...next,
     ...(role==='lead'?{voiceId:voice.id}:{}),
     duetSingers:updatedDuet,
     tracks:next.tracks.map(t=>t.id===target.trackId?{...t,mute:true}:
      t.id===replacement.id?{...t,singerVoiceId:voice.id,
       singerCharacterId:target.characterId,duetRole:role}:t),
     voiceReplace54:{version:1,activeVoiceId:role==='lead'?voice.id:project.voiceId,
      history:[...(project.voiceReplace54?.history||[]).slice(-19),
       {at:new Date().toISOString(),role,
        fromVoiceId:target.voiceId,toVoiceId:voice.id,
        mutedTrackId:target.trackId,newTrackIds:fresh.map(t=>t.id),
        modelId:model.id,engine:'diffsinger',mediaPreserved:true}]}
    };
    return onChange(published);
   }}
 });
 if(!published)throw Error('새 듀엣 신경망 보컬을 실제 DAW WAV로 저장하지 못했습니다.');
 return {project:published,replacedRole:role,
  previousTrackId:target.trackId,newTrackId:published.duetSingers[role].trackId,
  actualNeuralVocalAssets:result.vocalAssets,originalsPreserved:true};
}
