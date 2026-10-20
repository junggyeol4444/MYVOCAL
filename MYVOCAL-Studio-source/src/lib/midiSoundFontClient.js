// Local, installed FluidSynth SoundFont renderer for existing MYVOCAL Windows EXE.
// This is actual sample synthesis, not AI singing or neural composition.
import {assertUsableSingingWav} from './singingOutputValidation.js';
export async function renderMidiSoundFont(midi,{python,library,soundfont,rate=44100,gain=.2},
 {session=window.__MYVOCAL_SESSION_KEY,request=fetch,signal}={}){
 if(!(midi instanceof Blob)||midi.size<26||midi.size>4*1024*1024)throw Error('렌더링할 MIDI 파일이 올바르지 않습니다.');
 for(const [label,path,pattern] of [['Python',python,/(?:^|[/\\])python\.exe$/i],['FluidSynth DLL',library,/\.dll$/i],['SoundFont',soundfont,/\.sf[23]$/i]]){
  if(typeof path!=='string'||path.length>2048||!pattern.test(path)||!(/^[A-Za-z]:[\\/]/.test(path)||/^\\\\[^\\]+\\/.test(path)))throw Error(`설치된 ${label}의 로컬 경로를 입력하세요.`);
 }
 if(![44100,48000].includes(rate)||!Number.isFinite(gain)||gain<.01||gain>1)throw Error('SoundFont 샘플레이트·음량을 확인하세요.');
 if(!session||typeof session!=='string')throw Error('Windows EXE 세션이 필요합니다.');
 if(signal?.aborted)throw Error('SoundFont 렌더링이 취소됐습니다.');
 const body=new FormData();body.set('midi',midi,'MYVOCAL-notes.mid');
 for(const [key,value] of Object.entries({python,library,soundfont,rate,gain}))body.set(key,String(value));
 const response=await request('/api/music/midi/soundfont',{method:'POST',headers:{'X-MYVOCAL-Session':session},body,signal,cache:'no-store'});
 if(!response.ok){const detail=await response.json().catch(()=>({error:`HTTP ${response.status}`}));throw Error(detail.error||'SoundFont PCM 렌더링 실패');}
 if(response.headers?.get('Content-Type')?.split(';')[0]!=='audio/wav')throw Error('실제 WAV가 아닌 SoundFont 응답입니다.');
 const wav=await response.blob();if(wav.size<44||wav.size>80*1024*1024)throw Error('SoundFont WAV 결과 크기가 올바르지 않습니다.');
 assertUsableSingingWav(await wav.arrayBuffer(),{maxDurationSec:360});
 return new File([wav],'MYVOCAL-SoundFont.wav',{type:'audio/wav'});
}
