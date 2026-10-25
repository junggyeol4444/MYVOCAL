// 원본 66항: 동일 회차의 3~6분 개별 신경망 악기 WAV 6개를 한 번에
// Windows EXE에서 비파괴적으로 내보낸다. 입력 WAV/IndexedDB/프로젝트 불변.
// 대형 WAV를 전체 ArrayBuffer에 복사하지 않고 ZIP STORE의 Blob 파트를 조립한다.
import {getFile} from './assetDb.js';
import {identifyOriginalNeuralWavTracks,NEURAL_STEM_EXPORT_LABELS} from './neuralStemWavExport.js';
import {inspectGeneratedMusicPcm} from './musicProductionPcmSync.js';
import {latestCompleteNeuralScore} from './neuralScoreBatch.js';
import {createMidiFile} from './midiFile.js';

const ROLE_ORDER=['melody','chords','bass','drums','guitar','pad'];
const ENCODER=new TextEncoder();
const CHUNK=1024*1024;
const MAX_ARCHIVE=600*1024*1024;
const crcTable=Uint32Array.from({length:256},(_,index)=>{
 let value=index;
 for(let i=0;i<8;i++)value=(value&1)?(0xedb88320^(value>>>1)):(value>>>1);
 return value>>>0;
});
const u16=(out,p,n)=>{out[p]=n&255;out[p+1]=(n>>>8)&255;};
const u32=(out,p,n)=>{u16(out,p,n);u16(out,p+2,n>>>16);};
function checkAlive(signal,current,project){
 if(signal?.aborted||current()!==project)throw Error('6악기 WAV 내보내기가 취소되거나 프로젝트가 변경됐습니다. 기존 파일은 유지됩니다.');
}
async function crcBlob(blob,signal,current,project){
 let crc=0xffffffff;
 for(let offset=0;offset<blob.size;offset+=CHUNK){
  checkAlive(signal,current,project);
  const bytes=new Uint8Array(await blob.slice(offset,offset+CHUNK).arrayBuffer());
  checkAlive(signal,current,project);
  for(let i=0;i<bytes.length;i++)crc=crcTable[(crc^bytes[i])&255]^(crc>>>8);
 }
 return (crc^0xffffffff)>>>0;
}
function headers(name,size,checksum,offset){
 const bytes=ENCODER.encode(name);
 if(!bytes.length||bytes.length>65535||name.includes('..')||name.startsWith('/'))
  throw Error('6악기 ZIP 파일명이 안전하지 않습니다.');
 const local=new Uint8Array(30+bytes.length),central=new Uint8Array(46+bytes.length);
 u32(local,0,0x04034b50);u16(local,4,20);u16(local,6,0x0800);u16(local,8,0);
 u32(local,14,checksum);u32(local,18,size);u32(local,22,size);u16(local,26,bytes.length);
 local.set(bytes,30);
 u32(central,0,0x02014b50);u16(central,4,20);u16(central,6,20);u16(central,8,0x0800);
 u32(central,16,checksum);u32(central,20,size);u32(central,24,size);
 u16(central,28,bytes.length);u32(central,42,offset);central.set(bytes,46);
 return {local,central};
}
/**
 * @returns 실제 저장된 6악기 파일을 무손실 STORE로 담은 ZIP.
 * 모델을 추론·다운로드하거나 Demucs 후분리 WAV를 원천 악기로 오인하지 않는다.
 */
export async function exportOriginalNeuralWavBundle(project,{
 current,loadFile=getFile,signal,onProgress=()=>{}
}={}){
 if(typeof current!=='function'||typeof loadFile!=='function'||!project?.id)
  throw Error('MYVOCAL 원곡과 등록 WAV 저장소가 필요합니다.');
 checkAlive(signal,current,project);
 const tracks=identifyOriginalNeuralWavTracks(project,{requireAll:true});
 if(tracks.length!==6||tracks.some((stem,i)=>stem.role!==ROLE_ORDER[i]))
  throw Error('같은 MIDI 회차의 원천 신경망 악기 6개를 확인할 수 없습니다.');
 const score=latestCompleteNeuralScore(project);
 if(!score)throw Error('현재 원곡의 실제 신경망 6악기 MIDI가 없습니다.');
 const validated=[],midiEntries=[],zipParts=[],centralParts=[];let offset=0,centralSize=0;
 const append=async(name,blob)=>{
  if(!(blob instanceof Blob)||!blob.size||blob.size>0xffffffff)
   throw Error('ZIP 악기 원본 파일 크기가 잘못됐습니다.');
  const crc=await crcBlob(blob,signal,current,project);
  checkAlive(signal,current,project);
  const {local,central}=headers(name,blob.size,crc,offset);
  if(offset+local.length+blob.size+central.length>MAX_ARCHIVE)
   throw Error('6악기 ZIP 최대 600MiB 제한을 초과했습니다. 원본은 보존합니다.');
  zipParts.push(local,blob);centralParts.push(central);
  offset+=local.length+blob.size;centralSize+=central.length;
  return crc;
 };
 let baseline=null;
 for(const [i,stem] of tracks.entries()){
  checkAlive(signal,current,project);
  const wav=await loadFile(stem.assetId);
  checkAlive(signal,current,project);
  if(!(wav instanceof Blob)||wav.size<44||wav.size>90*1024*1024)
   throw Error(NEURAL_STEM_EXPORT_LABELS[stem.role]+'의 등록 원본 WAV 파일이 없습니다.');
  const pcm=await inspectGeneratedMusicPcm(wav,'신경망 원천 '+NEURAL_STEM_EXPORT_LABELS[stem.role]);
  if(Math.abs(pcm.durationSec-stem.durationSec)>.08||pcm.durationSec<150||pcm.durationSec>360)
   throw Error(NEURAL_STEM_EXPORT_LABELS[stem.role]+' 원본 WAV와 원곡 편집 길이가 다릅니다.');
  if(baseline&&(pcm.rate!==baseline.rate||pcm.channels!==baseline.channels||
   pcm.bits!==baseline.bits||pcm.frames!==baseline.frames))
   throw Error('6악기 실제 PCM 프레임·채널·레이트가 일치하지 않아 기존 원본을 유지합니다.');
  baseline||=pcm;
  const name='stems/'+stem.role+'.wav';
  const crc=await append(name,wav);
  validated.push({role:stem.role,assetId:stem.assetId,trackId:stem.track.id,
   sourceMidiTrackId:stem.track.sourceMidiTrackId,
   bytes:wav.size,crc32:crc.toString(16).padStart(8,'0')});
  onProgress(i+1,13,NEURAL_STEM_EXPORT_LABELS[stem.role]+' 실제 원본 PCM 검사·보관');
 }
 // 같은 MIDI 회차의 각 악기 음표를 그대로 Type-1 MIDI 파일로 내보낸다.
 // 원본 음표를 추정·생성·변환하지 않으며 기존 편집 트랙은 그대로 유지한다.
 for(const [i,stem] of tracks.entries()){
  checkAlive(signal,current,project);
  const midiSource=score.get(stem.role);
  if(!midiSource||midiSource.id!==stem.track.sourceMidiTrackId||
   !Array.isArray(midiSource.midiNotes)||!midiSource.midiNotes.length)
   throw Error('신경망 악기 WAV와 원래 MIDI 참조가 다릅니다.');
  const midi=createMidiFile({...project,tracks:[midiSource]});
  if(!(midi instanceof Blob)||midi.size<32||midi.size>4*1024*1024)
   throw Error(NEURAL_STEM_EXPORT_LABELS[stem.role]+' 원곡 MIDI 파일 길이가 잘못됐습니다.');
  const crc=await append('midi/'+stem.role+'.mid',midi);
  midiEntries.push({role:stem.role,trackId:midiSource.id,notes:midiSource.midiNotes.length,
   bytes:midi.size,crc32:crc.toString(16).padStart(8,'0')});
  onProgress(i+7,13,NEURAL_STEM_EXPORT_LABELS[stem.role]+' 원곡 MIDI 추가');
 }
 checkAlive(signal,current,project);
 const manifest={
  format:'MYVOCAL_ORIGINAL_NEURAL_6_STEMS',version:1,engine:'MusicGen independent per instrument',
  projectId:project.id,source:'musicgen-independent-audio',
  durationSec:baseline.durationSec,sampleRate:baseline.rate,
  channels:baseline.channels,bits:baseline.bits,frames:baseline.frames,stems:validated,midi:midiEntries
 };
 const meta=new Blob([JSON.stringify(manifest,null,2)],{type:'application/json'});
 await append('stems/manifest.json',meta);
 onProgress(13,13,'원곡 6악기 MIDI와 원천 6악기 WAV 정보 기록');
 checkAlive(signal,current,project);
 if(offset+centralSize+22>MAX_ARCHIVE||offset+centralSize+22>0xffffffff)
  throw Error('6악기 ZIP 전체 크기가 제한을 초과합니다.');
 const end=new Uint8Array(22);
 u32(end,0,0x06054b50);u16(end,8,13);u16(end,10,13);
 u32(end,12,centralSize);u32(end,16,offset);
 const title=String(project.title||'원곡').replace(/[^\p{L}\p{N}_-]/gu,'_').slice(0,40);
 const archive=new File([...zipParts,...centralParts,end],
  'MYVOCAL-'+title+'-원천신경망6악기-MIDI-WAV.zip',{type:'application/zip'});
 checkAlive(signal,current,project);
 return {file:archive,roles:[...ROLE_ORDER],durationSec:baseline.durationSec,
  sampleRate:baseline.rate,frames:baseline.frames,midiTracks:6,manifest};
}
