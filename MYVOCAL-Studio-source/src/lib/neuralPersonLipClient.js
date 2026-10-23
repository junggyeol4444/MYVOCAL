// Neural face lip sync with the user's installed Wav2Lip checkpoint.
// Uses the existing Windows EXE loopback session and authorized ORIGINAL media.
import {assertUsableSingingWav} from './singingOutputValidation.js';
import {assertRealPersonLipAudioSync} from './realPersonMp4Integrity.js';
const checkFile=(file,limit,label)=>{if(!(file instanceof Blob)||file.size<128||file.size>limit)throw Error(label+'의 원본 파일 크기를 확인하세요.');};
export async function renderNeuralPersonLip(face,audio,{python,root,checkpoint,resize=1,rightsConfirmed=false,modelRights=false,soundtrack=null}={},
 {session=globalThis.window?.__MYVOCAL_SESSION_KEY,signal,request=fetch}={}){
 if(rightsConfirmed!==true||modelRights!==true)throw Error('실제 사람·가창·체크포인트 사용 권한을 각각 확인하세요.');
 if(typeof session!=='string'||!session)throw Error('Windows MYVOCAL EXE 세션에서 실행해 주세요.');
 if(!Number.isInteger(resize)||resize<1||resize>4)throw Error('영상 축소 비율은 1~4입니다.');
 for(const x of [python,root,checkpoint])if(typeof x!=='string'||x.length>1024||!x.trim())throw Error('설치된 Wav2Lip 엔진·Python·체크포인트 경로를 입력하세요.');
 if(!/(?:^|[\\/])python\.exe$/i.test(python)||!/\.pth$/i.test(checkpoint))throw Error('Python.exe 및 Wav2Lip .pth 모델 경로를 확인하세요.');
 checkFile(face,200*1024*1024,'실제 사람 영상');
 if(!['video/mp4','video/webm'].includes(face.type))throw Error('실제 사람 영상은 MP4 또는 WebM이어야 합니다.');
 checkFile(audio,80*1024*1024,'가창 WAV');
 if(audio.type!=='audio/wav'&&audio.type!=='audio/x-wav')throw Error('신경망 립싱크는 실제 WAV 파일이 필요합니다.');
 const audioInfo=assertUsableSingingWav(await audio.arrayBuffer(),{maxDurationSec:360});
 let finalAudioInfo=audioInfo;
 if(soundtrack!==null){
  checkFile(soundtrack,80*1024*1024,'완성 음악 믹스');
  if(!['audio/wav','audio/x-wav'].includes(soundtrack.type))throw Error('완성 음악은 실제 WAV여야 합니다.');
  finalAudioInfo=assertUsableSingingWav(await soundtrack.arrayBuffer(),{maxDurationSec:360});
  if(Math.abs(finalAudioInfo.durationSec-audioInfo.durationSec)>.35)
   throw Error('입 모양용 보컬과 최종 음악 길이가 다릅니다.');
 }
 if(signal?.aborted)throw Error('립싱크 영상을 취소했습니다.');
 const body=new FormData();
 body.set('face',face,face.type==='video/webm'?'MYVOCAL-original-person.webm':'MYVOCAL-original-person.mp4');
 body.set('audio',audio,'MYVOCAL-original-singing.wav');
 if(soundtrack!==null)body.set('soundtrack',soundtrack,'MYVOCAL-original-full-song.wav');
 for(const [key,value] of Object.entries({python,root,checkpoint,resize}))body.set(key,String(value));
 body.set('rights','confirmed');body.set('modelRights','confirmed');
 const result=await request('/api/mv/person/neural-lipsync',{method:'POST',headers:{'X-MYVOCAL-Session':session},body,signal,cache:'no-store'});
 if(!result.ok){const details=await result.json().catch(()=>({error:'신경망 립싱크 HTTP '+result.status}));throw Error(String(details.error||'Wav2Lip 실행 오류'));}
 if(result.headers?.get('Content-Type')?.split(';')[0]!=='video/mp4')throw Error('신경망 엔진이 실제 MP4 영상 파일을 반환하지 않았습니다.');
 const movie=await result.blob();
 if(movie.size<128||movie.size>220*1024*1024)throw Error('신경망 MP4 출력 용량이 올바르지 않습니다.');
 const prefix=new Uint8Array(await movie.slice(0,8).arrayBuffer());
 if(String.fromCharCode(...prefix.slice(4,8))!=='ftyp')throw Error('실제 MP4 컨테이너가 아닌 출력입니다.');
 if(signal?.aborted)throw Error('립싱크 영상 생성이 취소됐습니다.');
 await assertRealPersonLipAudioSync(movie,finalAudioInfo,{signal});
 if(signal?.aborted)throw Error('립싱크 영상 생성이 취소됐습니다.');
 return new File([movie],'MYVOCAL-실제사람-신경망립싱크.mp4',{type:'video/mp4'});
}
