import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject} from '../src/lib/schema.js';
import {alignLyricNotes} from '../src/lib/lyricAlignment.js';
import {makeOpenUtauHandoffPackage,inspectRenderedWav,expectedVocalSeconds,OPENUTAU_SESSION_FORMAT} from '../src/lib/openUtauWorkflow.js';

function demo(){
 const p=newProject({title:'우리 노래'});
 p.lyrics='안녕';p.tracks[0].midiNotes=[
  {id:'a',pitch:60,startBeat:0,length:1,velocity:100},
  {id:'b',pitch:62,startBeat:1,length:1,velocity:100}];
 return {p,alignment:alignLyricNotes(p)};
}
function wav({seconds=1,channels=1,rate=16000,bits=16,float=false,extra=false}={}){
 const chunkBytes=Math.round(seconds*rate)*channels*(bits/8);
 const extraBytes=extra?12:0;
 const output=new Uint8Array(44+extraBytes+chunkBytes),v=new DataView(output.buffer);
 const str=(offset,value)=>{for(let i=0;i<value.length;i++)v.setUint8(offset+i,value.charCodeAt(i));};
 str(0,'RIFF');v.setUint32(4,output.length-8,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);
 v.setUint16(20,float?3:1,true);v.setUint16(22,channels,true);v.setUint32(24,rate,true);v.setUint32(28,rate*channels*(bits/8),true);v.setUint16(32,channels*(bits/8),true);v.setUint16(34,bits,true);
 if(extra){str(36,'JUNK');v.setUint32(40,4,true);str(48,'data');v.setUint32(52,chunkBytes,true)}
 else{str(36,'data');v.setUint32(40,chunkBytes,true)}
 return output;
}
function unpackStore(data){
 const view=new DataView(data.buffer,data.byteOffset,data.byteLength),files=new Map();let i=0,decoder=new TextDecoder();
 while(i+30<data.byteLength&&view.getUint32(i,true)===0x04034b50){
  const size=view.getUint32(i+18,true),nl=view.getUint16(i+26,true),el=view.getUint16(i+28,true);
  const name=decoder.decode(data.subarray(i+30,i+30+nl)),at=i+30+nl+el;
  files.set(name,data.subarray(at,at+size));i=at+size;
 }
 return files;
}

test('v1.7 handoff creates valid ZIP contents (USTX, MIDI, SRT, manifest, README)',async()=>{
 const {p,alignment}=demo();const r=await makeOpenUtauHandoffPackage(p,alignment,{singer:'MYVOICE'});
 const files=unpackStore(r.bytes);assert.equal(files.size,5);
 const yaml=new TextDecoder().decode([...files.entries()].find(([name])=>name.endsWith('.ustx'))[1]);
 assert.match(yaml,/lyric: "안"/);assert.match(yaml,/lyric: "녕"/);
 assert.equal(new TextDecoder().decode(files.get('lead-vocal.mid').subarray(0,4)),'MThd');
 assert.match(new TextDecoder().decode(files.get('lyrics.srt')),/00:00:00,000/);
 const manifest=JSON.parse(new TextDecoder().decode(files.get('manifest.json')));
 assert.equal(manifest.format,OPENUTAU_SESSION_FORMAT);assert.equal(manifest.noteCount,2);
 assert.equal(manifest.expectedVocalSeconds,1);assert.equal(manifest.singer,'MYVOICE');
 assert.equal(r.fileName,'MYVOCAL-우리_노래-OpenUtau-handoff.zip');
});
test('handoff refuses a stale MIDI/lyrics alignment',async()=>{
 const {p,alignment}=demo();p.lyrics='수정함';await assert.rejects(makeOpenUtauHandoffPackage(p,alignment),/오래|변경/);
});
test('handoff refuses overlapping notes',async()=>{
 const {p}=demo();p.tracks[0].midiNotes[1].startBeat=.5;
 const alignment=alignLyricNotes(p);await assert.rejects(makeOpenUtauHandoffPackage(p,alignment),/겹/);
});
test('WAV inspection accepts PCM mono 16-bit and gives duration',()=>{
 const v=inspectRenderedWav(wav({seconds:1.25}));
 assert.equal(v.durationSec,1.25);assert.equal(v.channels,1);assert.equal(v.sampleRate,16000);assert.equal(v.encoding,'PCM');
 assert.deepEqual(v.warnings,[]);
});
test('WAV inspection accepts extra metadata chunks and stereo Float32',()=>{
 const v=inspectRenderedWav(wav({seconds:2,channels:2,rate:48000,bits:32,float:true,extra:true}));
 assert.equal(v.encoding,'IEEE Float');assert.equal(v.durationSec,2);assert.equal(v.channels,2);
});
test('WAV inspection warns about vocal timeline mismatch instead of truncating',()=>{
 const report=inspectRenderedWav(wav({seconds:1}),3);
 assert.match(report.warnings[0],/짧/);
 assert.match(inspectRenderedWav(wav({seconds:6}),2).warnings[0],/길/);
});
test('WAV inspection rejects invalid and corrupt headers',()=>{
 const notWav=wav();notWav[0]=0;
 assert.throws(()=>inspectRenderedWav(notWav),/RIFF/);
 const wrong=wav();wrong[4]=255;wrong[5]=255;assert.throws(()=>inspectRenderedWav(wrong),/RIFF 길이/);
 const empty=new Uint8Array(10);assert.throws(()=>inspectRenderedWav(empty),/너무 작/);
});
test('WAV inspection rejects unsupported channel counts and sample formats',()=>{
 assert.throws(()=>inspectRenderedWav(wav({channels:3})),/채널/);
 const wrong=wav();new DataView(wrong.buffer).setUint16(20,6,true);
 assert.throws(()=>inspectRenderedWav(wrong),/PCM 또는/);
});
test('WAV inspection rejects truncated PCM and malformed fmt info',()=>{
 const wrong=wav();new DataView(wrong.buffer).setUint32(40,900000,true);
 assert.throws(()=>inspectRenderedWav(wrong),/범위를 벗어/);
 const b=wav();new DataView(b.buffer).setUint32(28,1234,true);
 assert.throws(()=>inspectRenderedWav(b),/블록/);
});
test('WAV inspection rejects overlong WAV audio',()=>{
 const long=wav({seconds:481,rate:8000});assert.throws(()=>inspectRenderedWav(long),/8분/);
});
test('expected seconds defaults to zero for missing cues',()=>{
 assert.equal(expectedVocalSeconds(null),0);const {alignment}=demo();assert.equal(expectedVocalSeconds(alignment),1);
});
