import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createDancePlan,validateDancePlan,saveDancePlan,usableDancePlan,danceStatus,danceAt,dancePose,danceLines,parseDanceLines,danceReferences} from '../src/lib/characterDanceDirector.js';
import {calculateRigPose} from '../src/lib/character3dRenderer.js';
import {drawAnimationFrame} from '../src/lib/characterAnimation2d.js';
import {newProject} from '../src/lib/schema.js';
const asset={id:'avatar',role:'model',name:'person.vrm',type:'application/octet-stream'};
const reference={id:'movie',role:'motion-reference',name:'reference.mp4',type:'video/mp4',size:200};
const chr=()=>({id:'char88',name:'Dance Singer',rights:'owned',assets:[asset,reference],lipSync:{version:1,cues:[]},stage3d:{assetId:'avatar',duration:8}});
function prj(){const p=newProject({title:'dance',characterId:'char88'});p.bpm=120;p.genreMix=[{name:'Rock',weight:50},{name:'K-Pop',weight:50}];p.sections=[{id:'a',name:'Verse 1',bars:1},{id:'b',name:'Chorus',bars:4,genreMix:[{name:'EDM',weight:100}]}];return p;}
test('88 generates beat-aligned deterministic dance cues from MYVOCAL project sections/genre',()=>{
 const c=chr(),p=prj(),a=createDancePlan(c,p,{durationSec:8}),b=createDancePlan(c,p,{durationSec:8});
 assert.deepEqual(a,b);assert.equal(a.bpm,120);assert.deepEqual(a.sections.map(s=>s.startMs),[0,2000]);assert.equal(a.cues.length,4);assert.deepEqual(a.cues.map(s=>s.section),['Verse 1','Chorus','Chorus','Chorus']);
 assert.equal(a.cues[0].move,'bounce');assert.equal(a.cues[1].move,'wave');assert.ok(a.cues[2].strength>a.cues[0].strength);
 assert.equal(c.dance88,undefined);assert.equal(validateDancePlan(c,a),a);
});
test('88 plays different body poses over beats; cue edges blend and out-of-time is idle',()=>{
 const c=chr(),plan=createDancePlan(c,prj(),{durationSec:8});
 assert.equal(danceAt(plan,-1),null);assert.equal(danceAt(plan,8),null);
 const early=danceAt(plan,.05),late=danceAt(plan,.5);assert.ok(early.strength<late.strength);assert.notDeepEqual(dancePose(plan,.10),dancePose(plan,.25));
 assert.ok(dancePose(plan,2.5)?.angles.rightUpperArm!==0);assert.equal(dancePose(null,1),null);
});
test('88 user can hand-map reference video timing and gesture cues, no optical pose inference',()=>{
 const c=chr(),base=createDancePlan(c,null,{referenceAssetId:'movie'}),rows=danceLines(base).split('\n');rows[0]='0.000,2.000,wave,0.95,5.250';
 const edited=parseDanceLines(c,base,rows.join('\n'));assert.equal(edited.cues[0].referenceStartMs,5250);assert.equal(edited.cues[0].move,'wave');
 assert.equal(danceAt(edited,.5).referenceMs,5750);assert.equal(danceReferences(c)[0].id,'movie');assert.deepEqual(c.assets,[asset,reference]);
});
test('88 stage and cue bounds deny overlapping, invalid input, untrusted metadata, and missing reference',()=>{
 const c=chr(),plan=createDancePlan(c),bad=x=>assert.throws(()=>validateDancePlan(c,x));
 for(const row of ['0,1,evil,0.5,','0,0,step,0.5,','-1,1,step,0.5,','0,2,step,1.2,','0,2,step,NaN,','0,2,step,0.5,Infinity','0,2,step,0.5','0,2,step,0.5,\n1,3,step,0.5,'])assert.throws(()=>parseDanceLines(c,plan,row),row);
 bad({...plan,version:99});bad({...plan,bpm:Infinity});bad({...plan,durationMs:40000});bad({...plan,referenceAssetId:'nonexistent'});bad({...plan,cues:[{...plan.cues[0],startMs:-1}]});bad({...plan,cues:[{...plan.cues[0],referenceStartMs:100}]});bad({...plan,cues:Array.from({length:257},()=>plan.cues[0])});
 assert.throws(()=>createDancePlan({...c,rights:'reference'}),/허가/);assert.throws(()=>createDancePlan({...c,rights:'licensed',rightsNote:''}),/허가/);
 assert.throws(()=>createDancePlan(c,null,{bpm:0}));assert.throws(()=>createDancePlan(c,{...prj(),sections:[{name:'bad',bars:-3}]}));
 assert.equal(usableDancePlan({...c,dance88:{version:88}}),null);
});
test('88 saves alongside Step85/86/87 and older rig/stage, deleting video disables safely',()=>{
 const c={...chr(),expression87:{version:1,other:'old'},rig3d:{assetId:'avatar'},personLipSync:{videoAssetId:'movie'}},plan=createDancePlan(c,null,{referenceAssetId:'movie'});
 const saved=saveDancePlan(c,plan);assert.equal(danceStatus(saved),'STEP88 춤 계획 저장됨');assert.notEqual(saved,c);assert.deepEqual(saved.expression87,c.expression87);assert.deepEqual(saved.rig3d,c.rig3d);assert.deepEqual(saved.stage3d,c.stage3d);assert.deepEqual(saved.lipSync,c.lipSync);assert.deepEqual(saved.personLipSync,c.personLipSync);
 assert.equal(danceStatus({...saved,assets:[asset]}),'춤 계획 재검토 필요');assert.deepEqual(saved.dance88,plan);
});
test('88 3D humanoid rig bends arms, legs and hips, leaving source model immutable',()=>{
 const c=chr(),dance=createDancePlan(c,prj(),{durationSec:8});
 const names=['hips','spine','head','leftUpperArm','rightUpperArm','leftLowerArm','rightLowerArm','leftUpperLeg','rightUpperLeg'];
 const nodes=names.map((name,index)=>({index,translation:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1],weights:[],matrix:null}));
 const model={nodes,parents:names.map(()=>-1),primitives:[],skins:[],animations:[],vrm:{bones:Object.fromEntries(names.map((n,i)=>[n,i]))}};
 const settings={speed:1,motion:'idle',animation:'',boneName:'',boneDegrees:0};
 const old=calculateRigPose(model,settings,.25),next=calculateRigPose(model,settings,.25,dance);
 assert.notDeepEqual(next.locals[3].rotation,old.locals[3].rotation);assert.notDeepEqual(next.locals[0].translation,old.locals[0].translation);assert.deepEqual(model.nodes[0].translation,[0,0,0]);
});
test('88 2D canvas body and face motion changes beat-synchronized image transforms',()=>{
 const c={...chr(),layerPlan:{reviewed:true}},plan=createDancePlan(c,null,{durationSec:8}),image={naturalWidth:200,naturalHeight:200};
 const layers={width:200,height:200,parts:{body:{enabled:true,x:0,y:0,w:200,h:200},hair:{enabled:false},face:{enabled:true,x:40,y:40,w:120,h:90,pivotX:.5,pivotY:.4},leftEye:{enabled:false},rightEye:{enabled:false},mouth:{enabled:false}}};
 const cfg={durationSec:8,expression:'neutral',headDegrees:0,bodyPixels:0,hairDegrees:0,blinkRate:0,mouthRate:0,mouthStrength:0,cameraZoom:0,cameraPan:0};
 const ops=[];const ctx=new Proxy({},{get:(_,key)=>()=>ops.push(key),set:()=>true});
 drawAnimationFrame(ctx,image,layers,cfg,.25,200,200,null,null,c,plan);const withDance=ops.filter(x=>x==='drawImage').length;ops.length=0;drawAnimationFrame(ctx,image,layers,cfg,.25,200,200);const old=ops.filter(x=>x==='drawImage').length;assert.ok(withDance>old);
});
test('88 project portable backup maps reference asset ID while preserving dance plan and original inputs',async()=>{
 const {importProjectBundle}=await import('../src/lib/projectBundle.js');const c=chr(),project=prj();c.dance88=createDancePlan(c,project,{referenceAssetId:'movie'});
 const payload={format:'MYVOCAL_PROJECT_BACKUP',formatVersion:2,project,profiles:{voices:[],characters:[c]},assets:{movie:{name:'reference.mp4',type:'video/mp4',dataUrl:'data:video/mp4;base64,'+Buffer.from('video').toString('base64')},avatar:{name:'person.vrm',type:'application/octet-stream',dataUrl:'data:application/octet-stream;base64,'+Buffer.from('model').toString('base64')}}};
 const old=globalThis.indexedDB;globalThis.indexedDB={open:()=>{const req={};queueMicrotask(()=>{req.result={close(){},transaction(){const tx={objectStore(){return {add(){queueMicrotask(()=>tx.oncomplete?.());}}}};return tx;}};req.onsuccess?.();});return req;}};
 try{const restored=await importProjectBundle(new File([JSON.stringify(payload)],'test.json',{type:'application/json'})),r=restored.characters[0];assert.equal(restored.project.characterId,r.id);assert.notEqual(r.assets.find(a=>a.role==='motion-reference').id,'movie');assert.equal(r.dance88.referenceAssetId,r.assets.find(a=>a.role==='motion-reference').id);assert.ok(usableDancePlan(r));assert.deepEqual(r.lipSync,c.lipSync);}
 finally{globalThis.indexedDB=old;}
});
test('88 stage and standalone editors consume the same saved dance plan, preserve Step87 and Step86 UI',()=>{
 const read=n=>fs.readFileSync(new URL('../src/'+n,import.meta.url),'utf8');
 for(const x of ['components/CharacterStage3dEditor.jsx','components/Character3dEditor.jsx','components/CharacterAnimationEditor.jsx'])assert.match(read(x),/usableDancePlan/);
 assert.match(read('lib/character3dRenderer.js'),/calculateRigPose\(model,settings,time,dancePlan\)/);
 assert.match(read('pages/Characters.jsx'),/STEP88 · AI Dance Director/);
 assert.match(read('pages/Characters.jsx'),/STEP87 · AI 표정 연출/);
 assert.match(read('pages/Characters.jsx'),/STEP86 · 실제 사람 Lip Sync/);
});
