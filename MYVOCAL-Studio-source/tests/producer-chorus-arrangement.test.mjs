import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject} from '../src/lib/schema.js';
import {generateOfflineDraft,applyComposition} from '../src/lib/composer.js';
import {applyProducerCommand,PRODUCER_COMMAND_EXAMPLES} from '../src/lib/producerCommands.js';

function song(){
 const p=newProject({title:'나의 창작 노래',voiceId:'my-voice',characterId:'my-character',withVideo:true});
 p.tracks[0].clips=[{id:'recording',assetId:'my-original-recording',startBar:1,durationSec:8}];
 p.scenes[0].imageAssetId='my-original-photo';
 return applyComposition(p,generateOfflineDraft({title:p.title,prompt:'오랫동안 헤어졌던 친구를 다시 만남',genre:'Rock',key:'G Major',bars:24}));
}
function role(t){return t.composerRole||t.name?.replace('Composer · ','').toLowerCase();}
function windows(p){
 let start=0,win=[];
 for(const s of p.sections){
  const end=start+s.bars*4;
  if(/Chorus|후렴/i.test(s.name))win.push([start,end]);
  start=end;
 }
 return win;
}
function inChorus(n,ranges){return ranges.some(([a,b])=>n.startBeat>=a&&n.startBeat<b);}
function trackByRole(p,r){return p.tracks.find(t=>role(t)===r);}
function differences(before,after,r){
 const a=trackByRole(before,r),b=trackByRole(after,r);
 assert.ok(a&&b);
 const byId=new Map(b.midiNotes.map(n=>[n.id,n]));
 const changed=a.midiNotes.filter(n=>JSON.stringify(n)!==JSON.stringify(byId.get(n.id)));
 const added=b.midiNotes.filter(n=>!a.midiNotes.some(x=>x.id===n.id));
 return {a,b,changed,added};
}
test('§11 후렴이 심심해 changes melody/drums/bass and adds real harmony/strings notes',()=>{
 const p=song(),snapshot=structuredClone(p),ranges=windows(p);
 const result=applyProducerCommand(p,'후렴이 심심해.');
 assert.ok(result.changed>0);assert.equal(result.kind,'chorus-arrangement-11');
 assert.deepEqual(Object.keys(result.counts),['melody','drums','bass','harmony','strings']);
 for(const [r,num] of Object.entries(result.counts))assert.ok(num>0,r);
 for(const r of ['melody','bass','drums']){
  const {changed,added}=differences(p,result.project,r);
  assert.ok(changed.length>0,r);
  assert.ok(changed.every(n=>inChorus(n,ranges)),r+' only modifies chorus notes');
  assert.equal(added.length,0);
 }
 for(const r of ['harmony','strings']){
  const {added}=differences(p,result.project,r);
  assert.ok(added.length>0,r+' must add playable MIDI');
  assert.ok(added.every(n=>inChorus(n,ranges)&&n.pitch>=0&&n.pitch<=127&&n.length>0));
 }
 assert.deepEqual(p,snapshot,'original project was modified');
 assert.deepEqual(result.project.scenes,p.scenes);
 assert.deepEqual(result.project.tracks[0].clips,p.tracks[0].clips);
 assert.equal(result.project.voiceId,p.voiceId);
 assert.equal(result.project.characterId,p.characterId);
});
test('all original quick actions work, not just chat replies',()=>{
 const p=song();
 for(const cmd of PRODUCER_COMMAND_EXAMPLES){
  const r=applyProducerCommand(p,cmd);
  assert.ok(r.changed>0,cmd);
  assert.notDeepEqual(r.project.tracks,p.tracks);
 }
});
test('individual melody, bass, harmony and string commands edit only the selected composer part',()=>{
 const p=song();
 const phrases={melody:'후렴 멜로디 바꿔줘',bass:'후렴 베이스 강화',harmony:'화음 추가',strings:'스트링 추가'};
 for(const [target,command] of Object.entries(phrases)){
  const r=applyProducerCommand(p,command);
  assert.deepEqual(Object.keys(r.counts),[target]);
  assert.ok(r.counts[target]>0);
  assert.notDeepEqual(trackByRole(r.project,target).midiNotes,trackByRole(p,target).midiNotes);
  for(const t of p.tracks){
   if(role(t)===target)continue;
   assert.deepEqual(r.project.tracks.find(v=>v.id===t.id),t,`unexpected change to ${role(t)}`);
  }
 }
});
test('Composer role survives user renaming, protecting unrelated hand-made instruments',()=>{
 const p=song();
 p.tracks=p.tracks.map(t=>t.composerRole==='harmony'?{...t,name:'내가 직접 이름 바꾼 화음 트랙'}:t);
 const r=applyProducerCommand(p,'화음 추가');
 assert.ok(r.changed>0);
 assert.equal(r.project.tracks.find(t=>t.composerRole==='harmony').name,'내가 직접 이름 바꾼 화음 트랙');
 assert.equal(r.project.tracks[0],p.tracks[0],'manual track is same object');
});
test('repeat harmony and strings commands never create colliding MIDI note IDs',()=>{
 let p=song();
 for(const cmd of ['화음 추가','스트링 추가','후렴이 심심해','후렴이 심심해']){
  const r=applyProducerCommand(p,cmd);
  for(const t of r.project.tracks){
   if(!['harmony','strings'].includes(role(t)))continue;
   const ids=t.midiNotes.map(n=>n.id);
   assert.equal(new Set(ids).size,ids.length,role(t)+' duplicate IDs');
  }
  p=r.project;
 }
});
test('legacy four-part songs and uncreated projects fail safely instead of claiming model edits',()=>{
 const p=song(),old={...p,tracks:p.tracks.filter(t=>t.composerRole!=='harmony')};
 assert.throws(()=>applyProducerCommand(old,'후렴이 심심해'),/harmony/);
 assert.throws(()=>applyProducerCommand(newProject(),'후렴이 심심해'),/자동 작곡 트랙/);
 assert.throws(()=>applyProducerCommand(p,'오디오 녹음 목소리를 학습해줘'),/지원하지 않는/);
 assert.equal(old.tracks.length,p.tracks.length-1);
});
