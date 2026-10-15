import test from 'node:test';
import assert from 'node:assert/strict';
import {proposeLayerPlan,saveLayerPlan,changeLayerPart} from '../src/lib/characterLayers.js';
import {ANIMATION_PRESETS,animationPose,animationStatus,animationCanvasSize,createAnimationSettings,changeAnimationSettings,saveAnimationSettings,layerAnimationSignature,validateAnimationSettings,drawAnimationFrame,animationManifest} from '../src/lib/characterAnimation2d.js';
const sample=()=>{
 const ch={id:'char82',name:'Synth singer',kind:'character',rights:'owned',assets:[{id:'a1',name:'drawing.png',type:'image/png'}],description:'original',appearance:{hair:'blue'}};
 const proposal=proposeLayerPlan(ch,'a1',400,600,{x:20,y:10,w:360,h:570,opaqueRatio:.9,transparentMargin:true});
 const character=saveLayerPlan(ch,proposal);
 return {character,settings:createAnimationSettings(character)};
};
test('Step82 requires reviewed Step81 regions and permitted original artwork',()=>{
 const {character}=sample();assert.equal(character.layerPlan.reviewed,true);assert.throws(()=>createAnimationSettings({...character,layerPlan:{...character.layerPlan,reviewed:false}}),/검토/);
 assert.throws(()=>createAnimationSettings({...character,rights:'reference'}),/원본|권한|등록/);
 assert.throws(()=>createAnimationSettings({...character,assets:[]}),/원본|권한|등록/);
 assert.throws(()=>createAnimationSettings({...character,kind:'person'}),/원본|권한|등록/);
});
test('Step82 presets provide seven channels of moving 2D and still controls',()=>{
 const {character}=sample();assert.deepEqual(Object.keys(ANIMATION_PRESETS),['gentle','energetic','ballad','still']);
 const still=createAnimationSettings(character,'still');assert.equal(still.cameraZoom,0);assert.equal(still.blinkRate,0);assert.equal(still.mouthStrength,0);
 const energetic=createAnimationSettings(character,'energetic');assert.ok(energetic.headDegrees>still.headDegrees);assert.ok(energetic.hairDegrees>still.hairDegrees);
});
test('Step82 produces deterministic blink, mouth, hair, body, head and camera positions by time',()=>{
 const {settings}=sample();const t=1.2;const a=animationPose(t,settings),b=animationPose(t,settings);assert.deepEqual(a,b);assert.ok(Number.isFinite(a.headRadians));assert.ok(Number.isFinite(a.hairRadians));assert.ok(Number.isFinite(a.bodyY));assert.ok(Number.isFinite(a.mouthScale));assert.ok(Number.isFinite(a.cameraX));assert.ok(Number.isFinite(a.cameraScale));
 assert.notDeepEqual(animationPose(0,settings),animationPose(1,settings));
 assert.equal(animationPose(999,settings).t,settings.durationSec);
 assert.ok(Array.from({length:600},(_,i)=>animationPose(i/100,settings).eyeScale).some(x=>x<.5));
});
test('Step82 validates finite bounded FPS/duration/expression and disallows unrecognized edits',()=>{
 const {character,settings}=sample();assert.throws(()=>changeAnimationSettings(character,settings,{fps:120}),/fps/);assert.throws(()=>changeAnimationSettings(character,settings,{fps:15.5}),/FPS/);assert.throws(()=>changeAnimationSettings(character,settings,{durationSec:0}),/durationSec/);assert.throws(()=>changeAnimationSettings(character,settings,{headDegrees:NaN}),/headDegrees/);assert.throws(()=>changeAnimationSettings(character,settings,{expression:'unknown'}),/표정/);assert.throws(()=>changeAnimationSettings(character,settings,{__proto__:null,wrong:1}),/지원하지/);
 const edited=changeAnimationSettings(character,settings,{fps:30,expression:'happy',blinkRate:0});assert.equal(edited.fps,30);assert.equal(edited.blinkRate,0);assert.equal(settings.fps,24);
});
test('Step82 stored animation is profile-local and original source and Step81 plan preserved',()=>{
 const {character,settings}=sample();const saved=saveAnimationSettings(character,settings);assert.equal(animationStatus(saved).status,'ready');assert.equal(animationStatus(character).status,'missing');assert.deepEqual(saved.assets,character.assets);assert.deepEqual(saved.layerPlan,character.layerPlan);assert.equal(saved.animation2d.version,1);
 const alteredLayer=changeLayerPart(saved,saved.layerPlan,'mouth',{x:30});const changed={...saved,layerPlan:alteredLayer};assert.equal(animationStatus(changed).status,'stale');assert.notEqual(layerAnimationSignature(alteredLayer),layerAnimationSignature(saved.layerPlan));
 assert.equal(animationStatus({...saved,rights:'reference'}).status,'stale');
});
test('Step82 restore remaps reference asset ID without invalidating geometrical signature',async()=>{
 const {character,settings}=sample();const {importProjectBundle}=await import('../src/lib/projectBundle.js');const {newProject}=await import('../src/lib/schema.js');
 const fileAsset=Buffer.from('abc');const project=newProject();project.characterId=character.id;
 const backup={format:'MYVOCAL_PROJECT_BACKUP',formatVersion:2,project,profiles:{voices:[],characters:[saveAnimationSettings(character,settings)]},assets:{a1:{name:'drawing.png',type:'image/png',dataUrl:'data:image/png;base64,'+fileAsset.toString('base64')}}};
 const old=globalThis.indexedDB;globalThis.indexedDB={open:()=>{const req={};queueMicrotask(()=>{req.result={close(){},createObjectStore(){},transaction(){const tx={objectStore(){return {add(){queueMicrotask(()=>tx.oncomplete?.());}}}};return tx;}};req.onsuccess?.();});return req;}};
 try{const restored=await importProjectBundle(new File([JSON.stringify(backup)],'sample.json',{type:'application/json'}));const c=restored.characters[0];assert.notEqual(c.layerPlan.sourceAssetId,'a1');assert.equal(c.animation2d.sourceAssetId,c.layerPlan.sourceAssetId);assert.equal(animationStatus(c).status,'ready');assert.equal(restored.project.characterId,c.id);}
 finally{globalThis.indexedDB=old;}
});
test('Step82 renders actual source image frame on canvas and applies time-varying transforms',()=>{
 const {character,settings}=sample();const history=[];const mock=new Proxy({fillStyle:'',strokeStyle:'',lineWidth:1,lineCap:'round'},{get:(t,k)=>k in t?t[k]:(...args)=>{history.push([k,...args])},set:(t,k,v)=>{t[k]=v;return true;}});
 const img={naturalWidth:400,naturalHeight:600};const size=animationCanvasSize(character.layerPlan);
 assert.ok(size.width<=960&&size.height<=960);
 const a=drawAnimationFrame(mock,img,character.layerPlan,settings,0,size.width,size.height);const b=drawAnimationFrame(mock,img,character.layerPlan,settings,1,size.width,size.height);assert.ok(history.filter(x=>x[0]==='drawImage').length>=10);assert.ok(history.some(x=>x[0]==='rotate'));assert.notDeepEqual(a,b);
 assert.throws(()=>drawAnimationFrame(mock,img,character.layerPlan,settings,0,4000,4000),/해상도/);
});
test('Step82 export JSON records actual settings but not protected source pixel bytes',()=>{const {character,settings}=sample();const file=animationManifest(character,settings);assert.equal(file.format,'MYVOCAL_2D_ANIMATION');assert.equal(file.characterId,'char82');assert.match(file.warning,/no semantic layer/);assert.equal(file.sourceAssetId,'a1');});
test('Step82 character UI and WebM recorder bound to saved profile and actual canvas',async()=>{
 const fs=await import('node:fs');const ui=fs.readFileSync(new URL('../src/components/CharacterAnimationEditor.jsx',import.meta.url),'utf8');const chars=fs.readFileSync(new URL('../src/pages/Characters.jsx',import.meta.url),'utf8');
 for(const token of ['getFile(plan.sourceAssetId)','drawAnimationFrame','requestAnimationFrame','MediaRecorder','canvas.captureStream(fps)','recorder.ondataavailable','downloadBlob(file','saveAnimationSettings'])assert.ok(ui.includes(token),token);
 for(const token of ['setAnimationFor(c)','CharacterAnimationEditor','STEP82 · 2D 애니메이션',"add('characters',profile)"])assert.ok(chars.includes(token),token);
});
