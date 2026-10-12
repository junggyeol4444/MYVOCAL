const DB='myvocal-assets-v01',STORE='files';
function openDb() {return new Promise((resolve,reject)=>{const request=indexedDB.open(DB,1);request.onupgradeneeded=()=>request.result.createObjectStore(STORE);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function tx(mode, callback) {const db=await openDb();return new Promise((resolve,reject)=>{const t=db.transaction(STORE,mode);const req=callback(t.objectStore(STORE));req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);t.oncomplete=()=>db.close();t.onerror=()=>reject(t.error);});}
export const putFile=(id,file)=>tx('readwrite',s=>s.put(file,id));
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
