import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject} from '../src/lib/schema.js';
import {planCreateSongVideo97,applyCreateSongVideo97} from '../src/lib/createSongVideo97.js';
import {alignmentSource,isAlignmentStale} from '../src/lib/lyricAlignment.js';
import {projectPreviewNotes} from '../src/lib/localVocalSampler.js';
import {renderOfflineVocalGuideSelection} from '../src/lib/offlineVocalGuide.js';
const made=()=>{const p=newProject({title:'MYVOCAL song',prompt:'친구를 다시 만나는 노래'});return applyCreateSongVideo97(p,planCreateSongVideo97(p,{lyrics:true,composition:true,arrangement:true,storyboard:true}));};
test('song creation uses lead melody rather than chord track for lyric sync',()=>{const p=made(),lead=p.tracks.find(t=>t.composerRole==='melody');assert.equal(p.vocalAlignment.trackId,lead.id);assert.equal(alignmentSource(p).track.id,lead.id);assert.equal(isAlignmentStale(p,p.vocalAlignment),false);assert.deepEqual(projectPreviewNotes(p),alignmentSource(p).notes);});
test('fresh song emits audible, correctly positioned vocal guide WAV',async()=>{const p=made(),alignment=p.vocalAlignment;const result=renderOfflineVocalGuideSelection(alignment,null,1,1);assert.ok(result.blob.size>44);assert.equal(result.rendered,1);const bytes=new Uint8Array(await result.blob.arrayBuffer());assert.equal(String.fromCharCode(...bytes.slice(0,4)),'RIFF');assert.ok(bytes.slice(44).some(v=>v!==0));});

test('authored vocal notes take priority and explicit user choice remains available',async()=>{
 const p=made(),lead=p.tracks.find(t=>t.composerRole==='melody'),base=p.tracks[0];
 const manual={...base,midiNotes:[{pitch:72,startBeat:0,length:1,velocity:92}]};
 const changed={...p,tracks:p.tracks.map(t=>t.id===base.id?manual:t)};
 const {alignLyricNotes}=await import('../src/lib/lyricAlignment.js');
 assert.equal(alignLyricNotes(changed).trackId,manual.id);
 assert.equal(alignLyricNotes(changed,lead.id).trackId,lead.id);
 assert.equal(alignLyricNotes(changed,lead.id).cues.length,lead.midiNotes.length);
});
test('a user-edited lead invalidates outdated cues without overwriting the source project',()=>{
 const p=made(),snapshot=structuredClone(p);
 const changed={...p,tracks:p.tracks.map(t=>t.composerRole==='melody'?{...t,midiNotes:t.midiNotes.map((n,i)=>i===0?{...n,pitch:n.pitch+1}:n)}:t)};
 assert.equal(isAlignmentStale(changed,p.vocalAlignment),true);
 assert.equal(isAlignmentStale(p,p.vocalAlignment),false);
 assert.deepEqual(p,snapshot);
});
test('existing handwritten sync and media survive newly composed arrangement',()=>{
 const old=newProject({voiceId:'my-voice',characterId:'my-character'});
 old.tracks[0].clips=[{id:'sample',assetId:'user-audio',startBar:1}];
 old.scenes[0].imageAssetId='user-photo';
 old.vocalAlignment={projectId:old.id,sourceKey:'handwritten'};
 const p=applyCreateSongVideo97(old,planCreateSongVideo97(old,{lyrics:true,composition:true,arrangement:true}));
 assert.equal(p.vocalAlignment,old.vocalAlignment);
 assert.deepEqual(p.tracks[0].clips,old.tracks[0].clips);
 assert.deepEqual(p.scenes,old.scenes);
 assert.equal(p.voiceId,old.voiceId);
 assert.equal(p.characterId,old.characterId);
});
