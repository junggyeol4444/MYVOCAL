// Full-workspace portable backup for moving between dedicated desktop profiles.
// The archive contains metadata AND every IndexedDB original. Import never overwrites
// a nonempty target, and no source browser profile is touched.
import {makeZip,crc32} from './zipStore.js';
import {listAssetFiles,countAssetFiles,putFilesAtomic,deleteFilesAtomic} from './assetDb.js';
import {initialData} from './schema.js';
import {saveData} from './store.js';

export const MAX_WORKSPACE_ZIP_BYTES=256*1024*1024;
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const fail=s=>{throw Error(s);};
// Read only uncompressed archives in the precise layout written by makeZip.
// ZIP64, compression, paths, duplicate entries, comments and trailing bytes are rejected.
export function readStoredWorkspaceZip(input){
 const b=input instanceof Uint8Array?input:new Uint8Array(input);
 if(b.length<22||b.length>MAX_WORKSPACE_ZIP_BYTES)fail('작업공간 ZIP 크기 제한 (256MB)');
 const view=new DataView(b.buffer,b.byteOffset,b.byteLength),u16=o=>view.getUint16(o,true),u32=o=>view.getUint32(o,true);
 const end=b.length-22;
 if(u32(end)!==0x06054b50||u16(end+20)!==0||u16(end+4)!==0||u16(end+6)!==0||u16(end+8)!==u16(end+10))fail('ZIP 중앙 디렉터리 오류');
 const count=u16(end+10),size=u32(end+12),start=u32(end+16);
 if(count<1||count>10001||start+size!==end)fail('ZIP 파일 목록 오류');
 let pos=start;const entries=new Map(),seenOffsets=new Set();
 for(let i=0;i<count;i++){
  if(pos+46>end||u32(pos)!==0x02014b50)fail('ZIP 항목 헤더 오류');
  const flags=u16(pos+8),method=u16(pos+10),crc=u32(pos+16),packed=u32(pos+20),unpacked=u32(pos+24),nl=u16(pos+28),extra=u16(pos+30),comment=u16(pos+32),local=u32(pos+42);
  if(flags!==0x0800||method!==0||packed!==unpacked||extra||comment||u16(pos+34)||u32(pos+38)||!nl||nl>240||pos+46+nl>end)fail('지원하지 않는 ZIP 항목');
  const name=decoder.decode(b.subarray(pos+46,pos+46+nl));
  if((name!=='manifest.json'&&!/^assets\/[0-9]{1,5}\.bin$/.test(name))||entries.has(name)||seenOffsets.has(local))fail('ZIP 경로 또는 중복 파일 오류');
  seenOffsets.add(local);
  if(local+30+nl>start||u32(local)!==0x04034b50||u16(local+6)!==flags||u16(local+8)!==0||
     u32(local+14)!==crc||u32(local+18)!==packed||u32(local+22)!==unpacked||u16(local+26)!==nl||u16(local+28)!==0)fail('ZIP 원본 항목 불일치');
  if(decoder.decode(b.subarray(local+30,local+30+nl))!==name)fail('ZIP 이름 불일치');
  const begin=local+30+nl,finish=begin+packed;
  if(finish>start)fail('ZIP 항목이 파일 영역을 벗어났습니다.');
  const bytes=b.subarray(begin,finish);
  if(crc32(bytes)!==crc)fail('ZIP 항목 체크섬 오류');
  entries.set(name,bytes);pos+=46+nl;
 }
 if(pos!==end||!entries.has('manifest.json')||entries.size!==count)fail('ZIP 항목 수 오류');
 return entries;
}
function validateData(data){
 if(!data||Array.isArray(data)||typeof data!=='object'||!Array.isArray(data.projects)||
    !Array.isArray(data.voices)||!Array.isArray(data.characters))fail('MYVOCAL 프로젝트 데이터 형식 오류');
 for(const key of ['projects','voices','characters','learning','trainingPlans','voiceModels','voicebanks','virtualSingers','musicStyles','videoStyles']){
  if(data[key]!==undefined&&!Array.isArray(data[key]))fail('프로필 목록 데이터 형식 오류: '+key);
 }
 if(data.settings!==undefined && (!data.settings||typeof data.settings!=='object'||Array.isArray(data.settings)))fail('설정 데이터 형식 오류');
 return {...initialData,...data};
}
export function emptyWorkspace(data){
 const valid=validateData(data);
 return ['projects','voices','characters','learning','trainingPlans','voiceModels','voicebanks','virtualSingers','musicStyles','videoStyles'].every(k=>(valid[k]||[]).length===0);
}
export async function createFullWorkspaceZip(data,assetFiles,exportedAt=new Date().toISOString()){
 const valid=validateData(data);
 if(!Array.isArray(assetFiles)||assetFiles.length>10000)fail('자산 개수 제한 (10,000개)');
 const ids=new Set(),assets=[],files=[];
 let total=0;
 for(let i=0;i<assetFiles.length;i++){
  const [id,file]=assetFiles[i];
  if(typeof id!=='string'||!id||id.length>256||ids.has(id)||!(file instanceof Blob))fail('프로젝트 자산 ID/파일 오류');
  ids.add(id);
  const name='assets/'+i+'.bin',bytes=new Uint8Array(await file.arrayBuffer());
  total+=bytes.length;
  if(total>MAX_WORKSPACE_ZIP_BYTES-2*1024*1024)fail('원본 자료 용량이 256MB 제한을 초과했습니다. 프로젝트별 백업을 이용하세요.');
  assets.push({id,path:name,name:String(file.name||id).slice(0,255),mime:file.type||'application/octet-stream',size:bytes.length});
  files.push({name,data:bytes});
 }
 const manifest={format:'MYVOCAL_FULL_WORKSPACE_BACKUP',formatVersion:1,exportedAt,data:valid,assets};
 files.unshift({name:'manifest.json',data:encoder.encode(JSON.stringify(manifest))});
 const bytes=makeZip(files);
 if(bytes.length>MAX_WORKSPACE_ZIP_BYTES)fail('작업공간 ZIP 크기 제한 (256MB)');
 return bytes;
}
export function parseFullWorkspaceZip(bytes){
 const entries=readStoredWorkspaceZip(bytes);
 let manifest;
 try{manifest=JSON.parse(decoder.decode(entries.get('manifest.json')));}catch{fail('작업공간 manifest.json 오류');}
 if(manifest?.format!=='MYVOCAL_FULL_WORKSPACE_BACKUP'||manifest.formatVersion!==1||
   !Array.isArray(manifest.assets)||manifest.assets.length!==entries.size-1)fail('지원하지 않는 작업공간 백업 형식');
 const data=validateData(manifest.data);
 const ids=new Set(),paths=new Set(),pending=[];
 for(const entry of manifest.assets){
  const {id,path,name,mime,size}=entry||{};
  if(typeof id!=='string'||!id||id.length>256||ids.has(id)||paths.has(path)||
     typeof name!=='string'||name.length>255||typeof mime!=='string'||mime.length>255||
     !Number.isInteger(size)||size<0||!entries.has(path))fail('백업 자산 정보 오류');
  ids.add(id);paths.add(path);
  const raw=entries.get(path);if(raw.length!==size)fail('원본 자산 크기 오류');
  pending.push([id,new File([raw],name||id,{type:mime})]);
 }
 return {data,assets:pending,count:pending.length};
}
export async function downloadFullWorkspaceZip(data){
 const assets=await listAssetFiles();
 const bytes=await createFullWorkspaceZip(data,assets);
 const url=URL.createObjectURL(new Blob([bytes],{type:'application/zip'}));
 const link=document.createElement('a');
 link.href=url;link.download='MYVOCAL-full-workspace.myvocal.zip';link.click();
 setTimeout(()=>URL.revokeObjectURL(url),15000);
 return assets.length;
}
export async function restoreFullWorkspaceZip(file,currentData){
 if(!emptyWorkspace(currentData)||await countAssetFiles()!==0)fail('현재 작업공간에 기존 자료가 있습니다. 덮어쓰지 않습니다. 빈 네이티브 프로필에서 복원하세요.');
 if(!(file instanceof Blob)||file.size>MAX_WORKSPACE_ZIP_BYTES||file.size<22)fail('작업공간 ZIP 파일 용량 오류');
 const loaded=parseFullWorkspaceZip(new Uint8Array(await file.arrayBuffer()));
 await putFilesAtomic(loaded.assets);
 if(!saveData(loaded.data)){
  try{await deleteFilesAtomic(loaded.assets.map(x=>x[0]));}catch{}
  fail('프로젝트 정보 저장 실패. 기존 자료는 덮어쓰지 않았습니다.');
 }
 return loaded;
}
