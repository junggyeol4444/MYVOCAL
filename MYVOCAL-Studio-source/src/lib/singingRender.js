// v1.0: Transparent cue-synchronized vowel SAMPLE renderer.
// Uses snippets from recordings already prepared in the local sampler.
// Does not produce spoken words, neural synthesis, speaker cloning or AI singing.
import {getFile} from './assetDb.js';
import {pcmToWav} from './localVocalSampler.js';
import {validateAlignment} from './lyricAlignment.js';
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
export const VOWEL_NAMES={a:'ㅏ',eo:'ㅓ',i:'ㅣ',u:'ㅜ'};
// Hangul syllable final decomposition, only representative categories are available.
const JUNGSEONG=['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
export function lyricVowel(lyric){
 const letter=[...String(lyric||'')].find(ch=>/[가-힣]/u.test(ch)||/[ㅏㅓㅣㅜ]/u.test(ch));
 if(!letter)return null;
 if(VOWEL_NAMES.a===letter)return 'a';
 if(VOWEL_NAMES.eo===letter)return 'eo';
 if(VOWEL_NAMES.i===letter)return 'i';
 if(VOWEL_NAMES.u===letter)return 'u';
 const code=letter.codePointAt(0);
 if(code<0xac00||code>0xd7a3)return null;
 const vowel=JUNGSEONG[Math.floor((code-0xac00)/28)%21];
 if(['ㅏ','ㅑ','ㅘ','ㅙ','ㅐ','ㅒ','ㅗ','ㅛ','ㅚ'].includes(vowel))return 'a';
 if(['ㅓ','ㅕ','ㅔ','ㅖ','ㅝ','ㅞ'].includes(vowel))return 'eo';
 if(['ㅣ','ㅟ','ㅢ'].includes(vowel))return 'i';
 if(['ㅜ','ㅠ','ㅡ'].includes(vowel))return 'u';
 return null;
}
export function guessVowelModels(models){
 const result={a:'',eo:'',i:'',u:''};
 for(const m of models||[]){
  if(m.engineId!=='sampler'||m.status!=='sample-preview-ready')continue;
  const v=String(m.sourcePromptId||'').split('-').at(-1);
  if(v in result&&!result[v])result[v]=m.id;
 }
 return result;
}
export function validateVowelRender(alignment,voice,modelMap,models){
 validateAlignment(alignment);
 if(!['self','owned','licensed'].includes(voice?.rights))throw Error('본인 또는 사용 허가가 있는 목소리만 사용할 수 있습니다.');
 const ids=Object.values(modelMap||{}).filter(Boolean);
 if(!ids.length)throw Error('보컬 샘플 모델을 최소 하나 선택해야 합니다. Voice Training에서 먼저 만들어 주세요.');
 const available=new Map((models||[]).map(m=>[m.id,m]));
 for(const id of ids){const m=available.get(id);
  if(!m||m.voiceId!==voice.id||m.engineId!=='sampler'||m.status!=='sample-preview-ready'||!m.assetId||!Number.isFinite(Number(m.sourceHz))||Number(m.sourceHz)<75||Number(m.sourceHz)>900){
   throw Error('선택한 샘플 모델이 없거나 다른 목소리의 샘플입니다.');
  }
 }
 const final=Math.max(...alignment.cues.map(c=>c.endSec))+.2;
 if(final>90.2)throw Error('최대 90초까지만 렌더링할 수 있습니다.');
 return {seconds:final,notes:alignment.cues.length};
}
export async function renderVowelSinging(alignment,voice,modelMap,models,{loadFile=getFile,contextFactory}={}){
 const {seconds}=validateVowelRender(alignment,voice,modelMap,models);
 const all=(models||[]).filter(m=>m.voiceId===voice.id&&m.engineId==='sampler');
 const selected=[...new Set(Object.values(modelMap).filter(Boolean))];
 const C=globalThis.AudioContext||globalThis.webkitAudioContext;
 const O=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;
 if(!contextFactory&&(!C||!O))throw Error('오프라인 오디오 렌더링을 지원하지 않습니다. Edge/Chrome 최신 버전이 필요합니다.');
 const buffers={};
 let temporary=null;
 if(!contextFactory)temporary=new C();
 try{
  for(const id of selected){
   const model=all.find(m=>m.id===id),file=await loadFile(model.assetId);
   if(!file?.size)throw Error(`샘플 파일을 찾을 수 없습니다: ${model.name}`);
   buffers[id]=contextFactory?await (await contextFactory('decode')).decodeAudioData(await file.arrayBuffer()):await temporary.decodeAudioData(await file.arrayBuffer());
  }
 }finally{if(temporary)await temporary.close().catch(()=>{});}
 const sampleRate=44100;
 const offline=contextFactory?await contextFactory('offline',1,Math.ceil(seconds*sampleRate),sampleRate):new O(1,Math.ceil(seconds*sampleRate),sampleRate);
 const fallback=selected[0];let rendered=0,missing=0;
 for(const cue of alignment.cues){
  if(!cue.lyric||cue.lyric==='—'){missing++;continue;}
  const vowel=lyricVowel(cue.lyric),id=modelMap[vowel]||fallback;
  if(!id){missing++;continue;}
  const model=all.find(m=>m.id===id),buffer=buffers[id];
  const src=offline.createBufferSource(),gain=offline.createGain();
  src.buffer=buffer;src.loop=true;
  src.playbackRate.value=clamp((440*Math.pow(2,(cue.pitch-69)/12))/model.sourceHz,.28,4);
  const start=cue.startSec,length=cue.endSec-cue.startSec;
  const amp=.48*clamp(Number(cue.velocity||90)/127,.25,1);
  const attack=Math.min(.028,length*.27),release=Math.min(.09,length*.27);
  gain.gain.setValueAtTime(0,start);
  gain.gain.linearRampToValueAtTime(amp,start+attack);
  gain.gain.setValueAtTime(amp,Math.max(start+attack,start+length-release));
  gain.gain.linearRampToValueAtTime(0,start+length);
  src.connect(gain);gain.connect(offline.destination);
  src.start(start);src.stop(start+length+.003);rendered++;
 }
 if(!rendered)throw Error('렌더링할 가사가 없습니다. 싱크의 가사를 확인해 주세요.');
 const result=await offline.startRendering();
 return {file:pcmToWav(result.getChannelData(0),sampleRate),rendered,skipped:missing,seconds,kind:'vowel-sample-preview'};
}
