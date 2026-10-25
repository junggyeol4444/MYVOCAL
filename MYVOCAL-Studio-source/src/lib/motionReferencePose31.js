// 원본 31·32항: 실제 로컬 MediaPipe 자세 추출 결과를 기존 VRM 본에 연결.
// 사용자가 촬영한 영상·기존 캐릭터의 모든 원본은 읽기 전용이다.
const FORMAT='MYVOCAL_MOTION_CAPTURE31';
export const CAPTURE31_BONES=Object.freeze([
 'spine','head','leftUpperArm','rightUpperArm','leftLowerArm','rightLowerArm',
 'leftUpperLeg','rightUpperLeg','leftLowerLeg','rightLowerLeg'
]);
const finite=(x,low,high)=>typeof x==='number'&&Number.isFinite(x)&&x>=low&&x<=high;
const allowed=character=>!!character?.id&&
 (character.rights==='owned'||character.rights==='self'||
 (character.rights==='licensed'&&String(character.rightsNote||'').trim()));
export function makeMotionCapture31(character,referenceAssetId,result){
 if(!allowed(character)||!Array.isArray(character.assets)||!character.assets.some(a=>
  a.id===referenceAssetId&&a.role==='motion-reference'&&/^video\//.test(a.type)))
  throw Error('권한 확인된 캐릭터의 등록 동작 참고 영상만 추출할 수 있습니다.');
 if(result?.format!==FORMAT||result.version!==1||
   result.source!=='installed-local-mediapipe-pose-task'||
   !Number.isInteger(result.durationMs)||result.durationMs<1||result.durationMs>30000||
   !Array.isArray(result.frames)||result.frames.length<3||result.frames.length>300)
  throw Error('실제 추출된 MediaPipe 동작 시간표가 없습니다.');
 let previous=-1;
 const frames=result.frames.map(frame=>{
  if(!Number.isInteger(frame?.timeMs)||frame.timeMs<0||frame.timeMs<=previous||
    frame.timeMs>result.durationMs||!finite(frame.lift,-.14,.14)||!frame.angles||
    typeof frame.angles!=='object'||Object.keys(frame.angles).length!==CAPTURE31_BONES.length)
   throw Error('동작 참고 영상의 자세 시간 또는 형식이 유효하지 않습니다.');
  previous=frame.timeMs;
  const angles={};
  for(const bone of CAPTURE31_BONES){
   const value=frame.angles[bone];
   if(!finite(value,-70.01,70.01))throw Error('동작 참고 영상의 관절 회전이 올바르지 않습니다.');
   angles[bone]=value;
  }
  return {timeMs:frame.timeMs,angles,lift:frame.lift};
 });
 return {format:FORMAT,version:1,characterId:character.id,
  referenceAssetId,source:'installed-local-mediapipe-pose-task',
  durationMs:result.durationMs,frames,enabled:true,createdAt:new Date().toISOString(),
  note:'실제 MediaPipe 2D 관절을 이용한 VRM 회전 근사. 원본 영상과 캐릭터 모델은 보존됨.'};
}
export async function extractMotionCapture31(video,{
 python,model,rightsConfirmed=false,session=globalThis.window?.__MYVOCAL_SESSION_KEY,
 signal,request=fetch
}={}){
 if(!rightsConfirmed)throw Error('본인 또는 명시적으로 허가받은 동작 영상인지 확인하세요.');
 if(!(video instanceof Blob)||video.size<1024||video.size>60*1024*1024||
 !['video/mp4','video/webm','video/quicktime','video/x-m4v'].includes(video.type))
  throw Error('실제 동작 참고 영상은 MP4/WebM/MOV/M4V 60MB 이하만 가능합니다.');
 if(!session||typeof session!=='string'||!/^.{8,}$/.test(session))
  throw Error('Windows MYVOCAL EXE 내부 세션에서 실행하세요.');
 if(!/^(?:[A-Za-z]:\\|\\\\)/.test(String(python))||!/[\\/]python\.exe$/i.test(String(python))||
   !/^(?:[A-Za-z]:\\|\\\\)/.test(String(model))||!model.toLowerCase().endsWith('.task'))
  throw Error('설치된 Windows Python.exe 및 MediaPipe Pose Task .task 절대 경로를 입력하세요.');
 const extension=video.type==='video/mp4'?'mp4':video.type==='video/webm'?'webm':
  video.type==='video/quicktime'?'mov':'m4v';
 const body=new FormData();
 body.set('video',video,'MYVOCAL-본인동작.'+extension);
 body.set('python',python);body.set('model',model);body.set('rights','confirmed');
 const response=await request('/api/motion/pose',{
  method:'POST',headers:{'X-MYVOCAL-Session':session},body,signal,cache:'no-store'
 });
 if(!response?.ok){
  const details=await response?.json?.().catch(()=>({}));
  throw Error(String(details?.error||'로컬 자세 추출 실패 ('+response.status+')'));
 }
 const result=await response.json();
 if(signal?.aborted)throw Error('실제 동작 추출이 취소됐습니다.');
 return result;
}
export function capturedMotionPoseAt(plan,seconds){
 if(plan?.format!==FORMAT||plan?.version!==1||plan.enabled!==true||
 !Array.isArray(plan.frames)||plan.frames.length<3||
 !Number.isFinite(seconds)||seconds<0)return null;
 const duration=plan.durationMs;
 if(!Number.isFinite(duration)||duration<=0)return null;
 const ms=Math.round(seconds*1000)%duration,frames=plan.frames;
 let lo=0,hi=frames.length-1;
 while(lo<=hi){const mid=(lo+hi)>>1;
  if(frames[mid].timeMs<ms)lo=mid+1;else hi=mid-1;
 }
 const last=frames[Math.max(0,hi)],next=frames[Math.min(frames.length-1,lo)];
 if(!last||!next||!last.angles||!next.angles)return null;
 const portion=last===next?0:Math.max(0,Math.min(1,(ms-last.timeMs)/(next.timeMs-last.timeMs||1)));
 const angles={};
 for(const bone of CAPTURE31_BONES){
  if(!finite(last.angles[bone],-70.01,70.01)||!finite(next.angles[bone],-70.01,70.01))return null;
  angles[bone]=last.angles[bone]+(next.angles[bone]-last.angles[bone])*portion;
 }
 if(!finite(last.lift,-.14,.14)||!finite(next.lift,-.14,.14))return null;
 return {angles,lift:last.lift+(next.lift-last.lift)*portion,source:'real-pose-landmarks'};
}
