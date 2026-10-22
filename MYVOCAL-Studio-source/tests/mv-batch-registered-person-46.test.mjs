import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizedAutoSceneReference,runMvBatch} from '../src/lib/mvBatchProduction.js';
const scene={id:'scene1',start:0,end:4,title:'한국어 MV 인물',description:'공연'};
const person={id:'person1',name:'본인',kind:'person',rights:'self',identityLock:true,
 assets:[{id:'photo1',role:'portrait',type:'image/jpeg',name:'등록사진.jpg'}]};
const project={id:'prj46person',title:'원본 인물 MV',bpm:120,key:'C Major',characterId:'person1',scenes:[scene]};
test('권한 확인된 본인 인물 등록 사진은 실제 ComfyUI person img2img로 전달',async()=>{
 let current=structuredClone(project),calls=0,plain=0;
 const original=new Blob(['REGISTERED ORIGINAL JPEG 12345'],{type:'image/jpeg'});
 const assets=new Map([['photo1',original]]),origSize=original.size;
 await runMvBatch({project:current,data:{characters:[person]},current:()=>current,commit:p=>{current=p},
  checkpoint:'sd.safetensors',videoModel:'svd.safetensors',port:8188,session:'myvocal-session',
  includeReferences:true,loadFile:async id=>assets.get(id),
  sourceFrame:async()=> 'data:image/jpeg;base64,QUJDRA==',
  generateImage:async()=>{plain++;return new Blob(['UNEXPECTED'])},
  generateReferencePerson:async input=>{calls++;assert.equal(input.imageData,'data:image/jpeg;base64,QUJDRA==');assert.equal(input.denoise,.25);return new Blob(['GENERATED REFERENCE IMAGE'],{type:'image/png'})},
  generateVideo:async()=>new Blob(['GENERATED SVD VIDEO'],{type:'image/webp'}),
  saveFile:async(id,file)=>{assert.equal(assets.has(id),false);assets.set(id,file)},
  idFactory:(()=>{let n=0;return prefix=>prefix+'_'+(++n)})()});
 assert.equal(calls,1);assert.equal(plain,0);
 assert.equal(assets.get('photo1'),original);
 assert.equal(original.size,origSize);
 assert.equal(current.scenes[0].imageGeneration.source,'ComfyUI local person img2img');
});
test('등록사진 참조 사용 선택이 없으면 인물 사진을 임의 전송하지 않음',()=>{
 assert.equal(authorizedAutoSceneReference(scene,person,{includeReferences:false}),null);
});
test('실제 사람은 본인 또는 근거가 있는 허가만 자동 참조 사용',()=>{
 const unlicensed={...person,rights:'licensed',rightsNote:''};
 assert.equal(authorizedAutoSceneReference(scene,unlicensed,{includeReferences:true}),null);
 const licensed={...person,rights:'licensed',rightsNote:'뮤직비디오 제작 동의'};
 assert.equal(authorizedAutoSceneReference(scene,licensed,{includeReferences:true}).assetId,'photo1');
});
