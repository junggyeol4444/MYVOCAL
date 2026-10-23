import {isPhonemePlanStale,validatePhonemePlan} from './phonemePlan.js';
import {normalizeSingingStyle} from './singingStyleControl.js';
// v1.3: Engine capability checks and OPTIONAL Hangul jamo hints.
// Jamo hints are not phoneme duration prediction or neural Singing synthesis.
const ONSETS=['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const VOWELS=['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
const CODAS=['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
export function hangulHint(text){
 const first=[...String(text||'')].find(x=>/^[가-힣]$/.test(x));
 if(!first)return null;
 const i=first.codePointAt(0)-0xac00;
 return {onset:ONSETS[Math.floor(i/588)],vowel:VOWELS[Math.floor(i/28)%21],coda:CODAS[i%28]};
}
export function singingCapabilitiesView(raw){
 if(!raw||raw.supported===false)return {supported:false,mode:'unknown',inferenceReady:false,models:[],message:'이 엔진은 모델 목록 제공 기능이 없어 실제 AI 추론 가능 여부를 알 수 없습니다.'};
 if(raw.protocol!=='MYVOCAL_SINGING_V1'||!['demo','sample','neural','unknown'].includes(raw.mode)||!Array.isArray(raw.models))throw Error('지원하지 않는 엔진 모델 정보입니다.');
 const modes={demo:'데모 음원 엔진',sample:'샘플 합성 엔진',neural:'신경망 엔진 (엔진 자체 신고)',unknown:'종류 확인되지 않음'};
 return {supported:true,mode:raw.mode,inferenceReady:raw.inferenceReady===true,models:raw.models.filter(m=>m&&typeof m.id==='string'&&m.id.length<=100),name:String(raw.name||'외부 엔진'),message:modes[raw.mode]};
}
export function engineModelCompatibility(cap,model){
 if(!cap?.supported)return {ok:true,warning:'엔진이 모델 목록을 제공하지 않습니다. 체크포인트 호환성을 확인할 수 없습니다.'};
 if(!model)return {ok:true,warning:cap.models.length?'엔진에서 사용할 모델을 선택하지 않았습니다.':'등록된 모델이 없습니다.'};
 const found=cap.models.find(m=>m.id===model.id);
 if(!found)return {ok:false,warning:'선택한 체크포인트 ID가 엔진 모델 목록에 없습니다. 엔진에서 모델을 설치/등록하세요.'};
 if(found.engineId&&model.engineId&&found.engineId!==model.engineId)return {ok:false,warning:`모델 엔진 유형 불일치: 앱 ${model.engineId}, 실행 서버 ${found.engineId}`};
 return {ok:true,warning:''};
}
export function buildSingingRequest(port,p,alignment,voice,model,phonemePlan=null){
 if(!voice||!['self','owned','licensed'].includes(voice.rights))throw Error('사용 허가된 목소리가 필요합니다.');
 if(!alignment||!Array.isArray(alignment.cues)||!alignment.cues.length)throw Error('가사·MIDI 싱크가 필요합니다.');
 if(phonemePlan){validatePhonemePlan(phonemePlan,alignment);}
 const style=normalizeSingingStyle(p?.singingStyle);
 return {port,format:'MYVOCAL_SINGING_REQUEST',version:1,project:p.title,voice:{id:voice.id,name:voice.name,rights:voice.rights},checkpoint:model?{id:model.id,name:model.name,engineId:model.engineId}:null,bpm:alignment.bpm,
   ...(style==='Natural'?{}:{singingStyle:style}),
   cues:alignment.cues.map(c=>({lyric:c.lyric,pitch:c.pitch,startSec:c.startSec,endSec:c.endSec,velocity:c.velocity,hangul:hangulHint(c.lyric)})),
   ...(phonemePlan?{phonemes:phonemePlan.segments.map(s=>({cueIndex:s.cueIndex,token:s.token,kind:s.kind,pitch:s.pitch,startSec:s.startSec,endSec:s.endSec}))}:{})};
}
export function appendRenderHistory(previous,entry){
 const history=Array.isArray(previous)?previous:[];
 return [...history,{id:String(entry.id||''),at:String(entry.at||new Date().toISOString()),mode:String(entry.mode||''),result:String(entry.result||''),notes:Number(entry.notes)||0,engine:String(entry.engine||'') }].slice(-20);
}
