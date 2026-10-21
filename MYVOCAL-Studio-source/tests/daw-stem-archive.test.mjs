import test from 'node:test';
import assert from 'node:assert/strict';
import {makeZip} from '../src/lib/zipStore.js';
import {parseDawStemArchive,prepareImportedStemTracks} from '../src/lib/dawStemArchive.js';

function wav(freq=440,seconds=.1){
 const frames=Math.round(44100*seconds),data=new Uint8Array(44+frames*4),v=new DataView(data.buffer);
 for(const [i,text] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])for(let j=0;j<4;j++)data[i+j]=text.charCodeAt(j);
 v.setUint32(4,data.length-8,true);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,44100,true);v.setUint32(28,44100*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);v.setUint32(40,frames*4,true);
 for(let i=0;i<frames;i++){let x=Math.round(1000*Math.sin(i*2*Math.PI*freq/44100));v.setInt16(44+i*4,x,true);v.setInt16(46+i*4,x,true);}
 return data;
}
function fixture(){
 const tracks=[{id:'old1',name:'드럼',file:'stems/01_드럼.wav',volume:85,originalMute:false,originalSolo:false},{id:'old2',name:'보컬',file:'stems/02_보컬.wav',volume:75,originalMute:true,originalSolo:true}];
 const manifest={format:'MYVOCAL_WAV_STEMS',version:2,projectId:'oldProject',title:'작품',sampleRate:44100,bitDepth:16,channels:2,tracks:tracks.map(t=>({...t,frames:4410,durationSec:.1,peak:.03}))};
 const input=[{name:'stems/manifest.json',data:new TextEncoder().encode(JSON.stringify(manifest))},...tracks.map((t,i)=>({name:t.file,data:wav(i?660:440)}))];
 return {bytes:makeZip(input),manifest};
}
test('MYVOCAL v2 ZIP를 CRC·WAV 길이 검증 후 새 자산/트랙으로 복원한다',async()=>{
 const {bytes}=fixture(),parsed=parseDawStemArchive(bytes);
 assert.equal(parsed.frames,4410);assert.equal(parsed.tracks.length,2);
 const issued=[];let sequence=0;
 const restored=prepareImportedStemTracks(parsed,kind=>{issued.push(kind);return `${kind}_${++sequence}`;});
 assert.equal(restored.assets.length,2);assert.equal(restored.tracks.length,2);
 assert.deepEqual(issued,['audio','trk','clip','audio','trk','clip']);
 assert.notEqual(restored.tracks[0].id,'old1');assert.equal(restored.tracks[0].clips[0].startBar,1);
 assert.equal(restored.tracks[1].mute,true);assert.equal(restored.tracks[1].solo,false);
 assert.equal(restored.tracks[0].clips[0].durationSec,.1);
 assert.deepEqual(new Uint8Array(await restored.assets[0][1].arrayBuffer()),parsed.tracks[0].bytes);
});
test('ZIP 안의 WAV가 바뀌면 CRC 오류로 거부한다',()=>{
 const {bytes}=fixture(),bad=bytes.slice();
 const start=bad.findIndex((x,i)=>x===82&&bad[i+1]===73&&bad[i+2]===70&&bad[i+3]===70);
 assert.ok(start>0);bad[start+44+80]^=1;
 assert.throws(()=>parseDawStemArchive(bad),/CRC|파일|ZIP/);
});
test('manifest의 WAV 길이 위조, 압축 ZIP, 중복 경로 및 외부 양식 거부',()=>{
 const {manifest}=fixture();manifest.tracks[1].frames=4409;
 const data=makeZip([{name:'stems/manifest.json',data:new TextEncoder().encode(JSON.stringify(manifest))},{name:manifest.tracks[0].file,data:wav(440)},{name:manifest.tracks[1].file,data:wav(660)}]);
 assert.throws(()=>parseDawStemArchive(data),/시간축|트랙|PCM/);
 const zipped=fixture().bytes.slice();zipped[8]=8; // local header compression method
 assert.throws(()=>parseDawStemArchive(zipped),/로컬|ZIP/);
 const dup=makeZip([{name:'stems/manifest.json',data:new TextEncoder().encode('{}')},{name:'stems/manifest.json',data:new TextEncoder().encode('{}')}]);
 assert.throws(()=>parseDawStemArchive(dup),/중복/);
 assert.throws(()=>parseDawStemArchive(new Uint8Array(12)),/크기/);
});
