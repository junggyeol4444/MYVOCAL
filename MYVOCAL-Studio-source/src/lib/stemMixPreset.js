// MYVOCAL: save/restore only non-destructive Demucs mix parameters.
// Never contains source WAVs, model paths, voice data or project assets.
const FOUR=['drums','bass','other','vocals'];
const SIX=[...FOUR,'guitar','piano'];
const FIELDS=['gainDb','balance','mute','eqLowDb','eqMidDb','eqHighDb','offsetSec','trimStartSec','trimEndSec','fadeInSec','fadeOutSec'];
const BOUNDS={gainDb:[-60,12],balance:[-1,1],eqLowDb:[-12,12],eqMidDb:[-12,12],eqHighDb:[-12,12],offsetSec:[0,360],trimStartSec:[0,360],trimEndSec:[0,360],fadeInSec:[0,10],fadeOutSec:[0,10]};
export function validateStemMixPreset(value,expectedCount){
 if(!value||typeof value!=='object'||Array.isArray(value)||value.format!=='MYVOCAL_STEM_MIX'||value.version!==1||![4,6].includes(value.stemCount)||value.stemCount!==expectedCount)throw Error('믹싱 설정 파일 버전 또는 트랙 개수가 일치하지 않습니다.');
 if(!value.settings||typeof value.settings!=='object'||Array.isArray(value.settings))throw Error('믹싱 설정이 올바르지 않습니다.');
 const allowed=value.stemCount===4?FOUR:SIX;
 const settings={};
 for(const [key,entry] of Object.entries(value.settings)){
  if(key!=='_master'&&!allowed.includes(key))throw Error('믹싱 설정에 알 수 없는 트랙이 있습니다.');
  if(!entry||typeof entry!=='object'||Array.isArray(entry))throw Error('믹싱 트랙 설정이 올바르지 않습니다.');
  const fields=key==='_master'?['fadeInSec','fadeOutSec','duckEnabled','duckThresholdDb','duckReductionDb','duckAttackMs','duckReleaseMs','targetLufs']:FIELDS;
  const clean={};
  for(const [field,val] of Object.entries(entry)){
   if(!fields.includes(field))throw Error('지원하지 않는 믹싱 설정 항목입니다.');
   if(field==='targetLufs'&&val===null){clean[field]=null;continue;}
   if(field==='mute'||field==='duckEnabled'){if(typeof val!=='boolean')throw Error('음소거·사이드체인 활성화 값이 올바르지 않습니다.');}
   else {const [min,max]=key==='_master'?({fadeInSec:[0,10],fadeOutSec:[0,10],duckThresholdDb:[-60,-1],duckReductionDb:[0,18],duckAttackMs:[5,250],duckReleaseMs:[50,1500],targetLufs:[-24,-9]}[field]):BOUNDS[field];if(typeof val!=='number'||!Number.isFinite(val)||val<min||val>max)throw Error('믹싱 수치가 허용 범위를 벗어났습니다.');}
   clean[field]=val;
  }
  settings[key]=clean;
 }
 return settings;
}
export function serializeStemMixPreset(settings,stemCount){
 const value={format:'MYVOCAL_STEM_MIX',version:1,stemCount,settings};
 const validated=validateStemMixPreset(value,stemCount);
 return JSON.stringify({...value,settings:validated},null,2)+'\n';
}
export function parseStemMixPreset(text,stemCount){
 if(typeof text!=='string'||text.length>65536)throw Error('믹싱 설정 파일은 64KiB 이하여야 합니다.');
 let value;try{value=JSON.parse(text)}catch{throw Error('믹싱 설정 JSON을 읽을 수 없습니다.');}
 return validateStemMixPreset(value,stemCount);
}
