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
  if(v.index!==undefined && (typeof v.index!=='string'||v.index.length>1024||!/\.index$/i.test(v.index)))return null;
  return {...Object.fromEntries(keys.map(k=>[k,v[k]])),index:v.index||''};
 }catch{return null}
}
export function writeRVCPreferences(storage,config){
 const keys=['root','python','model','f0','pitch','indexRate'];
 if(keys.some(k=>typeof config?.[k]!=='string'||config[k].length>1024))throw Error('저장할 RVC 경로와 옵션이 올바르지 않습니다.');
 const content={version:1};for(const k of keys)content[k]=config[k];
 if(config?.index){if(typeof config.index!=='string'||config.index.length>1024||!/\.index$/i.test(config.index))throw Error('FAISS 인덱스 경로가 올바르지 않습니다.');content.index=config.index;}
 storage?.setItem(RVC_PREF_KEY,JSON.stringify(content));
 return content;
}