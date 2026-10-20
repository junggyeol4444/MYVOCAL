import test from 'node:test';
import assert from 'node:assert/strict';
import {stemsZip98} from '../src/lib/finalExport98.js';

const project=()=>({id:'prj1',title:'내 노래',bpm:120,tracks:[
 {id:'lead',name:'리드/보컬',volume:65,mute:false,solo:true,midiNotes:[{pitch:60}]},
 {id:'drum',name:'드럼',volume:75,mute:true,solo:false,clips:[{assetId:'drum-audio'}]},
 {id:'empty',name:'빈 트랙',mute:false,solo:false,clips:[]}
]});
const wav=(frames=4410)=>{
 const b=new Uint8Array(44+frames*4),v=new DataView(b.buffer);
 for(const [at,tag] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])for(let i=0;i<4;i++)b[at+i]=tag.charCodeAt(i);
 v.setUint32(4,b.length-8,true);v.setUint32(16,16,true);v.setUint16(20,1,true);
 v.setUint16(22,2,true);v.setUint32(24,44100,true);v.setUint32(28,44100*4,true);
 v.setUint16(32,4,true);v.setUint16(34,16,true);v.setUint32(40,frames*4,true);
 for(let i=0;i<frames;i++){v.setInt16(44+i*4,9000,true);v.setInt16(46+i*4,-9000,true);}
 return new Blob([b],{type:'audio/wav'});
};
async function entries(blob){
 const b=new Uint8Array(await blob.arrayBuffer()),v=new DataView(b.buffer),out=[];
 for(let i=0;i+30<=b.length;){
  if(v.getUint32(i,true)!==0x04034b50)break;
  const nameLen=v.getUint16(i+26,true),extra=v.getUint16(i+28,true),size=v.getUint32(i+18,true);
  const start=i+30+nameLen+extra;
  const name=new TextDecoder().decode(b.subarray(i+30,i+30+nameLen));
  out.push({name,data:b.subarray(start,start+size)});
  i=start+size;
 }
 return out;
}

test('renders one REAL isolated WAV per original track with no project mutation',async()=>{
 const p=project(),before=structuredClone(p),seen=[];
 const blob=await stemsZip98(p,{mix:async(isolated,opts)=>{
  seen.push({isolated,opts});return wav();
 }});
 assert.equal(blob.type,'application/zip');
 assert.deepEqual(p,before);
 assert.equal(seen.length,2);
 assert.deepEqual(seen[0].isolated.tracks.map(t=>t.mute),[false,true,true]);
 assert.deepEqual(seen[1].isolated.tracks.map(t=>t.mute),[true,false,true]);
 assert.equal(seen.every(x=>x.isolated.tracks.every(t=>t.solo===false)),true);
 assert.equal(seen.every(x=>x.opts.trimSilence===false&&x.opts.normalizePeak===false),true);
 const files=await entries(blob);
 assert.equal(files.length,3);
 assert.equal(files[1].name,'stems/01_리드_보컬.wav');
 assert.equal(files[2].name,'stems/02_드럼.wav');
 const manifest=JSON.parse(new TextDecoder().decode(files[0].data));
 assert.equal(manifest.format,'MYVOCAL_WAV_STEMS');
 assert.equal(manifest.version,2);
 assert.equal(manifest.tracks[0].frames,4410);
 assert.deepEqual(manifest.tracks.map(t=>t.id),['lead','drum']);
 assert.equal(manifest.tracks[1].originalMute,true);
});

test('rejects no audio, duplicate track IDs and too many stems',async()=>{
 await assert.rejects(stemsZip98({tracks:[]},{mix:async()=>wav()}),/1~16개/);
 const p=project();p.tracks[1].id='lead';
 await assert.rejects(stemsZip98(p,{mix:async()=>wav()}),/중복/);
 const many=project();many.tracks=Array.from({length:17},(_,i)=>({id:'x'+i,midiNotes:[{pitch:60}]}));
 await assert.rejects(stemsZip98(many,{mix:async()=>wav()}),/1~16개/);
});

test('rejects invalid WAV and unequal stem durations without touching project',async()=>{
 const p=project(),original=structuredClone(p);
 await assert.rejects(stemsZip98(p,{mix:async()=>new Blob([new Uint8Array(100)])}),/WAV 구조/);
 let i=0;
 await assert.rejects(stemsZip98(p,{mix:async()=>wav(++i===1?4410:8820)}),/길이가 서로 달라/);
 assert.deepEqual(p,original);
});

test('failed stem renderer aborts without touching the existing project',async()=>{
 const p=project(),original=structuredClone(p);
 await assert.rejects(stemsZip98(p,{mix:async()=>{throw Error('WAV renderer failed')}}),/WAV renderer failed/);
 assert.deepEqual(p,original);
});
