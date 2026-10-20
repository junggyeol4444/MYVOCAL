// Actual RVC neural inference is executed by a user-installed RVC infer/cli.py.
// No new voice model is trained here; source MUST already be a sung/recorded WAV.
import {assertUsableSingingWav} from './singingOutputValidation.js';
export const RVC_SOURCE_LIMIT=24*1024*1024;
export const RVC_RESULT_LIMIT=48*1024*1024;
export function validateRVCSettings(file,settings){
 if(!(file instanceof Blob)||file.size<48||file.size>RVC_SOURCE_LIMIT)
  throw Error('가창 원본은 24MB 이하의 실제 WAV 파일이어야 합니다.');
 for(const key of ['root','python','model'])if(typeof settings?.[key]!=='string'||!settings[key].trim()||settings[key].length>1024)throw Error('RVC 설치 폴더, Python.exe, 모델 .pth 경로를 지정하세요.');
 if(!/\.pth$/i.test(settings.model)||!/(?:^|[/\\])python\.exe$/i.test(settings.python))throw Error('RVC Python.exe 또는 .pth 모델 경로가 올바르지 않습니다.');
 if(!Number.isInteger(Number(settings.pitch))||Number(settings.pitch)<-24||Number(settings.pitch)>24)throw Error('반음 이동은 -24~24입니다.');
 if(!Number.isFinite(Number(settings.indexRate))||Number(settings.indexRate)<0||Number(settings.indexRate)>1)throw Error('인덱스 비율은 0~1입니다.');
 if(!['pm','rmvpe'].includes(settings.f0))throw Error('F0 추출 방식을 확인하세요.');
}
export async function convertVoiceWithRVC(file,settings,{session,request=fetch,signal}={}){
 validateRVCSettings(file,settings);
 if(settings.rightsConfirmed!==true)throw Error('원본 녹음과 모델 사용 권한을 확인해 주세요.');
 if(!session||typeof session!=='string')throw Error('Windows EXE 세션에서만 RVC 모델을 실행할 수 있습니다.');
 assertUsableSingingWav(await file.arrayBuffer(),{maxDurationSec:300});
 if(signal?.aborted)throw Error('RVC 음색 변환을 취소했습니다.');
 const body=new FormData();body.set('audio',file,'MYVOCAL-source.wav');
 for(const k of ['root','python','model','f0','pitch','indexRate'])body.set(k,String(settings[k]));
 body.set('rights','confirmed');
 const response=await request('/api/singing/rvc/convert',{method:'POST',headers:{'X-MYVOCAL-Session':session},body,signal,cache:'no-store'});
 if(!response.ok){const problem=await response.json().catch(()=>({error:`RVC 변환 HTTP ${response.status}`}));throw Error(String(problem.error||'RVC 변환 실패'));}
 if(response.headers?.get('Content-Type')?.split(';')[0]!=='audio/wav')throw Error('RVC 모델이 실제 WAV 결과를 반환하지 않았습니다.');
 const result=await response.blob();
 if(result.size>RVC_RESULT_LIMIT)throw Error('RVC 변환 WAV가 48MB를 초과했습니다.');
 assertUsableSingingWav(await result.arrayBuffer(),{maxDurationSec:300});
 return new File([result],'MYVOCAL-RVC-vocal.wav',{type:'audio/wav'});
}