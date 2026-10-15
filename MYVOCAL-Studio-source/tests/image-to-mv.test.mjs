import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject} from '../src/lib/schema.js';
import {personPhotoAssets,validatePersonSource,linkPersonToMvScene,personSceneImageRequest,personMvSceneStatus,generatePersonMvImage} from '../src/lib/imageToMv.js';
import {applySceneImage} from '../src/lib/mvSceneImages.js';
import {videoSourceKey,applySceneVideo} from '../src/lib/mvSceneVideos.js';

const person=()=>({id:'chr_person',kind:'person',name:'나',rights:'self',assets:[{id:'asset_face',name:'front.png',type:'image/png',role:'front'},{id:'asset_back',name:'other.webp',type:'image/webp',role:'back'}],appearance:{hair:'short dark hair'}});
test('Step79 selects explicitly registered person photograph only, with rights',()=>{
 const p=person();assert.equal(personPhotoAssets(p).length,1);assert.equal(validatePersonSource(p,'asset_face'),true);
 assert.throws(()=>validatePersonSource({...p,kind:'character'},'asset_face'),/실제 사람/);
 assert.throws(()=>validatePersonSource({...p,rights:'reference'},'asset_face'),/사용 허가/);
 assert.throws(()=>validatePersonSource({...p,rights:'licensed',rightsNote:''},'asset_face'),/사용 허가/);
 assert.equal(validatePersonSource({...p,rights:'licensed',rightsNote:'contract signed'},'asset_face'),true);
 assert.throws(()=>validatePersonSource(p,'asset_back'),/PNG\/JPEG/);
 assert.throws(()=>validatePersonSource(p,'nonexistent'),/PNG\/JPEG/);
});
test('Step79 links photo non-destructively, changes fingerprint for person and photo',()=>{
 const project=newProject({title:'Person MV'}),scene=project.scenes[0],p=person(),snapshot=JSON.stringify(project);
 const linked=linkPersonToMvScene(project,scene.id,p,'asset_face',.35),linkedScene=linked.scenes[0];
 assert.equal(JSON.stringify(project),snapshot);assert.equal(linkedScene.characterId,p.id);assert.equal(linkedScene.personMv.referenceAssetId,'asset_face');
 assert.deepEqual(linked.tracks,project.tracks);
 const r=personSceneImageRequest(linked,linkedScene,p,null);
 assert.ok(r.prompt.includes('short dark hair'));assert.ok(r.prompt.includes('real-person source photo'));
 assert.notEqual(r.key,personSceneImageRequest({...linked,scenes:[{...linkedScene,personMv:{...linkedScene.personMv,denoise:.5}}]},{...linkedScene,personMv:{...linkedScene.personMv,denoise:.5}},p,null).key);
 assert.notEqual(r.key,personSceneImageRequest({...linked,scenes:[{...linkedScene,personMv:{...linkedScene.personMv,referenceAssetId:'asset_new'}}]}, {...linkedScene,personMv:{...linkedScene.personMv,referenceAssetId:'asset_new'}},{...p,assets:[...p.assets,{id:'asset_new',name:'new.jpg',type:'image/jpeg',role:'portrait'}]},null).key);
 assert.throws(()=>linkPersonToMvScene(project,'deleted',p,'asset_face',.35),/삭제/);
 assert.throws(()=>linkPersonToMvScene(project,scene.id,p,'asset_face',.9),/강도/);
});
test('Step79 generated still and Step78 clip preserve reference and project fields',()=>{
 const p=person(),project=newProject({title:'Person pipeline'}),sc=project.scenes[0];
 const linked=linkPersonToMvScene(project,sc.id,p,'asset_face',.35),request=personSceneImageRequest(linked,linked.scenes[0],p);
 const imageProject=applySceneImage(linked,sc.id,'img_scene79',request,{source:'person-img2img',seed:18,checkpoint:'local-sd'});
 const imageScene=imageProject.scenes[0];assert.equal(imageScene.imageGeneration.source,'ComfyUI local person img2img');
 const key=videoSourceKey(imageProject,imageScene,request);
 const final=applySceneVideo(imageProject,sc.id,'vid_scene79',key,{mime:'image/webp',frames:14,fps:6});
 assert.equal(final.scenes[0].personMv.referenceAssetId,'asset_face');assert.equal(final.scenes[0].videoClipAssetId,'vid_scene79');
 assert.equal(personMvSceneStatus(final.scenes[0]),'영상 클립 저장됨');assert.deepEqual(final.tracks,project.tracks);
});
test('Step79 photo image endpoint forwards authenticated local request and surfaces model errors',async()=>{
 const original=globalThis.fetch;let captured;
 globalThis.fetch=async(url,options)=>{captured={url,options};return new Response(new Blob([Buffer.alloc(40)],{type:'image/png'}),{status:200,headers:{'Content-Type':'image/png'}});};
 try{const result=await generatePersonMvImage({port:8188,checkpoint:'local',imageData:'test'},'key');assert.equal(result.type,'image/png');assert.equal(captured.url,'/api/person-mv/generate');assert.equal(captured.options.headers['X-MYVOCAL-Session'],'key');assert.equal(JSON.parse(captured.options.body).rightsAttested,true);}
 finally{globalThis.fetch=original;}
});
test('Step79 legacy project scenes stay untouched without linking',()=>{const p=newProject();assert.equal(p.scenes[0].personMv,undefined);assert.equal(personMvSceneStatus(p.scenes[0]),'미연결');});
test('Step79 restores linked actual-person photo ID together with new scene IDs',async()=>{
 const {importProjectBundle}=await import('../src/lib/projectBundle.js');
 const p=person(),project=newProject({title:'Person restore'}),s=project.scenes[0];
 const linked=linkPersonToMvScene(project,s.id,p,'asset_face',.35);
 const png=Buffer.from('synthetic local image for photo asset');
 const backup={format:'MYVOCAL_PROJECT_BACKUP',formatVersion:2,project:linked,profiles:{voices:[],characters:[p]},assets:{asset_face:{name:'front.png',type:'image/png',dataUrl:'data:image/png;base64,'+png.toString('base64')}}};
 const old=globalThis.indexedDB;
 globalThis.indexedDB={open:()=>{const req={};queueMicrotask(()=>{req.result={close(){},createObjectStore(){},transaction(){const tx={objectStore(){return {add(){queueMicrotask(()=>tx.oncomplete?.());}}}};return tx;}};req.onsuccess?.();});return req;}};
 try{
  const restored=await importProjectBundle(new File([JSON.stringify(backup)],'test.myvocal.json',{type:'application/json'}));
  const rs=restored.project.scenes[0],rp=restored.characters[0];
  assert.notEqual(rs.id,s.id);assert.notEqual(rs.personMv.referenceAssetId,'asset_face');assert.equal(rs.personMv.personId,rp.id);
  assert.equal(rs.personMv.referenceAssetId,rp.assets[0].id);assert.equal(rs.characterId,rp.id);assert.equal(personPhotoAssets(rp).length,1);
 }finally{globalThis.indexedDB=old;}
});
test('Step79 does not invalidate legacy Step77 images and keeps storyboard audit usable',async()=>{
 const {buildSceneImageRequest}=await import('../src/lib/mvSceneImages.js');
 const {auditMvStoryboard}=await import('../src/lib/mvStoryboard.js');
 const p=newProject({title:'Legacy project'}),s=p.scenes[0];
 const imageReq=buildSceneImageRequest(p,s);
 const legacyKey=JSON.stringify([p.id,s.id,['title','description','location','outfit','expression','action','camera','lighting'].map(k=>String(s[k]??'').replace(/[\x00-\x1f]/g,' ').trim().slice(0,320)).join('|'),'','','','Story MV','']);
 // Step77's key format is preserved without a Step79 person reference.
 assert.equal(imageReq.key,legacyKey);
 const withImage=applySceneImage(p,s.id,'img_legacy',imageReq,{seed:55});
 assert.equal(auditMvStoryboard(withImage).errors,0);
 const linked=linkPersonToMvScene(withImage,s.id,person(),'asset_face',.35);
 assert.equal(auditMvStoryboard(linked,[person()]).errors,0);
});
