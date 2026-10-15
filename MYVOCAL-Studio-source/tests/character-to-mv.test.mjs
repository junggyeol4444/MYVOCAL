import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject} from '../src/lib/schema.js';
import {characterArtworkAssets,validateCharacterArtwork,linkCharacterToMvScene,characterSceneImageRequest,generateCharacterMvImage,characterMvSceneStatus} from '../src/lib/characterToMv.js';
import {linkPersonToMvScene} from '../src/lib/imageToMv.js';
import {buildSceneImageRequest,applySceneImage} from '../src/lib/mvSceneImages.js';
import {videoSourceKey,applySceneVideo} from '../src/lib/mvSceneVideos.js';
import {auditMvStoryboard} from '../src/lib/mvStoryboard.js';
const singer=()=>({id:'chr_luna',kind:'character',name:'LUNA',rights:'owned',description:'Original anime singer, navy stage outfit',appearance:{hair:'blue hair',eyes:'green'},assets:[{id:'asset_luna',type:'image/png',role:'portrait',name:'luna.png'},{id:'asset_back',type:'image/jpeg',role:'back',name:'back.jpg'},{id:'asset_model',type:'model/gltf-binary',role:'model',name:'luna.glb'}]});
test('Step80 only accepts owned or expressly licensed registered 2D artwork',()=>{
 const ch=singer();assert.equal(characterArtworkAssets(ch).length,2);assert.equal(validateCharacterArtwork(ch,'asset_luna'),true);
 for(const bad of [{...ch,kind:'person'},{...ch,kind:'3d'}])assert.throws(()=>validateCharacterArtwork(bad,'asset_luna'),/2D/);
 assert.throws(()=>validateCharacterArtwork({...ch,rights:'reference'},'asset_luna'),/사용 허가/);
 assert.throws(()=>validateCharacterArtwork({...ch,rights:'licensed',rightsNote:''},'asset_luna'),/사용 허가/);
 assert.equal(validateCharacterArtwork({...ch,rights:'licensed',rightsNote:'artist signed license'},'asset_luna'),true);
 assert.throws(()=>validateCharacterArtwork(ch,'asset_model'),/PNG\/JPEG/);
 assert.throws(()=>validateCharacterArtwork(ch,'other-id'),/PNG\/JPEG/);
});
test('Step80 links original 2D illustration without modifying music, prior assets or existing scene values',()=>{
 const ch=singer(),p=newProject({title:'Anime PV'}),s=p.scenes[0],prior=structuredClone(p);
 const linked=linkCharacterToMvScene(p,s.id,ch,'asset_luna',.3);
 assert.deepEqual(p,prior);assert.deepEqual(linked.tracks,p.tracks);assert.deepEqual(linked.sections,p.sections);
 assert.equal(linked.scenes[0].characterId,ch.id);assert.equal(linked.scenes[0].characterMv.referenceAssetId,'asset_luna');
 assert.throws(()=>linkCharacterToMvScene(p,'missing',ch,'asset_luna',.3),/삭제/);
 for(const denoise of [.01,.99,NaN])assert.throws(()=>linkCharacterToMvScene(p,s.id,ch,'asset_luna',denoise),/강도/);
});
test('Step80 reference fingerprint detects new art and changes but preserves legacy Step77 keys',()=>{
 const ch=singer(),p=newProject({title:'Legacy'}),sc=p.scenes[0];
 assert.equal(buildSceneImageRequest(p,sc).key,JSON.stringify([p.id,sc.id,['title','description','location','outfit','expression','action','camera','lighting'].map(k=>String(sc[k]??'').replace(/[\x00-\x1f]/g,' ').trim().slice(0,320)).join('|'),'','','','Story MV','']));
 const linked=linkCharacterToMvScene(p,sc.id,ch,'asset_luna',.3),request=characterSceneImageRequest(linked,linked.scenes[0],ch);
 assert.match(request.prompt,/original 2D character artwork/);assert.match(request.prompt,/blue hair/);
 const changed=linkCharacterToMvScene(linked,sc.id,ch,'asset_back',.3);
 assert.notEqual(characterSceneImageRequest(changed,changed.scenes[0],ch).key,request.key);
 const strength=linkCharacterToMvScene(linked,sc.id,ch,'asset_luna',.45);
 assert.notEqual(characterSceneImageRequest(strength,strength.scenes[0],ch).key,request.key);
 assert.notEqual(characterSceneImageRequest(linked,linked.scenes[0],{...ch,description:'another outfit'}).key,request.key);
 assert.throws(()=>characterSceneImageRequest(linked,linked.scenes[0],{...ch,id:'different'}),/연결/);
});
test('Step80 still and clip are stored as distinct assets and flagged as a PV reference',()=>{
 const ch=singer(),p=newProject(),s=p.scenes[0],linked=linkCharacterToMvScene(p,s.id,ch,'asset_luna',.3),req=characterSceneImageRequest(linked,linked.scenes[0],ch);
 const rendered=applySceneImage(linked,s.id,'img_luna80',req,{source:'character-img2img',checkpoint:'localSD'});
 assert.equal(rendered.scenes[0].imageGeneration.source,'ComfyUI local character img2img');
 const key=videoSourceKey(rendered,rendered.scenes[0],req);
 const finished=applySceneVideo(rendered,s.id,'vid_luna80',key,{mime:'image/webp',frames:14,fps:6});
 assert.equal(characterMvSceneStatus(finished.scenes[0]),'영상 클립 저장됨');
 assert.equal(finished.scenes[0].imageAssetId,'img_luna80');assert.equal(finished.scenes[0].videoClipAssetId,'vid_luna80');
 assert.equal(auditMvStoryboard(finished,[ch]).errors,0);
});
test('Step80 person and character reference are mutually exclusive, original scene media remain',()=>{
 const ch=singer(),p=newProject(),s=p.scenes[0];
 const person={id:'chr_person',kind:'person',name:'Creator',rights:'self',assets:[{id:'asset_face',type:'image/png',role:'front'}]};
 const linkedPerson=linkPersonToMvScene(p,s.id,person,'asset_face',.3);
 const converted=linkCharacterToMvScene(linkedPerson,s.id,ch,'asset_luna',.3);
 assert.equal(converted.scenes[0].personMv,undefined);assert.ok(converted.scenes[0].characterMv);
 const switched=linkPersonToMvScene(converted,s.id,person,'asset_face',.3);
 assert.equal(switched.scenes[0].characterMv,undefined);assert.ok(switched.scenes[0].personMv);
 assert.equal(characterMvSceneStatus(p.scenes[0]),'미연결');
});
test('Step80 browser request addresses its own bridge, sends rights attestation and handles errors',async()=>{
 const old=globalThis.fetch;let call;
 globalThis.fetch=async(url,options)=>{call={url,options};return new Response(new Blob([Buffer.alloc(64)],{type:'image/png'}),{status:200});};
 try{const blob=await generateCharacterMvImage({port:8188,checkpoint:'sd',imageData:'data:image/png;base64,...'},'session80');assert.equal(blob.type,'image/png');assert.equal(call.url,'/api/character-mv/generate');assert.equal(call.options.headers['X-MYVOCAL-Session'],'session80');assert.equal(JSON.parse(call.options.body).rightsAttested,true);}
 finally{globalThis.fetch=old;}
 globalThis.fetch=async()=>new Response(JSON.stringify({error:'ComfyUI model unavailable'}),{status:502,headers:{'content-type':'application/json'}});
 try{await assert.rejects(()=>generateCharacterMvImage({},'x'),/ComfyUI model unavailable/);}finally{globalThis.fetch=old;}
});
test('Step80 portable backup remaps restored character-artwork source with scene/character IDs',async()=>{
 const {importProjectBundle}=await import('../src/lib/projectBundle.js');const ch=singer(),p=newProject(),s=p.scenes[0];
 const linked=linkCharacterToMvScene(p,s.id,ch,'asset_luna',.3);const png=Buffer.from('fake png bytes for metadata restore');
 const backup={format:'MYVOCAL_PROJECT_BACKUP',formatVersion:2,project:linked,profiles:{voices:[],characters:[ch]},assets:{asset_luna:{name:'luna.png',type:'image/png',dataUrl:'data:image/png;base64,'+png.toString('base64')}}};
 const old=globalThis.indexedDB;
 globalThis.indexedDB={open:()=>{const req={};queueMicrotask(()=>{req.result={close(){},createObjectStore(){},transaction(){const tx={objectStore(){return {add(){queueMicrotask(()=>tx.oncomplete?.());}}}};return tx;}};req.onsuccess?.();});return req;}};
 try{const {project:next,characters}=await importProjectBundle(new File([JSON.stringify(backup)],'test.myvocal.json',{type:'application/json'}));
  const ns=next.scenes[0];assert.notEqual(ns.id,s.id);assert.notEqual(ns.characterMv.referenceAssetId,'asset_luna');assert.equal(ns.characterMv.referenceAssetId,characters[0].assets[0].id);assert.equal(ns.characterMv.characterId,characters[0].id);assert.equal(ns.characterId,characters[0].id);
 }finally{globalThis.indexedDB=old;}
});
test('Step80 UI is tied to original art, storyboard and Step78 SVD rather than faking a video',async()=>{
 const fs=await import('node:fs');const src=fs.readFileSync(new URL('../src/pages/Video.jsx',import.meta.url),'utf8');
 for(const token of ['Step80 · Character-to-MV','createCharacterPv','generateCharacterMvImage','generateLocalVideoClip','characterSceneImageRequest','getFile(pvSelectedArtwork)','putFile(imgId','putFile(vidId','pvAbort.current?.abort()'])assert.ok(src.includes(token),token);
});
