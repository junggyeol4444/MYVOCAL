const DB='myvocal-assets-v01',STORE='files';
function openDb() {return new Promise((resolve,reject)=>{const request=indexedDB.open(DB,1);request.onupgradeneeded=()=>request.result.createObjectStore(STORE);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
// IndexedDB request success means the operation ran, NOT that its transaction
// committed. Never publish a recording/model asset as saved before oncomplete.
// An abort (quota, disk I/O, shutdown) must reject even if put() succeeded.
async function tx(mode, callback) {
 const db=await openDb();
 return new Promise((resolve,reject)=>{
  let done=false,requestResult,transaction;
  const settle=error=>{
   if(done)return;
   done=true;
   db.close();
   if(error)reject(error);
   else resolve(requestResult);
  };
  try{
   transaction=db.transaction(STORE,mode);
   transaction.oncomplete=()=>settle(null);
   transaction.onabort=()=>settle(transaction.error||new Error('자산 저장 트랜잭션이 중단되었습니다.'));
   // Request errors abort an ordinary IndexedDB transaction. Resolve/reject
   // on the transaction's terminal event, never an individual request event.
   transaction.onerror=()=>{};
   const request=callback(transaction.objectStore(STORE));
   request.onsuccess=()=>{requestResult=request.result;};
   request.onerror=()=>{};
  }catch(error){
   if(transaction)try{transaction.abort();}catch{}
   settle(error);
  }
 });
}
export const putFile=(id,file)=>tx('readwrite',s=>s.put(file,id));
// Generated assets require add-only storage; collisions abort without replacing originals.
export const putFileNew=(id,file)=>tx('readwrite',s=>s.add(file,id));
export const getFile=(id)=>tx('readonly',s=>s.get(id));
export const removeFile=(id)=>tx('readwrite',s=>s.delete(id));

// Restore all imported assets in one IndexedDB transaction: failure aborts the batch.
export async function putFilesAtomic(entries){
 if(!Array.isArray(entries)||entries.some(([id,file])=>!id||!file))throw new Error('Invalid asset batch');
 if(!entries.length)return;
 const db=await openDb();
 return new Promise((resolve,reject)=>{
  let settled=false;const done=(err)=>{if(settled)return;settled=true;db.close();err?reject(err):resolve();};
  let transaction;
  try{transaction=db.transaction(STORE,'readwrite');const store=transaction.objectStore(STORE);
   for(const [id,file] of entries)store.add(file,id);
   transaction.oncomplete=()=>done();
   transaction.onabort=()=>done(transaction.error||new Error('Asset restore transaction aborted'));
   transaction.onerror=()=>{};
  }catch(err){if(transaction)try{transaction.abort();}catch{}done(err);}
 });
}

// Enumerate originals when moving a complete workspace to a different profile.
// No files are modified by this read-only operation.
export async function listAssetFiles(){
 const db=await openDb();
 return new Promise((resolve,reject)=>{
  const rows=[],t=db.transaction(STORE,'readonly'),req=t.objectStore(STORE).openCursor();
  req.onsuccess=()=>{const c=req.result;if(c){rows.push([String(c.key),c.value]);c.continue();}};
  req.onerror=()=>{};
  t.oncomplete=()=>{db.close();resolve(rows);};
  t.onabort=()=>{db.close();reject(t.error||new Error('자산 목록 읽기 중단'));};
  t.onerror=()=>{};
 });
}
export const countAssetFiles=()=>tx('readonly',s=>s.count());
// Called only after a failed fresh-profile import; never wipe an existing workspace.
export async function deleteFilesAtomic(ids){
 if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'||!id))throw Error('자산 삭제 목록 오류');
 if(!ids.length)return;
 const db=await openDb();
 return new Promise((resolve,reject)=>{
  const t=db.transaction(STORE,'readwrite'),store=t.objectStore(STORE);
  ids.forEach(id=>store.delete(id));
  t.oncomplete=()=>{db.close();resolve();};
  t.onabort=()=>{db.close();reject(t.error||new Error('자산 복구 롤백 실패'));};
 });
}
