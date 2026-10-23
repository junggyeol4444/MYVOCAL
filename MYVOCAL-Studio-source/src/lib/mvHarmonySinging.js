// 원본 66항 3/5/55번: 가사·MIDI로 실제 로컬 신경망 Singing 엔진의 독립 화음 WAV를 생성한다.
// 원본 가사/멜로디/음색/사용자 데이터는 변경하지 않고 기존 DAW 신규 트랙에만 저장한다.
import {isAlignmentStale} from './lyricAlignment.js';
import {buildPhonemePlan} from './phonemePlan.js';
import {renderLongSinging} from './longSingingRender.js';
import {buildSingingRequest,singingCapabilitiesView,engineModelCompatibility} from './singingBridge.js';
import {assertSingingStyleSupported} from './singingStyleControl.js';
import {assertUsableSingingWav} from './singingOutputValidation.js';
import {persistNeuralVocalTake} from './neuralVocalPersist.js';
import {convertLongSingingWithRVC} from './rvcLongConversion.js';
import {convertRegisteredRVC} from './rvcStoredConversion.js';
import {getFile} from './assetDb.js';
import {sha256File} from './voiceTraining.js';

const PITCH_CLASSES=Object.freeze({C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11});
const MAJOR=[0,2,4,5,7,9,11],MINOR=[0,2,3,5,7,8,10];
function songKey(project){
 const label=String(project?.key||project?.musicKey||'').trim();
 const match=/^([A-G](?:#|b)?)(?:\s+(Major|Minor))?$/i.exec(label);
 if(!match||!Object.hasOwn(PITCH_CLASSES,match[1]))
  throw Error('3도 화음에는 현재 프로젝트의 정확한 Key(C Major 등)가 필요합니다.');
 return {root:PITCH_CLASSES[match[1]],intervals:match[2]?.toLowerCase()==='minor'?MINOR:MAJOR};
}
export function makeDiatonicHarmonyAlignment(project,{direction='above'}={}){
 const alignment=project?.vocalAlignment;
 if(!alignment||isAlignmentStale(project,alignment)||!Array.isArray(alignment.cues))
  throw Error('현재 곡의 한국어 가사·MIDI 싱크를 저장한 뒤 화음을 생성하세요.');
 if(!['above','below'].includes(direction))throw Error('3도 화음은 위/아래 방향을 선택하세요.');
 const key=songKey(project),delta=direction==='above'?2:-2;
 const cues=alignment.cues.map(c=>{
  const pc=((c.pitch-key.root)%12+12)%12,degree=key.intervals.indexOf(pc);
  if(degree<0)throw Error('원곡 MIDI에 현재 Key 음계 밖 음표가 있습니다. 임의 화음으로 교체하지 않습니다.');
  const next=degree+delta,octave=Math.floor(next/7);
  const pitch=c.pitch+(key.intervals[((next%7)+7)%7]+octave*12-pc);
  if(!Number.isInteger(pitch)||pitch<36||pitch>96)
   throw Error('화음 음높이가 실제 Singing MIDI 36~96 범위를 벗어납니다.');
  return {...c,pitch};
 });
 return {...alignment,cues,trackName:alignment.trackName+' · 실제 신경망 3도 화음'};
}
export async function generateAndStoreMvHarmony(project,{
 voice,port,modelId='',session,confirmed=false,direction='above',singingStyle='Natural',
 convertRVC=false,rvcOptions=null,registeredRVCModel=null,convert=convertLongSingingWithRVC,
 signal,request=fetch,saveOptions,onProgress=()=>{},duet=null
}={}){
 if(!project?.id||!voice||!['self','owned','licensed'].includes(voice.rights)||confirmed!==true)
  throw Error('허가된 가창 목소리와 명시적인 사용 동의가 필요합니다.');
 if(!Number.isInteger(port)||port<1024||port>65535||port===58319||
  typeof session!=='string'||session.length<8)
  throw Error('Windows EXE 인증 세션과 실제 Singing 엔진이 필요합니다.');
 if(!saveOptions||typeof saveOptions.current!=='function'||typeof saveOptions.onChange!=='function')
  throw Error('기존 프로젝트와 실제 신규 화음 트랙 저장 연결이 필요합니다.');
 if(duet!==null){
  const allowed=c=>c&&typeof c.id==='string'&&c.id.length>0&&
   ['self','owned','licensed'].includes(c.rights)&&
   (c.rights!=='licensed'||String(c.rightsNote||'').trim().length>0);
  if(!duet||typeof duet!=='object'||!allowed(duet.leadCharacter)||
     !allowed(duet.harmonyCharacter)||!allowed(duet.leadVoice)||
     duet.leadVoice.id===voice.id||
     duet.leadCharacter.id===duet.harmonyCharacter.id||
     typeof duet.leadTrackId!=='string'||!duet.leadTrackId||
     !Array.isArray(project.tracks)||!project.tracks.some(t=>
       t.id===duet.leadTrackId&&t.type==='vocal'&&!t.mute&&
       Array.isArray(t.clips)&&t.clips.some(c=>c.assetId)))
    throw Error('듀엣에는 실제 원본 보컬 WAV와 서로 다른 두 명의 사용 허가 Voice·캐릭터가 필요합니다.');
  if(project.duetSingers?.lead?.trackId&&project.duetSingers.lead.trackId!==duet.leadTrackId)
   throw Error('기존 듀엣의 원곡과 다른 보컬입니다. 먼저 원곡 프로젝트를 선택하세요.');
 }
 const guard=()=>{if(signal?.aborted||saveOptions.current()!==project)
  throw Error('화음 가창이 취소되었거나 프로젝트가 변경됐습니다. 원본을 보존합니다.');};
 guard();
 const harmony=makeDiatonicHarmonyAlignment(project,{direction});
 const phonemePlan=buildPhonemePlan(harmony);
 const fetchSinging=async(path,body)=>{
  guard();
  const result=await request(path+'?port='+port,{method:body?'POST':'GET',
   headers:{'X-MYVOCAL-Session':session,...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),signal,cache:'no-store'});
  if(!result?.ok){let reason='로컬 신경망 화음 가창 오류';
   try{reason=(await result.json()).error||reason;}catch{}
   throw Error(reason);
  }
  guard();return result;
 };
 const capabilities=singingCapabilitiesView(await (await fetchSinging('/api/singing/capabilities')).json());
 if(capabilities.mode!=='neural'||capabilities.inferenceReady!==true)
  throw Error('실제 학습된 한국어 신경망 Singing 모델만 화음에 사용할 수 있습니다.');
 const model=capabilities.models.find(m=>m.id===(modelId||capabilities.models[0]?.id));
 if(!model)throw Error('원곡 목소리 신경망 모델이 실행 중인 엔진에 없습니다.');
 const compatible=engineModelCompatibility(capabilities,model);
 if(!compatible.ok)throw Error(compatible.warning);
 const style=assertSingingStyleSupported(singingStyle,capabilities,model);
 const styledProject=style==='Natural'?project:{...project,singingStyle:style};
 const infer=async body=>{
  const res=await fetchSinging('/api/singing/render',body);
  const audio=await res.blob();guard();
  if(!(audio instanceof Blob)||audio.size<44||audio.size>90*1024*1024)
   throw Error('실제 화음 Singing WAV 출력이 잘못됐습니다.');
  assertUsableSingingWav(await audio.arrayBuffer(),{maxDurationSec:90});
  return audio;
 };
 onProgress('원곡과 독립된 신경망 3도 화음 가창 생성 중');
 let wav;
 if(harmony.longForm===true){
  const rendered=await renderLongSinging(harmony,{port,project:styledProject,voice,model,
   phonemePlan,request:infer,signal,onProgress:(done,total)=>onProgress('화음 Singing '+done+'/'+total+' 구간')});
  wav=rendered.wav;
 }else wav=await infer(buildSingingRequest(port,styledProject,harmony,voice,model,phonemePlan));
 guard();
 const info=assertUsableSingingWav(await wav.arrayBuffer(),{maxDurationSec:360});
 const lastNote=Math.max(...project.vocalAlignment.cues.map(c=>c.endSec));
 if(info.durationSec+.025<lastNote)
  throw Error('화음 WAV가 실제 원곡 마지막 MIDI 음표보다 짧습니다.');
 const label=direction==='above'?'상성 3도':'하성 3도';
 const file=new File([wav],'MYVOCAL-'+label+'-신경망-Singing.wav',{type:'audio/wav'});
 let files=[file];
 if(convertRVC){
  if(!rvcOptions||!rvcOptions.root||!rvcOptions.python||
     (!registeredRVCModel&&!rvcOptions.model))
   throw Error('실제 RVC CUDA 음색 변환용 Python·모델 경로를 확인하세요.');
  const conversion={session,signal,onProgress:(done,total)=>
   onProgress('독립 화음 RVC 음색 변환 '+done+'/'+total+' 구간')};
  if(registeredRVCModel){
   const record=registeredRVCModel;
   if(record.engineId!=='rvc'||record.voiceId!==voice.id||!record.assetId||
      !/^[a-f0-9]{64}$/i.test(String(record.sha256||'')))
    throw Error('화음 음색은 선택한 본인/허가된 RVC 모델에서만 변환할 수 있습니다.');
   const modelFile=await getFile(record.assetId);
   if(!(modelFile instanceof Blob)||await sha256File(modelFile)!==record.sha256)
    throw Error('등록된 RVC 본인 음색 체크포인트 SHA-256이 일치하지 않습니다.');
   let indexFile=null;
   if(record.indexAssetId){
    indexFile=await getFile(record.indexAssetId);
    if(!(indexFile instanceof Blob)||!/^[a-f0-9]{64}$/i.test(String(record.indexSha256||''))||
       await sha256File(indexFile)!==record.indexSha256)
     throw Error('등록된 RVC FAISS 인덱스 SHA-256이 일치하지 않습니다.');
   }
   if(Number(rvcOptions.indexRate)>0&&!indexFile)
    throw Error('RVC 검색 비율을 사용하려면 실제 등록 FAISS 인덱스가 필요합니다.');
   guard();
   conversion.convert=(chunk,settings,options)=>convertRegisteredRVC(chunk,{
    ...settings,modelFile,indexFile},options);
  }
  const converted=await convert(file,{...rvcOptions,rightsConfirmed:true},conversion);
  guard();
  if(!(converted instanceof Blob)||converted.size<44)
   throw Error('본인 음색 RVC 화음 신경망 WAV가 생성되지 않았습니다.');
  const convertedInfo=assertUsableSingingWav(await converted.arrayBuffer(),{maxDurationSec:360});
  if(Math.abs(convertedInfo.durationSec-info.durationSec)>.15)
   throw Error('화음 RVC 실제 PCM 길이가 원본 신경망 Singing과 일치하지 않습니다.');
  files=[file,new File([converted],'MYVOCAL-'+label+'-본인음색-RVC-화음.wav',{type:'audio/wav'})];
 }
 const job={id:saveOptions.newId('singjob'),at:new Date().toISOString(),
  mode:'실제 한국어 신경망 Singing '+label,result:'원본 보컬 보존·독립 화음 WAV 신규 편집 트랙',
  notes:harmony.cues.length,engine:capabilities.name||'로컬 신경망'};
 let named=null;
 const saved=await persistNeuralVocalTake(project,files,{...saveOptions,signal,
  engineInfo:{port,modelId:model.id},job,
  onChange:next=>{
   const total=files.length;
   const head=next.tracks.slice(0,-total);
   const appended=next.tracks.slice(-total).map((track,index)=>({...track,
    name:'한국어 신경망 · '+label+(convertRVC&&index===0?' 원본 화음 참조':' 독립 화음')+
     (convertRVC&&index===1?' · 실제 RVC 본인음색':''),
    source:convertRVC&&index===1?'neural-rvc-harmony':'neural-harmony-singing',
    harmonyDirection:direction,
    ...(duet?{singerVoiceId:voice.id,singerCharacterId:duet.harmonyCharacter.id,
     duetRole:index===total-1?'harmony':'reference'}:{}),
    volume:convertRVC&&index===0?25:48,
    mute:convertRVC&&index===0
   }));
   named={...next,tracks:[...head,...appended]};
   if(duet){
    const audible=appended.at(-1);
    named={...named,duetSingers:{
     version:1,
     lead:{voiceId:duet.leadVoice.id,characterId:duet.leadCharacter.id,trackId:duet.leadTrackId},
     harmony:{voiceId:voice.id,characterId:duet.harmonyCharacter.id,trackId:audible.id},
     source:'real-neural-duet-harmony-wav',durationSec:info.durationSec,
     originalAudioPreserved:true
    }};
   }
   return saveOptions.onChange(named);
  }
 });
 return {project:named||saved.project,assets:saved.assets,direction,voiceId:voice.id,
  modelId:model.id,neuralHarmony:true,convertedWithRVC:convertRVC,neuralDuet:!!duet};
}
