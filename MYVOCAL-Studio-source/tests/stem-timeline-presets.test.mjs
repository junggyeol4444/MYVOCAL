import test from 'node:test';
import assert from 'node:assert/strict';
import {renderStemRemixMaster} from '../src/lib/stemRemixMaster.js';
import {parseStemMixPreset,serializeStemMixPreset} from '../src/lib/stemMixPreset.js';
const names=['drums','bass','other','vocals'];
function wav(frames=44100,amplitude=.2){
 const b=new Uint8Array(44+frames*4),v=new DataView(b.buffer);b.set(new TextEncoder().encode('RIFF'),0);v.setUint32(4,b.length-8,true);b.set(new TextEncoder().encode('WAVEfmt '),8);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,44100,true);v.setUint32(28,176400,true);v.setUint16(32,4,true);v.setUint16(34,16,true);b.set(new TextEncoder().encode('data'),36);v.setUint32(40,frames*4,true);
 for(let i=0;i<frames;i++){v.setInt16(44+i*4,Math.round(amplitude*32767),true);v.setInt16(46+i*4,Math.round(amplitude*32767),true)}return b;
}
function stems(){return names.map((name,i)=>({name,file:new File([wav(44100,i===0?.2:0)],name+'.wav',{type:'audio/wav'})}));}
async function valueAt(file,frame){const v=new DataView(await file.slice(44+frame*4,48+frame*4).arrayBuffer());return v.getInt16(0,true)/32768}
test('non-destructive stem offset: silence before, audio after',async()=>{
 const f=await renderStemRemixMaster(stems(),{drums:{offsetSec:.2}});
 assert.equal(await valueAt(f,0),0);assert.equal(await valueAt(f,8819),0);assert.ok(Math.abs(await valueAt(f,8820)-.2)<.002);
});
test('source trim at both ends produces expected silence and fixed length',async()=>{
 const f=await renderStemRemixMaster(stems(),{drums:{trimStartSec:.2,trimEndSec:.3}});
 assert.equal(f.size,44+44100*4);assert.ok(Math.abs(await valueAt(f,0)-.2)<.002);assert.equal(await valueAt(f,30870),0);
});
test('track fade in and out modifies actual PCM samples',async()=>{
 const f=await renderStemRemixMaster(stems(),{drums:{fadeInSec:.1,fadeOutSec:.1}});
 assert.equal(await valueAt(f,0),0);assert.ok((await valueAt(f,2205))>.09);assert.equal(await valueAt(f,44099),0);
});
test('invalid timing and fade settings fail without modifying original',async()=>{
 const input=stems();const original=await input[0].file.arrayBuffer();
 await assert.rejects(renderStemRemixMaster(input,{drums:{trimStartSec:.6,trimEndSec:.5}}),/벗어났/);
 await assert.rejects(renderStemRemixMaster(input,{drums:{offsetSec:1}}),/벗어났/);
 await assert.rejects(renderStemRemixMaster(input,{drums:{trimStartSec:.9,fadeInSec:.2}}),/페이드/);
 assert.deepEqual(new Uint8Array(await input[0].file.arrayBuffer()),new Uint8Array(original));
});
test('mix JSON roundtrip and hostile keys rejection',()=>{
 const settings={drums:{gainDb:-3,offsetSec:.2,trimStartSec:.1,fadeOutSec:.2},_master:{fadeOutSec:1}};
 assert.deepEqual(parseStemMixPreset(serializeStemMixPreset(settings,4),4),settings);
 assert.throws(()=>parseStemMixPreset(serializeStemMixPreset(settings,4),6),/일치/);
 assert.throws(()=>parseStemMixPreset('{"format":"MYVOCAL_STEM_MIX","version":1,"stemCount":4,"settings":{"__proto__":{"mute":true}}}',4),/알 수 없는/);
 assert.throws(()=>serializeStemMixPreset({drums:{gainDb:NaN}},4),/범위/);
});
