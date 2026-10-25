// 원본 28항: 실제 설치된 로컬 FaceLandmarker 얼굴·눈·입 특징점으로
// 기존 2D 캐릭터 레이어 후보만 갱신한다. 기존 파일/자산/사용자 저장안 불변.
// 의미론적 캐릭터 분할/머리카락·몸 분리 또는 가려진 얼굴 복원으로 주장하지 않는다.
import {validateLayerPlan,eligibleLayerImages} from './characterLayers.js';
const SOURCE='installed-local-mediapipe-face-landmarker-task';
const PARTS=['face','leftEye','rightEye','mouth'];
const validRect=(r,w,h)=>r&&['x','y','w','h'].every(k=>Number.isSafeInteger(r[k]))&&
 r.x>=0&&r.y>=0&&r.w>=1&&r.h>=1&&r.x+r.w<=w&&r.y+r.h<=h&&
 Number.isFinite(r.pivotX)&&r.pivotX>=0&&r.pivotX<=1&&
 Number.isFinite(r.pivotY)&&r.pivotY>=0&&r.pivotY<=1&&r.enabled===true;

export function suggestFaceLandmarkLayers28(character,plan,result){
 validateLayerPlan(character,plan);
 if(result?.format!=='MYVOCAL_FACE_LANDMARK_LAYERS28'||result.version!==1||
  result.source!==SOURCE||result.width!==plan.width||result.height!==plan.height||
  !result.parts||Object.keys(result.parts).length!==4||
  PARTS.some(k=>!validRect(result.parts[k],plan.width,plan.height)))
  throw Error('실제 얼굴 특징점과 현재 그림/레이어 계획이 일치하지 않습니다.');
 const eyes=[result.parts.leftEye,result.parts.rightEye].sort((a,b)=>a.x-b.x);
 // 등록 캐릭터 전신/머리카락 영역은 자동 모델의 얼굴 특징점만으로 교체하지 않는다.
 const parts={...plan.parts,face:{...result.parts.face},leftEye:{...eyes[0]},
  rightEye:{...eyes[1]},mouth:{...result.parts.mouth}};
 const next={...plan,parts,reviewed:false,method:'actual-local-face-landmarks-with-original-body-hair',
  faceLandmark28:{version:1,source:SOURCE,suggestions:4,modelReviewRequired:true}};
 validateLayerPlan(character,next);
 return next;
}
export async function detectFaceLandmarks28(character,assetId,image,{
 python,model,rightsConfirmed=false,session=globalThis.window?.__MYVOCAL_SESSION_KEY,
 signal,request=fetch
}={}){
 if(!character?.id||!eligibleLayerImages(character).some(a=>a.id===assetId))
  throw Error('사용 허가가 확인된 2D 캐릭터 원본을 선택하세요.');
 if(rightsConfirmed!==true)throw Error('등록 캐릭터 그림의 얼굴 분석 사용 권한을 확인하세요.');
 if(!(image instanceof Blob)||image.size<1024||image.size>40*1024*1024||
 !['image/png','image/jpeg','image/webp'].includes(image.type))
  throw Error('2D 캐릭터 원본은 40MB 이하 PNG/JPEG/WebP만 지원합니다.');
 if(typeof session!=='string'||session.length<8)
  throw Error('기존 Windows EXE의 로컬 보안 세션이 필요합니다.');
 if(!/^(?:[A-Za-z]:\\|\\\\)/.test(String(python))||
  !/[\\/]python\.exe$/i.test(String(python))||
  !/^(?:[A-Za-z]:\\|\\\\)/.test(String(model))||
  !/\.task$/i.test(String(model)))
  throw Error('Windows Python.exe와 설치된 FaceLandmarker .task 절대 경로를 입력하세요.');
 const form=new FormData();
 const ext=image.type==='image/png'?'png':image.type==='image/webp'?'webp':'jpg';
 form.set('image',image,'MYVOCAL-2D-등록원본.'+ext);
 form.set('python',python);form.set('model',model);form.set('rights','confirmed');
 const response=await request('/api/character/layers/face-landmarks',{
  method:'POST',headers:{'X-MYVOCAL-Session':session},body:form,signal,cache:'no-store'
 });
 if(!response?.ok){
  let reason='로컬 FaceLandmarker 추론 실패';
  try{reason=(await response.json()).error||reason}catch{}
  throw Error(reason);
 }
 const result=await response.json();
 if(signal?.aborted)throw Error('실제 2D 얼굴 분석이 취소됐습니다.');
 return result;
}
