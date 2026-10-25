// MYVOCAL Windows EXE 본체에서 실제 DiffSinger acoustic+vocoder 모델을 직접 추론.
// 사용자 권한이 있는 한국어 음소 사전과 MIDI를 실제 DS 음소/F0 입력으로 변환한다.
// 생성 음원은 로컬 신경망 모델에서만 오며 합성음 대체·가짜 모델은 사용하지 않는다.
import {assertUsableSingingWav} from './singingOutputValidation.js';
import {validatePhonemePlan} from './phonemePlan.js';
const MAX_NOTES=2048,MAX_SECONDS=360;
const windowsPython=x=>typeof x==='string'&&x.length<2048&&
 (/^[a-zA-Z]:[\\/]/.test(x)||/^\\\\[^\\]+\\/.test(x))&&/(?:^|[\\/])python\.exe$/i.test(x);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const outputNumber=x=>Math.round(x*10000)/10000;
const normalizeWord=x=>String(x||'').replace(/\s+/g,'');
export function parseDiffSingerDictionary(contents){
 if(typeof contents!=='string'||contents.length<10||contents.length>2*1024*1024)
  throw Error('현재 신경망 모델의 한국어 발음 사전은 2MB 이하 UTF-8 텍스트여야 합니다.');
 const dictionary=new Map();
 for(const line of contents.split(/\r?\n/)){
  const row=line.trim();
  if(!row||row.startsWith('#'))continue;
  const parts=row.split('\t');
  if(parts.length!==2)continue;
  const [syllable,phones]=parts;
  const values=phones.trim().split(/\s+/).filter(Boolean);
  if(!syllable||!values.length||values.length>12||values.some(v=>!/^[\p{L}\p{N}_/+-]{1,60}$/u.test(v)))continue;
  dictionary.set(syllable.trim(),values);
 }
 if(!dictionary.size)throw Error('DiffSinger 한국어 발음 사전의 음절·음소 목록이 없습니다.');
 return dictionary;
}
export function buildKoreanDiffSingerDS(alignment,dictionary,{timestep=.01,phonemePlan=null}={}){
 if(!(dictionary instanceof Map)||!dictionary.size)throw Error('현재 학습 모델에 맞는 발음 사전을 선택하세요.');
 const cues=alignment?.cues;
 if(!Array.isArray(cues)||cues.length<1||cues.length>MAX_NOTES||!finite(timestep)||timestep<.005||timestep>.02)
  throw Error('현재 프로젝트의 한국어 가사·MIDI 음표가 필요합니다.');
 if(phonemePlan)validatePhonemePlan(phonemePlan,alignment);
 const cueDurations=new Map();
 if(phonemePlan)for(const segment of phonemePlan.segments){
  const label=/^c\\d+-u(\\d+)-p\\d+$/.exec(String(segment.id||''));
  if(!label)continue;
  const key=segment.cueIndex+':'+Number(label[1]);
  const len=Number(segment.endSec)-Number(segment.startSec);
  if(!finite(len)||len<=0)throw Error('발음 타임라인의 음절 길이가 잘못됐습니다.');
  cueDurations.set(key,(cueDurations.get(key)||0)+len);
 }
 let last=0;
 const prepared=cues.map((cue,index)=>{
  const text=normalizeWord(cue.lyric);
  const phonemes=(text==='—'||text==='-'||text==='_'||text==='SP')?['SP']:[...text].flatMap(ch=>{
   const found=dictionary.get(ch);
   if(!found)throw Error((index+1)+'번 MIDI 음표의 음절 '+ch+'가 현재 가수 모델 발음 사전에 없습니다.');
   return found;
  });
  if(!phonemes.length||phonemes.length>36||!finite(cue.pitch)||cue.pitch<36||cue.pitch>96||
   !finite(cue.startSec)||!finite(cue.endSec)||cue.startSec<last-.001||
   cue.endSec-cue.startSec<.075||cue.endSec>MAX_SECONDS)
   throw Error((index+1)+'번 노랫말·음정·길이의 신경망 합성 조건이 올바르지 않습니다.');
  last=cue.endSec;
  const syllables=[...text];
  const groups=syllables.map((ch,i)=>({count:(dictionary.get(ch)||[]).length,weight:cueDurations.get((index+1)+':'+i)||0}));
  const good=groups.length&&groups.every(g=>g.count>0&&g.weight>0);
  return {start:cue.startSec,end:cue.endSec,pitch:cue.pitch,phonemes,groups:good?groups:null};
 });
 const pieces=[];let current=[];
 const finish=()=>{
  if(!current.length)return;
  const first=current[0].start,absoluteEnd=current[current.length-1].end;
  const ph=[],dur=[];
  let cursor=first;
  for(const cue of current){
   const gap=cue.start-cursor;
   if(gap>.001){ph.push('SP');dur.push(gap);}
   const noteSec=cue.end-cue.start,n=cue.phonemes.length;
   if(cue.groups){
    const sum=cue.groups.reduce((s,g)=>s+g.weight,0);
    let index=0;
    for(const group of cue.groups){
     const part=noteSec*group.weight/sum;
     for(let i=0;i<group.count;i++){ph.push(cue.phonemes[index++]);dur.push(part/group.count);}
    }
   }else{
    const unit=noteSec/n;
    cue.phonemes.forEach((value,i)=>{ph.push(value);dur.push(i===n-1?noteSec-unit*(n-1):unit);});
   }
   cursor=cue.end;
  }
  const length=absoluteEnd-first;
  const frames=Math.max(1,Math.ceil(length/timestep));
  const f0=Array.from({length:frames},(_,i)=>{
   const t=first+i*timestep;
   const c=current.find(x=>t>=x.start&&t<x.end);
   return c&&c.phonemes[0]!=='SP'?Math.round(440*2**((c.pitch-69)/12)*100)/100:0;
  });
  // acoustic model actually consumes ph_seq/ph_dur and f0_seq.
  pieces.push({offset:outputNumber(first),ph_seq:ph.join(' '),
   ph_dur:dur.map(d=>String(outputNumber(d))).join(' '),
   f0_seq:f0.join(' '),f0_timestep:String(timestep)});
  current=[];
 };
 for(const cue of prepared){
  if(current.length&&(cue.end-current[0].start>18||current.length>=128))finish();
  current.push(cue);
 }
 finish();
 if(pieces.length>60)throw Error('신경망 합성 구간 수가 허용 범위를 초과했습니다.');
 return pieces;
}
export async function synthesizeDiffSingerWav(alignment,{python,root,experiment,dictionary,phonemePlan=null,rightsConfirmed,
 session=globalThis.window?.__MYVOCAL_SESSION_KEY,request=fetch,signal}={}){
 if(!windowsPython(python)||typeof root!=='string'||root.length>2048||
 !(/^[a-zA-Z]:[\\/]/.test(root)||/^\\\\[^\\]+\\/.test(root))||
 typeof experiment!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(experiment))
  throw Error('설치된 DiffSinger 경로, Python.exe 및 실제 학습 실험명을 지정하세요.');
 if(rightsConfirmed!==true)throw Error('가창 모델과 녹음·가사 사용 권한을 확인하세요.');
 if(typeof session!=='string'||session.length<8)throw Error('기존 Windows EXE에서만 로컬 가창 모델을 실행합니다.');
 const segments=buildKoreanDiffSingerDS(alignment,dictionary,{phonemePlan});
 if(signal?.aborted)throw Error('가창 생성을 취소했습니다.');
 const response=await request('/api/singing/diffsinger',{method:'POST',
  headers:{'X-MYVOCAL-Session':session,'Content-Type':'application/json'},
  body:JSON.stringify({python,root,experiment,rights:'confirmed',segments}),signal,cache:'no-store'});
 if(!response.ok){const payload=await response.json().catch(()=>({}));
  throw Error(String(payload.error||'로컬 DiffSinger 신경망 가창 실행에 실패했습니다 (HTTP '+response.status+')'));}
 if(response.headers?.get('Content-Type')?.split(';')[0]!=='audio/wav')
  throw Error('DiffSinger 모델이 실제 PCM WAV 결과를 반환하지 않았습니다.');
 const wav=await response.blob();
 if(signal?.aborted)throw Error('가창 생성을 취소했습니다.');
 if(wav.size<44||wav.size>160*1024*1024)throw Error('신경망 보컬 WAV 결과 크기 오류');
 assertUsableSingingWav(await wav.arrayBuffer(),{maxDurationSec:360});
 return new File([wav],'MYVOCAL-실제DiffSinger-한국어가창.wav',{type:'audio/wav'});
}
