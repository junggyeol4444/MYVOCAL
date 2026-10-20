// Existing Windows EXE only: real local recorded-guide -> MIDI score DSP.
// A spoken/sung guide with the correct lyrics is required; this is NOT a
// Korean neural singing model and cannot invent missing consonants/lyrics.
import {assertUsableSingingWav} from './singingOutputValidation.js';

export function scoreVocalNotes(alignment){
 if(alignment?.format!=='MYVOCAL_LYRIC_ALIGNMENT'||alignment?.version!==1||!Array.isArray(alignment.cues))
  throw Error('저장된 가사·MIDI 싱크가 필요합니다.');
 const notes=alignment.cues.map(c=>({startSec:Number(c.startSec),endSec:Number(c.endSec),pitch:Number(c.pitch)}));
 if(notes.length<1||notes.length>400)throw Error('녹음 기반 보컬은 1~400개 MIDI 음표를 지원합니다.');
 let prev=-1;
 for(const n of notes){
  if(!Number.isFinite(n.startSec)||!Number.isFinite(n.endSec)||!Number.isInteger(n.pitch)||
   n.startSec<prev||n.startSec<0||n.endSec>360||n.endSec-n.startSec<.07||n.endSec-n.startSec>12||n.pitch<24||n.pitch>108)
   throw Error('MIDI 음표 시간·음역이 올바르지 않습니다.');
  prev=n.startSec;
 }
 return notes;
}
export async function renderRecordedScoreVocal(file,alignment,{python,interval=0,strength=1,rightsConfirmed=false}={},
 {session=globalThis.window?.__MYVOCAL_SESSION_KEY,request=fetch,signal}={}){
 if(!(file instanceof Blob)||file.size<44||file.size>90*1024*1024)throw Error('90MB 이하의 실제 녹음 WAV를 선택하세요.');
 if(typeof python!=='string'||python.length>2048||!(/^[A-Za-z]:[\\/]/.test(python)||/^\\\\[^\\]+\\/.test(python))||!/(?:^|[\\/])python\.exe$/i.test(python))
  throw Error('설치된 Windows Python.exe의 절대 경로를 지정하세요.');
 if(!session||typeof session!=='string')throw Error('Windows EXE 세션이 필요합니다.');
 if(rightsConfirmed!==true)throw Error('사용자 녹음 사용 권한을 확인해 주세요.');
 if(!Number.isInteger(interval)||interval<-12||interval>12||!Number.isFinite(strength)||strength<0||strength>1)
  throw Error('화음 반음(-12~12) 및 음정 보정 강도(0~1)를 확인하세요.');
 const notes=scoreVocalNotes(alignment);
 if(signal?.aborted)throw Error('보컬 음정 보정이 취소됐습니다.');
 assertUsableSingingWav(await file.arrayBuffer(),{maxDurationSec:360});
 const body=new FormData();body.set('audio',file,'MYVOCAL-guide.wav');body.set('score',JSON.stringify({notes}));
 for(const [k,v] of Object.entries({python,interval,strength}))body.set(k,String(v));body.set('rights','confirmed');
 const response=await request('/api/singing/score-vocal',{method:'POST',headers:{'X-MYVOCAL-Session':session},body,signal,cache:'no-store'});
 if(!response.ok){const e=await response.json().catch(()=>({error:`HTTP ${response.status}`}));throw Error(e.error||'보컬 음정 보정 실패');}
 if(response.headers?.get('Content-Type')?.split(';')[0]!=='audio/wav')throw Error('보컬 PCM WAV가 아닌 응답입니다.');
 const wav=await response.blob();
 if(wav.size<44||wav.size>90*1024*1024)throw Error('보컬 WAV 출력 크기 오류');
 assertUsableSingingWav(await wav.arrayBuffer(),{maxDurationSec:360});
 return new File([wav],interval?`MYVOCAL-보컬화음-${interval}.wav`:'MYVOCAL-녹음음정보정.wav',{type:'audio/wav'});
}
