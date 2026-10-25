import {stemPerformanceLevel} from './neuralStemPerformanceEnvelope.js';
// STEP89: consented local webcam / reference-video motion *energy* and MIDI-note performance.
// No face recognition, skeleton recovery, remote model or storage of raw video frames.
import {modelAssets} from './character3d.js';
import {danceReferences} from './characterDanceDirector.js';
export const PERFORMANCE89_VERSION=1;
export const PERFORMANCE_ROLES=['guitar','piano','drums','bass','strings','synth'];
const valid=x=>x&&typeof x==='object'&&!Array.isArray(x);
const num=(x,a,b)=>typeof x==='number'&&Number.isFinite(x)&&x>=a&&x<=b;
const denied=()=>{throw Error('본인 제작 또는 사용 허가받은 캐릭터가 필요합니다.');};
const allowed=c=>{if(!c?.id||!['owned','self','licensed'].includes(c.rights)||(c.rights==='licensed'&&!c.rightsNote?.trim()))denied();if(!modelAssets(c).length&&!c.layerPlan?.reviewed)throw Error('STEP81 검토된 2D 또는 3D 모델이 필요합니다.');};
const framesMax=450;
export function createPerformance89(character,project=null,{durationSec=8,source='manual',referenceAssetId=''}={}){
 allowed(character);
 if(!num(durationSec,1,30)||!['manual','webcam','reference'].includes(source))throw Error('연기 길이 또는 영상 종류 오류');
 const plan={version:1,durationMs:Math.round(durationSec*1000),projectId:project?.id||'',source,referenceAssetId,frames:[],instruments:[]};
 if(project)plan.instruments=extractInstrumentEvents(project,plan.durationMs);
 return validatePerformance89(character,plan);
}
export function extractInstrumentEvents(project,durationMs=30000){
 if(!valid(project)||!num(project.bpm,20,300)||!Array.isArray(project.tracks)||project.tracks.length>512||!Number.isInteger(durationMs)||durationMs>30000)throw Error('음악 프로젝트 MIDI 또는 BPM 형식 오류');
 const events=[];
 for(const track of project.tracks){
  if(!track||track.mute===true||!Array.isArray(track.midiNotes))continue;
  const role=String(track.instrument||'').toLowerCase();if(!PERFORMANCE_ROLES.includes(role))continue;
  if(track.midiNotes.length>10000)throw Error('트랙 MIDI 음표가 너무 많습니다.');
  for(const note of track.midiNotes){
   if(!valid(note)||!num(note.startBeat,0,200000)||!num(note.length,.001,10000)||!num(note.pitch,0,127)||!num(note.velocity,1,127))continue;
   const startMs=Math.round(note.startBeat*60000/project.bpm),endMs=Math.min(durationMs,Math.round((note.startBeat+note.length)*60000/project.bpm));
   if(startMs>=durationMs||endMs<=startMs)continue;
   events.push({trackId:String(track.id||'').slice(0,120),role,startMs,endMs,pitch:Math.round(note.pitch),velocity:Math.round(note.velocity)});
   if(events.length>512)throw Error('30초 연주 구간은 MIDI 음표 512개 이하여야 합니다.');
  }
 }
 return events.sort((a,b)=>a.startMs-b.startMs||a.pitch-b.pitch);
}
export function validatePerformance89(character,plan){
 allowed(character);
 if(!valid(plan)||plan.version!==1||!Number.isInteger(plan.durationMs)||plan.durationMs<1000||plan.durationMs>30000||!['manual','webcam','reference'].includes(plan.source)||typeof plan.projectId!=='string'||plan.projectId.length>120||typeof plan.referenceAssetId!=='string'||plan.referenceAssetId.length>120)throw Error('STEP89 버전·시간·연기 소스 오류');
 if(plan.source==='reference'&&!danceReferences(character).some(a=>a.id===plan.referenceAssetId))throw Error('허가받은 참고 영상 파일이 없습니다.');
 if(plan.source!=='reference'&&plan.referenceAssetId)throw Error('참고 영상 식별자가 연기 소스와 일치하지 않습니다.');
 if(!Array.isArray(plan.frames)||plan.frames.length>framesMax||!Array.isArray(plan.instruments)||plan.instruments.length>512)throw Error('STEP89 연기 프레임 또는 연주 큐 초과');
 let last=-1;
 for(const f of plan.frames){if(!valid(f)||!Number.isInteger(f.ms)||f.ms<=last||f.ms<0||f.ms>plan.durationMs||!num(f.left,0,1)||!num(f.center,0,1)||!num(f.right,0,1))throw Error('연기 프레임 시간·움직임 오류');last=f.ms;}
 for(const e of plan.instruments)if(!valid(e)||!PERFORMANCE_ROLES.includes(e.role)||typeof e.trackId!=='string'||e.trackId.length>120||!Number.isInteger(e.startMs)||!Number.isInteger(e.endMs)||e.startMs<0||e.endMs<=e.startMs||e.endMs>plan.durationMs||!Number.isInteger(e.pitch)||e.pitch<0||e.pitch>127||!Number.isInteger(e.velocity)||e.velocity<1||e.velocity>127)throw Error('악기 연주 MIDI 큐 오류');
 return plan;
}
export function savePerformance89(character,plan){validatePerformance89(character,plan);return {...character,performance89:structuredClone(plan),updatedAt:new Date().toISOString()};}
export function usablePerformance89(character){try{return character?.performance89?validatePerformance89(character,character.performance89):null;}catch{return null;}}
export function performance89Status(character){return !character?.performance89?'직접 연기·연주 미설정':usablePerformance89(character)?'STEP89 연기·연주 저장됨':'STEP89 데이터 재검토 필요';}
// Three fixed thirds of a downsampled greyscale frame; direction-independent motion ENERGY.
// Frames only, never face identity, joints, or original pixels, are persisted.
export function grayscaleFrame(imageData,width,height){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<3||height<3||width*height>40000||imageData?.length!==width*height*4)throw Error('영상 프레임 크기 오류');
 const gray=new Uint8Array(width*height);
 for(let i=0;i<gray.length;i++)gray[i]=Math.round((imageData[i*4]*.299)+(imageData[i*4+1]*.587)+(imageData[i*4+2]*.114));
 return gray;
}
export function motionEnergy(previous,next,width,height){
 if(previous?.length!==width*height||next?.length!==width*height||width<3||height<3)throw Error('연기 프레임 크기가 일치하지 않습니다.');
 const sums=[0,0,0],counts=[0,0,0];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const z=Math.min(2,Math.floor(x*3/width));sums[z]+=Math.abs(next[y*width+x]-previous[y*width+x]);counts[z]++;}
 return Object.fromEntries(['left','center','right'].map((k,i)=>[k,Math.round(Math.min(1,sums[i]/(counts[i]*60))*1000)/1000]));
}
export function performanceAt(plan,time){
 if(!plan||!Number.isFinite(time)||time<0||time*1000>plan.durationMs)return null;
 const ms=time*1000,frames=plan.frames||[];let left=0,center=0,right=0;
 // 전곡 공연에서는 사용자가 실제 촬영한 1~30초 움직임 강약을
 // MIDI 마디 길이에 맞춰 반복한다. 관절·자세를 추정한 결과가 아니다.
 // STEP89 원본 프레임과 참고 영상은 복사하거나 수정하지 않는다.
 const loop=Number(plan.referenceLoopMs),sourceMs=Number(plan.referenceSourceDurationMs);
 const looped=Number.isFinite(loop)&&loop>=1000&&Number.isFinite(sourceMs)&&
  sourceMs>=1000&&sourceMs<=30000&&plan.durationMs>=150000;
 const phase=looped?ms%loop:ms;
 const sampleMs=looped?phase*sourceMs/loop:ms;
 const sample=target=>{
  let lo=0,hi=frames.length-1;
  while(lo<hi){const mid=(lo+hi+1)>>1;if(frames[mid].ms<=target)lo=mid;else hi=mid-1;}
  const a=frames[lo],b=frames[lo+1]||a;
  const k=a===b?0:Math.max(0,Math.min(1,(target-a.ms)/(b.ms-a.ms)));
  return {left:a.left+(b.left-a.left)*k,center:a.center+(b.center-a.center)*k,
   right:a.right+(b.right-a.right)*k};
 };
 if(frames.length){
  ({left,center,right}=sample(sampleMs));
  if(looped){
   // 반복 경계의 0.2초를 교차 보간해 6분 공연에서 몸짓이 튀지 않도록 한다.
   const fade=Math.min(200,loop*.1);
   if(phase>=loop-fade){
    const next=sample((phase-loop+fade)*sourceMs/loop);
    const weight=(phase-loop+fade)/fade;
    left=left*(1-weight)+next.left*weight;
    center=center*(1-weight)+next.center*weight;
    right=right*(1-weight)+next.right*weight;
   }
  }
 }
 const notes=(plan.instruments||[]).filter(e=>e.startMs<=ms&&e.endMs>ms);
 let guitar=0,piano=0,drums=0,bass=0,strings=0,synth=0;
 for(const n of notes){const pulse=Math.max(0,1-(ms-n.startMs)/Math.min(300,n.endMs-n.startMs)),v=n.velocity/127*(.3+.7*pulse);if(n.role==='guitar')guitar=Math.max(guitar,v);else if(n.role==='piano')piano=Math.max(piano,v);else if(n.role==='drums')drums=Math.max(drums,v);else if(n.role==='bass')bass=Math.max(bass,v);else if(n.role==='strings')strings=Math.max(strings,v);else synth=Math.max(synth,v);}
 // 원본 46·47항: MIDI 타이밍은 보존하고, 실제 MusicGen 독립 WAV가 연결된
  // 악기의 강약만 100ms PCM RMS 엔벨로프로 구동한다. 2D/VRM 렌더러가 공통 사용.
  const pcmEnvelope=plan.pcmEnergy;
  if(pcmEnvelope&&['guitar','bass','drums','piano','strings','synth'].includes(pcmEnvelope.role)){
   const pcm=stemPerformanceLevel(pcmEnvelope,ms+(Number(plan.pcmOffsetMs)||0));
   if(pcmEnvelope.role==='guitar')guitar=pcm;
   else if(pcmEnvelope.role==='bass')bass=pcm;
   else if(pcmEnvelope.role==='drums')drums=pcm;
   else if(pcmEnvelope.role==='piano')piano=pcm;
   else if(pcmEnvelope.role==='strings')strings=pcm;
   else synth=pcm;
  }
  return {left,center,right,guitar,piano,drums,bass,strings,synth,activeNotes:notes.length};
}
export function performancePose(plan,time){const a=performanceAt(plan,time);if(!a)return null;
 // Limited gesture approximation: explicitly not reconstructed camera poses or finger animation.
 return {angles:{leftUpperArm:30*a.left-13*a.piano-8*a.guitar,rightUpperArm:-30*a.right+18*a.guitar+12*a.piano,leftLowerArm:-40*a.piano-10*a.strings,rightLowerArm:-45*a.guitar-36*a.drums-12*a.bass,spine:9*a.center,head:5*(a.left-a.right),hips:8*a.center},lift:.045*a.center+.015*a.drums,offset:.045*(a.right-a.left),energy:Math.max(a.left,a.center,a.right,a.guitar,a.piano,a.drums,a.bass,a.strings,a.synth)};
}

export function performanceFrameLines(plan){return (plan?.frames||[]).map(f=>`${(f.ms/1000).toFixed(3)},${f.left.toFixed(3)},${f.center.toFixed(3)},${f.right.toFixed(3)}`).join('\n');}
export function parsePerformanceFrameLines(character,plan,lines){
 if(typeof lines!=='string'||lines.length>30000)throw Error('움직임 타임라인 텍스트가 너무 깁니다.');
 const rows=lines.trim()?lines.trim().split(/\r?\n/):[];
 if(rows.length>450)throw Error('움직임 프레임은 최대 450개입니다.');
 const frames=rows.map((line,i)=>{const fields=line.split(',').map(x=>x.trim());
  if(fields.length!==4||fields.some(x=>x===''))throw Error(`${i+1}행: 초,왼쪽,중앙,오른쪽 형식 오류`);
  const numbers=fields.map(Number);if(numbers.some(x=>!Number.isFinite(x)))throw Error(`${i+1}행에 잘못된 숫자가 있습니다.`);
  return {ms:Math.round(numbers[0]*1000),left:numbers[1],center:numbers[2],right:numbers[3]};
 });
 return validatePerformance89(character,{...plan,frames});
}
