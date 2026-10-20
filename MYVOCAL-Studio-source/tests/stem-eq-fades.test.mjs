import test from 'node:test';
import assert from 'node:assert/strict';
import {renderStemRemixMaster} from '../src/lib/stemRemixMaster.js';
const RATE=44100, FRAMES=44100;
const names=['drums','bass','other','vocals'];
function wav(freq=200,amp=.1){
 const b=new Uint8Array(44+FRAMES*4),v=new DataView(b.buffer);
 b.set(new TextEncoder().encode('RIFF'),0);v.setUint32(4,b.length-8,true);b.set(new TextEncoder().encode('WAVEfmt '),8);
 v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,RATE,true);v.setUint32(28,RATE*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);
 b.set(new TextEncoder().encode('data'),36);v.setUint32(40,FRAMES*4,true);
 for(let i=0;i<FRAMES;i++){const sample=Math.round(Math.sin(2*Math.PI*freq*i/RATE)*amp*32767);v.setInt16(44+i*4,sample,true);v.setInt16(46+i*4,sample,true)}
 return new File([b],'source.wav',{type:'audio/wav'});
}
function stems(freq=200){return names.map((name,i)=>({name,file:wav(freq,i===0?.1:0)}));}
async function rms(file,start=.1,end=.9){const v=new DataView(await file.arrayBuffer());let sum=0,n=0;for(let i=Math.floor(start*FRAMES);i<Math.floor(end*FRAMES);i++){const x=v.getInt16(44+i*4,true)/32768;sum+=x*x;n++}return Math.sqrt(sum/n)}
test('zero EQ and no fades preserve original remix PCM',async()=>{
 const s=stems();const baseline=await renderStemRemixMaster(s);const neutral=await renderStemRemixMaster(s,{drums:{eqLowDb:0,eqMidDb:0,eqHighDb:0},_master:{fadeInSec:0,fadeOutSec:0}});
 assert.deepEqual(new Uint8Array(await neutral.arrayBuffer()),new Uint8Array(await baseline.arrayBuffer()));
});
test('real 160 Hz low shelf raises bass tone and lowers it',async()=>{
 const s=stems(100),base=await rms(await renderStemRemixMaster(s));
 const up=await rms(await renderStemRemixMaster(s,{drums:{eqLowDb:6}}));
 const down=await rms(await renderStemRemixMaster(s,{drums:{eqLowDb:-6}}));
 assert.ok(up>base*1.4,`${up} <= ${base}`);assert.ok(down<base*.8);
});
test('1k mid EQ and 6k high EQ modify corresponding PCM tones',async()=>{
 const mid=stems(1000),high=stems(8000);
 assert.ok(await rms(await renderStemRemixMaster(mid,{drums:{eqMidDb:6}}))>await rms(await renderStemRemixMaster(mid))*1.5);
 assert.ok(await rms(await renderStemRemixMaster(high,{drums:{eqHighDb:6}}))>await rms(await renderStemRemixMaster(high))*1.4);
});
test('master fade-in and fade-out reach near zero at both ends',async()=>{
 const out=await renderStemRemixMaster(stems(),{_master:{fadeInSec:.1,fadeOutSec:.1}});
 const v=new DataView(await out.arrayBuffer());assert.equal(v.getInt16(44,true),0);assert.equal(v.getInt16(44+(FRAMES-1)*4,true),0);
 assert.ok(await rms(out,.2,.8)>.05);
});
test('invalid EQ and fade settings reject without touching WAV originals',async()=>{
 const ss=stems(),original=await ss[0].file.arrayBuffer();
 await assert.rejects(renderStemRemixMaster(ss,{drums:{eqLowDb:13}}),/설정/);
 await assert.rejects(renderStemRemixMaster(ss,{_master:{fadeInSec:9,fadeOutSec:9}}),/페이드/);
 assert.deepEqual(new Uint8Array(await ss[0].file.arrayBuffer()),new Uint8Array(original));
});
