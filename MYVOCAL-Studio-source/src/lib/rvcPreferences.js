// Store only optional local path choices, not model contents or recordings.
export const RVC_PREF_KEY='MYVOCAL_RVC_LOCAL_PATHS_V1';
export function readRVCPreferences(storage){
 try{
  const raw=storage?.getItem(RVC_PREF_KEY);
  if(!raw||raw.length>4000)return null;
  const v=JSON.parse(raw);
  if(v?.version!==1)return null;
  const keys=['root','python','model','f0','pitch','indexRate'];
  if(keys.some(k=>typeof v[k]!=='string'||v[k].length>1024))return null;
  if(!['pm','rmvpe'].includes(v.f0))return null;
  return Object.fromEntries(keys.map(k=>[k,v[k]]));
 }catch{return null}
}
export function writeRVCPreferences(storage,config){
 const keys=['root','python','model','f0','pitch','indexRate'];
 if(keys.some(k=>typeof config?.[k]!=='string'||config[k].length>1024))throw Error('저장할 RVC 경로와 옵션이 올바르지 않습니다.');
 const content={version:1};for(const k of keys)content[k]=config[k];
 storage?.setItem(RVC_PREF_KEY,JSON.stringify(content));
 return content;
}