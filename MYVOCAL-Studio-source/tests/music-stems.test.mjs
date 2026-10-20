import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeZip} from '../src/lib/zipStore.js';
import {parseNeuralStemsZip} from '../src/lib/musicStemZip.js';
import {splitMusicGenStems} from '../src/lib/musicStemsClient.js';
function wav(frames=4410){
 const b=new Uint8Array(44+frames*4),v=new DataView(b.buffer);
 b.set([82,73,70,70],0);v.setUint32(4,b.length-8,true);b.set([87,65,86,69,102,109,116,32],8);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,44100,true);v.setUint32(28,176400,true);v.setUint16(32,4,true);v.setUint16(34,16,true);b.set([100,97,116,97],36);v.setUint32(40,frames*4,true);v.setInt16(44,1234,true);return b;
}
const names=['drums','bass','other','vocals'];
function fixture({bad=false}={}){
 const manifest={format:'MYVOCAL_NEURAL_STEMS',version:1,engine:'Demucs',model:'htdemucs',stems:names,frames:4410,sampleRate:44100,channels:2,bits:16};
 return makeZip([{name:'stems/manifest.json',data:new TextEncoder().encode(JSON.stringify(manifest))},...names.map(n=>({name:`stems/${n}.wav`,data:wav(bad&&n==='bass'?4409:4410)}))]);
}
test('neural WAV 4 tracks and manifest parse',()=>{const parsed=parseNeuralStemsZip(fixture());assert.equal(parsed.stems.length,4);assert.equal(parsed.stems[0].info.frames,4410);assert.equal(parsed.manifest.engine,'Demucs')});
test('six-stem neural output preserves separate guitar and piano',()=>{
 const six=[...names,'guitar','piano'];
 const manifest={format:'MYVOCAL_NEURAL_STEMS',version:1,engine:'Demucs',model:'htdemucs_6s',stems:six,frames:4410,sampleRate:44100,channels:2,bits:16};
 const zip=makeZip([{name:'stems/manifest.json',data:new TextEncoder().encode(JSON.stringify(manifest))},...six.map(n=>({name:`stems/${n}.wav`,data:wav()}))]);
 const parsed=parseNeuralStemsZip(zip);
 assert.deepEqual(parsed.stems.map(x=>x.name),six);
});
test('five-stem model is rejected rather than silently dropping piano',()=>{
 const five=[...names,'guitar'];
 const manifest={format:'MYVOCAL_NEURAL_STEMS',version:1,engine:'Demucs',model:'broken',stems:five,frames:4410,sampleRate:44100,channels:2,bits:16};
 const zip=makeZip([{name:'stems/manifest.json',data:new TextEncoder().encode(JSON.stringify(manifest))},...five.map(n=>({name:`stems/${n}.wav`,data:wav()}))]);
 assert.throws(()=>parseNeuralStemsZip(zip),/4개 또는 6개/);
});
test('corrupted CRC rejected',()=>{const b=fixture();b[65]^=1;assert.throws(()=>parseNeuralStemsZip(b),/CRC|JSON/)});
test('misaligned neural stems rejected',()=>assert.throws(()=>parseNeuralStemsZip(fixture({bad:true})),/길이|포맷/));
test('untrusted extra file rejected',()=>{const entries=[{name:'stems/manifest.json',data:new Uint8Array([123,125])},...names.map(n=>({name:`stems/${n}.wav`,data:wav()})),{name:'stems/../unsafe',data:new Uint8Array([1])}];assert.throws(()=>makeZip(entries),/안전/)});
test('native request checks authorization and ZIP format',async()=>{
 const file=new File([wav()],'musicgen.wav',{type:'audio/wav'});
 let count=0;
 const request=async (path,opts)=>{count++;assert.equal(path,'/api/music/stems/split');assert.equal(opts.headers['X-MYVOCAL-Session'],'session');assert.equal(opts.body.get('model'),'htdemucs');return {ok:true,headers:{get:()=> 'application/zip'},blob:async()=>new Blob([fixture()],{type:'application/zip'})};};
 const result=await splitMusicGenStems(file,{python:'C:\\Python\\python.exe',repo:'C:\\Models',model:'htdemucs',device:'cpu'},{session:'session',request});
 assert.equal(result.stems.length,4);assert.equal(count,1);
});

test('native Go archive/zip data-descriptor output imports four stems',()=>{
 const path=process.env.MYVOCAL_TEST_ZIP_OUT;
 if(!path)return;
 const parsed=parseNeuralStemsZip(new Uint8Array(readFileSync(path)));
 assert.equal(parsed.stems.length,4);
 assert.equal(parsed.manifest.frames,4410);
});

test('native Go six-stem ZIP parses in existing JavaScript client',()=>{
 const path=process.env.MYVOCAL_TEST_ZIP_6_OUT;
 if(!path)return;
 const parsed=parseNeuralStemsZip(new Uint8Array(readFileSync(path)));
 assert.deepEqual(parsed.stems.map(x=>x.name),[...names,'guitar','piano']);
});
test('six-minute source and four-stem limits are consistent',()=>{
 const MAX_SECONDS=360;
 const stereo16Bytes=44+MAX_SECONDS*44100*4;
 assert.ok(stereo16Bytes<72*1024*1024);
 assert.ok(4*stereo16Bytes<300*1024*1024);
});
test('manifest with >6-minute duration is rejected before WAV processing',()=>{
 const m={format:'MYVOCAL_NEURAL_STEMS',version:1,engine:'Demucs',model:'htdemucs',stems:names,frames:44100*360+1,sampleRate:44100,channels:2,bits:16};
 const data=makeZip([{name:'stems/manifest.json',data:new TextEncoder().encode(JSON.stringify(m))},...names.map(n=>({name:`stems/${n}.wav`,data:wav()}))]);
 assert.throws(()=>parseNeuralStemsZip(data),/manifest/);
});
