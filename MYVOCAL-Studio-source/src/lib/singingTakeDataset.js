// 원본 #06·#07·#08·#33: 실제 사용자 노래 녹음과 가사·MIDI의 학습용 페어 데이터.
// 기존 프로젝트/녹음/모델은 읽기 전용. 음소 시간은 MIDI 기반이며 강제 정렬 결과가 아니다.
import {makeZip} from './zipStore.js';
import {isAlignmentStale,validateAlignment} from './lyricAlignment.js';
import {buildKoreanDiffSingerDS} from './diffSingerNative.js';

const encoder=new TextEncoder();
const MAX_WAV_BYTES=120*1024*1024;
const MAX_PHRASES=60;
const permitted=new Set(['self','owned','licensed']);
const round=x=>Math.round(x*10000)/10000;
function wav16(raw){
 const b=raw instanceof Uint8Array?raw:new Uint8Array(raw);
 if(b.length<44||b.length>MAX_WAV_BYTES)throw Error('녹음 WAV는 120MB 이하의 실제 PCM 파일이어야 합니다.');
 const v=new DataView(b.buffer,b.byteOffset,b.byteLength);
 const tag=(p)=>String.fromCharCode(...b.subarray(p,p+4));
 if(tag(0)!=='RIFF'||tag(8)!=='WAVE'||v.getUint32(4,true)+8!==b.length)
  throw Error('녹음 파일의 RIFF/WAVE 크기 또는 형식이 올바르지 않습니다.');
 let format=null,pcm=null,at=12;
 while(at+8<=b.length){
  const size=v.getUint32(at+4,true),start=at+8;
  if(size>b.length-start)throw Error('녹음 WAV 청크 크기가 손상됐습니다.');
  if(tag(at)==='fmt '){
   if(format||size<16)throw Error('녹음 WAV 포맷 청크가 잘못됐습니다.');
   format={codec:v.getUint16(start,true),channels:v.getUint16(start+2,true),
    rate:v.getUint32(start+4,true),bits:v.getUint16(start+14,true)};
  }
  if(tag(at)==='data'){
   if(pcm)throw Error('중복된 녹음 PCM 청크가 있습니다.');
   pcm=b.subarray(start,start+size);
  }
  at=start+size+(size&1);
 }
 if(!format||!pcm||format.codec!==1||format.bits!==16||![1,2].includes(format.channels)||
  format.rate<16000||format.rate>96000||!pcm.length||pcm.length%(format.channels*2))
  throw Error('학습용 녹음은 16~96kHz, 16비트 PCM 모노/스테레오 WAV여야 합니다.');
 return {...format,pcm,frames:pcm.length/(format.channels*2)};
}
function sliceWav(source,start,end){
 const first=Math.round(start*source.rate),last=Math.round(end*source.rate);
 if(first<0||last>source.frames||last-first<source.rate*.3)
  throw Error('녹음 시작 위치·길이가 가사·MIDI와 맞지 않습니다.');
 const frameSize=source.channels*2,body=source.pcm.subarray(first*frameSize,last*frameSize);
 const out=new Uint8Array(44+body.length),v=new DataView(out.buffer);
 for(const [at,name] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])
  for(let i=0;i<4;i++)out[at+i]=name.charCodeAt(i);
 v.setUint32(4,out.length-8,true);v.setUint32(16,16,true);
 v.setUint16(20,1,true);v.setUint16(22,source.channels,true);
 v.setUint32(24,source.rate,true);v.setUint32(28,source.rate*frameSize,true);
 v.setUint16(32,frameSize,true);v.setUint16(34,16,true);
 v.setUint32(40,body.length,true);out.set(body,44);
 let sum=0,clipped=0,peak=0;
 const pcm=new DataView(body.buffer,body.byteOffset,body.byteLength);
 for(let i=0;i<body.length;i+=2){
  const s=pcm.getInt16(i,true)/32768;sum+=s*s;peak=Math.max(peak,Math.abs(s));
  if(Math.abs(s)>=.999)clipped++;
 }
 const samples=body.length/2,rms=Math.sqrt(sum/samples);
 return {bytes:out,metrics:{seconds:round((last-first)/source.rate),rmsDbfs:round(20*Math.log10(Math.max(rms,1e-9))),
  peak:round(peak),clippedPercent:round(100*clipped/samples)}};
}
export function planSingingTakePhrases(project,alignment,{recordingStartSec=0,recordingEndSec=360,clipToRange=false}={}){
 if(!project||isAlignmentStale(project,alignment))throw Error('프로젝트 가사·MIDI가 변경됐습니다. 싱크를 다시 생성하세요.');
 validateAlignment(alignment);
 if(!Number.isFinite(recordingStartSec)||recordingStartSec<0||recordingStartSec>360||
  !Number.isFinite(recordingEndSec)||recordingEndSec<=recordingStartSec||recordingEndSec>360.001)
  throw Error('녹음 시작·종료 위치는 원곡 기준 0~360초입니다.');
 const cues=[...alignment.cues].sort((a,b)=>a.startSec-b.startSec);
 const phrases=[];let current=[];
 const flush=()=>{if(!current.length)return;phrases.push(current);current=[];};
 for(const cue of cues){
  if(clipToRange){
   if(cue.endSec<=recordingStartSec+.0001||cue.startSec>=recordingEndSec-.0001)continue;
   if(cue.startSec<recordingStartSec-.001||cue.endSec>recordingEndSec+.001)
    throw Error('녹음 파일의 시작·끝에서 MIDI 음표가 잘립니다. 원곡 시작 초나 녹음 구간을 조정하세요.');
  }
  const lyric=String(cue.lyric||'').trim();
  if(!lyric||lyric==='—'||lyric==='-'||lyric==='_'||lyric==='SP'){flush();continue;}
  if(cue.startSec<recordingStartSec-.001)
   throw Error('가사 음표가 녹음 시작 위치보다 앞에 있습니다. 녹음 시작 초를 확인하세요.');
  if(current.length&&(cue.startSec-current[current.length-1].endSec>.35||
   cue.endSec-current[0].startSec>12))flush();
  if(cue.endSec-cue.startSec>12)throw Error('12초보다 긴 한 음표는 학습용으로 분할할 수 없습니다.');
  current.push(cue);
 }
 flush();
 if(!phrases.length||phrases.length>MAX_PHRASES)
  throw Error('실제 가사가 있는 학습 구간은 1~60개여야 합니다.');
 return phrases.map((cues,i)=>({index:i+1,startSec:cues[0].startSec,
  endSec:cues[cues.length-1].endSec,cues}));
}
// A singer can contribute several independently recorded takes to one new,
// isolated training ZIP. Each take has an explicit absolute position on the
// existing MIDI timeline. Original WAVs and the project are read-only.
export async function exportSingingTakeDataset(project,alignment,recording,dictionary,{
 voice,recordingStartSec=0,rightsConfirmed=false,reviewedLabels=null,signal}={}){
 if(!voice||!permitted.has(voice.rights)||rightsConfirmed!==true)
  throw Error('본인 또는 허가받은 노래 녹음·가사·모델 학습 권한을 확인하세요.');
 if(!(dictionary instanceof Map)||!dictionary.size)
  throw Error('현재 학습할 DiffSinger 모델의 한국어 발음 사전을 선택하세요.');
 const takes=Array.isArray(recording)?recording:
  [{file:recording,startSec:recordingStartSec}];
 if(!takes.length||takes.length>12)
  throw Error('하나의 학습 자료는 서로 다른 실제 WAV 녹음 1~12개를 지원합니다.');
 // The review file is produced from the same immutable take order and score.
 // A user can correct phoneme durations without changing the original WAV/MIDI.
 if(reviewedLabels!==null){
  if(reviewedLabels?.format!=='MYVOCAL_SINGING_PHONEME_REVIEW'||
     reviewedLabels.version!==1||reviewedLabels.projectId!==project.id||
     reviewedLabels.voiceId!==voice.id||
     !reviewedLabels.labels||Array.isArray(reviewedLabels.labels)||
     typeof reviewedLabels.labels!=='object'||
     Object.keys(reviewedLabels.labels).length>MAX_PHRASES)
   throw Error('현재 프로젝트·목소리와 일치하는 음소 검수 JSON이 아닙니다.');
 }
 const reviewTemplate={format:'MYVOCAL_SINGING_PHONEME_REVIEW',version:1,
  projectId:project.id,voiceId:voice.id,labels:{},
  instructions:'각 take의 ph_seq는 그대로 두고 ph_dur(초)만 실제 녹음을 듣고 수정하세요. 음소 수와 WAV 길이가 일치해야 합니다.'};
 const entries=[],manifest=[],recordingInfo=[],transcriptions=['name,ph_seq,ph_dur'];
 const lexicon=[...dictionary].map(([word,phonemes])=>{
  if(typeof word!=='string'||!word||/[^\p{L}\p{N}_+-]/u.test(word)||
   !Array.isArray(phonemes)||!phonemes.length||
   phonemes.some(p=>typeof p!=='string'||!/^[\p{L}\p{N}_/+-]+$/u.test(p)))
   throw Error('실제 한국어 DiffSinger 학습 발음 사전에 유효하지 않은 단어·음소가 있습니다.');
  return word+'\t'+phonemes.join(' ');
 }).join('\n')+'\n';
 if(encoder.encode(lexicon).length>2*1024*1024)
  throw Error('DiffSinger 학습 발음 사전은 2MB 이하여야 합니다.');
 let totalAudio=0,phraseIndex=0;
 for(const [takeIndex,take] of takes.entries()){
  if(signal?.aborted)throw Error('데이터셋 만들기가 취소됐습니다.');
  const file=take?.file,start=Number(take?.startSec);
  if(!(file instanceof Blob)||file.size<44||file.size>MAX_WAV_BYTES||
    !Number.isFinite(start)||start<0||start>=360)
   throw Error((takeIndex+1)+'번 녹음 WAV 파일·원곡 시작 초를 확인하세요.');
  const source=wav16(await file.arrayBuffer());
  const maxSeconds=source.frames/source.rate,end=start+maxSeconds;
  if(end>360.001)throw Error((takeIndex+1)+'번 녹음이 원곡 360초를 초과합니다.');
  const phrases=planSingingTakePhrases(project,alignment,{
   recordingStartSec:start,recordingEndSec:end,
   clipToRange:Array.isArray(recording)
  });
  if(phraseIndex+phrases.length>MAX_PHRASES)
   throw Error('모든 녹음의 가창 학습 구간 합계는 최대 60개입니다.');
  recordingInfo.push({index:takeIndex+1,name:String(file.name||'recording.wav').slice(0,120),
   startSec:round(start),seconds:round(maxSeconds),
   sampleRate:source.rate,channels:source.channels,phrases:phrases.length});
  for(const phrase of phrases){
   if(signal?.aborted)throw Error('데이터셋 만들기가 취소됐습니다.');
   const from=phrase.startSec-start,to=phrase.endSec-start;
   if(from<-.0001||to>maxSeconds+.0001)
    throw Error((takeIndex+1)+'번 녹음의 가사·MIDI 구간이 실제 WAV 길이를 벗어납니다.');
   const audio=sliceWav(source,Math.max(0,from),Math.min(to,maxSeconds));
   const ds=buildKoreanDiffSingerDS({cues:phrase.cues},dictionary);
   if(ds.length!==1)throw Error('녹음 '+(takeIndex+1)+'의 음소·음정 학습 구간을 만들 수 없습니다.');
   phraseIndex++;
   const key='take-'+String(phraseIndex).padStart(3,'0');
   const label={format:'MYVOCAL_SINGING_TAKE_LABEL',version:1,voiceId:voice.id,
    projectId:project.id,sourceKey:alignment.sourceKey,recordingIndex:takeIndex+1,
    originalStartSec:round(phrase.startSec),originalEndSec:round(phrase.endSec),
    recordingStartSec:round(start),
    noteCues:phrase.cues.map(c=>({lyric:c.lyric,pitch:c.pitch,
     startSec:round(c.startSec-phrase.startSec),endSec:round(c.endSec-phrase.startSec)})),
    phonemeTiming:'MIDI-derived, not audio forced-aligned',
    audioMetrics:audio.metrics};
   const paths={audio:'wavs/'+key+'.wav',label:'labels/'+key+'.json',score:'score/'+key+'.ds'};
   const score={...ds[0],offset:0};
   reviewTemplate.labels[key]={ph_seq:score.ph_seq,ph_dur:score.ph_dur,
    seconds:audio.metrics.seconds,recordingIndex:takeIndex+1};
   if(reviewedLabels!==null){
    const reviewed=reviewedLabels.labels[key];
    if(!reviewed||typeof reviewed.ph_seq!=='string'||reviewed.ph_seq!==score.ph_seq||
       typeof reviewed.ph_dur!=='string'||reviewed.ph_dur.length>16000)
     throw Error(key+'의 검수 음소 순서가 원본 MIDI·발음 사전과 다릅니다.');
    const phones=score.ph_seq.trim().split(/\s+/);
    const parts=reviewed.ph_dur.trim().split(/\s+/);
    const values=parts.map(Number);
    if(parts.length!==phones.length||
       values.some(v=>!Number.isFinite(v)||v<.005||v>20)||
       Math.abs(values.reduce((sum,v)=>sum+v,0)-audio.metrics.seconds)>.035)
     throw Error(key+'의 검수 음소 길이 합계가 실제 WAV 길이와 맞지 않습니다.');
    // Preserve user-reviewed precision; per-phone rounding could accumulate
    // enough drift to desynchronise a long phrase from its actual PCM WAV.
    score.ph_dur=parts.join(' ');
    label.phonemeTiming='user-reviewed durations, not automated forced alignment';
    label.phonemeReview={source:'user-supplied JSON',matchedAudioSeconds:audio.metrics.seconds};
   }
   transcriptions.push([key,score.ph_seq,score.ph_dur].join(','));
   entries.push({name:paths.audio,data:audio.bytes},
    {name:paths.label,data:encoder.encode(JSON.stringify(label,null,2))},
    {name:paths.score,data:encoder.encode(JSON.stringify([score],null,2))});
   totalAudio+=audio.bytes.length;
   if(totalAudio>MAX_WAV_BYTES)throw Error('모든 녹음의 학습용 WAV 합계가 120MB를 넘었습니다.');
   manifest.push({...paths,recordingIndex:takeIndex+1,
    seconds:audio.metrics.seconds,rmsDbfs:audio.metrics.rmsDbfs,
    clippedPercent:audio.metrics.clippedPercent,
    phonemeDurationsReviewed:reviewedLabels!==null});
  }
 }
 if(reviewedLabels!==null&&Object.keys(reviewedLabels.labels).length!==manifest.length)
  throw Error('음소 검수 JSON의 take 개수가 현재 실제 녹음 구간과 일치하지 않습니다.');
 const meta={format:'MYVOCAL_SINGING_TAKE_DATASET',version:1,voiceId:voice.id,
  projectId:project.id,alignmentSourceKey:alignment.sourceKey,
  recordingName:recordingInfo.length===1?recordingInfo[0].name:'multiple recordings',
  sampleRate:recordingInfo.length===1?recordingInfo[0].sampleRate:null,
  channels:recordingInfo.length===1?recordingInfo[0].channels:null,
  rights:voice.rights,
  recordingStartSec:recordingInfo.length===1?recordingInfo[0].startSec:null,
  recordings:recordingInfo,phrases:manifest,trained:false,
  phonemeDurationsReviewed:reviewedLabels!==null,
  note:'여러 실제 가창 녹음의 PCM 구간을 원곡 MIDI 위치에 맞춰 추출했습니다. 음소 시간은 MIDI 추정이며 음성 강제 정렬/신경망 학습은 수행하지 않았습니다. 모델별 전처리 전 수동 라벨 검수가 필요합니다.'};
 entries.unshift({name:'transcriptions.csv',data:encoder.encode(transcriptions.join('\n')+'\n')},
  {name:'dictionary.txt',data:encoder.encode(lexicon)},
  {name:'manifest.json',data:encoder.encode(JSON.stringify({...meta,pronunciationDictionary:'dictionary.txt'},null,2))},
  {name:'README.txt',data:encoder.encode('MYVOCAL 한국어 가창 학습 데이터\nDiffSinger acoustic 원시 데이터: wavs/*.wav + transcriptions.csv + dictionary.txt.\n원곡 시작 초가 서로 다른 실제 사용자 녹음 여러 개를 한 번에 수집하며 원본은 변경하지 않습니다.\n음소 시간은 강제 정렬 결과가 아닙니다. 설치된 모델에 맞게 라벨을 검수하세요.\n')});
 return {bytes:makeZip(entries),manifest:meta,reviewTemplate,
  fileName:'MYVOCAL-'+String(project.title||'singing').replace(/[^a-zA-Z0-9가-힣_-]/g,'_').slice(0,45)+'-가창학습데이터.zip'};
}
