// Store paths and text options ONLY; no model, audio, token or personal recording.
export const MUSICGEN_SETTINGS_KEY='myvocal-musicgen-local-paths-v1';
export function readMusicGenPreferences(storage){
 try{const raw=storage?.getItem(MUSICGEN_SETTINGS_KEY);if(!raw)return {};
  const p=JSON.parse(raw);if(p?.version!==1)return {};
  return {python:typeof p.python==='string'?p.python.slice(0,1024):'',modelDir:typeof p.modelDir==='string'?p.modelDir.slice(0,1024):''};
 }catch{return {};}
}
export function writeMusicGenPreferences(storage,{python,modelDir}){
 if(typeof python!=='string'||typeof modelDir!=='string'||python.length>1024||modelDir.length>1024||/[\r\n\x00]/.test(python+modelDir))throw Error('MusicGen 로컬 경로를 확인하세요.');
 if(!storage||typeof storage.setItem!=='function')throw Error('로컬 설정을 저장할 수 없습니다.');
 storage.setItem(MUSICGEN_SETTINGS_KEY,JSON.stringify({version:1,python,modelDir}));
}
