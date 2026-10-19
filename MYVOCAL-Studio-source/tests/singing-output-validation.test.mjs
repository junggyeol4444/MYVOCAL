import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectSingingWav,assertUsableSingingWav} from '../src/lib/singingOutputValidation.js';
function wav({encoding=1,bits=16,channels=1,rate=48000,samples=[0,1000,-1000]}={}){
 const size=samples.length*bits/8, b=new Uint8Array(44+size),v=new DataView(b.buffer);
 const tag=(p,s)=>{for(let i=0;i<s.length;i++)b[p+i]=s.charCodeAt(i)};
 tag(0,'RIFF');v.setUint32(4,36+size,true);tag(8,'WAVE');tag(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,encoding,true);v.setUint16(22,channels,true);v.setUint32(24,rate,true);v.setUint32(28,rate*channels*bits/8,true);v.setUint16(32,channels*bits/8,true);v.setUint16(34,bits,true);tag(36,'data');v.setUint32(40,size,true);
 samples.forEach((s,i)=>{let p=44+i*bits/8;if(encoding===3)v.setFloat32(p,s,true);else if(bits===16)v.setInt16(p,s,true);else {if(s<0)s+=0x1000000;b[p]=s&255;b[p+1]=(s>>8)&255;b[p+2]=(s>>16)&255;}});return b;
}
test('valid 16 bit mono WAV',()=>{let r=inspectSingingWav(wav());assert.equal(r.valid,true);assert.equal(r.frames,3);assert.equal(r.sampleRate,48000)});
test('valid 24 bit stereo WAV',()=>{let r=inspectSingingWav(wav({bits:24,channels:2,samples:[0,1000,-1000,0]}));assert.equal(r.valid,true);assert.equal(r.frames,2)});
test('valid float WAV with above full-scale sample',()=>{let r=inspectSingingWav(wav({encoding:3,bits:32,samples:[1.25,-.5]}));assert.equal(r.valid,true);assert.equal(r.peak,1.25)});
test('rejects nonfinite float',()=>assert.match(inspectSingingWav(wav({encoding:3,bits:32,samples:[NaN]})).reason,/Non-finite/));
test('rejects truncated header',()=>assert.equal(inspectSingingWav(new Uint8Array(20)).valid,false));
test('rejects malformed RIFF size',()=>{let b=wav();b[4]=0;assert.equal(inspectSingingWav(b).valid,false)});
test('rejects truncated chunk',()=>{let b=wav();b[40]=255;assert.equal(inspectSingingWav(b).valid,false)});
test('rejects empty audio',()=>assert.equal(inspectSingingWav(wav({samples:[]})).valid,false));
test('rejects invalid channel count',()=>assert.equal(inspectSingingWav(wav({channels:0})).valid,false));
test('rejects invalid sample rate',()=>assert.equal(inspectSingingWav(wav({rate:0})).valid,false));
test('rejects non WAV bytes',()=>{let b=wav();b[0]=0;assert.equal(inspectSingingWav(b).valid,false)});

test('singing WAV gate accepts an audible 0.1-second PCM recording',()=>{
 const input=wav({samples:Array(4800).fill(2500)});
 const inspected=assertUsableSingingWav(input);
 assert.equal(inspected.valid,true);
 assert.ok(inspected.peak>0.001);
 assert.ok(inspected.durationSec>=0.099);
});
test('singing WAV gate refuses silent, truncated and very short engine output',()=>{
 assert.throws(()=>assertUsableSingingWav(wav({samples:Array(4800).fill(0)})),/소리가 없는/);
 assert.throws(()=>assertUsableSingingWav(wav({samples:[1000,-1000]})),/길이가/);
 const bad=wav({samples:Array(4800).fill(1000)});bad[4]=0;
 assert.throws(()=>assertUsableSingingWav(bad),/손상된/);
});
