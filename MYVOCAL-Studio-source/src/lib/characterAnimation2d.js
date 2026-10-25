import {visemeAt} from './characterLipSync.js';
import {expressionAt} from './characterExpressionDirector.js';
import {dancePose} from './characterDanceDirector.js';
import {performancePose} from './characterPerformance89.js';
// Step82: deterministic, offline 2D animation over user-reviewed Step81 regions.
// A flattened input is NOT a rig; movements are compositing approximations.
import {validateLayerPlan} from './characterLayers.js';
export const ANIMATION2D_VERSION=1;
export const EXPRESSIONS=['neutral','happy','sad','surprised'];
export const ANIMATION_PRESETS={
 gentle:{headDegrees:2,bodyPixels:2,hairDegrees:3,blinkRate:.28,mouthRate:1.8,mouthStrength:.55,cameraZoom:.02,cameraPan:.015},
 energetic:{headDegrees:7,bodyPixels:6,hairDegrees:8,blinkRate:.35,mouthRate:3.2,mouthStrength:1,cameraZoom:.06,cameraPan:.04},
 ballad:{headDegrees:3,bodyPixels:2,hairDegrees:2,blinkRate:.25,mouthRate:1.45,mouthStrength:.7,cameraZoom:.035,cameraPan:.018},
 still:{headDegrees:0,bodyPixels:0,hairDegrees:0,blinkRate:0,mouthRate:0,mouthStrength:0,cameraZoom:0,cameraPan:0}
};
export const ANIMATION_FIELDS={
 durationSec:[1,20],fps:[6,30],headDegrees:[0,15],bodyPixels:[0,12],hairDegrees:[0,18],
 blinkRate:[0,1],mouthRate:[0,6],mouthStrength:[0,1],cameraZoom:[0,.15],cameraPan:[0,.12]
};
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const validObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function layerAnimationSignature(plan){
 if(!validObject(plan))throw Error('2D 레이어 계획이 필요합니다.');
 // Excludes source asset ID because importing a portable backup reassigns IDs.
 return JSON.stringify({width:plan.width,height:plan.height,parts:plan.parts});
}
export function createAnimationSettings(character,preset='gentle'){
 validateLayerPlan(character,character?.layerPlan);
 if(character.layerPlan.reviewed!==true)throw Error('81단계에서 레이어 위치를 검토·저장한 뒤 애니메이션을 제작하세요.');
 if(!own(ANIMATION_PRESETS,preset))throw Error('지원하지 않는 동작 프리셋입니다.');
 return {version:ANIMATION2D_VERSION,sourceAssetId:character.layerPlan.sourceAssetId,layerSignature:layerAnimationSignature(character.layerPlan),
  durationSec:6,fps:24,expression:'neutral',...ANIMATION_PRESETS[preset]};
}
export function validateAnimationSettings(character,settings){
 validateLayerPlan(character,character?.layerPlan);
 if(character.layerPlan.reviewed!==true)throw Error('레이어 검토·저장이 필요합니다.');
 if(!validObject(settings)||settings.version!==ANIMATION2D_VERSION)throw Error('2D 애니메이션 설정 버전이 맞지 않습니다.');
 if(settings.sourceAssetId!==character.layerPlan.sourceAssetId||settings.layerSignature!==layerAnimationSignature(character.layerPlan))throw Error('81단계 원본/영역이 변경되었습니다. 동작 설정을 재검토하세요.');
 if(!EXPRESSIONS.includes(settings.expression))throw Error('지원하지 않는 표정입니다.');
 for(const [key,[min,max]] of Object.entries(ANIMATION_FIELDS)){
  if(typeof settings[key]!=='number'||!Number.isFinite(settings[key])||settings[key]<min||settings[key]>max)throw Error(`${key} 값은 ${min}~${max} 범위여야 합니다.`);
 }
 if(!Number.isInteger(settings.fps))throw Error('FPS는 정수로 설정하세요.');
 return settings;
}
export function changeAnimationSettings(character,settings,patch){
 if(!validObject(patch)||!Object.keys(patch).length||Object.keys(patch).some(k=>k!=='expression'&&!own(ANIMATION_FIELDS,k)))throw Error('지원하지 않는 동작 설정 수정입니다.');
 return validateAnimationSettings(character,{...settings,...patch});
}
export function saveAnimationSettings(character,settings){
 validateAnimationSettings(character,settings);
 return {...character,animation2d:{...settings,savedAt:new Date().toISOString()},updatedAt:new Date().toISOString()};
}
export function animationStatus(character){
 if(!character?.animation2d)return {status:'missing',message:'2D 애니메이션 설정 없음'};
 try{validateAnimationSettings(character,character.animation2d);return {status:'ready',message:'저장됨 · 동작 미리보기 가능'};}
 catch(e){return {status:'stale',message:e.message};}
}
export function animationManifest(character,settings){
 validateAnimationSettings(character,settings);
 return {format:'MYVOCAL_2D_ANIMATION',version:1,characterId:character.id,characterName:character.name,...settings,
  warning:'Flattened raster compositing preview; no semantic layer extraction, hidden-pixel restoration, phoneme lip sync or 3D rigging.'};
}
const sin=Math.sin,PI=Math.PI;
const safeTime=(t,d)=>Math.max(0,Math.min(d,Number.isFinite(t)?t:0));
export function animationPose(time,settings,{continuous=false}={}){
 // 긴 공연에서는 기존 프리셋의 실제 Canvas 동작을 전곡 시각으로 반복한다.
 // 짧은 단독 미리보기의 기존 종료 시각 동작은 유지한다.
 const t=continuous?Math.max(0,Number.isFinite(time)?time:0):safeTime(time,settings.durationSec);
 const phase=2*PI*t/settings.durationSec;
 // Blink starts a short distance into its cycle, with a deterministic close/open pulse.
 const blinkPhase=(t*settings.blinkRate+.76)%1;
 const blink= settings.blinkRate>0&&blinkPhase>.82?Math.sin((blinkPhase-.82)/.18*PI)**2:0;
 const mouth=settings.mouthRate>0?(Math.sin(2*PI*t*settings.mouthRate)+1)/2:0;
 return {t,blink,eyeScale:1-.93*blink,mouthScale:1+settings.mouthStrength*(.65*mouth-.2),
  headRadians:settings.headDegrees*PI/180*sin(phase),hairRadians:settings.hairDegrees*PI/180*sin(phase-.8),
  bodyY:settings.bodyPixels*sin(phase*2),cameraScale:1+settings.cameraZoom*(.5+.5*sin(phase-.5)),
  cameraX:settings.cameraPan*sin(phase)*.5,cameraY:settings.cameraPan*sin(phase*.75)};
}
function shiftCrop(ctx,img,part,dy){
 if(!part?.enabled||Math.abs(dy)<.00001)return;
 ctx.save();ctx.beginPath();ctx.rect(part.x,part.y,part.w,part.h);ctx.clip();
 ctx.drawImage(img,0,dy,img.naturalWidth,img.naturalHeight);ctx.restore();
}
function angleCrop(ctx,img,part,angle,alpha=1){
 if(!part?.enabled||Math.abs(angle)<.00001)return;
 const cx=part.pivotX*img.naturalWidth,cy=part.pivotY*img.naturalHeight;
 ctx.save();ctx.globalAlpha=alpha;
 ctx.beginPath();ctx.rect(part.x,part.y,part.w,part.h);ctx.clip();
 ctx.translate(cx,cy);ctx.rotate(angle);ctx.translate(-cx,-cy);
 // Sample actual original pixels but clip destination to reviewed rectangle.
 ctx.drawImage(img,0,0,img.naturalWidth,img.naturalHeight);
 ctx.restore();
}
function skinPatch(ctx,img,r){
 // Flattened art has no hidden pixels; use neighboring source pixels as a *visual approximation*.
 const sampleY=Math.max(0,Math.min(img.naturalHeight-1,Math.round(r.y+r.h*1.4)));
 ctx.drawImage(img,r.x,sampleY,r.w,1,r.x,r.y,r.w,r.h);
}
function featureCrop(ctx,img,r,verticalScale){
 if(!r?.enabled)return;
 ctx.save();ctx.beginPath();ctx.rect(r.x,r.y,r.w,r.h);ctx.clip();
 skinPatch(ctx,img,r);
 const amount=Math.max(.05,Math.min(1.8,verticalScale)),dy=r.y+(r.h-r.h*amount)/2;
 ctx.drawImage(img,r.x,r.y,r.w,r.h,r.x,dy,r.w,r.h*amount);
 ctx.restore();
}
/** Draw one real frame on Canvas. The source image is always read-only. */
export function drawAnimationFrame(ctx,img,plan,settings,time,outWidth,outHeight,lipSync=null,expressionPlan=null,character=null,dancePlan=null,performancePlan=null,continuousStage=false){
 if(!ctx||!img||!plan)throw Error('Canvas·원본 이미지·레이어 계획이 필요합니다.');
 if(!Number.isInteger(outWidth)||!Number.isInteger(outHeight)||outWidth<1||outHeight<1||outWidth*outHeight>2_000_000)throw Error('출력 영상 해상도가 허용 범위를 초과했습니다.');
 const p=animationPose(time,settings,{continuous:continuousStage}),w=plan.width,h=plan.height;
 const dance=dancePlan?dancePose(dancePlan,time):null;
 const acting=performancePlan?performancePose(performancePlan,time):null;
 ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,outWidth,outHeight);
 ctx.fillStyle='#171b2c';ctx.fillRect(0,0,outWidth,outHeight);
 ctx.save();ctx.scale(outWidth/w,outHeight/h);
 ctx.translate(w/2+p.cameraX*w,h/2+p.cameraY*h);ctx.scale(p.cameraScale,p.cameraScale);ctx.translate(-w/2,-h/2);
 ctx.drawImage(img,0,0,w,h);
 shiftCrop(ctx,img,plan.parts.body,p.bodyY*h/500+(dance?dance.lift*h*.17:0)+(acting?acting.lift*h*.35:0));
 // Localized appearance approximations: not rigged layers, do not restore occluded pixels.
 // STEP88: dance body sway, driven by beat/section plan; original raster is read-only.
 if(dance?.offset)shiftCrop(ctx,img,plan.parts.body,dance.offset*w*.14);
 if(acting?.offset)shiftCrop(ctx,img,plan.parts.body,acting.offset*w*.22);
 angleCrop(ctx,img,plan.parts.hair,p.hairRadians,.8);
 angleCrop(ctx,img,plan.parts.face,p.headRadians+(dance?dance.angles.head*Math.PI/180:0)+(acting?acting.angles.head*Math.PI/180:0),.87);
 featureCrop(ctx,img,plan.parts.leftEye,p.eyeScale);
 featureCrop(ctx,img,plan.parts.rightEye,p.eyeScale);
 featureCrop(ctx,img,plan.parts.mouth,lipSync ? (.28+visemeAt(lipSync,time).weight*({A:1.45,I:.6,U:.8,E:.85,O:1.25,M:.12,F:.35,sil:0}[visemeAt(lipSync,time).viseme]||0)) : p.mouthScale);
 const directed=expressionPlan&&character?expressionAt(character,expressionPlan,time):null;
 const faceExpression=directed?.expression||settings.expression;
 const faceWeight=directed?.weight??1;
 if(faceExpression!=='neutral'&&faceWeight>0&&plan.parts.mouth.enabled&&(!lipSync||visemeAt(lipSync,time).viseme==='sil')){
  const r=plan.parts.mouth;ctx.save();ctx.lineWidth=Math.max(1,w/320);ctx.strokeStyle='#6e314a';ctx.globalAlpha=faceWeight;ctx.lineCap='round';ctx.beginPath();
  const y=r.y+r.h*.65;ctx.moveTo(r.x+r.w*.2,y);
  if(faceExpression==='happy')ctx.quadraticCurveTo(r.x+r.w*.5,r.y+r.h*1.3,r.x+r.w*.8,y);
  else if(faceExpression==='sad')ctx.quadraticCurveTo(r.x+r.w*.5,r.y+r.h*.08,r.x+r.w*.8,y);
  else if(faceExpression==='surprised'){ctx.ellipse(r.x+r.w*.5,r.y+r.h*.55,r.w*.17,r.h*.3,0,0,2*PI);}else if(faceExpression==='angry'){ctx.lineTo(r.x+r.w*.8,r.y+r.h*.5);}else {ctx.lineTo(r.x+r.w*.8,y);}
  // During singing the STEP85 viseme owns the mouth; mood is shown around the eyes.
  ctx.stroke();ctx.restore();
 }
 if(directed?.weight>0&&(plan.parts.leftEye.enabled||plan.parts.rightEye.enabled)){
  ctx.save();ctx.globalAlpha=directed.weight;ctx.lineWidth=Math.max(1,w/300);ctx.strokeStyle='#452e47';
  for(const eye of [plan.parts.leftEye,plan.parts.rightEye]){if(!eye.enabled)continue;const y=eye.y-eye.h*.14;ctx.beginPath();
   if(directed.expression==='sad') {ctx.moveTo(eye.x,y);ctx.lineTo(eye.x+eye.w,y-eye.h*.16);} 
   else if(directed.expression==='angry'){ctx.moveTo(eye.x,y-eye.h*.2);ctx.lineTo(eye.x+eye.w,y);} 
   else if(directed.expression==='surprised'){ctx.ellipse(eye.x+eye.w/2,y,eye.w*.4,Math.max(1,eye.h*.12),0,Math.PI,2*Math.PI);} 
   else {ctx.moveTo(eye.x,y);ctx.quadraticCurveTo(eye.x+eye.w/2,y-eye.h*.12,eye.x+eye.w,y);}ctx.stroke();
  }ctx.restore();
 }
 ctx.restore();
 return p;
}
export function animationCanvasSize(plan,maxSide=960){
 const scale=Math.min(1,maxSide/Math.max(plan.width,plan.height),Math.sqrt(900000/(plan.width*plan.height)));
 return {width:Math.max(1,Math.round(plan.width*scale)),height:Math.max(1,Math.round(plan.height*scale))};
}
