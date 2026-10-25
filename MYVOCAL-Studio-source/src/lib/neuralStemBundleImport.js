// MYVOCAL 원본66항: 기존 EXE에서 내보낸 신경망 6악기 MIDI/WAV를
// 사용자 원곡을 덮어쓰지 않고 새로운 12개 편집 트랙에 등록한다.
// 대용량 ZIP을 전체 메모리에 펼치지 않으며 원본 사용자 파일은 읽기만 한다.
import {inspectGeneratedMusicPcm} from './musicProductionPcmSync.js';
import {parseMidiFile} from './midiFile.js';

const ROLES=['melody','chords','bass','drums','guitar','pad'];
const LABEL={melody:'멜로디',chords:'코드',bass:'베이스',drums:'드럼',guitar:'기타',pad:'패드'};
const INSTRUMENT={melody:'synth',chords:'piano',bass:'bass',drums:'drums',guitar:'guitar',pad:'strings'};
const MAX_ZIP=600*1024*1024,CHUNK=1024*1024;
const DECODER=new TextDecoder('utf-8',{fatal:true});
const TABLE=Uint32Array.from({length:256},(_,i)=>{
 let c=i;for(let j=0;j<8;j++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);return c>>>0;
});
const read16=(v,p)=>v.getUint16(p,true),read32=(v,p)=>v.getUint32(p,true);
const alive=(project,current,signal)=>{
 if(signal?.aborted||current()!==project)throw Error('원본 MIDI·WAV 가져오기를 취소했거나 프로젝트가 바뀌었습니다.');
};
const bounded=(start,n,size)=>Number.isSafeInteger(start)&&Number.isSafeInteger(n)&&start>=0&&n>=0&&start+n<=size;
async function crcOf(blob,project,current,signal){
 let c=0xffffffff;
 for(let p=0;p<blob.size;p+=CHUNK){
  alive(project,current,signal);
  const bytes=new Uint8Array(await blob.slice(p,p+CHUNK).arrayBuffer());
  for(const b of bytes)c=TABLE[(c^b)&255]^(c>>>8);
 }
 alive(project,current,signal);
 return (c^0xffffffff)>>>0;
}
async function entries(archive,project,current,signal){
 if(!(archive instanceof Blob)||archive.size<200||archive.size>MAX_ZIP)
  throw Error('실제 MYVOCAL MIDI·WAV 원본 ZIP(600MiB 이하)을 선택하세요.');
 const tailSize=Math.min(65557,archive.size),tailOffset=archive.size-tailSize;
 const tail=new Uint8Array(await archive.slice(tailOffset).arrayBuffer());
 const t=new DataView(tail.buffer,tail.byteOffset,tail.byteLength);
 let index=-1;
 for(let p=tailSize-22;p>=0;p--){
  if(read32(t,p)===0x06054b50&&p+22+read16(t,p+20)===tailSize){index=p;break;}
 }
 if(index<0)throw Error('원곡 ZIP의 중앙 디렉터리를 찾을 수 없습니다.');
 const start=read32(t,index+16),size=read32(t,index+12),count=read16(t,index+10);
 if(read16(t,index+8)!==count||count!==13||start+size!==tailOffset+index||
   !bounded(start,size,archive.size)||size>64*1024)
  throw Error('원곡 ZIP은 WAV 6개·MIDI 6개·manifest 1개만 포함해야 합니다.');
 const raw=new Uint8Array(await archive.slice(start,start+size).arrayBuffer());
 const v=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),output=new Map();
 const names=new Set([...ROLES.map(r=>'stems/'+r+'.wav'),...ROLES.map(r=>'midi/'+r+'.mid'),'stems/manifest.json']);
 let p=0;
 for(let i=0;i<count;i++){
  alive(project,current,signal);
  if(!bounded(p,46,raw.length)||read32(v,p)!==0x02014b50)throw Error('ZIP 중앙 디렉터리 손상');
  const flags=read16(v,p+8),method=read16(v,p+10);
  const crc=read32(v,p+16),packed=read32(v,p+20),original=read32(v,p+24);
  const len=read16(v,p+28),extra=read16(v,p+30),comment=read16(v,p+32),local=read32(v,p+42);
  if(flags!==0x0800||method!==0||packed!==original||!bounded(p+46,len+extra+comment,raw.length))
   throw Error('압축·암호화되었거나 손상된 ZIP 항목입니다.');
  const name=DECODER.decode(raw.subarray(p+46,p+46+len));
  if(!names.has(name)||output.has(name))throw Error('알 수 없거나 중복된 ZIP 파일: '+name);
  if(!bounded(local,30,archive.size))throw Error('ZIP 로컬 헤더 범위 오류');
  const lh=new Uint8Array(await archive.slice(local,local+30).arrayBuffer());
  const h=new DataView(lh.buffer);
  if(read32(h,0)!==0x04034b50||read16(h,6)!==0x0800||read16(h,8)!==0||
    read32(h,14)!==crc||read32(h,18)!==packed||read32(h,22)!==original)
   throw Error('ZIP 중앙/로컬 CRC·크기 헤더 불일치');
  const nlen=read16(h,26),elen=read16(h,28);
  const dataAt=local+30+nlen+elen;
  if(nlen!==len||!bounded(dataAt,original,start))throw Error('ZIP 파일 데이터 경계 오류');
  const localName=DECODER.decode(new Uint8Array(await archive.slice(local+30,local+30+nlen).arrayBuffer()));
  if(localName!==name)throw Error('ZIP 중앙/로컬 파일 이름이 일치하지 않습니다.');
  const data=archive.slice(dataAt,dataAt+original);
  if((await crcOf(data,project,current,signal))!==crc)throw Error('ZIP 원본 파일 CRC 검사 실패: '+name);
  output.set(name,data);
  p+=46+len+extra+comment;
 }
 if(p!==raw.length||output.size!==13)throw Error('ZIP 중앙 디렉터리가 일치하지 않습니다.');
 return output;
}
export async function importOriginalNeuralMidiWavBundle(project,archive,{
 current,onChange,newId,createTrack,save,remove,signal,onProgress=()=>{}
}={}){
 if(!project?.id||!Array.isArray(project.tracks)||[current,onChange,newId,createTrack,save,remove].some(f=>typeof f!=='function'))
  throw Error('기존 MYVOCAL 프로젝트와 IndexedDB 편집기 연결이 필요합니다.');
 alive(project,current,signal);
 const files=await entries(archive,project,current,signal);
 const manifest=JSON.parse(await files.get('stems/manifest.json').text());
 if(manifest?.format!=='MYVOCAL_ORIGINAL_NEURAL_6_STEMS'||manifest.version!==1||
  manifest.source!=='musicgen-independent-audio'||!Number.isFinite(manifest.bpm)||
  Number(project.bpm)!==manifest.bpm||!Array.isArray(manifest.stems)||manifest.stems.length!==6||
  !Array.isArray(manifest.midi)||manifest.midi.length!==6||
  !Number.isInteger(manifest.frames)||!Number.isFinite(manifest.durationSec))
  throw Error('원곡 ZIP 정보가 올바르지 않거나 현재 음악 프로젝트와 BPM이 다릅니다.');
 const allocated=new Set(project.tracks.map(t=>t.id));
 for(const track of project.tracks)for(const clip of track.clips||[])if(clip.assetId)allocated.add(clip.assetId);
 const assign=prefix=>{
  const id=newId(prefix);
  if(typeof id!=='string'||!id||allocated.has(id))throw Error('새 MIDI·WAV 트랙 ID 충돌');
  allocated.add(id);return id;
 };
 let baseline=null;
 const wavTracks=[],midiTracks=[],newAssets=[];
 for(const [index,role] of ROLES.entries()){
  alive(project,current,signal);
  const info=manifest.stems[index],midiInfo=manifest.midi[index];
  if(info?.role!==role||midiInfo?.role!==role||!Number.isInteger(info.bytes)||
   !Number.isInteger(midiInfo.bytes)||typeof info.crc32!=='string'||typeof midiInfo.crc32!=='string')
   throw Error('악기 원본 목록과 실제 ZIP 파일이 일치하지 않습니다.');
  const wav=files.get('stems/'+role+'.wav'),midi=files.get('midi/'+role+'.mid');
  if(wav.size!==info.bytes||midi.size!==midiInfo.bytes||wav.size>90*1024*1024||
   midi.size>4*1024*1024)throw Error('악기 원본 WAV/MIDI 파일 크기 불일치');
  const pcm=await inspectGeneratedMusicPcm(wav,'원본 '+LABEL[role]);
  if(pcm.frames!==manifest.frames||pcm.rate!==manifest.sampleRate||
   pcm.channels!==manifest.channels||pcm.bits!==manifest.bits||
   Math.abs(pcm.durationSec-manifest.durationSec)>.05||pcm.durationSec<150||pcm.durationSec>360||
   (baseline&&(pcm.frames!==baseline.frames||pcm.rate!==baseline.rate||pcm.channels!==baseline.channels)))
   throw Error('원본 신경망 WAV 6개 PCM 시간축이 일치하지 않습니다.');
  baseline||=pcm;
  const parsed=await parseMidiFile(new File([midi],role+'.mid',{type:'audio/midi'}));
  if(parsed.tracks.length!==1||parsed.bpm!==manifest.bpm||
   parsed.tracks[0].notes.length!==midiInfo.notes)
   throw Error('MIDI 원곡 음표·BPM 또는 파일 정보가 일치하지 않습니다.');
  const midiId=assign('import-neural-midi'),assetId=assign('import-neural-wav'),trackId=assign('import-neural-audio');
  midiTracks.push({id:midiId,name:'ZIP 원곡 MIDI · '+LABEL[role],instrument:INSTRUMENT[role],
   type:role==='drums'?'rhythm':'instrument',midiNotes:parsed.tracks[0].notes.map(n=>({...n})),
   role,clips:[],volume:70,mute:true,solo:false,
   generatedBy:'imported-neural-bundle',sourceOriginalMidiTrackId:midiInfo.trackId});
  const actualFile=new File([wav],'MYVOCAL-ZIP-원천신경망-'+role+'.wav',{type:'audio/wav'});
  const baseTrack=createTrack(project,actualFile,assetId,pcm.durationSec);
  if(!baseTrack?.clips?.some(c=>c.assetId===assetId))throw Error('원천 WAV를 편집 가능한 클립으로 연결하지 못했습니다.');
  wavTracks.push({...baseTrack,id:trackId,type:'instrument',instrument:INSTRUMENT[role],
   clips:baseTrack.clips.map(c=>({...c,startBar:1,durationSec:pcm.durationSec})),
   name:'ZIP 원천 신경망 WAV · '+LABEL[role],volume:70,mute:true,solo:false,
   generatedBy:'imported-neural-bundle',sourceRole:role,sourceMidiTrackId:midiId});
  newAssets.push([assetId,actualFile]);
  onProgress(index+1,6,LABEL[role]+' MIDI 음표와 실제 PCM 확인');
 }
 alive(project,current,signal);
 let stored=false;
 try{
  await save(newAssets);stored=true;
  alive(project,current,signal);
  const updated={...project,tracks:[...project.tracks,...midiTracks,...wavTracks]};
  await Promise.resolve(onChange(updated));stored=false;
  return {project:updated,midiTracks:6,wavTracks:6,durationSec:baseline.durationSec,
   importedAssets:6,source:'MYVOCAL-6-MIDI-6-WAV-archive'};
 }catch(error){
  if(stored&&current()===project){
   try{await remove(newAssets.map(([id])=>id));}
   catch(rollback){throw Error('새 WAV 자산 복원 실패: '+rollback.message+' / '+error.message);}
  }
  throw error;
 }
}
