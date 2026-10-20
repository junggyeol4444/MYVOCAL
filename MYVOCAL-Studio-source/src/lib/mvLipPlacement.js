// Local-only UI placement values, never recordings, media or character data.
export const MV_LIP_PLACEMENT_KEY='myvocal-mv-lip-overlay-v1';
const valid=(n,a,b)=>typeof n==='number'&&Number.isFinite(n)&&n>=a&&n<=b;
export function readMvLipPlacement(storage,projectId){
 if(typeof projectId!=='string'||!projectId||projectId.length>120)return {};
 try{const data=JSON.parse(storage?.getItem(MV_LIP_PLACEMENT_KEY)||'null');const p=data?.[projectId];
  if(valid(p?.xPercent,5,95)&&valid(p?.yPercent,5,95)&&valid(p?.sizePercent,2,18))return {xPercent:p.xPercent,yPercent:p.yPercent,sizePercent:p.sizePercent};
 }catch{}return {};
}
export function saveMvLipPlacement(storage,projectId,{xPercent,yPercent,sizePercent}){
 if(typeof projectId!=='string'||!projectId||projectId.length>120||![ [xPercent,5,95],[yPercent,5,95],[sizePercent,2,18] ].every(([n,a,b])=>valid(n,a,b)))throw Error('프로젝트 ID 또는 입 위치가 올바르지 않습니다.');
 if(!storage?.setItem)throw Error('이 PC에 입 위치를 기억할 수 없습니다.');
 let current={};try{const raw=JSON.parse(storage.getItem(MV_LIP_PLACEMENT_KEY)||'{}');if(raw&&typeof raw==='object'&&!Array.isArray(raw))current=raw;}catch{}
 // Bound the local preferences to 80 projects; never store character media.
 const next=Object.fromEntries(Object.entries(current).filter(([k])=>k!==projectId).slice(-79));
 next[projectId]={xPercent,yPercent,sizePercent};storage.setItem(MV_LIP_PLACEMENT_KEY,JSON.stringify(next));
}