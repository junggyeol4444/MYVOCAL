// 원본 66항: 기존 한국어 가사/MIDI의 빈 구간에 실제 로컬 신경망 ad-lib 보컬 WAV를 생성한다.
// 가사는 원곡에서만 가져온다. AI가 임의 가사/가짜 오디오를 만든 것으로 주장하지 않는다.
// 사용자 원본 트랙/노래/모델/사진은 변경하지 않고 신규 IndexedDB 자산으로만 저장한다.
import {isAlignmentStale} from './lyricAlignment.js';
import {buildPhonemePlan} from './phonemePlan.js';
import {renderLongSinging} from './longSingingRender.js';
import {buildSingingRequest,singingCapabilitiesView,engineModelCompatibility} from './singingBridge.js';
import {assertSingingStyleSupported} from './singingStyleControl.js';
import {assertUsableSingingWav} from './singingOutputValidation.js';
import {persistNeuralVocalTake} from './neuralVocalPersist.js';
const round=v=>Math.round(v*1000)/1000;
export function makeOriginalLyricAdlibAlignment(project,{minimumRestSec=.48,maximumNoteSec=1.7}={}){
 const source=project?.vocalAlignment;
 if(!source||isAlignmentStale(project,source)||!Array.isArray(source.cues)||!source.cues.length)
  throw Error('기존 가사와 MIDI 싱크를 먼저 저장해야 신경망 추임새를 만들 수 있습니다.');
 if(!Number.isFinite(minimumRestSec)||minimumRestSec<.3||minimumRestSec>2||
    !Number.isFinite(maximumNoteSec)||maximumNoteSec<.3||maximumNoteSec>2)
  throw Error('추임새 간격과 음표 길이는 사용 가능한 범위 안에서 설정하세요.');
 const notes=source.cues.slice().sort((a,b)=>a.startSec-b.startSec);
 const all=[],minDuration=Math.min(360,Number(project?.neuralAutoScore?.durationSec)||360);
 for(let i=0;i<notes.length;i++){
  const note=notes[i],next=notes[i+1];
  if(!Number.isFinite(note.endSec)||!Number.isFinite(note.pitch)||note.endSec>minDuration)continue;
  const restStart=note.endSec;
  const restEnd=Math.min(next?.startSec??minDuration,minDuration);
  const gap=restEnd-restStart;
  if(gap<minimumRestSec+.12)continue;
  // 가사의 실제 마지막 한국어 음절만 되풀이한다. 사용자가 쓰지 않은 문장은 추가하지 않는다.
  const originals=[...String(note.lyric||'')].filter(ch=>/^[가-힣]$/.test(ch));
  if(!originals.length)continue;
  const start=restStart+.12,end=Math.min(restEnd-.08,start+maximumNoteSec);
  if(end-start<.3)continue;
  // 본래 보컬 음표의 완전5도에 맞추되 신경망 Singing의 허용 음역 안에 유지.
  const pitch=note.pitch+7<=96?note.pitch+7:note.pitch-5>=36?note.pitch-5:note.pitch;
  if(!Number.isInteger(pitch)||pitch<36||pitch>96)continue;
  all.push({...note,index:all.length+1,lyric:originals.at(-1),
   pitch,startSec:round(start),endSec:round(end),
   startBeat:round(start*Number(source.bpm)/60),
   length:round((end-start)*Number(source.bpm)/60),
   velocity:Math.min(110,Math.max(40,Number(note.velocity)||80))});
  if(all.length>=128)break;
 }
 if(all.length===0)throw Error('현재 노래에는 원본 가사를 재사용할 0.6초 이상의 실제 MIDI 휴지가 없습니다.');
 const duration=Math.max(...all.map(c=>c.endSec));
 const longForm=duration>89||all.length>128||source.longForm===true;
 return {...source,longForm,cues:all,syllablesTotal:all.length,
  overflow:0,unfilled:0,trackName:'원본 한국어 MIDI의 독립 신경망 Ad-lib'};
}
export async function generateAndStoreMvAdlib(project,{
 voice,port,modelId='',singingStyle='Natural',session,confirmed=false,signal,
 request=fetch,saveOptions,onProgress=()=>{},minimumRestSec=.48
}={}){
 if(!project?.id||!voice||!['self','owned','licensed'].includes(voice.rights)||
   voice.rights==='licensed'&&!String(voice.rightsNote||'').trim()||confirmed!==true)
  throw Error('등록된 본인·허가된 목소리와 추임새 생성 동의가 필요합니다.');
 if(!Number.isInteger(port)||port<1024||port>65535||port===58319||
   typeof session!=='string'||session.length<8||
   typeof saveOptions?.current!=='function'||typeof saveOptions?.onChange!=='function')
  throw Error('Windows EXE의 실제 Singing 엔진과 신규 트랙 저장 연결을 확인하세요.');
 const guard=()=>{if(signal?.aborted||saveOptions.current()!==project)
  throw Error('Ad-lib 생성 취소 또는 프로젝트 변경: 기존 노래·녹음·모델을 보존합니다.');};
 guard();
 const alignment=makeOriginalLyricAdlibAlignment(project,{minimumRestSec});
 const phonemePlan=buildPhonemePlan(alignment);
 const send=async(path,{body}={})=>{
  guard();
  const response=await request(path+'?port='+port,{
   method:body?'POST':'GET',
   headers:{'X-MYVOCAL-Session':session,...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),signal,cache:'no-store'});
  if(!response?.ok){const error=await response?.json?.().catch(()=>null);
   throw Error(error?.error||'실제 한국어 신경망 Ad-lib 엔진 응답 실패');}
  guard();return response;
 };
 const capabilities=singingCapabilitiesView(await (await send('/api/singing/capabilities')).json());
 if(capabilities.mode!=='neural'||capabilities.inferenceReady!==true)
  throw Error('실제 신경망 Singing 모델이 준비되지 않았습니다.');
 const model=capabilities.models.find(m=>m.id===(modelId||capabilities.models[0]?.id));
 if(!model)throw Error('신경망 Singing 모델을 실제 엔진 목록에서 찾지 못했습니다.');
 const compatible=engineModelCompatibility(capabilities,model);
 if(!compatible.ok)throw Error(compatible.warning);
 const style=assertSingingStyleSupported(singingStyle,capabilities,model);
 const styled=style==='Natural'?project:{...project,singingStyle:style};
 const infer=async body=>{
  const res=await send('/api/singing/render',{body});
  const wav=await res.blob();guard();
  if(!(wav instanceof Blob)||wav.size<44||wav.size>90*1024*1024)
   throw Error('실제 신경망 Ad-lib 가창 WAV가 반환되지 않았습니다.');
  assertUsableSingingWav(await wav.arrayBuffer(),{maxDurationSec:90});
  return wav;
 };
 onProgress('실제 신경망 Ad-lib '+alignment.cues.length+'음표의 가창 생성 중');
 let output;
 if(alignment.longForm===true){
  const rendered=await renderLongSinging(alignment,{
   port,project:styled,voice,model,phonemePlan,request:infer,signal,
   onProgress:(completed,total)=>onProgress('실제 Ad-lib '+completed+'/'+total+' 구간')
  });
  output=rendered.wav;
 }else output=await infer(buildSingingRequest(port,styled,alignment,voice,model,phonemePlan));
 guard();
 const pcm=assertUsableSingingWav(await output.arrayBuffer(),{maxDurationSec:360});
 if(pcm.durationSec+0.025<Math.max(...alignment.cues.map(c=>c.endSec)))
  throw Error('실제 신경망 추임새 오디오가 마지막 MIDI 음표보다 짧습니다.');
 const file=new File([output],'MYVOCAL-원곡한국어-Adlib-신경망-가창.wav',{type:'audio/wav'});
 let changed=null;
 const saved=await persistNeuralVocalTake(project,[file],{
  ...saveOptions,signal,
  engineInfo:{port,modelId:model.id},
  job:{id:saveOptions.newId('singjob'),at:new Date().toISOString(),
   mode:'실제 한국어 신경망 Ad-lib',result:'원곡 가사·MIDI에서 독립 보컬 WAV 생성',
   notes:alignment.cues.length,engine:capabilities.name||'설치된 신경망'},
  onChange:next=>{
   changed={...next,tracks:[...next.tracks.slice(0,-1),
    {...next.tracks.at(-1),name:'실제 신경망 한국어 Ad-lib · 독립 보컬',
     type:'vocal',volume:45,mute:false,source:'real-neural-original-lyric-adlib'}]};
   return saveOptions.onChange(changed);
  }
 });
 return {project:changed||saved.project,assets:saved.assets,notes:alignment.cues.length,
  modelId:model.id,neuralAdlib:true};
}
