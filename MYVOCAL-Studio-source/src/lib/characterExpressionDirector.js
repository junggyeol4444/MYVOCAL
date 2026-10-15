// STEP87: local lyric emotion cues + user-reviewed vocal dynamics and musical energy.
// Deterministic assistive rules, NOT a trained emotion-recognition AI model.
import {validateLipSync} from './characterLipSync.js';
export const EXPRESSION87_VERSION=1;
export const EXPRESSIONS87=['auto','neutral','happy','sad','angry','relaxed','surprised'];
const MAX_CUES=2000,MAX_TIME=3600000;
const isRecord=x=>x&&typeof x==='object'&&!Array.isArray(x);
const signatures=new WeakMap();
export function expressionSourceSignature(lipSync){
 if(lipSync&&signatures.has(lipSync))return signatures.get(lipSync);
 validateLipSync(lipSync);
 // A compact, deterministic integrity marker; prevents accidental application after lyric edits.
 const text=JSON.stringify(lipSync.cues);let hash=2166136261;
 for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}
 const signature=`${lipSync.cues.length}:${(hash>>>0).toString(16)}`;signatures.set(lipSync,signature);return signature;
}
export function detectLyricEmotion(lyric){
 const t=String(lyric||'').toLowerCase();
 if(/화나|분노|미워|증오|짜증|격노|angry|rage|hate/.test(t))return 'angry';
 if(/슬프|눈물|울고|울음|아파|이별|외로|그리워|sad|cry|alone|goodbye/.test(t))return 'sad';
 if(/놀라|갑자기|충격|깜짝|surprise|shock|wow/.test(t))return 'surprised';
 if(/행복|기쁨|사랑|웃음|웃어|좋아|반가|happy|love|smile|joy/.test(t))return 'happy';
 if(/조용|편안|고요|쉬어|평온|peace|calm|relax/.test(t))return 'relaxed';
 return 'neutral';
}
function overlapLyric(lipSync,startMs,endMs){
 const lyrics=[];let prev='';for(const c of lipSync.cues){if(c.endMs<=startMs||c.startMs>=endMs)continue;
  if(c.lyric&&c.lyric!==prev){lyrics.push(c.lyric);prev=c.lyric;}
 }return lyrics.join(' ').slice(0,1000);
}
export function createExpressionPlan(character){
 const lipSync=character?.lipSync;expressionSourceSignature(lipSync);
 if(!lipSync.cues.length)throw Error('STEP85 가사·음소 타임라인이 먼저 필요합니다.');
 // Merge adjacent phonemes belonging to the same lyric, but keep each distinct timed phrase.
 const rows=[];
 for(const c of lipSync.cues){const last=rows.at(-1);
  if(last&&last.endMs===c.startMs&&last.lyric===c.lyric){last.endMs=c.endMs;continue;}
  rows.push({startMs:c.startMs,endMs:c.endMs,lyric:c.lyric});
 }
 return {version:EXPRESSION87_VERSION,sourceSignature:expressionSourceSignature(lipSync),cues:rows.map(r=>({startMs:r.startMs,endMs:r.endMs,emotion:'auto',dynamics:.5,energy:.5}))};
}
export function validateExpressionPlan(character,plan){
 if(!character?.id||!isRecord(plan)||plan.version!==EXPRESSION87_VERSION||!Array.isArray(plan.cues)||!plan.cues.length||plan.cues.length>MAX_CUES)throw Error('STEP87 표정 타임라인 형식 또는 크기가 잘못되었습니다.');
 if(!['owned','self','licensed'].includes(character.rights)||(character.rights==='licensed'&&!character.rightsNote?.trim()))throw Error('본인 자료 또는 사용 허가 기록이 있는 캐릭터에만 표정 연출을 저장할 수 있습니다.');
 if(plan.sourceSignature!==expressionSourceSignature(character.lipSync))throw Error('STEP85 가사·음소가 변경되었습니다. 87단계 표정 계획을 재검토하세요.');
 let end=0;
 for(const c of plan.cues){if(!isRecord(c)||!Number.isInteger(c.startMs)||!Number.isInteger(c.endMs)||c.startMs<end||c.endMs<=c.startMs||c.endMs>MAX_TIME||!EXPRESSIONS87.includes(c.emotion)||!Number.isFinite(c.dynamics)||!Number.isFinite(c.energy)||c.dynamics<0||c.dynamics>1||c.energy<0||c.energy>1)throw Error('STEP87 표정·강약·에너지·시각이 잘못됐거나 겹칩니다.');end=c.endMs;}
 return plan;
}
export function saveExpressionPlan(character,plan){
 validateExpressionPlan(character,plan);
 return {...character,expression87:{version:1,sourceSignature:plan.sourceSignature,cues:plan.cues.map(c=>({...c}))},updatedAt:new Date().toISOString()};
}
export function expressionLines(plan){
 if(!plan?.cues)return '';
 return plan.cues.map(c=>`${(c.startMs/1000).toFixed(3)},${(c.endMs/1000).toFixed(3)},${c.emotion},${c.dynamics.toFixed(2)},${c.energy.toFixed(2)}`).join('\n');
}
export function parseExpressionLines(character,text){
 if(typeof text!=='string'||text.length>120000)throw Error('STEP87 입력 크기 초과');
 const cues=text.split(/\r?\n/).filter(s=>s.trim()).map(line=>{const a=line.split(',');if(a.length!==5||a.some(x=>!x.trim()))throw Error('줄 형식: 시작초,종료초,감정,보컬강약,음악에너지');
  return {startMs:Math.round(Number(a[0])*1000),endMs:Math.round(Number(a[1])*1000),emotion:a[2].trim(),dynamics:Number(a[3]),energy:Number(a[4])};
 });
 return validateExpressionPlan(character,{version:1,sourceSignature:expressionSourceSignature(character.lipSync),cues});
}
/** Expression at song time. Missing/invalid plans are disabled, never break legacy playback. */
export function expressionAt(character,plan,time){
 if(!plan?.cues||!Number.isFinite(time)||time<0)return null;
 try{if(plan.sourceSignature!==expressionSourceSignature(character?.lipSync))return null;}catch{return null;}
 const ms=Math.round(time*1000),cues=plan.cues;let low=0,high=cues.length-1,found=null;
 while(low<=high){const mid=(low+high)>>1,c=cues[mid];if(!Number.isInteger(c?.startMs)||!Number.isInteger(c?.endMs))return null;
  if(ms<c.startMs)high=mid-1;else if(ms>=c.endMs)low=mid+1;else{found=c;break;}}
 if(!found||!EXPRESSIONS87.includes(found.emotion)||!Number.isFinite(found.dynamics)||!Number.isFinite(found.energy)||found.dynamics<0||found.dynamics>1||found.energy<0||found.energy>1)return null;
 const lyric=overlapLyric(character.lipSync,found.startMs,found.endMs);
 let expression=found.emotion==='auto'?detectLyricEmotion(lyric):found.emotion;
 if(found.emotion==='auto'&&expression==='neutral'){if(found.energy>=.85)expression='surprised';else if(found.energy<=.2&&found.dynamics<=.3)expression='relaxed';}
 const magnitude=Math.min(1,.3+.4*found.dynamics+.3*found.energy);
 const fade=Math.min(1,(ms-found.startMs)/120,(found.endMs-ms)/120);
 const weight=expression==='neutral'?0:Math.max(0,magnitude*fade);
 return {expression,weight,lyric,dynamics:found.dynamics,energy:found.energy,source:found.emotion==='auto'?'가사 규칙 분석':'수동 지정'};
}
export function usableExpressionPlan(character){try{return character?.expression87&&validateExpressionPlan(character,character.expression87)?character.expression87:null;}catch{return null;}}
export function expressionPlanStatus(character){if(!character?.expression87)return '표정 타임라인 없음';try{validateExpressionPlan(character,character.expression87);return '표정 연출 저장됨';}catch{return '가사 변경 / 표정 계획 재검토 필요';}}
