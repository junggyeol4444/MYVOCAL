// #55: reusable paths to EXPLICITLY installed local software. Never store
// voice/audio files, passwords, rights consent, trained model bytes, or remote URLs.
// Native Windows EXE localStorage only. Missing tools remain visibly unconfigured.
const KEY='MYVOCAL_NATIVE_PRODUCTION_PATHS55';
const FIELDS=['musicPython','musicModelDir','demucsRoot','soundfontDll','soundfontFile'];
const windowsPath=value=>typeof value==='string'&&value.length<=2048&&
 (/^[A-Za-z]:[\\/]/.test(value)||/^\\\\[^\\/]+[\\/]/.test(value))&&
 !/[\0\r\n]/.test(value);
export function readNativeProductionPaths(storage){
 const result={};let saved=null;
 try{saved=JSON.parse(storage?.getItem(KEY)||'{}')}catch{return result}
 if(!saved||saved.version!==1)return result;
 for(const field of FIELDS){
  if(windowsPath(saved[field]))result[field]=saved[field];
 }
 return result;
}
export function storeNativeProductionPaths(storage,settings){
 if(!storage||typeof storage.setItem!=='function')throw Error('Windows 로컬 설정 저장소를 사용할 수 없습니다.');
 const values={version:1};
 for(const field of FIELDS){
  if(settings[field]===''||settings[field]===undefined)continue;
  if(!windowsPath(settings[field]))
   throw Error('로컬 프로그램 경로가 Windows 절대 경로가 아닙니다: '+field);
  values[field]=settings[field];
 }
 storage.setItem(KEY,JSON.stringify(values));
 return Object.fromEntries(FIELDS.filter(k=>k in values).map(k=>[k,values[k]]));
}
