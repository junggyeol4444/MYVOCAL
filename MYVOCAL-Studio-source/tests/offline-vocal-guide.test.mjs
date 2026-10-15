import test from 'node:test';
import assert from 'node:assert/strict';
import {guideVowel, validateGuideCues, pcmMonoToWav, renderOfflineVocalGuide} from '../src/lib/offlineVocalGuide.js';
const cue=(overrides={})=>({lyric:'아',pitch:69,startSec:0,endSec:0.25,velocity:100,...overrides});
const align=(cues=[cue()])=>({bpm:120,cues});
const read32=(bytes,i)=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(i,true);
const read16=(bytes,i)=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint16(i,true);

test('Korean vowel mapping and fallback are stable',()=>{
 assert.equal(guideVowel('안녕'),'a');
 assert.equal(guideVowel('서울'),'eo');
 assert.equal(guideVowel('우리'),'u');
 assert.equal(guideVowel('별'),'eo');
 assert.equal(guideVowel('빛'),'i');
 assert.equal(guideVowel('Hello'),'a');
});
test('offline guide generates playable mono 16-bit PCM WAV without external inputs',async()=>{
 const original=align([cue({startSec:0.1,endSec:0.3})]);
 const before=JSON.stringify(original);
 const result=renderOfflineVocalGuide(original);
 const bytes=new Uint8Array(await result.blob.arrayBuffer());
 assert.equal(String.fromCharCode(...bytes.slice(0,4)),'RIFF');
 assert.equal(String.fromCharCode(...bytes.slice(8,12)),'WAVE');
 assert.equal(read32(bytes,4),bytes.length-8);
 assert.equal(read16(bytes,20),1);
 assert.equal(read16(bytes,22),1);
 assert.equal(read32(bytes,24),22050);
 assert.equal(read16(bytes,34),16);
 assert.equal(read32(bytes,40),bytes.length-44);
 assert.equal(result.rendered,1);
 assert.equal(result.seconds,0.3);
 assert.equal(JSON.stringify(original),before,'must not mutate project note data');
 assert.ok(bytes.slice(44,44+4400).every(x=>x===0),'opening 0.1s must be silent');
 assert.ok(bytes.slice(44+4800).some(x=>x!==0),'sung note must contain audio');
});
test('guide rendering is reproducible and pitch and vowel alter the waveform',async()=>{
 const sound=async c=>new Uint8Array(await renderOfflineVocalGuide(align([cue(c)])).blob.arrayBuffer());
 const a=await sound({lyric:'아',pitch:69});
 assert.deepEqual(a,await sound({lyric:'아',pitch:69}));
 assert.notDeepEqual(a,await sound({lyric:'아',pitch:72}));
 assert.notDeepEqual(a,await sound({lyric:'이',pitch:69}));
});
test('rest cue and zero velocity produce silence',async()=>{
 const data=new Uint8Array(await renderOfflineVocalGuide(align([cue({lyric:'—'}),cue({startSec:0.4,endSec:0.5,velocity:0})])).blob.arrayBuffer());
 assert.equal(data.length,44+Math.ceil(0.5*22050)*2);
 assert.ok(data.subarray(44).every(x=>x===0));
});
test('invalid MIDI cues reject before waveform allocation',()=>{
 const invalid=[null,{},align([]),align(Array.from({length:129},()=>cue())),
  ...[{pitch:NaN},{pitch:Infinity},{pitch:99},{pitch:60.5},{startSec:-1},{endSec:90.1},
      {endSec:0},{startSec:0.3,endSec:0.2},{velocity:-1},{velocity:128},{lyric:{}},
      {lyric:'가'.repeat(241)}].map(x=>align([cue(x)]))];
 for(const x of invalid)assert.throws(()=>validateGuideCues(x));
 assert.equal(validateGuideCues(align([cue()])),0.25);
});
test('WAV export rejects invalid arrays and clips nonfinite samples safely',()=>{
 assert.throws(()=>pcmMonoToWav([]));
 assert.throws(()=>pcmMonoToWav(new Float32Array(2),44100));
 const data=pcmMonoToWav(new Float32Array([NaN,Infinity,-Infinity,2,-2]));
 assert.equal(data.length,54);
 assert.deepEqual([...data.slice(44,50)],[0,0,0,0,0,0]);
});
test('simultaneous notes and gaps produce bounded PCM audio',async()=>{
 const result=renderOfflineVocalGuide(align([cue({startSec:0,endSec:0.2}),cue({lyric:'이',startSec:0.1,endSec:0.3})]));
 assert.equal(result.rendered,2);
 const bytes=new Uint8Array(await result.blob.arrayBuffer());
 assert.equal(read32(bytes,40),Math.ceil(.3*22050)*2);
 assert.ok(bytes.slice(44).some(x=>x!==0));
});

test('excessive overlapping guide synthesis is capped before audio allocation',()=>{
 const many=align(Array.from({length:3},()=>cue({startSec:0,endSec:50})));
 assert.throws(()=>renderOfflineVocalGuide(many),/120초/);
});

test('all sung Hangul syllable vowels are extracted in order',async()=>{
 const {guideVowelSequence}=await import('../src/lib/offlineVocalGuide.js');
 assert.deepEqual(guideVowelSequence('아 이 우'),['a','i','u']);
 assert.deepEqual(guideVowelSequence('고양이!'),['o','a','i']);
 assert.deepEqual(guideVowelSequence('서울'),['eo','u']);
});

test('compatibility jamo vowels and non-Hangul fallback are deterministic',async()=>{
 const {guideVowelSequence}=await import('../src/lib/offlineVocalGuide.js');
 assert.deepEqual(guideVowelSequence('ㅏㅓㅣ'),['a','eo','i']);
 assert.deepEqual(guideVowelSequence('Hello 123!'),['a']);
 assert.equal(guideVowel('ㅣ'),'i');
 assert.equal(guideVowel('아 이'),'a');
});

test('pasted long lyric does not create unbounded per-note synthesis work',async()=>{
 const {guideVowelSequence}=await import('../src/lib/offlineVocalGuide.js');
 assert.deepEqual(guideVowelSequence('아'.repeat(300)),Array.from({length:24},()=> 'a'));
 const result=renderOfflineVocalGuide(align([cue({lyric:'아이'.repeat(60)})]));
 assert.equal(result.rendered,1);
 assert.equal(result.seconds,.25);
});

test('multiple syllables within one note change the later vocal timbre',async()=>{
 const wav=async lyric=>new Uint8Array(await renderOfflineVocalGuide(align([cue({lyric,endSec:.5})])).blob.arrayBuffer());
 const mono=await wav('아');
 const multi=await wav('아이');
 assert.equal(mono.length,multi.length);
 assert.notDeepEqual(mono,multi);
 // The first syllable retains the old formant guide exactly until the blend.
 assert.deepEqual(mono.slice(44,44+22050/5),multi.slice(44,44+22050/5));
 // The second half must no longer sound like an unchanging first vowel.
 assert.notDeepEqual(mono.slice(-5000),multi.slice(-5000));
});

test('reversing syllable order changes the generated vowel-transition waveform',async()=>{
 const audio=async lyric=>new Uint8Array(await renderOfflineVocalGuide(align([cue({lyric,endSec:.6})])).blob.arrayBuffer());
 assert.notDeepEqual(await audio('아이'),await audio('이아'));
});

test('multi-syllable rendering preserves original cue data and is reproducible',async()=>{
 const a=align([cue({lyric:'우리아이',startSec:.1,endSec:.7}),cue({lyric:'사랑',startSec:.72,endSec:.98,pitch:72})]);
 const before=JSON.stringify(a);
 const first=new Uint8Array(await renderOfflineVocalGuide(a).blob.arrayBuffer());
 const second=new Uint8Array(await renderOfflineVocalGuide(a).blob.arrayBuffer());
 assert.equal(JSON.stringify(a),before);
 assert.deepEqual(first,second);
});

test('a multi-syllable rest cue remains silent',async()=>{
 const b=new Uint8Array(await renderOfflineVocalGuide(align([cue({lyric:'—',endSec:.35})])).blob.arrayBuffer());
 assert.ok(b.slice(44).every(v=>v===0));
});

test('consonant onset hints follow Unicode Hangul choseong grouping',async()=>{
 const {guideSyllableSequence}=await import('../src/lib/offlineVocalGuide.js');
 assert.deepEqual(guideSyllableSequence('아가사나라마하'),[
  {vowel:'a',onset:'none'},
  {vowel:'a',onset:'burst'},
  {vowel:'a',onset:'fricative'},
  {vowel:'a',onset:'nasal'},
  {vowel:'a',onset:'liquid'},
  {vowel:'a',onset:'nasal'},
  {vowel:'a',onset:'fricative'},
 ]);
});

test('standalone vowels and foreign lyrics have no imagined consonants',async()=>{
 const {guideSyllableSequence}=await import('../src/lib/offlineVocalGuide.js');
 assert.deepEqual(guideSyllableSequence('ㅏㅣ'),[
  {vowel:'a',onset:'none'},{vowel:'i',onset:'none'},
 ]);
 assert.deepEqual(guideSyllableSequence('Hello 123'),[{vowel:'a',onset:'none'}]);
 assert.deepEqual(guideSyllableSequence('—'),[{vowel:'a',onset:'none'}]);
});

test('onset hints alter consonant attacks even when vowels match',async()=>{
 const wav=async lyric=>new Uint8Array(await renderOfflineVocalGuide(align([cue({lyric,endSec:0.6})])).blob.arrayBuffer());
 const silentOnset=await wav('아');
 for(const consonant of ['가','사','나','라','하','바']){
  const generated=await wav(consonant);
  assert.equal(generated.length,silentOnset.length);
  assert.notDeepEqual(generated.subarray(44+2*150,44+2*800),silentOnset.subarray(44+2*150,44+2*800),`${consonant} should have a distinct attack`);
  // After the short onset has ended, both notes share the same vowel/formants.
  assert.deepEqual(generated.subarray(44+2*3000,44+2*4000),silentOnset.subarray(44+2*3000,44+2*4000));
 }
});

test('consonant onset is deterministic across repeated offline renders',async()=>{
 const a=align([cue({lyric:'사랑',pitch:65,endSec:.45}),cue({lyric:'바람',pitch:72,startSec:.5,endSec:1.0})]);
 const original=JSON.stringify(a);
 const first=new Uint8Array(await renderOfflineVocalGuide(a).blob.arrayBuffer());
 const second=new Uint8Array(await renderOfflineVocalGuide(a).blob.arrayBuffer());
 assert.deepEqual(first,second);
 assert.equal(JSON.stringify(a),original);
});

test('same vowels but different consonants produce different internal syllable onsets',async()=>{
 const wav=async lyric=>new Uint8Array(await renderOfflineVocalGuide(align([cue({lyric,endSec:.8})])).blob.arrayBuffer());
 const a=await wav('아아');
 const b=await wav('아사');
 assert.deepEqual(a.subarray(44,44+2*7000),b.subarray(44,44+2*7000));
 assert.notDeepEqual(a.subarray(44+2*9050,44+2*9700),b.subarray(44+2*9050,44+2*9700));
});

test('onset hint syllable processing is bounded to 24 units',async()=>{
 const {guideSyllableSequence}=await import('../src/lib/offlineVocalGuide.js');
 const many=guideSyllableSequence('사'.repeat(120));
 assert.equal(many.length,24);
 assert.ok(many.every(x=>x.onset==='fricative'));
 const a=renderOfflineVocalGuide(align([cue({lyric:'사'.repeat(120),endSec:.5})]));
 assert.equal(a.rendered,1);
});

test('consonant onset rest and zero-velocity notes remain exactly silent',async()=>{
 const data=new Uint8Array(await renderOfflineVocalGuide(align([
  cue({lyric:'바사하',velocity:0}),cue({lyric:'—',startSec:.4,endSec:.6}),
 ])).blob.arrayBuffer());
 assert.ok(data.subarray(44).every(x=>x===0));
});

test('onset envelope does not create out-of-bounds data for very short notes',async()=>{
 const wav=new Uint8Array(await renderOfflineVocalGuide(align([
  cue({lyric:'가사',startSec:0,endSec:0.0001}),
  cue({lyric:'사',startSec:.001,endSec:.002}),
 ])).blob.arrayBuffer());
 assert.equal(read32(wav,40),Math.ceil(.002*22050)*2);
 assert.equal(wav.length,44+Math.ceil(.002*22050)*2);
});
