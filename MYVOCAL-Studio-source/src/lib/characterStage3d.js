// STEP84 — offline 3D stage direction, independent of Step83 rig/asset data.
// No network or remote effects. Values are finite and bounded before rendering/recording.
import {modelAssets,validateRigSettings,createRigSettings} from './character3d.js';
export const STAGE_BACKDROPS=['concert','neon','theater'];
export const STAGE_CAMERAS=['fixed','orbit','track','dolly','cuts'];
export const STAGE_LIGHTS=['concert','warm','cool','pulse'];
export const STAGE_FPS=[24,30];
export const STAGE_MAX_SECONDS=360;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const validString=(value,max)=>typeof value==='string'&&value.length<=max;
const ensure=(ok,msg)=>{if(!ok)throw Error(msg);};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const colors={
 concert:{background:[.025,.034,.085],floor:[.15,.17,.27],rear:[.07,.1,.22],accent:[.45,.23,.85]},
 neon:{background:[.025,.012,.065],floor:[.12,.07,.19],rear:[.09,.025,.16],accent:[.18,.74,.92]},
 theater:{background:[.07,.025,.03],floor:[.28,.18,.14],rear:[.24,.055,.07],accent:[.95,.66,.27]}
};
const tints={concert:[.94,.9,1],warm:[1,.86,.7],cool:[.75,.88,1],pulse:[.88,.65,1]};
export function createStageSettings(character){
 const candidates=modelAssets(character);const rig=character.rig3d&&candidates.some(a=>a.id===character.rig3d.assetId)?character.rig3d:createRigSettings(character);
 return {version:1,assetId:rig.assetId,backdrop:'concert',camera:'orbit',lights:'concert',duration:8,fps:24,
  yaw:rig.yaw||0,pitch:rig.pitch||0,zoom:1,lightIntensity:1,cameraMotion:1,lightMotion:1,
  motion:rig.motion||'idle',animation:rig.animation||'',expression:rig.expression||'neutral',expressionWeight:rig.expressionWeight??1,speed:rig.speed||1,autoBlink:true};
}
export function validateStageSettings(character,stage){
 ensure(character&&typeof character==='object','캐릭터가 없습니다.');
 ensure(character.rights==='owned'||character.rights==='self'||(character.rights==='licensed'&&character.rightsNote?.trim()),'본인 제작 또는 허가 기록이 있는 캐릭터만 무대 제작할 수 있습니다.');
 ensure(stage&&typeof stage==='object'&&!Array.isArray(stage),'3D 무대 설정 형식 오류');
 ensure(stage.version===1,'지원하지 않는 무대 설정 버전');
 ensure(stage.autoBlink===undefined||typeof stage.autoBlink==='boolean','VRM 자동 눈깜빡임 설정 오류');
 ensure(modelAssets(character).some(a=>a.id===stage.assetId),'캐릭터 원본 3D 모델을 찾을 수 없습니다.');
 ensure(STAGE_BACKDROPS.includes(stage.backdrop)&&STAGE_CAMERAS.includes(stage.camera)&&STAGE_LIGHTS.includes(stage.lights),'무대·카메라·조명 설정 오류');
 for(const key of ['duration','fps','yaw','pitch','zoom','lightIntensity','cameraMotion','lightMotion','expressionWeight','speed'])ensure(finite(stage[key]),`${key} 설정 오류`);
 ensure(stage.duration>=2&&stage.duration<=STAGE_MAX_SECONDS&&STAGE_FPS.includes(stage.fps),'영상 길이 또는 FPS 범위 오류');
 ensure(Math.abs(stage.yaw)<=180&&Math.abs(stage.pitch)<=60&&stage.zoom>=.7&&stage.zoom<=1.5,'카메라 설정 범위 오류');
 ensure(stage.lightIntensity>=.2&&stage.lightIntensity<=2&&stage.cameraMotion>=0&&stage.cameraMotion<=2&&stage.lightMotion>=0&&stage.lightMotion<=2,'연출 강도 범위 오류');
 ensure(validString(stage.animation,100)&&validString(stage.motion,20)&&validString(stage.expression,30),'모션·표정 설정 오류');
 const rig={assetId:stage.assetId,motion:stage.motion,expression:stage.expression,expressionWeight:stage.expressionWeight,
  speed:stage.speed,yaw:stage.yaw,pitch:stage.pitch,boneName:'',boneDegrees:0,animation:stage.animation};
 validateRigSettings(character,rig);
 return stage;
}
export function saveStageSettings(character,settings){validateStageSettings(character,settings);return {...character,stage3d:{...settings},updatedAt:new Date().toISOString()};}
export function stageStatus(character){if(!modelAssets(character).length)return '3D 모델 없음';if(!character.stage3d)return '무대 설정 전';try{validateStageSettings(character,character.stage3d);return '3D 무대 저장됨';}catch{return '무대 재설정 필요';}}
// Time is always explicitly supplied; the preview, scrubber and video use identical math.
export function stageFrame(stage,time,{continuous=false}={}){
 // 3~6분 가상 밴드에서는 원곡 전체 시각으로 카메라·조명을 구동한다.
 // 단독 짧은 무대 미리보기는 기존 duration 경계를 유지한다.
 const t=continuous?Math.max(0,Number.isFinite(time)?time:0):clamp(Number.isFinite(time)?time:0,0,stage.duration);
 const movement=stage.cameraMotion;
 let yaw=stage.yaw,pitch=stage.pitch,zoom=stage.zoom,track=0;
 if(stage.camera==='orbit')yaw+=movement*30*Math.sin(t*.42);
 else if(stage.camera==='track')track=movement*.34*Math.sin(t*.65);
 else if(stage.camera==='dolly')zoom*=1+movement*.16*Math.sin(t*.72);
 else if(stage.camera==='cuts'){
  const shot=Math.floor(t/Math.max(1.5,stage.duration/4))%4;
  yaw+=movement*[-20,25,-12,12][shot];pitch+=movement*[3,-4,7,0][shot];zoom*=1+movement*[.22,-.13,.4,-.05][shot];
 }
 pitch=clamp(pitch,-65,65);zoom=clamp(zoom,.4,2.6);
 const pulse=(stage.lights==='pulse'?(.65+.35*Math.cos(t*4)):1);
 const sweep=stage.lightMotion*Math.sin(t*1.4);
 const brightness=stage.lightIntensity*pulse;
 return {time:t,camera:{yaw,pitch,zoom,track},light:{brightness,sweep,theme:tints[stage.lights]},palette:colors[stage.backdrop]};
}
export function stageRigSettings(stage){return {assetId:stage.assetId,motion:stage.motion,animation:stage.animation,expression:stage.expression,
 expressionWeight:stage.expressionWeight,speed:stage.speed,autoBlink:stage.autoBlink!==false,boneName:'',boneDegrees:0,yaw:stage.yaw,pitch:stage.pitch};}
export function stageMetadata(character,stage){validateStageSettings(character,stage);return {format:'MYVOCAL_3D_STAGE_STEP84',version:1,characterId:character.id,
 modelAssetId:stage.assetId,settings:{...stage},export:{format:'video/webm',audio:'none',durationSec:stage.duration,fps:stage.fps},
 caveat:'WebGL stage renderer; actual WebM recording depends on supported MediaRecorder and GPU.'};}
