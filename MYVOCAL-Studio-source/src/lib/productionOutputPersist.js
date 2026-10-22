// MYVOCAL 기존 Windows EXE 최종 WAV/WebM/MP4: 다운로드와 별개로 IndexedDB에 추가 저장.
// 사용자 원본·기존 프로젝트·모델·백업을 변경하거나 삭제하지 않는다.
export const PRODUCTION_OUTPUT_TYPES=Object.freeze({
 wav:'audio/wav',webm:'video/webm',mp4:'video/mp4'
});
const LIMITS={wav:96*1024*1024,webm:160*1024*1024,mp4:200*1024*1024};
const cancelled=()=>Error('최종 산출물 저장 중 취소되거나 프로젝트가 변경됐습니다. 기존 출력물은 보존합니다.');
// 파일명이나 MIME만 바꾼 빈/가짜 출력은 프로젝트 자산으로 저장하지 않는다.
// 최대 64바이트만 읽으므로 장시간 GPU 영상 파일을 메모리에 한꺼번에 복사하지 않는다.
export async function verifyProductionContainer(kind,blob){
 if(!Object.hasOwn(PRODUCTION_OUTPUT_TYPES,kind)||!(blob instanceof Blob)||
    blob.type!==PRODUCTION_OUTPUT_TYPES[kind]||blob.size<44||blob.size>LIMITS[kind])
  throw Error('생성 결과 WAV/WebM/MP4의 형식 또는 용량이 잘못됐습니다.');
 const head=new Uint8Array(await blob.slice(0,64).arrayBuffer());
 const ascii=(at,n)=>String.fromCharCode(...head.subarray(at,at+n));
 if(kind==='wav'){
  if(ascii(0,4)!=='RIFF'||ascii(8,4)!=='WAVE')
   throw Error('실제 PCM WAV가 아닙니다. 사용자 원본은 그대로 유지합니다.');
  const header=new DataView(head.buffer);
  if(header.getUint32(4,true)+8!==blob.size)
   throw Error('WAV 컨테이너 크기가 손상됐습니다.');
 }else if(kind==='webm'){
  if(head[0]!==0x1a||head[1]!==0x45||head[2]!==0xdf||head[3]!==0xa3)
   throw Error('실제 WebM EBML 컨테이너가 아닙니다.');
 }else if(ascii(4,4)!=='ftyp'){
  throw Error('MP4 컨테이너가 아닙니다. WebM을 이름만 변경한 파일은 허용하지 않습니다.');
 }
 return true;
}
export async function persistProductionDeliverables(project,outputs,{
 current,onChange,newId,save,remove,signal,now=()=>new Date().toISOString()
}={}){
 if(!project?.id||!Array.isArray(project.tracks)||!Array.isArray(outputs)||!outputs.length||
 outputs.length>4||[current,onChange,newId,save,remove,now].some(f=>typeof f!=='function'))
  throw Error('기존 MYVOCAL 프로젝트와 결과 파일 저장 기능을 확인하세요.');
 const guard=()=>{if(signal?.aborted||current()!==project)throw cancelled();};
 guard();
 const existing=Array.isArray(project.deliverables)?project.deliverables:[];
 if(existing.length>250)throw Error('보존된 프로젝트 산출물 기록이 너무 많습니다. 새 프로젝트에서 제작하세요.');
 const seen=new Set([...existing.map(x=>x.assetId),...project.tracks.map(t=>t.id)]);
 const entries=[],records=[],selected=new Set();
 for(const output of outputs){
  guard();
  const kind=output?.kind,blob=output?.file,variant=output?.variant||'base';
  const uniqueKey=kind+':'+variant;
  if(!Object.hasOwn(PRODUCTION_OUTPUT_TYPES,kind)||!['base','face-lip'].includes(variant)||
    (variant==='face-lip'&&kind!=='mp4')||selected.has(uniqueKey)||
    !(blob instanceof Blob)||blob.type!==PRODUCTION_OUTPUT_TYPES[kind]||
    blob.size<44||blob.size>LIMITS[kind])
   throw Error('완성 WAV/WebM/MP4 실제 파일의 형식·용량 또는 중복이 올바르지 않습니다.');
  await verifyProductionContainer(kind,blob);
  guard();
  const assetId=newId('delivery');
  if(typeof assetId!=='string'||!/^delivery_[A-Za-z0-9_-]{1,90}$/.test(assetId)||seen.has(assetId))
   throw Error('최종 결과의 신규 자산 ID가 중복됐거나 올바르지 않습니다.');
  seen.add(assetId);selected.add(uniqueKey);
  const timestamp=now();
  if(typeof timestamp!=='string'||!Number.isFinite(Date.parse(timestamp)))throw Error('최종 결과 생성 시간 오류');
  const name='MYVOCAL-'+String(project.title||'작업').replace(/[^\w가-힣-]/g,'_').slice(0,55)+
   '-완성'+(variant==='face-lip'?'-실사립싱크':'')+'.'+kind;
  const file=new File([blob],name,{type:PRODUCTION_OUTPUT_TYPES[kind]});
  entries.push([assetId,file]);
  records.push({assetId,kind,variant,mime:file.type,name:file.name,size:file.size,createdAt:timestamp,
   source:'real-local-music-mv-production'});
 }
 guard();
 let saved=false;
 try{
  // 기존 ID를 쓰는 put/overwrite는 허용하지 않는다. 모든 신규 파일은 add 트랜잭션.
  await save(entries);saved=true;guard();
  const updated={...project,deliverables:[...existing,...records]};
  await Promise.resolve(onChange(updated));
  saved=false;
  return {project:updated,count:records.length,files:records};
 }catch(error){
  // 다른 프로젝트로 이동한 경우 삭제가 다른 사용자 자산에 닿지 않도록 보존한다.
  if(saved&&current()===project){
   try{await remove(entries.map(([id])=>id))}
   catch(rollback){throw Error('신규 결과 자산 정리 실패: '+rollback.message+' / '+error.message)}
  }
  throw error;
 }
}
