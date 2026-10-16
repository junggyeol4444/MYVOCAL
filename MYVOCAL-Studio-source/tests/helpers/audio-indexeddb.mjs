// Test-only fake: an IndexedDB request succeeds before its transaction commits.
export function installAudioIndexedDB(file){
 globalThis.indexedDB={open(){
  const database={
   createObjectStore(){},
   close(){},
   transaction(){
    const transaction={
     objectStore(){return {
      get(){
       const request={};
       queueMicrotask(()=>{
        request.result=file;
        request.onsuccess?.();
        queueMicrotask(()=>transaction.oncomplete?.());
       });
       return request;
      }
     };}
    };
    return transaction;
   }
  };
  const request={result:database};
  queueMicrotask(()=>request.onsuccess?.());
  return request;
 }};
}
