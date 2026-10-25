// MYVOCAL 원본66항 #50: 기존 MV Style91이 허가 영상에서 실제 측정한
// 색/밝기/대비 정보를 기존 MV 렌더러에 비파괴 적용한다.
// 컷 의미/카메라/AI 신경망 스타일 학습을 수행했다고 주장하지 않는다.
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const snapshot=project=>JSON.stringify({
 id:project?.id,scenes:project?.scenes,
 existing:project?.mvStyleGrade91,history:project?.mvStyleGradeHistory91
});
function validAnalysis(x){
 return x?.version===1&&x.method==='offline-sampled-frame-analysis'&&
 Number.isInteger(x.frameSamples)&&x.frameSamples>=2&&
 Array.isArray(x.averageColor)&&x.averageColor.length===3&&
 x.averageColor.every(v=>Number.isFinite(v)&&v>=0&&v<=255)&&
 Number.isFinite(x.averageBrightness)&&x.averageBrightness>=0&&x.averageBrightness<=255&&
 Number.isFinite(x.averageContrast)&&x.averageContrast>=0&&x.averageContrast<=255&&
 Number.isFinite(x.estimatedShotSeconds)&&x.estimatedShotSeconds>=0;
}
function trusted(entry){
 return entry?.kind==='MV Style Learning'&&
 (entry.rights==='self'||entry.rights==='owned'||(entry.rights==='licensed'&&!!String(entry.rightsNote||'').trim()))&&
 entry.assetId&&entry.mvStyle91?.sourceAssetId===entry.assetId&&validAnalysis(entry.mvStyle91);
}
export function mvStyle91ColorGrade(analysis){
 if(!validAnalysis(analysis))throw Error('기존 MV 영상에서 측정한 스타일 데이터가 없습니다.');
 const [r,g,b]=analysis.averageColor.map(x=>Math.round(x));
 const brightness=clamp(analysis.averageBrightness/128,.72,1.32);
 const contrast=clamp(analysis.averageContrast/55,.75,1.35);
 const saturation=clamp((Math.max(r,g,b)-Math.min(r,g,b))/75,.76,1.26);
 return {brightness:Math.round(brightness*100)/100,
  contrast:Math.round(contrast*100)/100,
  saturation:Math.round(saturation*100)/100,
  color:[r,g,b],tintAlpha:.08};
}
export function previewMvStyleReapply91(project,entry){
 if(!project?.id||!Array.isArray(project.scenes)||!project.scenes.length)
  throw Error('기존 MYVOCAL MV 장면 프로젝트를 선택하세요.');
 if(!trusted(entry))throw Error('권한 및 실제 영상 프레임 분석이 확인된 MV 스타일만 사용 가능합니다.');
 const style=entry.mvStyle91;
 const grade=mvStyle91ColorGrade(style);
 const read=style.estimatedShotSeconds;
 return {version:1,projectId:project.id,entryId:entry.id,sourceAssetId:entry.assetId,
  styleName:String(style.name||entry.name||'MV 스타일').slice(0,120),
  sourceSnapshot:snapshot(project),grade,
  measuredCutSeconds:read,measuredCuts:style.estimatedCutsSec?.length||0,
  preview:'실제 측정 RGB '+grade.color.join('/')+
   ', 밝기 '+grade.brightness+', 대비 '+grade.contrast+
   ', 채도 '+grade.saturation+' · 평균 컷 '+read+'초(참고만)'};
}
export function applyMvStyleReapply91(project,entry,review){
 const next=previewMvStyleReapply91(project,entry);
 if(!review||review.version!==1||review.sourceSnapshot!==next.sourceSnapshot||
  review.projectId!==next.projectId||review.entryId!==next.entryId||
  JSON.stringify(review.grade)!==JSON.stringify(next.grade))
  throw Error('MV 스타일 미리보기 후 원본 영상·프로젝트가 변경되었습니다.');
 const previous=Object.hasOwn(project,'mvStyleGrade91')?project.mvStyleGrade91:null;
 const applied={version:1,sourceLearningId:entry.id,sourceAssetId:entry.assetId,
  styleName:next.styleName,grade:next.grade,
  measuredCutSeconds:next.measuredCutSeconds,measuredCuts:next.measuredCuts};
 return {...project,mvStyleGrade91:applied,
  mvStyleGradeHistory91:{version:1,history:[
   ...(project.mvStyleGradeHistory91?.history||[]),{
    before:previous,after:JSON.stringify(applied)
   }].slice(-12)}};
}
export function undoMvStyleReapply91(project){
 const history=project?.mvStyleGradeHistory91?.history||[],last=history.at(-1);
 if(!last||JSON.stringify(project.mvStyleGrade91)!==last.after)
  throw Error('변경 이후 영상 스타일이 달라져 자동 복원할 수 없습니다.');
 const next={...project,mvStyleGradeHistory91:{version:1,history:history.slice(0,-1)}};
 if(last.before===null)delete next.mvStyleGrade91;
 else next.mvStyleGrade91=last.before;
 return next;
}
export function activeMvStyleGrade91(project){
 const obj=project?.mvStyleGrade91,grade=obj?.grade;
 if(obj?.version!==1||!grade||!Array.isArray(grade.color)||grade.color.length!==3||
 grade.color.some(v=>!Number.isInteger(v)||v<0||v>255)||
 ![grade.brightness,grade.contrast,grade.saturation].every(v=>Number.isFinite(v)&&v>=.65&&v<=1.5)||
 !Number.isFinite(grade.tintAlpha)||grade.tintAlpha<0||grade.tintAlpha>.2)
  return null;
 return grade;
}
