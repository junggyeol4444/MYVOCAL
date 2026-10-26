// #55: additional real neural ad-lib singing in gaps in the original MIDI.
// The source note selection is shared with the established legacy engine,
// and every phrase originates in the user's lyrics. No text or WAV is faked.
import {makeOriginalLyricAdlibAlignment} from './mvNeuralAdlib.js';
import {generateAndStoreDiffSingerMvSinging} from './diffSingerMvSinging.js';

export async function generateAndStoreDiffSingerMvAdlib(project,{
 voice,model,session,confirmed=false,signal,saveOptions,onProgress=()=>{}
}={}){
 if(!saveOptions||typeof saveOptions.current!=='function'||
  typeof saveOptions.onChange!=='function')
  throw Error('원본을 보존하는 신규 Ad-lib 편집 트랙 저장 연결이 필요합니다.');
 const score=makeOriginalLyricAdlibAlignment(project);
 const originals=new Set(project.tracks.map(t=>t.id));
 let named=null;
 const result=await generateAndStoreDiffSingerMvSinging(project,{
  voice,model,session,confirmed,signal,scoreAlignment:score,
  scoreAlignmentKind:'adlib',onProgress,
  saveOptions:{...saveOptions,onChange:next=>{
   if(signal?.aborted||saveOptions.current()!==project)
    throw Error('추임새 저장 전에 원곡이 변경됐습니다.');
   const fresh=(next.tracks||[]).filter(t=>!originals.has(t.id));
   if(fresh.length!==1||fresh[0].type!=='vocal')
    throw Error('실제 독립 Ad-lib 보컬 WAV 트랙을 생성하지 못했습니다.');
   named={...next,tracks:next.tracks.map(t=>originals.has(t.id)?t:{
    ...t,name:'DiffSinger 실제 한국어 원곡 Ad-lib · 독립 보컬',
    source:'diffsinger-neural-original-lyric-adlib',volume:45,mute:false
   })};
   return saveOptions.onChange(named);
  }}
 });
 return {...result,project:named||result.project,notes:score.cues.length,neuralAdlib:true};
}
