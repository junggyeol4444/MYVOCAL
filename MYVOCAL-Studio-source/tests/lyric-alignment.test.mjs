import test from 'node:test';
import assert from 'node:assert/strict';
import {lyricUnits,alignmentSource,alignLyricNotes,isAlignmentStale,createVocalExchangePackage,cuesToSrt,makeImportedVocalTrack} from '../src/lib/lyricAlignment.js';
import {parseMidiFile} from '../src/lib/midiFile.js';
function project(){return {id:'p1',title:'노래 테스트',bpm:120,lyrics:'[Verse 1]\n안녕 hello world!\n[Chorus]\n우리',tracks:[{id:'v1',type:'vocal',name:'Lead Vocal',instrument:'synth',midiNotes:[{pitch:60,startBeat:0,length:1,velocity:95},{pitch:62,startBeat:1,length:1},{pitch:64,startBeat:2,length:.5},{pitch:65,startBeat:2.5,length:1},{pitch:67,startBeat:3.5,length:1}]}]};}
test('Hangul syllables and Latin words, heading removed',()=>assert.deepEqual(lyricUnits('[Verse 1]\n안녕 hello world!\n[Chorus]\n우리'),['안','녕','hello','world','우','리']));
test('notes sort and timestamp mapping, overflow count',()=>{const a=alignLyricNotes(project());assert.equal(a.cues.length,5);assert.equal(a.cues[0].lyric,'안');assert.equal(a.cues[4].lyric,'우');assert.equal(a.overflow,1);assert.equal(a.cues[1].endSec,1);});
test('missing lyrics are shown as placeholders',()=>{const p=project();p.lyrics='안';const a=alignLyricNotes(p);assert.equal(a.unfilled,4);assert.equal(a.cues[1].lyric,'—');});
test('stale source detection catches tempo, lyric and MIDI edits',()=>{const p=project(),a=alignLyricNotes(p);assert.equal(isAlignmentStale(p,a),false);p.bpm=150;assert.equal(isAlignmentStale(p,a),true);p.bpm=120;p.lyrics+=' 더';assert.equal(isAlignmentStale(p,a),true);});
test('invalid or unavailable MIDI rejected',()=>assert.throws(()=>alignLyricNotes({...project(),tracks:[]}),/MIDI/));
test('time range limitation rejects long songs',()=>{let p=project();p.tracks[0].midiNotes=[{pitch:60,startBeat:200,length:2}];assert.throws(()=>alignmentSource(p),/90초/);});
test('SRT contains time stamped written syllables not claimed phonemes',()=>assert.match(cuesToSrt(alignLyricNotes(project()).cues),/00:00:00,000 --> 00:00:00,500/));
test('ZIP manifest, SRT and MIDI generated; exported MIDI roundtrips',async()=>{
 const p=project(),a=alignLyricNotes(p);const result=await createVocalExchangePackage(p,a);
 const bytes=result.bytes;assert.equal(new TextDecoder().decode(bytes.slice(0,2)),'PK');
 assert.equal(result.manifest.engineStatus,'NOT_CONNECTED');assert.equal(result.manifest.cues.length,5);
 // Read uncompressed ZIP local headers without third-party ZIP dependencies.
 const files={};let at=0,view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 while(at<bytes.length&&view.getUint32(at,true)===0x04034b50){const n=view.getUint16(at+26,true),e=view.getUint16(at+28,true),len=view.getUint32(at+18,true);const name=new TextDecoder().decode(bytes.slice(at+30,at+30+n));files[name]=bytes.slice(at+30+n+e,at+30+n+e+len);at+=30+n+e+len;}
 assert.deepEqual(Object.keys(files),['manifest.json','melody.mid','lyrics.srt','README.txt']);
 assert.equal(JSON.parse(new TextDecoder().decode(files['manifest.json'])).format,'MYVOCAL_VOICE_INFERENCE_REQUEST');
 const midi=await parseMidiFile(new File([files['melody.mid']],'melody.mid'));assert.equal(midi.tracks[0].notes.length,5);
});
test('forbidden reference-only voice cannot be exported',async()=>{const p=project();await assert.rejects(createVocalExchangePackage(p,alignLyricNotes(p),{id:'v',rights:'reference'}),/권한/);});
test('foreign checkpoint rejected for model voice mismatch',async()=>{const p=project();await assert.rejects(createVocalExchangePackage(p,alignLyricNotes(p),{id:'v',rights:'self'},{id:'m',voiceId:'x'}),/서로 다릅니다/);});
test('changed project cannot export stale alignment',async()=>{const p=project(),a=alignLyricNotes(p);p.tracks[0].midiNotes[0].pitch=70;await assert.rejects(createVocalExchangePackage(p,a),/다시 생성/);});
test('imported WAV track starts at bar 1 with separate clip',()=>{const track=makeImportedVocalTrack(project(),{name:'sing.wav',size:44},'asset1',2.4);assert.equal(track.clips[0].startBar,1);assert.equal(track.clips[0].assetId,'asset1');assert.equal(track.type,'vocal');});
