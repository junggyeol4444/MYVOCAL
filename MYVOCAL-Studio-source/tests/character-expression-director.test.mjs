import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseLipSyncLines} from '../src/lib/characterLipSync.js';
import {detectLyricEmotion,expressionSourceSignature,createExpressionPlan,validateExpressionPlan,saveExpressionPlan,parseExpressionLines,expressionLines,expressionAt,usableExpressionPlan,expressionPlanStatus} from '../src/lib/characterExpressionDirector.js';
import {drawAnimationFrame,animationPose} from '../src/lib/characterAnimation2d.js';
const character=()=>({id:'char87',name:'Singer',rights:'owned',lipSync:parseLipSyncLines('0,0.3,ㅁ,사랑\n0.3,1,ㅏ,사랑\n1,2,ㅣ,눈물\n2.2,3.2,ㅏ,노래')});

test('87 reads existing Step85 lyrics and keeps the old profile untouched until save',()=>{
 const c=character(),plan=createExpressionPlan(c);assert.equal(c.expression87,undefined);assert.equal(plan.cues.length,3);assert.deepEqual(plan.cues.map(x=>x.startMs),[0,1000,2200]);assert.equal(plan.sourceSignature,expressionSourceSignature(c.lipSync));
 const saved=saveExpressionPlan(c,plan);assert.deepEqual(saved.lipSync,c.lipSync);assert.equal(saved.expression87.cues.length,3);assert.equal(usableExpressionPlan(saved),saved.expression87);assert.equal(expressionPlanStatus(saved),'표정 연출 저장됨');assert.notEqual(saved,c);
});
test('87 local, deterministic lyric emotion heuristic covers Korean and English',()=>{
 for(const [lyric,emotion] of [['사랑해','happy'],['눈물이 흐른다','sad'],['화나서','angry'],['갑자기 놀라','surprised'],['고요한 바다','relaxed'],['la la la','neutral'],['love you','happy']])assert.equal(detectLyricEmotion(lyric),emotion);
 const c=character(),plan=createExpressionPlan(c);assert.equal(expressionAt(c,plan,.5).expression,'happy');assert.equal(expressionAt(c,plan,1.5).expression,'sad');assert.equal(expressionAt(c,plan,2.05),null);assert.equal(expressionAt(c,plan,3.2),null);
});
test('87 user supplied vocal dynamics and song energy drive intensity and neutral fallback',()=>{
 const c=character(),plan=createExpressionPlan(c);let line=expressionLines(plan).split('\n');line[2]='2.200,3.200,auto,0.10,0.95';let changed=parseExpressionLines(c,line.join('\n'));
 assert.equal(expressionAt(c,changed,2.7).expression,'surprised');assert.equal(expressionAt(c,changed,2.7).source,'가사 규칙 분석');
 const strong=expressionAt(c,changed,.5).weight;changed.cues[0].dynamics=0;changed.cues[0].energy=0;assert.ok(expressionAt(c,changed,.5).weight<strong);
 changed.cues[2].energy=.1;assert.equal(expressionAt(c,changed,2.7).expression,'relaxed');
});
test('87 manual mood override and eased boundaries; neutral cannot invent mood',()=>{
 const c=character(),plan=createExpressionPlan(c);plan.cues[0].emotion='angry';let mid=expressionAt(c,plan,.5);assert.equal(mid.expression,'angry');assert.equal(mid.source,'수동 지정');assert.ok(mid.weight>.5);assert.equal(expressionAt(c,plan,0).weight,0);assert.ok(expressionAt(c,plan,.05).weight<mid.weight);
 plan.cues[0].emotion='neutral';assert.equal(expressionAt(c,plan,.5).weight,0);
});
test('87 rejects malformed or overlapping segments, invalid time and out-of-range dynamics',()=>{
 const c=character(),valid=createExpressionPlan(c);
 for(const row of ['0,1,auto,0.5,2','0,1,hacked,0.5,0.5','-1,1,auto,0.5,0.5','0,0,auto,0.5,0.5','0,Infinity,auto,0.5,0.5','0,1,auto,NaN,0.5','0,1,auto,0.5','0,1,auto,0.5,0.5\n0.5,2,sad,0.5,0.5'])assert.throws(()=>parseExpressionLines(c,row),row);
 for(const bad of [{...valid,version:20},{...valid,sourceSignature:'corrupt'},{...valid,cues:Array.from({length:2001},()=>valid.cues[0])},{...valid,cues:[{...valid.cues[0],startMs:1.5}]},{...valid,cues:[{...valid.cues[0],energy:-.2}]}])assert.throws(()=>validateExpressionPlan(c,bad));
 assert.throws(()=>createExpressionPlan({...c,lipSync:null}));
 assert.throws(()=>saveExpressionPlan({...c,rights:'reference'},valid),/허가/);
 assert.throws(()=>saveExpressionPlan({...c,rights:'licensed',rightsNote:''},valid),/허가/);
 assert.doesNotThrow(()=>saveExpressionPlan({...c,rights:'licensed',rightsNote:'사용 동의서 확인'},valid));
 assert.equal(expressionAt({...c,lipSync:null},valid,.5),null);
});
test('87 stale lyric edits disable expressions without losing original plan or older assets',()=>{
 const c=character(),saved=saveExpressionPlan(c,createExpressionPlan(c));const replaced={...saved,lipSync:parseLipSyncLines('0,1,a,다른가사')};assert.equal(usableExpressionPlan(replaced),null);assert.equal(expressionPlanStatus(replaced),'가사 변경 / 표정 계획 재검토 필요');assert.equal(expressionAt(replaced,saved.expression87,.5),null);assert.deepEqual(saved.lipSync,c.lipSync);
 assert.equal(usableExpressionPlan({...c,expression87:{version:1,cues:'bad'}}),null);
});
test('87 2D canvas expression varies over song time while preserving lip visemes and manual settings',()=>{
 const c=character(),directed=createExpressionPlan(c);const plan={width:200,height:200,parts:{body:{enabled:false},hair:{enabled:false},face:{enabled:false},leftEye:{enabled:true,x:35,y:55,w:35,h:15},rightEye:{enabled:true,x:120,y:55,w:35,h:15},mouth:{enabled:true,x:80,y:130,w:40,h:20}}};
 const image={naturalWidth:200,naturalHeight:200},config={durationSec:4,expression:'neutral',headDegrees:0,bodyPixels:0,hairDegrees:0,blinkRate:0,mouthRate:0,mouthStrength:0,cameraZoom:0,cameraPan:0};
 const ops=[];const ctx=new Proxy({}, {set(){return true;},get(t,key){if(key==='canvas')return {};return (...args)=>{ops.push([key,...args]);};}});
 drawAnimationFrame(ctx,image,plan,config,.5,200,200,c.lipSync,directed,c);const happy=ops.filter(x=>x[0]==='quadraticCurveTo').length;assert.ok(happy>=2,'happy eyebrow curves');assert.equal(ops.filter(x=>x[0]==='stroke').length,2,'singing viseme keeps mouth; eyebrows signal emotion');
 ops.length=0;drawAnimationFrame(ctx,image,plan,config,1.5,200,200,c.lipSync,directed,c);assert.equal(ops.filter(x=>x[0]==='quadraticCurveTo').length,0,'sad brow uses line');
 assert.equal(config.expression,'neutral');assert.ok(animationPose(.5,config));
});
test('87 references are integrated in stage, 3D renderer, 2D editor, character studio and not person lip',()=>{
 const f=n=>fs.readFileSync(new URL('../src/'+n,import.meta.url),'utf8');
 for(const n of ['components/Character3dEditor.jsx','components/CharacterStage3dEditor.jsx','components/CharacterAnimationEditor.jsx'])assert.match(f(n),/usableExpressionPlan/);
 assert.match(f('lib/character3dRenderer.js'),/expressionAt\(character,expressionPlan,time\)/);
 assert.match(f('pages/Characters.jsx'),/STEP87 · AI 표정 연출/);
 assert.match(f('pages/Characters.jsx'),/PersonLipSyncEditor/);
 assert.match(f('components/CharacterStage3dEditor.jsx'),/recordStageWebM/);
 assert.match(f('lib/projectBundle.js'),/if\(result\.personLipSync\)/);
});
test('87 project backup/restore keeps expression time plan, Step85 lip cues and Step86 media IDs',async()=>{
 const {importProjectBundle}=await import('../src/lib/projectBundle.js');const {newProject}=await import('../src/lib/schema.js');
 const c={...character(),assets:[{id:'portrait',name:'pic.png',type:'image/png'}],personLipSync:undefined};const saved=saveExpressionPlan(c,createExpressionPlan(c));const project=newProject();project.characterId=c.id;
 const payload={format:'MYVOCAL_PROJECT_BACKUP',formatVersion:2,project,profiles:{voices:[],characters:[saved]},assets:{portrait:{name:'pic.png',type:'image/png',dataUrl:'data:image/png;base64,'+Buffer.from('test').toString('base64')}}};
 const old=globalThis.indexedDB;globalThis.indexedDB={open:()=>{const req={};queueMicrotask(()=>{req.result={close(){},transaction(){const tx={objectStore(){return {add(){queueMicrotask(()=>tx.oncomplete?.());}}}};return tx;}};req.onsuccess?.();});return req;}};
 try{const restored=await importProjectBundle(new File([JSON.stringify(payload)],'demo.json',{type:'application/json'})),profile=restored.characters[0];assert.notEqual(profile.assets[0].id,'portrait');assert.deepEqual(profile.lipSync,saved.lipSync);assert.deepEqual(profile.expression87,saved.expression87);assert.equal(usableExpressionPlan(profile),profile.expression87);assert.equal(restored.project.characterId,profile.id);}
 finally{globalThis.indexedDB=old;}
});
test('87 WebGL renderer morph vertices follow saved mood timeline, with old manual fallback',async()=>{
 const {Character3dRenderer}=await import('../src/lib/character3dRenderer.js');
 const c=character(),plan=createExpressionPlan(c),buffers=[];let index=0;
 const gl=new Proxy({}, {get(target,key){if(key==='getShaderParameter'||key==='getProgramParameter')return ()=>true;if(key==='getAttribLocation')return (_,name)=>({pos:0,uv:1,shade:2}[name]);if(key==='getUniformLocation')return (_,name)=>name;if(['createShader','createProgram','createBuffer'].includes(key))return ()=>({id:++index});if(key==='getExtension')return ()=>true;if(key==='bufferSubData')return (_,__,data)=>buffers.push(Array.from(data));if(typeof key==='string'&&/^[A-Z0-9_]+$/.test(key))return ++index;return ()=>{};}});
 const canvas={width:640,height:360,getContext:()=>gl};
 const model={nodes:[{index:0,translation:[0,0,0],rotation:[0,0,0,1],scale:[1,1,1],weights:[0],skin:null,matrix:null}],parents:[-1],skins:[],animations:[],vrm:{bones:{},expressions:{happy:[{node:0,index:0,weight:1}]}},textures:[],images:[],primitives:[{node:0,mesh:0,position:new Float32Array([0,0,0,1,0,0,0,1,0]),indices:[0,1,2],uv:null,weights:[0],targets:[new Float32Array([.4,0,0,.4,0,0,.4,0,0])],joints:null,jointWeights:null,material:{color:[1,1,1,1],texture:-1,doubleSided:true},mode:4}]};
 const rig={yaw:0,pitch:0,motion:'idle',speed:1,expression:'neutral',expressionWeight:1};const renderer=new Character3dRenderer(canvas,model);
 renderer.render(rig,.5);const manual=buffers.at(-1)[0];renderer.render(rig,.5,null,c.lipSync,plan,c);const happy=buffers.at(-1)[0];assert.ok(happy>manual+.15,'3D happy morph changes actual GPU vertex data');
 renderer.render(rig,1.5,null,c.lipSync,plan,c);assert.equal(buffers.at(-1)[0],manual,'model without sad morph falls back to original vertex');renderer.dispose();
});
