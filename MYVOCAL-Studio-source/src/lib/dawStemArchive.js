// Import native MYVOCAL DAW stems (STORE ZIP, PCM16 stereo 44.1kHz).
// This is a reversible, offline project-track export format; not AI source separation.
// Rejects untrusted ZIP metadata before creating new project assets.
import {crc32} from './zipStore.js';
import {inspectSingingWav} from './singingOutputValidation.js';
const MAX_ZIP=256*1024*1024;
const MAX_STEMS=16;
const decoder=new TextDecoder('utf-8',{fatal:true});
const number16=(v,p)=>v.getUint16(p,true),number32=(v,p)=>v.getUint32(p,true);
function checkRange(size,p,n){if(!Number.isSafeInteger(p)||!Number.isSafeInteger(n)||p<0||n<0||p+n>size)throw Error('악기 트랙 ZIP 범위가 올바르지 않습니다.');}
function fail(reason){throw Error('트랙 ZIP 복원 실패: '+reason);}

export function parseDawStemArchive(input){
 const b=input instanceof Uint8Array?input:new Uint8Array(input);
 if(b.length<22||b.length>MAX_ZIP)fail('파일 크기가 256MiB 범위를 초과했습니다.');
 const view=new DataView(b.buffer,b.byteOffset,b.byteLength);
 let end=-1;
 for(let p=b.length-22;p>=Math.max(0,b.length-65557);p--){
  if(number32(view,p)===0x06054b50 && p+22+number16(view,p+20)===b.length){end=p;break;}
 }
 if(end<0)fail('ZIP 중앙 디렉터리를 찾지 못했습니다.');
 const count=number16(view,end+10),entriesOnDisk=number16(view,end+8);
 if(number16(view,end+4)!==0||number16(view,end+6)!==0||count!==entriesOnDisk||count<2||count>MAX_STEMS+1)fail('ZIP 항목 수 또는 디스크 정보가 올바르지 않습니다.');
 const size=number32(view,end+12),offset=number32(view,end+16);
 checkRange(b.length,offset,size);
 if(offset+size!==end)fail('중앙 디렉터리 위치가 잘못됐습니다.');
 let pos=offset;const entries=new Map(),spans=[];
 for(let i=0;i<count;i++){
  checkRange(b.length,pos,46);
  if(number32(view,pos)!==0x02014b50)fail('ZIP 엔트리 헤더 오류');
  const flags=number16(view,pos+8),method=number16(view,pos+10),crc=number32(view,pos+16),packed=number32(view,pos+20),plain=number32(view,pos+24);
  const nameLength=number16(view,pos+28),extra=number16(view,pos+30),comment=number16(view,pos+32),fileOffset=number32(view,pos+42);
  if(flags!==0x0800||method!==0||packed!==plain||plain>90*1024*1024||!nameLength||extra||comment)fail('ZIP 압축·플래그 또는 크기 지원 범위 오류');
  checkRange(b.length,pos+46,nameLength);
  const name=decoder.decode(b.subarray(pos+46,pos+46+nameLength));
  if(name!=='stems/manifest.json'&&!/^stems\/[0-9]{2}_[^/\\\x00-\x1f]{1,60}\.wav$/u.test(name))fail('허용하지 않는 트랙 경로가 있습니다.');
  if(name.includes('..')||entries.has(name))fail('ZIP 경로 중복 또는 경로 이동이 감지됐습니다.');
  checkRange(b.length,fileOffset,30);
  if(number32(view,fileOffset)!==0x04034b50||number16(view,fileOffset+6)!==flags||number16(view,fileOffset+8)!==0)fail('로컬 ZIP 헤더가 올바르지 않습니다.');
  const localName=number16(view,fileOffset+26),localExtra=number16(view,fileOffset+28);
  if(localExtra||localName!==nameLength)fail('ZIP 로컬 파일 이름 길이가 일치하지 않습니다.');
  checkRange(b.length,fileOffset+30,localName);
  if(decoder.decode(b.subarray(fileOffset+30,fileOffset+30+localName))!==name)fail('ZIP 파일 이름이 일치하지 않습니다.');
  const begin=fileOffset+30+localName;
  checkRange(b.length,begin,plain);
  if(begin+plain>offset)fail('압축 파일 데이터가 디렉터리와 겹칩니다.');
  spans.push([fileOffset,begin+plain]);
  const data=b.subarray(begin,begin+plain);
  if(crc32(data)!==crc)fail('ZIP 파일 CRC가 일치하지 않습니다.');
  entries.set(name,data);
  pos+=46+nameLength;
 }
 if(pos!==end||entries.size!==count||!entries.has('stems/manifest.json'))fail('ZIP 디렉터리 구조가 올바르지 않습니다.');
 spans.sort((a,b)=>a[0]-b[0]);
 for(let i=1;i<spans.length;i++)if(spans[i][0]<spans[i-1][1])fail('ZIP 엔트리 데이터가 겹칩니다.');
 if(entries.get('stems/manifest.json').byteLength>128*1024)fail('트랙 정보가 너무 큽니다.');
 let manifest;
 try{manifest=JSON.parse(decoder.decode(entries.get('stems/manifest.json')));}catch{fail('트랙 정보 JSON을 읽을 수 없습니다.');}
 if(manifest?.format!=='MYVOCAL_WAV_STEMS'||manifest.version!==2||manifest.sampleRate!==44100||manifest.channels!==2||manifest.bitDepth!==16||!Array.isArray(manifest.tracks)||manifest.tracks.length!==count-1)fail('MYVOCAL WAV Stems v2 형식이 아닙니다.');
 const files=new Set(['stems/manifest.json']),tracks=[],ids=new Set();let frames=null;
 for(const t of manifest.tracks){
  if(typeof t?.id!=='string'||!t.id||t.id.length>128||ids.has(t.id)||typeof t.name!=='string'||t.name.length>160||/[\x00-\x1f]/.test(t.name)||typeof t.file!=='string'||!entries.has(t.file)||files.has(t.file))fail('트랙 이름·ID 또는 WAV 경로가 중복/누락됐습니다.');
  files.add(t.file);ids.add(t.id);
  if(typeof t.durationSec!=='number'||!Number.isFinite(t.durationSec)||!(t.type===undefined||['vocal','instrument','rhythm'].includes(t.type))||typeof t.originalMute!=='boolean'||typeof t.originalSolo!=='boolean'||!Number.isFinite(t.volume)||t.volume<0||t.volume>100)fail('원본 트랙 설정을 해석할 수 없습니다.');
  const bytes=entries.get(t.file),info=inspectSingingWav(bytes);
  if(!info.valid||info.channels!==2||info.bits!==16||info.encoding!==1||info.sampleRate!==44100||info.durationSec>480||info.durationSec<.01||!Number.isFinite(t.frames)||t.frames!==info.frames||Math.abs(t.durationSec-info.durationSec)>0.001)fail('실제 PCM WAV와 트랙 정보가 일치하지 않습니다.');
  if(frames!==null&&info.frames!==frames)fail('악기별 WAV 시간축이 서로 다릅니다.');
  frames=info.frames;
  tracks.push({sourceId:t.id,name:t.name,type:t.type||'instrument',fileName:t.file.slice(6),originalMute:t.originalMute,originalSolo:t.originalSolo,volume:t.volume,bytes,info});
 }
 if(files.size!==entries.size)fail('manifest에 없는 WAV가 포함됐습니다.');
 return {manifest,tracks,frames};
}

export function prepareImportedStemTracks(parsed,generateId){
 if(!parsed?.tracks?.length||typeof generateId!=='function')throw Error('트랙 복원 자료가 없습니다.');
 const assets=[],tracks=[];
 for(const item of parsed.tracks){
  const assetId=generateId('audio'),trackId=generateId('trk');
  if(!assetId||!trackId)throw Error('트랙 자산 ID 생성 실패');
  const file=new File([item.bytes],item.fileName,{type:'audio/wav'});
  assets.push([assetId,file]);
  tracks.push({id:trackId,name:item.name,type:item.type,volume:item.volume,mute:item.originalMute,solo:false,
   clips:[{id:generateId('clip'),assetId,fileName:file.name,durationSec:item.info.durationSec,startBar:1,size:file.size}],midiNotes:[]});
 }
 return {assets,tracks};
}
