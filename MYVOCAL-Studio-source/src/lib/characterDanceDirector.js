// STEP88 — local, deterministic beat/genre/section dance direction.
// Motion Reference is a user-reviewed VIDEO + manual move/time annotation;
// video pose extraction and webcam capture are reserved for later stages.
import {resolveGenreMix,validateGenreMix} from './genreMix.js';
import {modelAssets} from './character3d.js';
export const DANCE_MOVES=['groove','step','bounce','sway','wave','pose'];
export const DANCE88_VERSION=1;
const valid=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
const finite=(x,lo,hi)=>typeof x==='number'&&Number.isFinite(x)&&x>=lo&&x<=hi;
const fail=msg=>{throw Error(msg);};
export function danceReferences(character){return (character?.assets||[]).filter(a=>a.role==='motion-reference'&&a.type?.startsWith('video/')&&/\.(mp4|webm|mov|m4v)$/i.test(a.name||''));}
function permitted(character){if(!character?.id||!['owned','self','licensed'].includes(character.rights)||(character.rights==='licensed'&&!character.rightsNote?.trim()))fail('본인 제작 또는 사용 허가를 기록한 캐릭터만 춤 동작을 저장할 수 있습니다.');}
function sectionSnapshot(project,bpm,mix){
 const raw=project?.sections;
 if(raw!==undefined&&(!Array.isArray(raw)||raw.length>256))fail('곡 구간 형식/개수 오류');
 let cursor=0;
 const sections=(raw?.length?raw:[{name:'전체 구간',bars:256}]).map(s=>{
  if(!valid(s)||typeof s.name!=='string'||s.name.length>100||!Number.isInteger(s.bars)||s.bars<1||s.bars>512)fail('곡 구간 이름 또는 마디 수 오류');
  const genreMix=s.genreMix==null?mix:validateGenreMix(s.genreMix),startMs=cursor;
  cursor+=s.bars*240000/bpm;
  return {name:s.name,startMs:Math.round(startMs),endMs:Math.round(cursor),genreMix};
 });
 return sections;
}
function chooseMove(mix,section,bar){const title=section.toLowerCase(),main=mix.slice().sort((a,b)=>b.weight-a.weight)[0]?.name?.toLowerCase()||'';
 if(/chorus|후렴|drop|final/.test(title))return ['step','wave','bounce','groove'][bar%4];
 if(/ballad|acoustic|lo-fi|orchestral|cinematic|jazz/.test(main))return ['sway','pose','sway','groove'][bar%4];
 if(/rock|metal|punk/.test(main))return ['bounce','wave','step','groove'][bar%4];
 if(/edm|techno|house|hip-hop|dance|k-pop/.test(main))return ['step','groove','bounce','wave'][bar%4];
 return ['groove','sway','step','pose'][bar%4];
}
export function createDancePlan(character,project=null,{bpm=project?.bpm??120,durationSec=project?.stage3d?.duration??character?.stage3d?.duration??8,genreMix=project?.genreMix??null,referenceAssetId=''}={}){
 permitted(character);
 if(!modelAssets(character).length&&!character.layerPlan?.reviewed)fail('검토된 2D 캐릭터 또는 등록된 3D 모델이 필요합니다.');
 if(!finite(bpm,40,240)||!finite(durationSec,2,30))fail('BPM(40~240) 또는 영상 길이(2~30초) 오류');
 const mix=resolveGenreMix(genreMix,project?.genre||'Rock');
 const sections=sectionSnapshot(project,bpm,mix);
 const step=240000/bpm,count=Math.ceil(durationSec*1000/step),cues=[];
 for(let i=0;i<count;i++){
  const startMs=Math.round(i*step),endMs=Math.min(Math.round(durationSec*1000),Math.round((i+1)*step));
  const section=sections.find(s=>startMs>=s.startMs&&startMs<s.endMs)||sections.at(-1);
  cues.push({startMs,endMs,move:chooseMove(section.genreMix,section.name,i),strength:/chorus|후렴|drop/i.test(section.name)?.9:.65,section:section.name,referenceStartMs:null});
 }
 const plan={version:DANCE88_VERSION,bpm,durationMs:Math.round(durationSec*1000),projectId:project?.id||'',genreMix:mix,referenceAssetId,sections,cues};
 return validateDancePlan(character,plan);
}
// 원본 29·30항: 기존 30초 STEP88을 보존하면서 실제 음악 프로젝트
// 3~6분 BPM·곡 구간을 전부 포함하는 춤 연출을 생성한다.
// 사용자가 직접 작성한 STEP88 큐는 이 함수에서 절대 변경하지 않는다.
export function createFullSongDancePlan(character,project,{durationSec=project?.neuralAutoScore?.durationSec}={}){
 permitted(character);
 if(!project?.id||!Array.isArray(project.tracks))
  fail('장편 춤을 만들 기존 음악 프로젝트가 필요합니다.');
 if(!modelAssets(character).length&&!character.layerPlan?.reviewed)
  fail('장편 춤에는 등록된 2D/3D 캐릭터가 필요합니다.');
 const bpm=Number(project.bpm);
 if(!finite(bpm,40,240)||!finite(durationSec,150,360))
  fail('3~6분 장편 춤에는 실제 곡 길이와 40~240 BPM이 필요합니다.');
 const mix=resolveGenreMix(project.genreMix??null,project.genre||'Rock');
 const sections=sectionSnapshot(project,bpm,mix);
 const durationMs=Math.round(durationSec*1000),barMs=240000/bpm;
 const totalBars=Math.ceil(durationMs/barMs),barsPerCue=Math.max(1,Math.ceil(totalBars/256));
 const cues=[];
 for(let bar=0;bar<totalBars;bar+=barsPerCue){
  const startMs=Math.round(bar*barMs);
  const endMs=Math.min(durationMs,Math.round((bar+barsPerCue)*barMs));
  if(endMs<=startMs)continue;
  const section=sections.find(x=>startMs>=x.startMs&&startMs<x.endMs)||sections.at(-1);
  const isChorus=/chorus|후렴|drop/i.test(section.name);
  cues.push({startMs,endMs,move:chooseMove(section.genreMix,section.name,bar),
   strength:isChorus?.9:.65,section:section.name,referenceStartMs:null});
 }
 const plan={version:DANCE88_VERSION,bpm,durationMs,projectId:project.id,genreMix:mix,
  referenceAssetId:'',sections,cues};
 return validateDancePlan(character,plan);
}
export function validateDancePlan(character,plan){
 permitted(character);
 if(!valid(plan)||plan.version!==DANCE88_VERSION||!finite(plan.bpm,40,240)||!Number.isInteger(plan.durationMs)||plan.durationMs<2000||plan.durationMs>360000||typeof plan.projectId!=='string'||plan.projectId.length>120)fail('STEP88 춤 계획 버전·BPM·길이 오류');
 if(!modelAssets(character).length&&!character.layerPlan?.reviewed)fail('사용 가능한 2D/3D 캐릭터가 없습니다.');
 validateGenreMix(plan.genreMix);
 if(typeof plan.referenceAssetId!=='string'||plan.referenceAssetId.length>120||plan.referenceAssetId&&!danceReferences(character).some(a=>a.id===plan.referenceAssetId))fail('STEP88 동작 참고 영상 자산을 찾지 못했습니다.');
 if(!Array.isArray(plan.sections)||!plan.sections.length||plan.sections.length>256)fail('곡 구간 구조 오류');
 let sEnd=0;
 for(const s of plan.sections){if(!valid(s)||typeof s.name!=='string'||s.name.length>100||!Number.isInteger(s.startMs)||!Number.isInteger(s.endMs)||s.startMs!==sEnd||s.endMs<=s.startMs||s.endMs>36000000)fail('곡 구간 타이밍 오류');validateGenreMix(s.genreMix);sEnd=s.endMs;}
 if(!Array.isArray(plan.cues)||!plan.cues.length||plan.cues.length>256)fail('춤 동작 큐는 1~256개여야 합니다.');
 let end=0;
 for(const c of plan.cues){if(!valid(c)||!Number.isInteger(c.startMs)||!Number.isInteger(c.endMs)||c.startMs<end||c.startMs<0||c.endMs<=c.startMs||c.endMs>plan.durationMs||!DANCE_MOVES.includes(c.move)||!finite(c.strength,0,1)||typeof c.section!=='string'||c.section.length>100)fail('춤 큐 타이밍·동작·강도 오류');
  if(c.referenceStartMs!==null&&(!plan.referenceAssetId||!Number.isInteger(c.referenceStartMs)||c.referenceStartMs<0||c.referenceStartMs>3600000))fail('동작 참고 영상의 시작 시간을 확인하세요.');
  end=c.endMs;
 }
 return plan;
}
export function saveDancePlan(character,plan){validateDancePlan(character,plan);return {...character,dance88:JSON.parse(JSON.stringify(plan)),updatedAt:new Date().toISOString()};}
export function usableDancePlan(character){try{return character?.dance88?validateDancePlan(character,character.dance88):null;}catch{return null;}}
export function danceStatus(character){if(!character?.dance88)return '춤 동작 계획 없음';return usableDancePlan(character)?'STEP88 춤 계획 저장됨':'춤 계획 재검토 필요';}
export function danceAt(plan,time){if(!plan||!Number.isFinite(time)||!Array.isArray(plan.cues))return null;
 const ms=Math.round(time*1000);if(ms<0||ms>=plan.durationMs)return null;
 let lo=0,hi=plan.cues.length-1,found=null;
 while(lo<=hi){const mid=(lo+hi)>>1,c=plan.cues[mid];if(ms<c.startMs)hi=mid-1;else if(ms>=c.endMs)lo=mid+1;else{found=c;break;}}
 if(!found)return null;
 const phase=(time*plan.bpm/60)%1,pulse=Math.sin(phase*2*Math.PI);
 const fade=Math.max(0,Math.min(1,(ms-found.startMs)/100,(found.endMs-ms)/100));
 return {move:found.move,strength:found.strength*fade,section:found.section,beat:time*plan.bpm/60,phase,pulse,referenceMs:found.referenceStartMs===null?null:found.referenceStartMs+(ms-found.startMs)};
}
export function dancePose(plan,time){const at=danceAt(plan,time);if(!at)return null;
 const {move,pulse,phase}=at,k=at.strength;
 const side=Math.sin(2*Math.PI*phase),down=.5-.5*Math.cos(2*Math.PI*phase);
 const angles={hips:0,spine:0,head:0,leftUpperArm:0,rightUpperArm:0,leftLowerArm:0,rightLowerArm:0,leftUpperLeg:0,rightUpperLeg:0};
 let lift=0,offset=0;
 if(move==='groove'){angles.hips=8*side;angles.spine=-5*side;angles.leftUpperArm=25+12*side;angles.rightUpperArm=-25+12*side;lift=.045*down;}
 else if(move==='step'){angles.hips=10*side;angles.leftUpperLeg=20*side;angles.rightUpperLeg=-20*side;angles.leftUpperArm=-25*side;angles.rightUpperArm=-25*side;offset=.07*side;}
 else if(move==='bounce'){lift=.11*down;angles.spine=7*down;angles.leftUpperArm=12*down;angles.rightUpperArm=-12*down;}
 else if(move==='sway'){angles.hips=9*side;angles.spine=8*side;angles.head=-5*side;angles.leftUpperArm=-14+6*side;angles.rightUpperArm=14+6*side;offset=.04*side;}
 else if(move==='wave'){angles.rightUpperArm=-52+15*side;angles.rightLowerArm=-45*side;angles.leftUpperArm=12*side;angles.head=4*side;}
 else if(move==='pose'){angles.leftUpperArm=16;angles.rightUpperArm=-16;angles.spine=3*side;}
 return {move,section:at.section,referenceMs:at.referenceMs,angles:Object.fromEntries(Object.entries(angles).map(([key,value])=>[key,value*k])),lift:lift*k,offset:offset*k};
}
export function danceLines(plan){return plan.cues.map(c=>`${(c.startMs/1000).toFixed(3)},${(c.endMs/1000).toFixed(3)},${c.move},${c.strength.toFixed(2)},${c.referenceStartMs===null?'':(c.referenceStartMs/1000).toFixed(3)}`).join('\n');}
export function parseDanceLines(character,base,text){if(typeof text!=='string'||text.length>30000)fail('춤 큐 편집 길이 초과');
 const cues=text.split(/\r?\n/).filter(x=>x.trim()).map((row,i)=>{
  const fields=row.split(',').map(x=>x.trim());if(fields.length!==5)fail(`${i+1}행: 시작초,끝초,동작,강도,참고영상 시작초(선택)`);
  const [a,b,move,strength,ref]=fields, startMs=Math.round(Number(a)*1000),endMs=Math.round(Number(b)*1000);
  if(!a||!b||!strength||!Number.isFinite(Number(a))||!Number.isFinite(Number(b))||!Number.isFinite(Number(strength)))fail(`${i+1}행 숫자 오류`);
  const referenceStartMs=ref===''?null:Math.round(Number(ref)*1000);
  if(ref!==''&&!Number.isFinite(Number(ref)))fail(`${i+1}행 참고영상 시간 오류`);
  const previous=base.cues[i];return {startMs,endMs,move,strength:Number(strength),section:previous?.section||'수동',referenceStartMs};
 });
 return validateDancePlan(character,{...base,cues});
}
