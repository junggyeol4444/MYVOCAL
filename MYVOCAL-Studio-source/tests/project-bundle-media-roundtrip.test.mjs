import test from 'node:test';
import assert from 'node:assert/strict';
import {importProjectBundle} from '../src/lib/projectBundle.js';

// Emulates only the IndexedDB write transaction used by project backup restore.
// This checks imported bytes and references without touching an existing user profile.
function isolatedAssetDatabase(t){
 const files=new Map([['user-existing',new File(['unchanged'],'original.txt',{type:'text/plain'})]]);
 const previous=globalThis.indexedDB;
 const db={
  close(){},
  transaction(store,mode){
   assert.equal(store,'files');
   assert.equal(mode,'readwrite');
   const writes=[];
   const tx={
    error:null,
    objectStore(){return{add(file,id){
      if(files.has(id)||writes.some(x=>x[0]===id))throw Error('duplicate asset id');
      writes.push([id,file]);
      return{result:id};
    }}},
    abort(){this.onabort?.();}
   };
   queueMicrotask(()=>{
    for(const [id,file] of writes)files.set(id,file);
    tx.oncomplete?.();
   });
   return tx;
  }
 };
 globalThis.indexedDB={open(name,version){
   assert.equal(name,'myvocal-assets-v01');
   assert.equal(version,1);
   const request={result:db};
   queueMicrotask(()=>request.onsuccess?.());
   return request;
 }};
 t.after(()=>{if(previous===undefined)delete globalThis.indexedDB;else globalThis.indexedDB=previous;});
 return files;
}

test('existing portable project restore remaps and saves original voice, photo, look and scene bytes',async t=>{
 const stored=isolatedAssetDatabase(t);
 const media={
  'vocal-old':{name:'original.wav',type:'audio/wav',bytes:Buffer.from('RIFF\x04\0\0\0WAVE','binary')},
  'portrait-old':{name:'portrait.png',type:'image/png',bytes:Buffer.from([137,80,78,71,13,10,26,10])},
  'look-old':{name:'outfit.png',type:'image/png',bytes:Buffer.from([137,80,78,71,13,10,26,10,1])},
  'video-old':{name:'scene.webm',type:'video/webm',bytes:Buffer.from([0x1a,0x45,0xdf,0xa3,0x00])},
  'source-old':{name:'original-image.png',type:'image/png',bytes:Buffer.from([137,80,78,71,13,10,26,10,2])},
  'sample-old':{name:'training.wav',type:'audio/wav',bytes:Buffer.from('RIFF\x04\0\0\0WAVEtest','binary')}
 };
 const assets=Object.fromEntries(Object.entries(media).map(([id,m])=>[id,{name:m.name,type:m.type,dataUrl:`data:${m.type};base64,${m.bytes.toString('base64')}`}]));
 const project={
  id:'project-old',title:'Media backup',voiceId:'voice-old',characterId:'character-old',
  sections:[{id:'section-old',name:'Chorus',bars:4}],
  tracks:[{id:'track-old',name:'Lead Vocal',clips:[{id:'clip-old',assetId:'vocal-old'}]}],
  scenes:[{id:'scene-old',characterId:'character-old',imageAssetId:'portrait-old',
    videoClipAssetId:'video-old',
    personMv:{personId:'character-old',referenceAssetId:'portrait-old'},
    regeneration92:{sourceAssetId:'source-old',history:[]}}]
 };
 const bundle={format:'MYVOCAL_PROJECT_BACKUP',formatVersion:2,project,
  profiles:{voices:[{id:'voice-old',name:'Voice',assetId:'sample-old'}],
            characters:[{id:'character-old',name:'Character',
              looks:[{referenceAssetId:'look-old'}],
              personLipSync:{videoAssetId:'video-old',audioAssetId:'sample-old'}}]},
  assets};
 const originalFile=new File([JSON.stringify(bundle)],'sample.myvocal.json',{type:'application/json'});
 const imported=await importProjectBundle(originalFile);
 assert.equal(imported.portable,true);
 assert.notEqual(imported.project.id,project.id);
 assert.equal(imported.voices.length,1);
 assert.equal(imported.characters.length,1);
 assert.equal(stored.size,Object.keys(media).length+1);
 assert.equal(await stored.get('user-existing').text(),'unchanged');
 assert.notEqual(imported.voices[0].id,'voice-old');
 assert.equal(imported.project.voiceId,imported.voices[0].id);
 assert.equal(imported.project.characterId,imported.characters[0].id);
 assert.equal(imported.project.scenes[0].personMv.personId,imported.characters[0].id);
 const restoredIds={
  'vocal-old':imported.project.tracks[0].clips[0].assetId,
  'portrait-old':imported.project.scenes[0].imageAssetId,
  'look-old':imported.characters[0].looks[0].referenceAssetId,
  'video-old':imported.project.scenes[0].videoClipAssetId,
  'source-old':imported.project.scenes[0].regeneration92.sourceAssetId,
  'sample-old':imported.voices[0].assetId
 };
 for(const [oldId,newId] of Object.entries(restoredIds)){
  assert.notEqual(newId,oldId,`ID retained: ${oldId}`);
  const file=stored.get(newId);
  assert.ok(file,`missing restored media: ${oldId}`);
  assert.equal(file.name,media[oldId].name);
  assert.equal(file.type,media[oldId].type);
  assert.deepEqual(Buffer.from(await file.arrayBuffer()),media[oldId].bytes);
 }
 assert.equal(imported.characters[0].personLipSync.videoAssetId,restoredIds['video-old']);
 assert.equal(imported.characters[0].personLipSync.audioAssetId,restoredIds['sample-old']);
});

test('invalid backup media rejects before changing stored user files',async t=>{
 const stored=isolatedAssetDatabase(t);
 const bundle={format:'MYVOCAL_PROJECT_BACKUP',formatVersion:2,
  project:{id:'old',title:'Bad media',tracks:[],sections:[]},
  profiles:{voices:[],characters:[]},
  assets:{bad:{name:'bad.wav',type:'audio/wav',dataUrl:'data:audio/wav;base64,invalid'}}};
 const file=new File([JSON.stringify(bundle)],'bad.myvocal.json',{type:'application/json'});
 await assert.rejects(importProjectBundle(file));
 assert.equal(stored.size,1);
 assert.equal(await stored.get('user-existing').text(),'unchanged');
});
