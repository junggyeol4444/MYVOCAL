import test from 'node:test';
import assert from 'node:assert/strict';
import {planRVCWavChunks,joinOverlappedRVCWavs,convertLongSingingWithRVC} from '../src/lib/rvcLongConversion.js';

function sineWav(seconds=6,rate=8000){
 const frames=Math.round(seconds*rate),bytes=new Uint8Array(44+frames*2),v=new DataView(bytes.buffer);
 for(const [at,tag] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])for(let i=0;i<4;i++)bytes[at+i]=tag.charCodeAt(i);
 v.setUint32(4,bytes.length-8,true);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
 v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);
 v.setUint32(40,frames*2,true);
 for(let i=0;i<frames;i++)v.setInt16(44+i*2,Math.round(9000*Math.sin(i*2*Math.PI*200/rate)),true);
 return bytes;
}

test('real PCM split retains original audio frames and stays within each RVC upload limit',()=>{
 const bytes=sineWav(),{chunks,durationSec}=planRVCWavChunks(bytes,{maxBytes:16000});
 assert.equal(durationSec,6);
 assert.ok(chunks.length>1&&chunks.length<=16);
 assert.ok(chunks.every(x=>x.wav.length<=16000&&x.durationSec>.03));
 const restored=new Int16Array((bytes.length-44)/2);
 for(const c of chunks){
  const src=new Int16Array(c.wav.buffer,44,(c.wav.length-44)/2);
  const start=Math.round(c.startSec*8000),coreStart=Math.round(c.coreStartSec*8000),coreEnd=Math.round(c.coreEndSec*8000);
  restored.set(src.subarray(coreStart-start,coreEnd-start),coreStart);
 }
 assert.deepEqual(Array.from(restored),Array.from(new Int16Array(bytes.buffer,44,(bytes.length-44)/2)));
});

test('multiple RVC inference calls join to one valid 6-second WAV without overwriting original',async()=>{
 const source=new File([sineWav()],'user-singing.wav',{type:'audio/wav'});
 const original=new Uint8Array(await source.arrayBuffer()),progress=[];
 const fake=async(file,settings,{session})=>{
  assert.equal(session,'local-session');assert.equal(settings.rightsConfirmed,true);
  assert.ok(file.size<=16000);
  return new File([await file.arrayBuffer()],'converted.wav',{type:'audio/wav'});
 };
 const result=await convertLongSingingWithRVC(source,{rightsConfirmed:true},{
  session:'local-session',maxInputBytes:16000,convert:fake,onProgress:(done,total)=>progress.push([done,total])
 });
 assert.equal(result.name,'MYVOCAL-RVC-긴곡.wav');
 const output=new Uint8Array(await result.arrayBuffer());
 assert.equal(output.length,original.length);
 const src=new Int16Array(original.buffer,44),dst=new Int16Array(output.buffer,44);
 assert.ok(src.every((sample,i)=>Math.abs(sample-dst[i])<=1),'identity RVC must remain PCM-exact within 1 LSB');
 assert.ok(progress.length>1);
 assert.deepEqual(progress.at(-1),[progress.length,progress.length]);
 assert.deepEqual(new Uint8Array(await source.arrayBuffer()),original);
});

test('cancelled multi-part inference never reports a successful output',async()=>{
 const controller=new AbortController(),source=new File([sineWav()],'source.wav');
 await assert.rejects(convertLongSingingWithRVC(source,{rightsConfirmed:true},{
  maxInputBytes:16000,signal:controller.signal,convert:async f=>new File([await f.arrayBuffer()],'x.wav'),
  onProgress:()=>controller.abort()
 }),/취소/);
});

test('invalid settings and missing audio are rejected before any model call',async()=>{
 const source=new File([sineWav()],'source.wav');
 let called=false;
 await assert.rejects(convertLongSingingWithRVC(source,{}, {maxInputBytes:100,convert:async()=>{called=true;}}),/분할 크기/);
 await assert.rejects(convertLongSingingWithRVC(new File([new Uint8Array(100)],'bad.wav'),{}, {convert:async()=>{called=true;}}),/손상|WAV|포맷/);
 assert.equal(called,false);
});


test('crossfade removes a hard step between two different RVC chunk gains',async()=>{
 const input=sineWav(4,8000),plan=planRVCWavChunks(input,{maxBytes:16000});
 assert.ok(plan.chunks.length>=2);
 const parts=plan.chunks.map((c,i)=>{
  const wav=new Uint8Array(c.wav),v=new DataView(wav.buffer);
  for(let at=44;at<wav.length;at+=2){const sample=v.getInt16(at,true);v.setInt16(at,Math.round(sample*(i%2?0.5:1)),true);}
  return {bytes:wav,...c};
 });
 const output=new Uint8Array(await joinOverlappedRVCWavs(parts,4).arrayBuffer());
 const samples=new Int16Array(output.buffer,44);
 for(let i=1;i<parts.length;i++){
  const at=Math.round(parts[i].coreStartSec*8000);
  // A 200Hz sine wave can move up to 1400 PCM counts per sample;
  // an artificial 4500-count gain discontinuity must be avoided.
  assert.ok(Math.abs(samples[at]-samples[at-1])<2500);
 }
});

test('rejects a neural model returning an unexpectedly short WAV segment',async()=>{
 const source=new File([sineWav()],'user.wav');
 await assert.rejects(convertLongSingingWithRVC(source,{rightsConfirmed:true},{
  maxInputBytes:16000,convert:async file=>new File([sineWav(.1)],'short.wav')
 }),/0.05초|짧/);
});

test('RVC output may be 48kHz even when source is 8kHz; final duration remains aligned',async()=>{
 const source=new File([sineWav(6,8000)],'voice.wav');
 const result=await convertLongSingingWithRVC(source,{rightsConfirmed:true},{
  maxInputBytes:16000,
  convert:async f=>{
   const bytes=new Uint8Array(await f.arrayBuffer());
   const frames=(bytes.length-44)/2;
   return new File([sineWav(frames/8000,48000)],'neural-48k.wav');
  }
 });
 const bytes=new Uint8Array(await result.arrayBuffer()),v=new DataView(bytes.buffer);
 assert.equal(v.getUint32(24,true),48000);
 assert.equal((bytes.length-44)/2,48000*6);
});

test('rejects inconsistent neural output sample rates before joining WAVs',async()=>{
 const source=new File([sineWav(6,8000)],'voice.wav');let n=0;
 await assert.rejects(convertLongSingingWithRVC(source,{rightsConfirmed:true},{
  maxInputBytes:16000,convert:async f=>{
   const frames=(f.size-44)/2;
   return new File([sineWav(frames/8000,++n===1?16000:48000)],'changed-rate.wav');
  }
 }),/샘플레이트/);
});
test('six-minute long RVC chunk plan retains complete source and does not exceed 16 chunks',()=>{
 const bytes=sineWav(360,8000);
 const result=planRVCWavChunks(bytes,{maxBytes:2*1024*1024});
 assert.equal(result.durationSec,360);
 assert.ok(result.chunks.length>=2&&result.chunks.length<=16);
 assert.ok(result.chunks.every(c=>c.wav.length<=2*1024*1024));
 assert.equal(result.chunks.at(-1).coreEndSec,360);
});
