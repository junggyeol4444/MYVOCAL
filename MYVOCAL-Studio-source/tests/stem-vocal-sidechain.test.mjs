import test from 'node:test';
import assert from 'node:assert/strict';
import {renderStemRemixMaster} from '../src/lib/stemRemixMaster.js';
import {parseStemMixPreset,serializeStemMixPreset} from '../src/lib/stemMixPreset.js';
const RATE=44100,NAMES=['drums','bass','other','vocals'];
function wav(amplitudeAt,frames=RATE*2){
 const b=new Uint8Array(44+frames*4),v=new DataView(b.buffer),enc=new TextEncoder();
 b.set(enc.encode('RIFF'),0);v.setUint32(4,b.length-8,true);b.set(enc.encode('WAVEfmt '),8);
 v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);
 v.setUint32(24,RATE,true);v.setUint32(28,RATE*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);
 b.set(enc.encode('data'),36);v.setUint32(40,frames*4,true);
 for(let i=0;i<frames;i++){const sample=Math.round(Math.max(-1,Math.min(1,amplitudeAt(i/RATE)))*32767);
  v.setInt16(44+i*4,sample,true);v.setInt16(46+i*4,sample,true);}
 return new File([b],'input.wav',{type:'audio/wav'});
}
function stems(){return NAMES.map((name,i)=>({name,file:wav(i===0?()=>.3:i===3?t=>t>=.5&&t<1.2?.25:0:()=>0)}));}
async function sample(file,time){const b=new DataView(await file.slice(44+Math.floor(time*RATE)*4,48+Math.floor(time*RATE)*4).arrayBuffer());return b.getInt16(0,true)/32768;}
const duck={_master:{duckEnabled:true,duckThresholdDb:-35,duckReductionDb:14,duckAttackMs:10,duckReleaseMs:100}};
test('vocal activity reduces real backing PCM and release restores it',async()=>{
 const inputs=stems(),plain=await renderStemRemixMaster(inputs),mixed=await renderStemRemixMaster(inputs,duck);
 assert.ok(Math.abs(await sample(mixed,.2)-await sample(plain,.2))<.002);
 assert.ok((await sample(mixed,.9))<(await sample(plain,.9))-.10);
 assert.ok(Math.abs(await sample(mixed,1.8)-await sample(plain,1.8))<.02);
});
test('sidechain disabled is bitwise backward compatible',async()=>{
 const inputs=stems();
 const a=await renderStemRemixMaster(inputs),b=await renderStemRemixMaster(inputs,{_master:{duckEnabled:false}});
 assert.deepEqual(new Uint8Array(await a.arrayBuffer()),new Uint8Array(await b.arrayBuffer()));
});
test('preset stores sidechain settings and rejects malformed values',()=>{
 assert.deepEqual(parseStemMixPreset(serializeStemMixPreset(duck,4),4),duck);
 assert.throws(()=>serializeStemMixPreset({_master:{duckAttackMs:-1}},4),/범위/);
 assert.throws(()=>serializeStemMixPreset({_master:{duckEnabled:'true'}},4),/올바르지/);
});
test('muted vocal with enabled ducking is rejected and source WAVs preserved',async()=>{
 const inputs=stems(),before=await Promise.all(inputs.map(x=>x.file.arrayBuffer()));
 await assert.rejects(renderStemRemixMaster(inputs,{...duck,vocals:{mute:true}}),/보컬 WAV/);
 for(let i=0;i<inputs.length;i++)assert.deepEqual(new Uint8Array(await inputs[i].file.arrayBuffer()),new Uint8Array(before[i]));
});
test('same samples across chunk boundaries and passes',async()=>{
 const input=stems();const mixed=await renderStemRemixMaster(input,duck);
 assert.equal(mixed.size,44+RATE*2*4);
 for(const time of [.99,1.0,1.01])assert.ok(Number.isFinite(await sample(mixed,time)));
});
