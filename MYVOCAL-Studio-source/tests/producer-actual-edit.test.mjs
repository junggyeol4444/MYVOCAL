import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject} from '../src/lib/schema.js';
import {planCreateSongVideo97,applyCreateSongVideo97} from '../src/lib/createSongVideo97.js';
import {applyProducerCommand,PRODUCER_COMMAND_EXAMPLES} from '../src/lib/producerCommands.js';

function preparedSong(){
 const blank=newProject({title:'다시 만난 친구',prompt:'다시 만나는 밤, 마지막 후렴은 웅장하게',genre:'Rock'});
 const plan=planCreateSongVideo97(blank,{lyrics:true,composition:true,arrangement:true,storyboard:true,singing:true,musicVideo:true});
 return applyCreateSongVideo97(blank,plan);
}
function sectionWindow(project,find){
 let start=0;
 for(const section of project.sections){
  const end=start+section.bars*4;
  if(find(section))return [start,end];
  start=end;
 }
 throw new Error('section absent');
}
test('one-click creation provides playable/editable music and storyboard, without falsely claiming AI models',()=>{
 const project=preparedSong();
 assert.ok(project.lyrics.includes('[Chorus]'));
 assert.ok(project.tracks.some(t=>t.generatedBy==='composer-v04'&&t.midiNotes?.length));
 assert.ok(project.tracks.some(t=>t.instrument==='drums'&&t.midiNotes?.length));
 assert.ok(project.chords.length>4);
 assert.equal(project.scenes.length,6);
 assert.equal(project.createPipeline97.tasks.find(t=>t.key==='singing').status,'requires-local-model');
 assert.equal(project.createPipeline97.tasks.find(t=>t.key==='musicVideo').status,'requires-local-model');
});
test('last chorus half-step edits pitched MIDI and matching chord symbols but not drums or other song sections',()=>{
 const before=preparedSong(),unchanged=JSON.stringify(before);
 const [start,end]=sectionWindow(before,s=>/Final Chorus/i.test(s.name));
 const result=applyProducerCommand(before,'마지막 후렴만 반키 올려줘');
 assert.ok(result.changed>0);assert.match(result.response,/반음/);
 for(let i=0;i<before.tracks.length;i++){
  const a=before.tracks[i],b=result.project.tracks[i];
  for(let j=0;j<(a.midiNotes||[]).length;j++){
   const old=a.midiNotes[j],next=b.midiNotes[j];
   assert.equal(next.pitch,old.pitch+((a.instrument!=='drums'&&a.type!=='rhythm'&&old.startBeat>=start&&old.startBeat<end)?1:0));
  }
 }
 for(let i=0;i<before.chords.length;i++){
  const a=before.chords[i],b=result.project.chords[i];
  if(a.bar-1>=start/4&&a.bar+a.bars-1<=end/4)assert.notEqual(b.symbol,a.symbol);
  else assert.equal(b.symbol,a.symbol);
 }
 assert.equal(JSON.stringify(before),unchanged,'source project must not be mutated');
});
test('drum strengthening changes velocity only in chorus, retaining pitched tracks and original audio clips',()=>{
 const p=preparedSong();const [,]=PRODUCER_COMMAND_EXAMPLES;
 p.tracks[0].clips.push({id:'c1',assetId:'original-rec-1',durationSec:12});
 const result=applyProducerCommand(p,'드럼 강화하기');
 assert.ok(result.changed>0);
 assert.equal(result.project.tracks[0].clips[0].assetId,'original-rec-1');
 const chorusWindows=[];let start=0;for(const s of p.sections){const end=start+s.bars*4;if(/Chorus/i.test(s.name))chorusWindows.push([start,end]);start=end;}
 for(let i=0;i<p.tracks.length;i++){
  const a=p.tracks[i],b=result.project.tracks[i];
  for(let j=0;j<(a.midiNotes||[]).length;j++){
   const x=a.midiNotes[j],y=b.midiNotes[j],inside=chorusWindows.some(([lo,hi])=>x.startBeat>=lo&&x.startBeat<hi);
   const expected=inside&&(a.instrument==='drums'||a.type==='rhythm')?Math.min(127,x.velocity+18):x.velocity;
   assert.equal(y.velocity,expected);
   assert.equal(y.pitch,x.pitch);
  }
 }
});
test('chorus energy command changes only chorus MIDI and rejects unsupported natural language rather than claiming success',()=>{
 const p=preparedSong();
 const result=applyProducerCommand(p,'후렴을 더 웅장하게');
 assert.ok(result.changed>0);
 assert.ok(result.project.tracks.some((t,i)=>(t.midiNotes||[]).some((n,j)=>n.velocity!==p.tracks[i].midiNotes[j].velocity)));
 assert.throws(()=>applyProducerCommand(p,'내 목소리 AI 학습 완료해 줘'),/지원하지 않는/);
 assert.throws(()=>applyProducerCommand(newProject(),'마지막 후렴만 반키 올려줘'),/음표/);
});
test('all three proposed Producer quick actions are executable on generated song',()=>{
 const p=preparedSong();
 for(const command of PRODUCER_COMMAND_EXAMPLES){
  const result=applyProducerCommand(p,command);
  assert.ok(result.changed>0,command);
 }
});
