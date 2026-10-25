// 원본 20·21·59항: 두 실제 가수의 독립 보컬 WAV를 단일 ZIP에 무손실 저장.
// 기존 Windows EXE의 실제 오프라인 믹스 출력만 사용하고 원본 자산은 읽기 전용.
import {exportDuetVocalWav} from './duetVocalExport.js';

const encoder=new TextEncoder();
const crcTable=Uint32Array.from({length:256},(_,i)=>{
 let c=i;for(let j=0;j<8;j++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);return c>>>0;
});
const put16=(b,p,v)=>{b[p]=v&255;b[p+1]=(v>>>8)&255;};
const put32=(b,p,v)=>{put16(b,p,v);put16(b,p+2,v>>>16);};
function zipHeaders(name,size,crc,offset){
 const n=encoder.encode(name),local=new Uint8Array(30+n.length),central=new Uint8Array(46+n.length);
 if(!n.length||n.length>65535||size>0xffffffff||offset>0xffffffff)
  throw Error('듀엣 ZIP 파일 크기 또는 이름이 올바르지 않습니다.');
 put32(local,0,0x04034b50);put16(local,4,20);put16(local,6,0x0800);
 put32(local,14,crc);put32(local,18,size);put32(local,22,size);put16(local,26,n.length);local.set(n,30);
 put32(central,0,0x02014b50);put16(central,4,20);put16(central,6,20);put16(central,8,0x0800);
 put32(central,16,crc);put32(central,20,size);put32(central,24,size);
 put16(central,28,n.length);put32(central,42,offset);central.set(n,46);
 return {local,central};
}
async function crcFile(blob,check){
 let crc=0xffffffff;
 for(let start=0;start<blob.size;start+=1024*1024){
  check();
  const data=new Uint8Array(await blob.slice(start,start+1024*1024).arrayBuffer());
  check();
  for(const byte of data)crc=crcTable[(crc^byte)&255]^(crc>>>8);
 }
 return (crc^0xffffffff)>>>0;
}
export async function exportDuetVocalBundle(project,{
 current=()=>project,render,signal,onProgress=()=>{}
}={}){
 if(!project?.id||typeof current!=='function')throw Error('실제 듀엣 프로젝트가 필요합니다.');
 const check=()=>{
  if(signal?.aborted||current()!==project)
   throw Error('듀엣 WAV 묶음 내보내기가 취소되거나 프로젝트가 변경됐습니다.');
 };
 const files=[],parts=[],central=[];let offset=0,centralBytes=0;
 const add=async(name,blob)=>{
  if(!(blob instanceof Blob)||!blob.size||blob.size>90*1024*1024)
   throw Error('듀엣 원본 WAV 또는 ZIP 메타데이터 용량 오류');
  const crc=await crcFile(blob,check);check();
  const header=zipHeaders(name,blob.size,crc,offset);
  parts.push(header.local,blob);central.push(header.central);
  offset+=header.local.length+blob.size;centralBytes+=header.central.length;
  if(offset+centralBytes+22>220*1024*1024)
   throw Error('두 가수 WAV ZIP 크기가 220MiB를 초과했습니다.');
  return crc.toString(16).padStart(8,'0');
 };
 for(const role of ['lead','harmony']){
  check();
  const item=await exportDuetVocalWav(project,role,{current,render,signal});
  check();
  const name=role==='lead'?'주보컬':'화음보컬';
  const crc=await add('vocals/'+role+'.wav',item.file);
  files.push({role,name,trackId:item.trackId,voiceId:item.voiceId,
   characterId:item.characterId,durationSec:item.durationSec,
   bytes:item.file.size,crc32:crc});
  onProgress(name+' 실제 독립 WAV 오프라인 렌더·ZIP 추가 완료');
 }
 if(Math.abs(files[0].durationSec-files[1].durationSec)>.08)
  throw Error('두 가수의 실제 보컬 WAV 길이가 일치하지 않습니다. 원본은 보존합니다.');
 const manifest={format:'MYVOCAL_NEURAL_DUET_VOCALS',version:1,
  projectId:project.id,engine:'existing-offline-audio-mix',stems:files};
 await add('vocals/manifest.json',new Blob([JSON.stringify(manifest,null,2)],{type:'application/json'}));
 check();
 if(offset+centralBytes+22>0xffffffff)throw Error('듀엣 ZIP 크기 제한 초과');
 const end=new Uint8Array(22);put32(end,0,0x06054b50);
 put16(end,8,3);put16(end,10,3);put32(end,12,centralBytes);put32(end,16,offset);
 const file=new File([...parts,...central,end],'MYVOCAL-듀엣-두가수-독립WAV.zip',{type:'application/zip'});
 check();
 return {file,manifest,stems:2,durationSec:files[0].durationSec};
}
