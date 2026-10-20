// Read only the four or six validated, uncompressed Demucs WAV tracks from our native EXE.
// Uses the ZIP central directory (Go zip.Writer emits data descriptors).
import {crc32} from './zipStore.js';
import {inspectSingingWav} from './singingOutputValidation.js';
const FOUR=['drums','bass','other','vocals'];
const SIX=[...FOUR,'guitar','piano'];
const dec=new TextDecoder('utf-8',{fatal:true});
const read32=(v,p)=>v.getUint32(p,true),read16=(v,p)=>v.getUint16(p,true);
function requireRange(b,p,n){if(!Number.isSafeInteger(p)||!Number.isSafeInteger(n)||p<0||n<0||p+n>b.byteLength)throw Error('분리 ZIP의 데이터 범위가 잘못됐습니다.');}
export function parseNeuralStemsZip(input){
 const b=input instanceof Uint8Array?input:new Uint8Array(input),v=new DataView(b.buffer,b.byteOffset,b.byteLength);
 if(b.length<22||b.length>450*1024*1024)throw Error('분리 ZIP 크기 제한을 초과했습니다.');
 let end=-1;
 for(let p=b.length-22;p>=Math.max(0,b.length-65557);p--)if(read32(v,p)===0x06054b50){if(p+22+read16(v,p+20)===b.length){end=p;break;}}
 if(end<0)throw Error('분리 ZIP의 중앙 디렉터리를 찾지 못했습니다.');
 const count=read16(v,end+10);
 if(read16(v,end+4)||read16(v,end+6)||![5,7].includes(count)||read16(v,end+8)!==count)throw Error('분리 ZIP은 정확히 4개 또는 6개 WAV와 manifest만 포함해야 합니다.');
 const centralSize=read32(v,end+12),centralOffset=read32(v,end+16);requireRange(b,centralOffset,centralSize);
 if(centralOffset+centralSize!==end)throw Error('ZIP 중앙 디렉터리 위치 오류');
 let pos=centralOffset;const files=new Map();
 for(let i=0;i<count;i++){
  requireRange(b,pos,46);if(read32(v,pos)!==0x02014b50)throw Error('ZIP 중앙 디렉터리 헤더 오류');
  const flags=read16(v,pos+8),method=read16(v,pos+10),crc=read32(v,pos+16),compressed=read32(v,pos+20),plain=read32(v,pos+24),nameLen=read16(v,pos+28),extraLen=read16(v,pos+30),commentLen=read16(v,pos+32),offset=read32(v,pos+42);
  if(flags&1||method!==0||compressed!==plain||plain>72*1024*1024)throw Error('암호화·압축·초대형 분리 ZIP은 지원하지 않습니다.');
  requireRange(b,pos+46,nameLen+extraLen+commentLen);
  const name=dec.decode(b.subarray(pos+46,pos+46+nameLen));
  if(!['stems/manifest.json',...SIX.map(s=>`stems/${s}.wav`)].includes(name)||files.has(name))throw Error('분리 ZIP에 알 수 없는 파일 또는 중복 파일이 있습니다.');
  requireRange(b,offset,30);if(read32(v,offset)!==0x04034b50||read16(v,offset+8)!==0)throw Error('ZIP 로컬 헤더 오류');
  const localNameLen=read16(v,offset+26),localExtraLen=read16(v,offset+28);requireRange(b,offset+30,localNameLen+localExtraLen);
  if(dec.decode(b.subarray(offset+30,offset+30+localNameLen))!==name)throw Error('ZIP 중앙·로컬 파일명이 일치하지 않습니다.');
  const dataStart=offset+30+localNameLen+localExtraLen;requireRange(b,dataStart,plain);
  if(dataStart+plain>centralOffset||crc32(b.subarray(dataStart,dataStart+plain))!==crc)throw Error('분리 ZIP 파일 CRC 또는 크기 오류');
  files.set(name,b.subarray(dataStart,dataStart+plain));pos+=46+nameLen+extraLen+commentLen;
 }
 if(pos!==end)throw Error('ZIP 중앙 디렉터리 길이 오류');
 const manifest=JSON.parse(dec.decode(files.get('stems/manifest.json')));
 const expected=count===5?FOUR:SIX;
 if(manifest?.format!=='MYVOCAL_NEURAL_STEMS'||manifest.version!==1||manifest.engine!=='Demucs'||manifest.sampleRate!==44100||manifest.channels!==2||manifest.bits!==16||!Array.isArray(manifest.stems)||manifest.stems.join(',')!==expected.join(',')||!Number.isSafeInteger(manifest.frames)||manifest.frames<4410||manifest.frames>44100*360)throw Error('분리 ZIP manifest가 올바르지 않습니다.');
 const stems=expected.map(name=>{
  const bytes=files.get(`stems/${name}.wav`),info=inspectSingingWav(bytes);
  if(!info.valid||info.encoding!==1||info.bits!==16||info.sampleRate!==44100||info.channels!==2||info.frames!==manifest.frames)throw Error(`${name}.wav 길이·포맷이 맞지 않습니다.`);
  return {name,file:new File([bytes],`MYVOCAL-${name}.wav`,{type:'audio/wav'}),info};
 });
 return {manifest,stems};
}
