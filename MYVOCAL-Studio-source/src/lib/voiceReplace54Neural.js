// 원본 66항 #54 Voice Replace: 기존 캐릭터·MV 콘티·사진·영상은 그대로 유지.
// 사용자가 지정한 단 하나의 기존 보컬 트랙만 음소거하고, 새 목소리로 실제
// 로컬 Singing 신경망 WAV 생성 성공 후 append-only IndexedDB/DAW에 반영한다.
// 원본 음원, 이전 보컬 트랙, 모델 체크포인트는 삭제·수정하지 않는다.
import {generateAndStoreMvSinging} from './autoMvSinging.js';
import {generateAndStoreDiffSingerMvSinging} from './diffSingerMvSinging.js';
import {listedDiffSingerModels} from './diffSingerVoiceRegistry.js';
import {diffSingerExpression} from './diffSingerExpressiveF0.js';
import {isAlignmentStale} from './lyricAlignment.js';

const authorized=v=>v&&['self','owned','licensed'].includes(v.rights)&&
 (v.rights!=='licensed'||Boolean(String(v.rightsNote||'').trim()));
export async function replaceProjectVoice54(project,{
 targetTrackId,voice,confirmed=false,port,modelId='',singingStyle='Natural',
 backend='external',diffSingerModel=null,generateDiffSinger=generateAndStoreDiffSingerMvSinging,
 convertRVC=false,rvcOptions=null,registeredRVCModel=null,
 session,signal,current,onChange,newId,readInfo,createTrack,store,rollback,
 generate=generateAndStoreMvSinging,onProgress=()=>{}
}={}){
 if(!project?.id||!Array.isArray(project.tracks)||typeof targetTrackId!=='string'||!targetTrackId||
  !authorized(voice)||confirmed!==true)
  throw Error('기존 보컬 트랙, 새 목소리, 명시적인 보컬 교체 동의를 확인하세요.');
 const target=project.tracks.find(t=>t.id===targetTrackId);
 if(!target||target.type!=='vocal'||!Array.isArray(target.clips)||!target.clips.length)
  throw Error('기존 보컬 WAV가 들어 있는 트랙 하나만 교체 대상으로 지정하세요.');
 if(target.mute)throw Error('이미 음소거된 보컬 트랙은 교체 대상으로 사용할 수 없습니다.');
 if(!project.vocalAlignment||isAlignmentStale(project,project.vocalAlignment))
  throw Error('보컬 교체 전에 원곡의 가사·MIDI 싱크를 먼저 저장하세요.');
 if([current,onChange,newId,readInfo,createTrack,store,rollback,generate].some(v=>typeof v!=='function'))
  throw Error('기존 MYVOCAL EXE의 프로젝트·실제 WAV 저장 연결이 필요합니다.');
 if(!['external','diffsinger'].includes(backend))
  throw Error('보컬 교체용 실제 신경망 엔진을 선택하세요.');
 if(backend==='external'&&(!Number.isInteger(port)||port<1024||port>65535||port===58319))
  throw Error('신경망 Singing 엔진 포트를 확인하세요.');
 if(backend==='diffsinger'){
  if(typeof generateDiffSinger!=='function'||!diffSingerModel||
    listedDiffSingerModels(voice,[diffSingerModel]).length!==1||
    typeof diffSingerModel.dictionaryAssetId!=='string'||!diffSingerModel.dictionaryAssetId||
    !/^[a-f0-9]{64}$/i.test(String(diffSingerModel.dictionarySha256||'')))
   throw Error('새 목소리의 실제 DiffSinger Acoustic 체크포인트와 한국어 발음 사전을 등록하세요.');
  diffSingerExpression(singingStyle);
 }
 if(project.duetSingers?.version===1)
  throw Error('서로 다른 실제 가수 두 명의 듀엣 트랙은 단독 교체 시 기존 연출과 불일치합니다. 독립 듀엣 전용 교체를 사용하세요.');
 if(typeof session!=='string'||session.length<8)
  throw Error('MYVOCAL Windows EXE의 로컬 세션이 필요합니다.');
 const guard=()=>{if(signal?.aborted||current()!==project)
  throw Error('보컬 교체 중 프로젝트 변경·취소를 감지했습니다. 기존 음악·영상은 보존했습니다.');};
 guard();
 // 임의 캐릭터 교체, 씬 재생성, 사진 원본 파일 덮어쓰기 금지.
 const originalScene=JSON.stringify(project.scenes);
 const characters=JSON.stringify({characterId:project.characterId,cast:project.cast});
 let final=null;
 const produce=backend==='diffsinger'?generateDiffSinger:generate;
 const response=await produce(project,{
  voice,port,modelId,singingStyle,
  ...(backend==='diffsinger'?{model:diffSingerModel}:{}),
  session,convertRVC,rvcOptions,
  registeredRVCModel,confirmed:true,signal,onProgress,
  saveOptions:{current,newId,readInfo,createTrack,store,rollback,
   onChange:next=>{
    guard();
    if(next.id!==project.id||!Array.isArray(next.tracks)||
       next.tracks.length<=project.tracks.length||
       JSON.stringify(next.scenes)!==originalScene||
       JSON.stringify({characterId:next.characterId,cast:next.cast})!==characters)
     throw Error('새 보컬 외의 사용자 음악·영상·캐릭터 원본이 변경됐습니다.');
    const previousIds=new Set(project.tracks.map(t=>t.id));
    const newer=next.tracks.filter(t=>!previousIds.has(t.id));
    if(!newer.length||newer.some(t=>t.type!=='vocal'||!t.clips?.length))
     throw Error('실제 신규 Singing 보컬 파일이 생성되지 않아 Voice Replace를 적용하지 않습니다.');
    final={...next,voiceId:voice.id,
     tracks:next.tracks.map(t=>t.id===targetTrackId?{...t,mute:true}:t),
     voiceReplace54:{version:1,activeVoiceId:voice.id,
      history:[...(project.voiceReplace54?.history||[]).slice(-19),
       {fromVoiceId:project.voiceId||'',toVoiceId:voice.id,
        mutedTrackId:targetTrackId,newTrackIds:newer.map(t=>t.id),
        engine:backend,modelId:backend==='diffsinger'?diffSingerModel.id:modelId,
        at:new Date().toISOString(),mediaPreserved:true}]}};
    return onChange(final);
   }
  }
 });
 if(!final)throw Error('새 신경망 Singing WAV 편집 트랙이 저장되지 않았습니다.');
 return {project:final,voiceId:voice.id,mutedTrackId:targetTrackId,
  newVocalAssets:response.vocalAssets,originalMediaPreserved:true};
}
