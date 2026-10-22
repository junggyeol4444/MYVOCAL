import test from 'node:test';
import assert from 'node:assert/strict';
import {planLongSingingChunks,combineSingingWavChunks,renderLongSinging} from '../src/lib/longSingingRender.js';
import {inspectSingingWav} from '../src/lib/singingOutputValidation.js';
function wav(seconds=1,rate=8000,amplitude=8000){
 const count=Math.ceil(seconds*rate),out=new Uint8Array(44+count*2),v=new DataView(out.buffer);
 for(const [at,t] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])for(let j=0;j<4;j++)out[at+j]=t.charCodeAt(j);
 v.setUint32(4,out.length-8,true);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
 v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);v.setUint32(40,count*2,true);
 for(let i=0;i<count;i++)v.setInt16(44+i*2,amplitude,true);return out;
}
const align={bpm:120,cues:[{lyric:'안',pitch:60,startSec:0,endSec:50,velocity:90},{lyric:'녕',pitch:62,startSec:50,endSec:120,velocity:90},{lyric:'하',pitch:64,startSec:120,endSec:195,velocity:90}]};
test('partitions 195-second score into bounded, rebased local engine requests',()=>{
 const p=planLongSingingChunks(align);assert.equal(p.durationSec,195);assert.equal(p.chunks.length,3);
 assert.deepEqual(p.chunks.map(x=>x.startSec),[0,50,120]);
 assert.equal(p.chunks[2].cues[0].endSec,75);
 assert.equal(JSON.stringify(align).includes('"endSec":195'),true);
});
test('reject overlapping or inconsistent music notes before engine call',()=>{
 assert.throws(()=>planLongSingingChunks({...align,cues:[align.cues[1],align.cues[0]]}),/시간/);
 assert.throws(()=>planLongSingingChunks({...align,cues:[{...align.cues[0],endSec:91}]}),/80초/);
});
test('joins actual PCM samples and preserves silent time offsets',()=>{
 const a=wav(.5),b=wav(.5,8000,15000);
 const joined=combineSingingWavChunks([{startSec:0,limitSec:1,requiredDurationSec:.5,bytes:a},{startSec:1,limitSec:1.5,requiredDurationSec:.5,bytes:b}],1.5);
 return joined.arrayBuffer().then(buf=>{
  const info=inspectSingingWav(buf);assert.equal(info.durationSec,1.5);assert.equal(info.peak>0.4,true);
  const view=new DataView(buf);assert.equal(view.getInt16(44,true),8000);
  assert.ok(view.getInt16(44+8000*2,true)>0&&view.getInt16(44+8000*2,true)<15000);
  assert.equal(view.getInt16(44+(8000+40)*2,true),15000);
  assert.equal(view.getInt16(44+6000*2,true),0);
 });
});
test('different sample formats and truncated segments fail instead of accepting broken audio',()=>{
 assert.throws(()=>combineSingingWavChunks([{startSec:0,requiredDurationSec:1,bytes:wav(.5)}],1),/짧게/);
 assert.throws(()=>combineSingingWavChunks([{startSec:0,bytes:wav(.3)},{startSec:.3,bytes:wav(.3,16000)}],.6),/포맷/);
});
test('sequential real-engine requests are combined without modifying score',async()=>{
 const original=JSON.stringify(align),requested=[];
 const output=await renderLongSinging(align,{port:7867,project:{title:'노래'},voice:{id:'me',name:'나',rights:'self'},model:null,
  request:async req=>{requested.push(req);return new Blob([wav(Math.max(...req.cues.map(c=>c.endSec)))],{type:'audio/wav'});}
 });
 assert.equal(requested.length,3);assert.equal(output.parts,3);assert.equal((await output.wav.arrayBuffer()).byteLength>3000000,true);
 assert.equal(JSON.stringify(align),original);
});
test('abort between long-form model requests does not claim a finished WAV',async()=>{
 const controller=new AbortController();let count=0;
 await assert.rejects(renderLongSinging(align,{port:7867,project:{title:'song'},voice:{id:'me',rights:'self'},model:null,
 signal:controller.signal,request:async req=>{count++;controller.abort();return new Blob([wav(Math.max(...req.cues.map(c=>c.endSec)))],{type:'audio/wav'});}}),/취소/);
 assert.equal(count,1);
});
import {buildPhonemePlan} from '../src/lib/phonemePlan.js';
test('long Korean phoneme hints are rebased per neural singing inference chunk',async()=>{
 const s={...align,format:'MYVOCAL_LYRIC_ALIGNMENT',version:1,longForm:true,projectId:'test-long',trackId:'v',sourceKey:'original-vocal',cues:align.cues.map(c=>({...c}))};
 const hints=buildPhonemePlan(s),received=[];
 await renderLongSinging(s,{port:7867,project:{title:'노래'},voice:{id:'mine',name:'나',rights:'self'},model:null,phonemePlan:hints,
 request:async body=>{received.push(body);return new Blob([wav(Math.max(...body.cues.map(c=>c.endSec)))],{type:'audio/wav'});}});
 assert.equal(received.length,3);
 assert.ok(received.every(x=>x.phonemes?.length>0));
 assert.equal(received[1].phonemes[0].cueIndex,1);
 assert.ok(received[1].phonemes[0].startSec<1);
 assert.equal(s.cues[1].startSec,50);
});

test('full 360-second neural Korean vocal chunking retains first cue phonemes on every chunk',async()=>{
 const notes=Array.from({length:6},(_,i)=>({lyric:['나','는','노','래','한','다'][i],pitch:60+i,startSec:i*60,endSec:(i+1)*60,velocity:90}));
 const structure={...align,format:'MYVOCAL_LYRIC_ALIGNMENT',version:1,longForm:true,projectId:'six-min-vocal',trackId:'lead',sourceKey:'vocal-score',cues:notes};
 const {buildPhonemePlan}=await import('../src/lib/phonemePlan.js');
 const phonemes=buildPhonemePlan(structure),sent=[];
 const data=await renderLongSinging(structure,{port:7867,project:{title:'6분 원본'},voice:{id:'self',rights:'self'},model:null,phonemePlan:phonemes,
 request:async r=>{sent.push(r);return new Blob([wav(Math.max(...r.cues.map(c=>c.endSec)))],{type:'audio/wav'});}});
 assert.equal(data.parts,6);
 assert.equal(sent.length,6);
 assert.ok(sent.every(x=>x.phonemes?.length>0));
 assert.ok(sent.every(x=>x.phonemes[0].cueIndex===1));
 const result=inspectSingingWav(await data.wav.arrayBuffer());
 assert.equal(result.durationSec,360);
});
