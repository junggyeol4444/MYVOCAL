// #21/#55: keep lead WAV and MIDI intact; sing a diatonic 3rd as a
// separate, real local DiffSinger + optional same-owner RVC neural track.
import {makeDiatonicHarmonyAlignment} from './mvHarmonySinging.js';
import {generateAndStoreDiffSingerMvSinging} from './diffSingerMvSinging.js';

export async function generateAndStoreDiffSingerMvHarmony(project,{
 voice,model,session,confirmed=false,direction='above',convertRVC=false,
 rvcOptions=null,registeredRVCModel=null,signal,saveOptions,onProgress=()=>{}
}={}){
 if(!saveOptions||typeof saveOptions.onChange!=='function'||typeof saveOptions.current!=='function')
  throw Error('원본 보존 프로젝트 및 신규 화음 저장 기능이 필요합니다.');
 const harmonyScore=makeDiatonicHarmonyAlignment(project,{direction});
 const label=direction==='above'?'상성 3도':'하성 3도';
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
     harmonyDirection:direction,volume:reference?25:48,mute:reference};
   });
   named={...next,tracks:nextTracks};
   return saveOptions.onChange(named);
  }}
 });
 return {...result,project:named||result.project,direction,neuralHarmony:true};
}
