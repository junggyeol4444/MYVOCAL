// v1.3. Editable Korean Hangul jamo timing HINTS, not G2P / audio forced alignment.
// Real phonetic pronunciation depends on context (liaison, assimilation, etc.) and a
// compatible external neural singing engine must interpret these hints explicitly.
import {validateAlignment} from './lyricAlignment.js';

const ONSETS=['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const NUCLEI=['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
const CODAS=['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const round = n => Math.round(n*10000)/10000;
const HANGUL=/^[가-힣]$/;

export function syllableHint(ch){
 if(!HANGUL.test(ch))return null;
 const i=ch.codePointAt(0)-0xac00;
 return {onset:ONSETS[Math.floor(i/588)],nucleus:NUCLEI[Math.floor(i/28)%21],coda:CODAS[i%28]};
}
export function phonemeSourceKey(alignment){
 return JSON.stringify({projectId:alignment?.projectId,trackId:alignment?.trackId,sourceKey:alignment?.sourceKey,
  cues:alignment?.cues?.map(c=>[c.lyric,c.pitch,c.startSec,c.endSec])||[]});
}
export function isPhonemePlanStale(alignment,plan){
 return !alignment||!plan||plan.format!=='MYVOCAL_PHONEME_HINTS'||plan.version!==1||plan.sourceKey!==phonemeSourceKey(alignment);
}
export function buildPhonemePlan(alignment){
 validateAlignment(alignment);
 const segments=[],warnings=[];
 for(let n=0;n<alignment.cues.length;n++){
  const cue=alignment.cues[n],text=cue.lyric.trim();
  if(!text||text==='—')continue;
  // User may attach multiple syllables to one note; split its time evenly.
  // Do not invent Latin pronunciation: leave Latin script as a textual label.
  const units=[...text].filter(x=>!(/\s/u).test(x));
  if(units.length>24)throw Error('음표 하나의 가사는 최대 24글자까지만 발음 힌트로 분리할 수 있습니다.');
  const duration=cue.endSec-cue.startSec;
  for(let j=0;j<units.length;j++){
   const ch=units[j],hint=syllableHint(ch),left=cue.startSec+duration*j/units.length,right=cue.startSec+duration*(j+1)/units.length;
   const parts=[];
   if(!hint){parts.push(['text',ch,1]);warnings.push(`${n+1}번 음표의 '${ch}'는 발음 변환하지 않았습니다.`);}
   else{
    if(hint.onset!=='ㅇ')parts.push(['onset',hint.onset,0.18]);
    parts.push(['nucleus',hint.nucleus,0.70]);
    if(hint.coda)parts.push(['coda',hint.coda,0.12]);
   }
   // Ensure no zero-duration slivers for unusually short MIDI notes.
   if(right-left<parts.length*0.004){
    warnings.push(`${n+1}번 음표의 '${ch}'가 너무 짧아 모음/문자 구간만 배치했습니다.`);
    parts.splice(0,parts.length,['text',hint?.nucleus||ch,1]);
   }
   const total=parts.reduce((a,p)=>a+p[2],0);
   let t=left;
   for(let k=0;k<parts.length;k++){
    const [kind,token,weight]=parts[k],end=k===parts.length-1?right:t+(right-left)*weight/total;
    segments.push({id:`c${n}-u${j}-p${k}`,cueIndex:n+1,syllable:ch,kind,token,pitch:cue.pitch,startSec:round(t),endSec:round(end)});
    t=end;
   }
  }
 }
 if(!segments.length)throw Error('발음 계획을 만들 가사가 없습니다. 가사·MIDI 싱크를 확인하세요.');
 if(segments.length>(alignment.longForm===true?2048:512))throw Error('발음 구간 제한을 초과했습니다. 짧게 나눠 생성하세요.');
 const plan={format:'MYVOCAL_PHONEME_HINTS',version:1,projectId:alignment.projectId,trackId:alignment.trackId,
  sourceKey:phonemeSourceKey(alignment),createdAt:new Date().toISOString(),method:'jamo-heuristic-not-audio-alignment',segments,warnings:warnings.slice(0,50)};
 validatePhonemePlan(plan,alignment);
 return plan;
}
export function validatePhonemePlan(plan,alignment){
 if(!plan||plan.format!=='MYVOCAL_PHONEME_HINTS'||plan.version!==1||!Array.isArray(plan.segments)||!plan.segments.length||plan.segments.length>(alignment?.longForm===true?2048:512))throw Error('발음 타임라인 파일 형식이 올바르지 않습니다.');
 if(alignment){validateAlignment(alignment);if(isPhonemePlanStale(alignment,plan))throw Error('가사·MIDI가 달라져 발음 계획을 다시 생성해야 합니다.');}
 const lastEnd=new Map();
 for(const s of plan.segments){
  const cue=alignment?.cues?.[s.cueIndex-1];
  if(!Number.isInteger(s.cueIndex)||s.cueIndex<1||s.cueIndex>(alignment?.longForm===true?512:128)||typeof s.token!=='string'||s.token.length<1||s.token.length>40||/[\r\n\u0000-\u001f]/.test(s.token)||!['onset','nucleus','coda','text'].includes(s.kind)||
    !Number.isFinite(s.startSec)||!Number.isFinite(s.endSec)||s.startSec<0||s.endSec<=s.startSec||s.endSec>(alignment?.longForm===true?360.001:90.001)|| !Number.isFinite(s.pitch)||s.pitch<36||s.pitch>96)throw Error('발음 구간의 텍스트·시간·음높이가 잘못되었습니다.');
  if(cue&&(s.startSec<cue.startSec-0.001||s.endSec>cue.endSec+0.001||s.pitch!==cue.pitch))throw Error(`${s.cueIndex}번 음표의 범위 밖으로 발음 구간을 지정했습니다.`);
  if(lastEnd.has(s.cueIndex)&&s.startSec<lastEnd.get(s.cueIndex)-0.00011)throw Error(`${s.cueIndex}번 음표의 발음 구간이 겹치거나 순서가 바뀌었습니다.`);
  lastEnd.set(s.cueIndex,s.endSec);
 }
 return true;
}
export function planAsCsv(plan,alignment){
 validatePhonemePlan(plan,alignment);
 const esc=s=>'"'+String(s).replaceAll('"','""')+'"';
 const rows=[['cue','syllable','phase','token','pitch','start_sec','end_sec'],...plan.segments.map(s=>[s.cueIndex,s.syllable,s.kind,s.token,s.pitch,s.startSec,s.endSec])];
 return '\uFEFF'+rows.map(row=>row.map(esc).join(',')).join('\r\n')+'\r\n';
}
export function planAsJson(plan,alignment){validatePhonemePlan(plan,alignment);return JSON.stringify(plan,null,2)+'\n';}
