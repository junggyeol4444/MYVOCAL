import {assertUsableSingingWav} from './singingOutputValidation.js';
export const MAX_MUSICGEN_WAV=12*1024*1024;
export function musicGenSettingsValid(settings){
 if(!settings||typeof settings.python!=='string'||typeof settings.modelDir!=='string'||typeof settings.prompt!=='string')throw Error('로컬 MusicGen 실행 환경을 지정하세요.');
 if(!/python\.exe$/i.test(settings.python)||settings.modelDir.length<3||settings.modelDir.length>1024||settings.python.length>1024)throw Error('Python.exe와 로컬 MusicGen 모델 경로를 입력하세요.');
 if(settings.audioPrompt!==undefined&&(typeof settings.audioPrompt!=='string'||settings.audioPrompt.length>3*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(settings.audioPrompt)))throw Error('MusicGen 연결 WAV 인코딩이 올바르지 않습니다.');
 if(settings.audioPrompt&&settings.seconds>20)throw Error('연속 MusicGen 구간은 최대 20초입니다.');
 if(settings.prompt.trim().length<2||[...settings.prompt].length>600)throw Error('음악 설명은 2~600자입니다.');
 if(!Number.isInteger(settings.seconds)||settings.seconds<3||settings.seconds>28||!Number.isInteger(settings.seed)||settings.seed<0||settings.seed>2147483647)throw Error('음악 길이(3~28초)·시드 범위를 확인하세요.');
 return settings;
}
export async function generateMusicGenAudio(settings,{session=window.__MYVOCAL_SESSION_KEY,request=fetch,signal}={}){
 musicGenSettingsValid(settings);
 if(typeof session!=='string'||!session)throw Error('Windows EXE 로컬 세션이 필요합니다.');
 const res=await request('/api/music/generate',{method:'POST',headers:{'Content-Type':'application/json','X-MYVOCAL-Session':session},body:JSON.stringify(settings),signal,cache:'no-store'});
 if(!res.ok){const reason=await res.json().catch(()=>({error:`HTTP ${res.status}`}));throw Error(reason.error||'MusicGen 오디오 생성 실패');}
 if(res.headers?.get('Content-Type')?.split(';')[0]!=='audio/wav')throw Error('실제 WAV가 아닌 응답입니다.');
 const blob=await res.blob();if(!blob.size||blob.size>MAX_MUSICGEN_WAV)throw Error('MusicGen 결과 WAV 크기 오류');
 assertUsableSingingWav(await blob.arrayBuffer(),{maxDurationSec:30});
 return new File([blob],'MYVOCAL-MusicGen.wav',{type:'audio/wav'});
}