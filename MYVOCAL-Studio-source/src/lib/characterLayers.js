// Step81: local pixel/silhouette-guided 2D layer preparation.
// No semantic face/eye detector is bundled: regions are heuristics requiring human review.
export const LAYER_PLAN_VERSION=1;
export const LAYER_KEYS=['body','hair','face','leftEye','rightEye','mouth'];
export const LAYER_LABELS={body:'몸',hair:'머리카락',face:'얼굴',leftEye:'왼쪽 눈(그림 기준)',rightEye:'오른쪽 눈(그림 기준)',mouth:'입'};
export const MAX_LAYER_SIDE=4096;
export const MAX_LAYER_PIXELS=12_000_000;
const isObj=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const rounded=x=>Math.round(x*10000)/10000;
const positive=(n)=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const clamp=(n,low,high)=>Math.min(high,Math.max(low,n));
export function eligibleLayerImages(character){
 if(!character||character.kind!=='character'||!['owned','self','licensed'].includes(character.rights)||(character.rights==='licensed'&&!String(character.rightsNote||'').trim()))return [];
 return (character.assets||[]).filter(a=>/\.(png|jpe?g|webp)$/i.test(a.name||'')&&['image/png','image/jpeg','image/webp'].includes(a.type));
}
export function measureOpacityBounds(pixels,width,height){
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>MAX_LAYER_SIDE||height>MAX_LAYER_SIDE||width*height>MAX_LAYER_PIXELS)throw Error('이미지 크기는 한 변 4096px, 총 1,200만 픽셀 이하여야 합니다.');
 if(!pixels||pixels.length!==width*height*4)throw Error('RGBA 픽셀 데이터 길이가 맞지 않습니다.');
 let minX=width,minY=height,maxX=-1,maxY=-1,count=0;
 // 16 이상의 알파만 전경으로 계산. Solid JPEG will yield full bounds.
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  if(pixels[(y*width+x)*4+3]<16)continue;
  if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;count++;
 }
 if(!count)throw Error('불투명한 픽셀이 없어 레이어 영역을 준비할 수 없습니다.');
 return {x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1,opaqueRatio:rounded(count/(width*height)),transparentMargin:count<width*height};
}
const rect=(b,rx,ry,rw,rh,width,height)=>{
 const x=clamp(Math.round(b.x+b.w*rx),0,width-1),y=clamp(Math.round(b.y+b.h*ry),0,height-1);
 const w=clamp(Math.round(b.w*rw),1,width-x),h=clamp(Math.round(b.h*rh),1,height-y);
 return {x,y,w,h,pivotX:rounded((x+w/2)/width),pivotY:rounded((y+h/2)/height),enabled:true};
};
export function proposeLayerPlan(character,sourceAssetId,width,height,bounds){
 const source=eligibleLayerImages(character).find(a=>a.id===sourceAssetId);
 if(!source)throw Error('등록된 사용 허가 2D 캐릭터의 PNG/JPEG/WebP 원본만 분석할 수 있습니다.');
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>MAX_LAYER_SIDE||height>MAX_LAYER_SIDE||width*height>MAX_LAYER_PIXELS)throw Error('분석 가능한 이미지 크기를 초과했습니다.');
 if(!isObj(bounds)||!['x','y','w','h'].every(k=>Number.isSafeInteger(bounds[k]))||bounds.x<0||bounds.y<0||bounds.w<1||bounds.h<1||bounds.x+bounds.w>width||bounds.y+bounds.h>height)throw Error('알파 경계 정보가 잘못되었습니다.');
 const parts={
  body:rect(bounds,.08,.38,.84,.62,width,height),
  hair:rect(bounds,.20,0,.60,.40,width,height),
  face:rect(bounds,.28,.09,.44,.32,width,height),
  leftEye:rect(bounds,.33,.20,.15,.075,width,height),
  rightEye:rect(bounds,.52,.20,.15,.075,width,height),
  mouth:rect(bounds,.43,.32,.14,.07,width,height),
 };
 return {version:LAYER_PLAN_VERSION,sourceAssetId,width,height,opacityBounds:{...bounds},method:'alpha-silhouette-and-proportional-guide',reviewed:false,parts,createdAt:new Date().toISOString()};
}
export function validateLayerPlan(character,plan){
 if(!isObj(plan)||plan.version!==LAYER_PLAN_VERSION)throw Error('레이어 계획 버전이 지원되지 않습니다.');
 if(!eligibleLayerImages(character).some(a=>a.id===plan.sourceAssetId))throw Error('레이어 원본 그림이 누락되었거나 사용 권한이 부족합니다.');
 const {width,height}=plan;
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>MAX_LAYER_SIDE||height>MAX_LAYER_SIDE||width*height>MAX_LAYER_PIXELS)throw Error('이미지 크기가 잘못되었습니다.');
 if(!isObj(plan.parts)||Object.keys(plan.parts).length!==LAYER_KEYS.length)throw Error('레이어 6종이 모두 필요합니다.');
 for(const key of LAYER_KEYS){
  const p=plan.parts[key];
  if(!isObj(p)||!['x','y','w','h'].every(k=>Number.isSafeInteger(p[k]))||p.x<0||p.y<0||p.w<1||p.h<1||p.x+p.w>width||p.y+p.h>height)throw Error(`${LAYER_LABELS[key]} 영역이 이미지 밖이거나 잘못되었습니다.`);
  if(!Number.isFinite(p.pivotX)||!Number.isFinite(p.pivotY)||p.pivotX<0||p.pivotX>1||p.pivotY<0||p.pivotY>1||typeof p.enabled!=='boolean')throw Error(`${LAYER_LABELS[key]} 중심점·사용 설정이 잘못되었습니다.`);
 }
 return plan;
}
export function changeLayerPart(character,plan,key,patch){
 validateLayerPlan(character,plan);
 if(!LAYER_KEYS.includes(key)||!isObj(patch)||Object.keys(patch).some(k=>!['x','y','w','h','pivotX','pivotY','enabled'].includes(k)))throw Error('허용되지 않는 레이어 수정입니다.');
 const updated={...plan,reviewed:false,parts:{...plan.parts,[key]:{...plan.parts[key],...patch}}};
 validateLayerPlan(character,updated);return updated;
}
export function saveLayerPlan(character,plan){
 validateLayerPlan(character,plan);
 return {...character,layerPlan:{...plan,reviewed:true,reviewedAt:new Date().toISOString()},updatedAt:new Date().toISOString()};
}
export function layerPlanStatus(character){
 if(!character?.layerPlan)return {status:'missing',message:'레이어 분석 없음'};
 try{validateLayerPlan(character,character.layerPlan);return character.layerPlan.reviewed?{status:'ready',message:'영역 검토·저장됨'}:{status:'review',message:'영역 수동 검토 필요'};}
 catch(e){return {status:'invalid',message:'다시 분석 필요: '+e.message};}
}
export function layerManifest(character,plan){
 validateLayerPlan(character,plan);
 return {format:'MYVOCAL_2D_LAYER_PLAN',version:1,characterId:character.id,characterName:character.name,sourceAssetId:plan.sourceAssetId,width:plan.width,height:plan.height,method:plan.method,reviewed:plan.reviewed,opacityBounds:plan.opacityBounds,parts:Object.fromEntries(LAYER_KEYS.map(key=>[key,{...plan.parts[key]}])),warning:'These are rectangular cutouts, NOT semantic segmentation / transparent rig-ready independent sprites. Review manually; a single flattened image cannot recover hidden pixels.'};
}
