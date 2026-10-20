import {parseNeuralStemsZip} from './musicStemZip.js';
export async function splitMusicGenStems(wav,{python,repo,model='htdemucs',device='auto'},{session=window.__MYVOCAL_SESSION_KEY,request=fetch,signal}={}){
 if(!(wav instanceof Blob)||wav.size<44||wav.size>72*1024*1024)throw Error('분리할 MusicGen WAV 크기가 올바르지 않습니다.');
 if(!/python\.exe$/i.test(python||'')||!repo||repo.length>1024||!/^[a-zA-Z0-9_-]{1,48}$/.test(model)||!['auto','cpu','cuda'].includes(device))throw Error('로컬 Demucs Python·모델·장치 설정을 확인하세요.');
 if(typeof session!=='string'||!session)throw Error('Windows EXE 로컬 세션이 필요합니다.');
 const body=new FormData();body.set('python',python);body.set('repo',repo);body.set('model',model);body.set('device',device);body.set('audio',wav,'MYVOCAL-MusicGen.wav');
 const res=await request('/api/music/stems/split',{method:'POST',headers:{'X-MYVOCAL-Session':session},body,signal,cache:'no-store'});
 if(!res.ok){const msg=await res.json().catch(()=>({error:`HTTP ${res.status}`}));throw Error(msg.error||'신경망 악기 분리 실패');}
 if(res.headers?.get('Content-Type')?.split(';')[0]!=='application/zip')throw Error('악기 분리 결과가 ZIP이 아닙니다.');
 const blob=await res.blob();if(blob.size<22||blob.size>450*1024*1024)throw Error('악기 분리 ZIP 크기 오류');
 const parsed=parseNeuralStemsZip(await blob.arrayBuffer());
 return {...parsed,zip:blob};
}
