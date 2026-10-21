// Convert an already registered, user-owned RVC checkpoint from IndexedDB.
// Only isolated copies enter the authenticated Windows-native endpoint.
// The installed RVC Python engine still performs the actual neural inference.
import {validateRVCSettings,RVC_SOURCE_LIMIT,RVC_RESULT_LIMIT} from './rvcVoiceConversion.js';
import {assertUsableSingingWav} from './singingOutputValidation.js';

const MAX_MODEL=200*1024*1024,MAX_INDEX=96*1024*1024;
export async function convertRegisteredRVC(file,{modelFile,indexFile=null,...settings},{session,request=fetch,signal}={}){
 const proxy={...settings,model:'registered-model.pth',index:indexFile?'registered-index.index':''};
 validateRVCSettings(file,proxy);
 if(settings.rightsConfirmed!==true)throw Error('RVC 등록 모델과 원본 가창 사용 권한을 확인하세요.');
 if(typeof session!=='string'||!session)throw Error('로컬 Windows EXE 세션에서만 등록 모델을 사용할 수 있습니다.');
 if(!(modelFile instanceof Blob)||modelFile.size<1024||modelFile.size>MAX_MODEL)throw Error('등록된 RVC 체크포인트 파일이 없거나 200MiB를 초과합니다.');
 if(indexFile!==null && (!(indexFile instanceof Blob)||indexFile.size<1024||indexFile.size>MAX_INDEX))throw Error('등록된 FAISS 인덱스가 없거나 96MiB를 초과합니다.');
 if(file.size>RVC_SOURCE_LIMIT)throw Error('원본 WAV는 한 구간당 24MiB를 초과할 수 없습니다.');
 assertUsableSingingWav(await file.arrayBuffer(),{maxDurationSec:300});
 if(signal?.aborted)throw Error('등록 모델 RVC 변환을 취소했습니다.');
 const form=new FormData();
 form.set('audio',file,'MYVOCAL-source.wav');
 form.set('modelUpload',modelFile,'registered-model.pth');
 if(indexFile)form.set('indexUpload',indexFile,'registered-index.index');
 for(const k of ['root','python','f0','pitch','indexRate'])form.set(k,String(settings[k]));
 form.set('rights','confirmed');
 const response=await request('/api/singing/rvc/stored',{method:'POST',headers:{'X-MYVOCAL-Session':session},body:form,signal,cache:'no-store'});
 if(!response.ok){const data=await response.json().catch(()=>({error:'RVC 모델 실행 HTTP '+response.status}));throw Error(String(data.error||'등록 모델 RVC 변환 실패'));}
 if(response.headers?.get('Content-Type')?.split(';')[0]!=='audio/wav')throw Error('RVC가 실제 WAV를 반환하지 않았습니다.');
 const blob=await response.blob();
 if(blob.size>RVC_RESULT_LIMIT)throw Error('RVC 변환 결과가 48MiB를 초과했습니다.');
 assertUsableSingingWav(await blob.arrayBuffer(),{maxDurationSec:300});
 if(signal?.aborted)throw Error('RVC 등록 모델 음색 변환을 취소했습니다.');
 return new File([blob],'MYVOCAL-등록모델-RVC-가창.wav',{type:'audio/wav'});
}
