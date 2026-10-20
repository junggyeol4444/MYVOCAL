import test from 'node:test';
import assert from 'node:assert/strict';
import {renderStemRemixMaster} from '../src/lib/stemRemixMaster.js';
import {serializeStemMixPreset,parseStemMixPreset} from '../src/lib/stemMixPreset.js';
const names=['drums','bass','other','vocals'];
function wav(amp,frames=44100){
 const b=new Uint8Array(44+frames*4),v=new DataView(b.buffer);
 b.set(new TextEncoder().encode('RIFF'),0);v.setUint32(4,b.length-8,true);b.set(new TextEncoder().encode('WAVEfmt '),8);
 v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,44100,true);v.setUint32(28,176400,true);v.setUint16(32,4,true);v.setUint16(34,16,true);
 b.set(new TextEncoder().encode('data'),36);v.setUint32(40,frames*4,true);
 for(let i=0;i<frames;i++){
  const value=Math.round(32767*amp*Math.sin(2*Math.PI*440*i/44100));v.setInt16(44+i*4,value,true);v.setInt16(46+i*4,value,true);
 }return b;
}
function stems(amp){return names.map((name,i)=>({name,file:new File([wav(i===0?amp:0)],name+'.wav',{type:'audio/wav'})}));}
async function peak(file){const v=new DataView(await file.arrayBuffer());let peak=0;for(let p=44;p+4<=v.byteLength;p+=2)peak=Math.max(peak,Math.abs(v.getInt16(p,true)/32768));return peak;}

test('실제 K-weighting/게이팅 측정 후 -16 LUFS 목표 마스터 PCM 생성',async()=>{
 const ss=stems(.05),before=await Promise.all(ss.map(s=>s.file.arrayBuffer()));
 const file=await renderStemRemixMaster(ss,{_master:{targetLufs:-16}});
 const stats=file.myvocalMastering;
 assert.ok(Number.isFinite(stats.measuredLufs));
 assert.ok(stats.appliedGainDb>3);
 assert.ok(Math.abs(stats.estimatedOutputLufs+16)<.6,JSON.stringify(stats));
 assert.ok(await peak(file)<=Math.pow(10,-1/20)+.0002);
 for(let i=0;i<ss.length;i++)assert.deepEqual(new Uint8Array(await ss[i].file.arrayBuffer()),new Uint8Array(before[i]));
});
test('높은 목표 LUFS라도 -1dBFS 피크를 넘지 않음',async()=>{
 const file=await renderStemRemixMaster(stems(.8),{_master:{targetLufs:-9}});
 assert.ok(await peak(file)<=Math.pow(10,-1/20)+.0002);
 assert.ok(file.myvocalMastering.estimatedOutputLufs<=-9+1e-5);
});
test('기존 기본 믹스는 LUFS 기능 비활성 상태를 유지',async()=>{
 const file=await renderStemRemixMaster(stems(.05));
 assert.equal(file.myvocalMastering.targetLufs,null);
 assert.ok(Math.abs((await peak(file))-.05)<.002);
});
test('목표 LUFS 설정 JSON 저장/복원 및 입력 범위 거부',async()=>{
 const preset=serializeStemMixPreset({_master:{targetLufs:-14}},4);
 assert.equal(parseStemMixPreset(preset,4)._master.targetLufs,-14);
 assert.equal(parseStemMixPreset(serializeStemMixPreset({_master:{targetLufs:null}},4),4)._master.targetLufs,null);
 await assert.rejects(renderStemRemixMaster(stems(.05),{_master:{targetLufs:4}}),/LUFS/);
 assert.throws(()=>serializeStemMixPreset({_master:{targetLufs:-40}},4),/범위/);
});
