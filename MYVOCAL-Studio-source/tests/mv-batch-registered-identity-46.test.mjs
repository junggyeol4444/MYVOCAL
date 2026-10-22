import test from 'node:test';
import assert from 'node:assert/strict';
import {runMvBatch,authorizedAutoSceneReference,stableMvCharacterSeed} from '../src/lib/mvBatchProduction.js';
import {buildSceneImageRequest} from '../src/lib/mvSceneImages.js';
const base={
 id:'project-46',title:'내 캐릭터 한국어 MV',bpm:120,key:'C Major',genreMix:[{name:'Rock',weight:100}],characterId:'singer',
 scenes:[{id:'scene-1',characterId:'singer',start:0,end:4,title:'1절',description:'무대'},
         {id:'scene-2',characterId:'singer',start:4,end:8,title:'후렴',description:'다른 카메라'}]
};
const singer={
 id:'singer',name:'내 캐릭터',kind:'character',rights:'owned',identityLock:true,
 assets:[{id:'art-original',role:'front',type:'image/png',name:'원본그림.png'}]
};
function setup(project,character,{references=true}={}){
 let live=structuredClone(project),saves=[],imageRequests=[],plain=0,video=0,loaded=[];
 const assets=new Map([['art-original',new Blob(['ORIGINAL_REGISTERED_ART'],{type:'image/png'})]]);
 let serial=0;
 const args={
  project:live,data:{characters:[character]},current:()=>live,commit:p=>{live=p},
  currentData:()=>({characters:[character]}),checkpoint:'sd-user.safetensors',videoModel:'svd-user.safetensors',
  port:8188,session:'local-authorized-session',includeReferences:references,
  generateImage:async()=>{plain++;return new Blob(['GENERATED_PLAIN_IMAGE_BYTES'],{type:'image/png'})},
  generateReferenceCharacter:async input=>{imageRequests.push(input);return new Blob(['GENERATED_IMG2IMG_BYTES'],{type:'image/png'})},
  generateVideo:async()=>{video++;return new Blob(['SVD-VIDEO-CLIP-BYTES'],{type:'image/webp'})},
  loadFile:async id=>{loaded.push(id);return assets.get(id)||null},
  sourceFrame:async()=> 'data:image/png;base64,QUJDRA==',
  saveFile:async(id,file)=>{assert.equal(assets.has(id),false);saves.push(id);assets.set(id,file)},
  idFactory:prefix=>prefix+'_'+(++serial)
 };
 return {args,state:()=>({live,saves,imageRequests,plain,video,loaded,assets})};
}
test('동일 등록 그림을 두 개 장면의 실제 img2img 요청에 반복 사용하고 원본 유지',async()=>{
 const original=structuredClone(base),before=JSON.stringify(original);
 const fixture=setup(original,singer);
 const result=await runMvBatch(fixture.args);
 const s=fixture.state();
 assert.equal(result.generatedImages,2);assert.equal(result.generatedVideos,2);
 assert.equal(s.plain,0);assert.equal(s.imageRequests.length,2);
 assert.equal(s.imageRequests[0].imageData,s.imageRequests[1].imageData);
 assert.equal(s.imageRequests[0].seed,s.imageRequests[1].seed);
 assert.equal(s.imageRequests[0].seed,stableMvCharacterSeed(base.id,'singer'));
 assert.deepEqual(s.loaded.filter(id=>id==='art-original'),['art-original','art-original']);
 assert.equal(s.live.scenes[0].imageGeneration.source,'ComfyUI local character img2img');
 assert.equal(s.live.scenes[1].imageGeneration.source,'ComfyUI local character img2img');
 assert.equal(JSON.stringify(original),before);
 assert.equal(s.assets.get('art-original').size,'ORIGINAL_REGISTERED_ART'.length);
});
test('등록 캐릭터 원본 참조를 사용하지 않는 경우 일반 생성 경로 보존',async()=>{
 const f=setup({...base,scenes:[base.scenes[0]]},singer,{references:false});
 await runMvBatch(f.args);
 assert.equal(f.state().plain,1);
 assert.equal(f.state().imageRequests.length,0);
});
test('사용 허가가 없는 캐릭터는 실제 추론·파일 저장 전에 중단',async()=>{
 const invalid={...singer,rights:'licensed',rightsNote:''};
 const f=setup({...base,scenes:[base.scenes[0]]},invalid);
 await assert.rejects(runMvBatch(f.args),/사용 허가/);
 assert.equal(f.state().plain,0);
 assert.equal(f.state().imageRequests.length,0);
 assert.equal(f.state().saves.length,0);
});
test('입력 장면에 직접 지정한 사진은 자동 선택보다 우선한다',()=>{
 const project={...base,scenes:[{...base.scenes[0],characterMv:{characterId:'singer',referenceAssetId:'art-manual',denoise:.5}}]};
 assert.equal(authorizedAutoSceneReference(project.scenes[0],singer,{includeReferences:true}),null);
});
test('자동 원본 참조 ID가 다르면 장면 생성 무결성 키도 달라진다',()=>{
 const p=base,s=p.scenes[0],one={assetId:'art1',denoise:.25,kind:'character'};
 const two={assetId:'art2',denoise:.25,kind:'character'};
 assert.notEqual(buildSceneImageRequest(p,s,singer,null,one).key,buildSceneImageRequest(p,s,singer,null,two).key);
});
test('동일 캐릭터 고정 해제·권한 없는 사람은 자동 참조로 추정하지 않는다',()=>{
 assert.equal(authorizedAutoSceneReference(base.scenes[0],{...singer,identityLock:false},{includeReferences:true}),null);
 const person={...singer,kind:'person',rights:'licensed',rightsNote:''};
 assert.equal(authorizedAutoSceneReference(base.scenes[0],person,{includeReferences:true}),null);
});
