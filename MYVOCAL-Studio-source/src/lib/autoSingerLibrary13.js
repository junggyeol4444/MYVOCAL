// 원본 13·26·58·59항: MYVOCAL의 실제 SD 자동 생성 가수 첫 이미지를
// 본인 권한 확인 후 재사용 가능한 Character Library로 별도 신규 등록.
// 영상 프로젝트/원본 이미지 ID/IndexedDB 원본/기존 인물 자료는 불변.
import {validateAutoVirtualSinger} from './autoVirtualSingerImages.js';
import {normalizeCharacterIdentity} from './characterIdentity.js';
import {genId} from './schema.js';
import {getFile,putFileNew,removeFile} from './assetDb.js';
const safeName=name=>typeof name==='string'&&!!name.trim()&&name.trim().length<=120&&
 !/[\u0000-\u001f\u007f]/u.test(name);
export async function registerGeneratedSinger13(project,name,{
 confirmed=false,characters=[],register,getSource=getFile,
 saveNew=putFileNew,rollback=removeFile,newId=genId
}={}){
 if(confirmed!==true)throw Error('자신이 생성해 재사용 권한이 확인된 가수 이미지만 캐릭터로 등록할 수 있습니다.');
 if(!safeName(name)||!Array.isArray(characters)||typeof register!=='function')
  throw Error('가상 가수 이름과 기존 캐릭터 저장 연결이 필요합니다.');
 if(characters.some(c=>c.name===name.trim()))
  throw Error('같은 이름의 가상 가수 또는 캐릭터가 존재합니다. 새 이름을 지정하세요.');
 const anchor=validateAutoVirtualSinger(project,{enabled:true}).anchor;
 if(!anchor)throw Error('기존 SD로 실제 생성한 첫 자동 가수 이미지가 필요합니다.');
 if(characters.some(c=>c?.autoSinger13?.sourceProjectId===project.id&&
   c.autoSinger13?.originalAssetId===anchor.sourceAssetId))
  throw Error('이 자동 가수의 동일 첫 이미지는 이미 캐릭터 라이브러리에 저장돼 있습니다.');
 const source=await getSource(anchor.sourceAssetId);
 if(!(source instanceof Blob)||source.size<32||source.size>40*1024*1024||
  !['image/png','image/jpeg','image/webp'].includes(source.type))
  throw Error('자동 생성된 원본 가수의 이미지가 로컬 저장소에 없습니다.');
 const assetId=newId('asset'),characterId=newId('char');
 if(!assetId||!characterId||characters.some(c=>c.id===characterId||
  c.assets?.some(a=>a.id===assetId)))
  throw Error('새 가수·원본 사본의 고유 ID가 중복됐습니다.');
 const extension=source.type==='image/png'?'png':source.type==='image/jpeg'?'jpg':'webp';
 const file=new File([source],'MYVOCAL-가상가수-첫원화-'+characterId+'.'+extension,{type:source.type});
 const profile=normalizeCharacterIdentity({
  id:characterId,name:name.trim(),kind:'character',rights:'owned',rightsNote:'',
  description:'MYVOCAL 로컬 이미지 모델이 실제 생성한 자동 가수의 첫 이미지 사본입니다. '
   +'다른 장면의 같은 인물 유지는 참고 생성 방식이며 학습된 외형 보장은 아닙니다.',
  appearance:{},identityLock:false,
  assets:[{id:assetId,name:file.name,type:file.type,size:file.size,role:'portrait',
   generatedBy:'local-comfyui-auto-singer-copy',sourceProjectId:project.id,
   sourceSceneId:anchor.sourceSceneId}],
  autoSinger13:{version:1,sourceProjectId:project.id,
   sourceSceneId:anchor.sourceSceneId,originalAssetId:anchor.sourceAssetId,
   copiedAssetId:assetId,trainedIdentity:false}
 });
 let persisted=false;
 try{
  await saveNew(assetId,file);
  persisted=true;
  await Promise.resolve(register(profile));
  persisted=false;
  return profile;
 }catch(error){
  if(persisted){
   try{await rollback(assetId);}
   catch(cleanup){throw Error('신규 가상 가수 자산 등록 복구가 필요합니다: '+cleanup.message+' / '+error.message);}
  }
  throw error;
 }
}
