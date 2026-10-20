import test from 'node:test';
import assert from 'node:assert/strict';
import {renderStemRemixMaster} from '../src/lib/stemRemixMaster.js';
const names=['drums','bass','other','vocals'];
function wav(value=0.2,frames=4410){
 const b=new Uint8Array(44+frames*4),v=new DataView(b.buffer);
 b.set(new TextEncoder().encode('RIFF'),0);v.setUint32(4,b.length-8,true);b.set(new TextEncoder().encode('WAVEfmt '),8);
 v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,44100,true);v.setUint32(28,176400,true);v.setUint16(32,4,true);v.setUint16(34,16,true);
 b.set(new TextEncoder().encode('data'),36);v.setUint32(40,frames*4,true);
 for(let i=0;i<frames;i++){v.setInt16(44+i*4,Math.round(value*32767),true);v.setInt16(46+i*4,Math.round(value*32767),true)}return b;
}
function stems(values=[0.2,0.2,0.2,0.2]){return names.map((name,i)=>({name,file:new File([wav(values[i])],name+'.wav',{type:'audio/wav'})}));}
async function samples(file){const b=new DataView(await file.arrayBuffer());return {l:b.getInt16(44,true)/32768,r:b.getInt16(46,true)/32768,frames:b.getUint32(40,true)/4,size:file.size}}
test('real four stem PCM sums and outputs RIFF stereo WAV',async()=>{
 const f=await renderStemRemixMaster(stems([0.1,0.1,0.1,0.1]));const s=await samples(f);
 assert.equal(s.frames,4410);assert.equal(s.size,44+4410*4);assert.ok(Math.abs(s.l-0.4)<0.002);assert.ok(Math.abs(s.r-0.4)<0.002);
});
test('peak ceiling prevents clipping and does not boost quiet audio',async()=>{
 const loud=await samples(await renderStemRemixMaster(stems([0.6,0.6,0.6,0.6])));
 assert.ok(Math.abs(loud.l)<=Math.pow(10,-1/20)+0.0001);assert.ok(loud.l>0.88);
 const quiet=await samples(await renderStemRemixMaster(stems([0.02,0.02,0.02,0.02])));
 assert.ok(Math.abs(quiet.l-0.08)<0.002);
});
test('mute, gain and stereo balance affect real samples',async()=>{
 const f=await renderStemRemixMaster(stems([0.2,0.2,0,0]),{drums:{mute:true},bass:{gainDb:-6,balance:1}});
 const s=await samples(f);assert.ok(Math.abs(s.l)<0.0001);assert.ok(s.r>0.09&&s.r<0.11);
});
test('six stems produce a real mix including guitar and piano',async()=>{
 const six=[...stems([0,0,0,0]),{name:'guitar',file:new File([wav(0.1)],'guitar.wav')},{name:'piano',file:new File([wav(0.15)],'piano.wav')}];
 const s=await samples(await renderStemRemixMaster(six));assert.ok(Math.abs(s.l-0.25)<0.002);
});
test('all muted, mismatched frames, invalid gains rejected',async()=>{
 await assert.rejects(renderStemRemixMaster(stems(),Object.fromEntries(names.map(n=>[n,{mute:true}]))),/음소거/);
 const different=stems();different[1].file=new File([wav(0.1,4411)],'bass.wav');
 await assert.rejects(renderStemRemixMaster(different),/재생시간/);
 await assert.rejects(renderStemRemixMaster(stems(),{bass:{gainDb:100}}),/설정/);
});
test('abort before mixing and during mixing',async()=>{
 const controller=new AbortController();controller.abort();await assert.rejects(renderStemRemixMaster(stems(),{}, {signal:controller.signal}),/취소/);
 const later=new AbortController();await assert.rejects(renderStemRemixMaster(stems(),{}, {signal:later.signal,onProgress:()=>later.abort()}),/취소/);
});
test('source WAVs unchanged after mastering',async()=>{
 const ss=stems(),before=await Promise.all(ss.map(x=>x.file.arrayBuffer()));
 await renderStemRemixMaster(ss,{vocals:{gainDb:-12}});
 for(let i=0;i<ss.length;i++)assert.deepEqual(new Uint8Array(await ss[i].file.arrayBuffer()),new Uint8Array(before[i]));
});
test('native Go ZIP -> validated Demucs stems -> real master WAV',async()=>{
 const path=process.env.MYVOCAL_TEST_ZIP_OUT;
 if(!path)return;
 const {readFileSync}=await import('node:fs');
 const {parseNeuralStemsZip}=await import('../src/lib/musicStemZip.js');
 const parsed=parseNeuralStemsZip(new Uint8Array(readFileSync(path)));
 const result=await renderStemRemixMaster(parsed.stems);
 const s=await samples(result);
 assert.equal(s.frames,4410);assert.ok(s.l>0);assert.ok(s.l<=Math.pow(10,-1/20)+0.0001);
});
