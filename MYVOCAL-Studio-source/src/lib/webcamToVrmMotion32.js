// Original #31/#32: one user-approved Windows EXE action:
// webcam -> REAL recording -> local MediaPipe Pose Task inference ->
// bind ORIGINAL 2D pose landmarks to selected VRM character -> append
// video and motion profile as NEW stored assets. No remote uploads,
// fake pose landmarks or destructive updates to prior manual animation.
import {recordWebcamMotion32} from './webcamMotionRecording32.js';
import {extractMotionCapture31,makeMotionCapture31} from './motionReferencePose31.js';
import {MAX_CHARACTER_ASSETS,validateCharacterFile,validateCharacterAssetRole} from './characterIdentity.js';
import {putFileNew,removeFile} from './assetDb.js';
import {genId} from './schema.js';

export async function recordAndApplyWebcamPose32(character,{
 durationSec=10,python,model,consent=false,signal,current=()=>character,
 onSave,onProgress=()=>{},
 record=recordWebcamMotion32,extract=extractMotionCapture31,
 addFile=putFileNew,deleteFile=removeFile,newId=genId
}={}){
 if(!character?.id||!['self','owned','licensed'].includes(character.rights)||
    (character.rights==='licensed'&&!String(character.rightsNote||'').trim()))
  throw Error('본인 또는 사용 허가를 확인한 VRM·캐릭터만 동작을 녹화할 수 있습니다.');
 if(consent!==true||![record,extract,addFile,deleteFile,onSave,current,newId].every(f=>typeof f==='function'))
  throw Error('카메라·자세 추출 권한과 로컬 캐릭터 저장 연결을 확인하세요.');
 if(!Number.isInteger(durationSec)||durationSec<2||durationSec>30)
  throw Error('실제 연기 영상은 2~30초만 한 번에 촬영할 수 있습니다.');
 if(!Array.isArray(character.assets)||character.assets.length>=MAX_CHARACTER_ASSETS)
  throw Error('선택한 캐릭터의 등록 자산 한도를 초과했습니다.');
 const guard=()=>{
  if(signal?.aborted||current()!==character)
   throw Error('동작 촬영이 취소되거나 캐릭터가 변경됐습니다. 원본 동작은 보존됩니다.');
 };
 guard();
 onProgress('사용자가 허가한 로컬 웹캠에서 실제 연기 영상 녹화 중');
 const video=await record({durationSec,signal,onProgress});guard();
 validateCharacterFile(video);validateCharacterAssetRole('motion-reference','video');
 onProgress('녹화한 원본 WebM에서 실제 설치된 MediaPipe 전신 관절 추출 중');
 const landmarkResult=await extract(video,{
  python,model,rightsConfirmed:consent,signal
 });guard();
 const assetId=newId('asset');
 if(!assetId||character.assets.some(a=>a.id===assetId))
  throw Error('새 로컬 영상 자산 ID가 기존 원본과 중복됩니다.');
 const asset={id:assetId,name:video.name,type:video.type,size:video.size,
  role:'motion-reference'};
 const draft={...character,assets:[...character.assets,asset]};
 // Validate extracted actual landmark timesteps BEFORE saving any bytes.
 const motion=makeMotionCapture31(draft,assetId,landmarkResult);
 const updated={...draft,motionCaptured31:motion,
  updatedAt:new Date().toISOString()};
 guard();
 let saved=false;
 try{
  await addFile(assetId,video);
  saved=true;guard();
  onProgress('실제 관절 '+motion.frames.length+'프레임과 촬영 원본 신규 보존 중');
  await Promise.resolve(onSave(updated));
  saved=false;
  onProgress('실제 웹캠 → MediaPipe → VRM 동작 저장 완료 · '+motion.frames.length+'개 관절 프레임');
  return {character:updated,videoAssetId:assetId,frames:motion.frames.length,
   durationMs:motion.durationMs,originalPreserved:true,
   actualModelPoseSource:'installed-local-mediapipe-pose-task'};
 }catch(error){
  if(saved&&current()===character){
   try{await deleteFile(assetId);}catch(clean){
    throw Error('새 촬영 자료 저장 처리 중단 · 원본 유지 / 새 자산 롤백 실패: '+
     clean.message+' / '+error.message);
   }
  }
  throw error;
 }
}
