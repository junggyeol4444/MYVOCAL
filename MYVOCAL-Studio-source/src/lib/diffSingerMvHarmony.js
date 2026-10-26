// #21/#55: keep lead WAV and MIDI intact; sing a diatonic 3rd as a
// separate, real local DiffSinger + optional same-owner RVC neural track.
import {makeDiatonicHarmonyAlignment} from './mvHarmonySinging.js';
import {generateAndStoreDiffSingerMvSinging} from './diffSingerMvSinging.js';

export async function generateAndStoreDiffSingerMvHarmony(project,{
 voice,model,session,confirmed=false,direction='above',convertRVC=false,
 rvcOptions=null,registeredRVCModel=null,signal,saveOptions,onProgress=()=>{},duet=null
}={}){
 if(!saveOptions||typeof saveOptions.onChange!=='function'||typeof saveOptions.current!=='function')
  throw Error('원본 보존 프로젝트 및 신규 화음 저장 기능이 필요합니다.');
 const harmonyScore=makeDiatonicHarmonyAlignment(project,{direction});
 const label=direction==='above'?'상성 3도':'하성 3도';
 if(duet!==null){
  const approved=c=>c&&typeof c.id==='string'&&c.id.length>0&&
   ['self','owned','licensed'].includes(c.rights)&&
   (c.rights!=='licensed'||String(c.rightsNote||'').trim());
  if(!approved(duet.leadVoice)||!approved(duet.leadCharacter)||
     !approved(duet.harmonyCharacter)||!approved(voice)||
     duet.leadVoice.id===voice.id||duet.leadCharacter.id===duet.harmonyCharacter.id||
     !project.tracks?.some(t=>t.id===duet.leadTrackId&&t.type==='vocal'&&!t.mute&&
      Array.isArray(t.clips)&&t.clips.some(c=>c.assetId)))
   throw Error('듀엣 화음에는 독립 등록된 두 가수·두 캐릭터와 실제 리드 보컬 WAV가 필요합니다.');
  if(project.duetSingers?.lead?.trackId&&
     project.duetSingers.lead.trackId!==duet.leadTrackId)
   throw Error('기존 듀엣 리드 보컬을 임의로 교체할 수 없습니다.');
 }
 let named=null;
 const originalTrackIds=new Set((project.tracks||[]).map(track=>track.id));
 const result=await generateAndStoreDiffSingerMvSinging(project,{
  voice,model,session,confirmed,scoreAlignment:harmonyScore,
  convertRVC,rvcOptions,registeredRVCModel,signal,onProgress,
  saveOptions:{...saveOptions,onChange:next=>{
   if(signal?.aborted||saveOptions.current()!==project)
    throw Error('화음 트랙 저장 중 원본 프로젝트가 변경됐습니다.');
   const newTracks=(next.tracks||[]).filter(track=>!originalTrackIds.has(track.id));
   if(newTracks.length!==(convertRVC?2:1))
    throw Error('신규 화음 신경망 PCM 트랙 생성 수가 올바르지 않습니다.');
   const nextTracks=next.tracks.map(track=>{
    const index=newTracks.findIndex(t=>t.id===track.id);
    if(index<0)return track;
    const reference=convertRVC&&index===0;
    return {...track,
     name:'DiffSinger 한국어 실제 '+label+(reference?' · Acoustic 원본 참조':
      convertRVC?' · RVC 본인음색 화음':' · 별도 가창 화음'),
     source:reference?'diffsinger-harmony-reference':'diffsinger-neural-harmony',
     harmonyDirection:direction,volume:reference?25:48,mute:reference,
     ...(duet?{singerVoiceId:voice.id,singerCharacterId:duet.harmonyCharacter.id,
      duetRole:reference?'reference':'harmony'}:{})};
   });
   named={...next,tracks:nextTracks};
   if(duet){
    const audible=nextTracks.find(t=>!originalTrackIds.has(t.id)&&!t.mute);
    if(!audible)throw Error('실제 두 번째 가수의 보컬 트랙이 없습니다.');
    named={...named,duetSingers:{
     version:1,
     lead:{voiceId:duet.leadVoice.id,characterId:duet.leadCharacter.id,trackId:duet.leadTrackId},
     harmony:{voiceId:voice.id,characterId:duet.harmonyCharacter.id,trackId:audible.id},
     source:'real-diffsinger-two-voice-harmony-wav',
     durationSec:Math.max(...harmonyScore.cues.map(c=>c.endSec)),
     originalAudioPreserved:true
    }};
   }
   return saveOptions.onChange(named);
  }}
 });
 return {...result,project:named||result.project,direction,neuralHarmony:true,neuralDuet:!!duet};
}
