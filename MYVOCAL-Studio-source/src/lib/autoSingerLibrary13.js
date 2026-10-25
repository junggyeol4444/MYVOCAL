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

// 원본 25·26항: 앞에서 실제 저장한 캐릭터와 기존 허가 Voice를 가상 가수로 연결.
// 등록 정보만 별도로 추가하며 Singing 모델이 없다면 가창 가능이라고 표시하지 않는다.
export function prepareAutoSingerVoiceLink26(character,voice,{
 name='',singingStyle='Natural',modelId='',models=[],existing=[],confirmed=false,newId=genId
}={}){
 if(!character?.id||character.autoSinger13?.version!==1||
  !character.assets?.some(a=>a.id===character.autoSinger13.copiedAssetId))
  throw Error('실제 자동 생성 가수 첫 원화를 캐릭터 라이브러리에 먼저 등록하세요.');
 if(!voice?.id||!['self','owned','licensed'].includes(voice.rights)||
   voice.rights==='licensed'&&!String(voice.rightsNote||'').trim()||
   confirmed!==true)
  throw Error('사용 권한이 확인된 기존 목소리와 가상 가수 연결 동의가 필요합니다.');
 if(!Array.isArray(existing)||existing.some(v=>
   v.characterId===character.id&&v.voiceId===voice.id))
  throw Error('이미 같은 목소리와 가수로 등록한 가상 가수 프로필이 존재합니다.');
 if(!['Natural','Ballad','Soft','Power','Rock','Whisper','Falsetto','Emotional'].includes(singingStyle))
  throw Error('지원하는 Singing Style을 선택하세요.');
 const model=modelId?models.find(m=>m.id===modelId):null;
 if(modelId&&(!model||model.voiceId!==voice.id||model.engineId==='sampler'||
    !model.assetId))
  throw Error('등록한 실제 RVC/가창 음색 모델만 선택할 수 있으며 샘플 미리보기는 사용할 수 없습니다.');
 const profileName=String(name||character.name||'').trim();
 if(!safeName(profileName))throw Error('등록할 가상 가수의 이름을 확인하세요.');
 const now=new Date().toISOString();
 return {id:newId('profile'),name:profileName,characterId:character.id,
  voiceId:voice.id,modelId:model?.id||'',style:singingStyle,
  createdAt:now,updatedAt:now,
  autoSingerVoice26:{version:1,confirmed:true,characterImageAssetId:character.autoSinger13.copiedAssetId,
   voiceModelConnected:!!model,neuralSingingRendered:false,
   note:model?'등록된 로컬 모델을 선택한 상태이며 실제 가창은 별도 실행 필요':
    '기존 목소리 데이터만 연결했습니다. 신경망 Singing 학습/가창은 실행되지 않았습니다.'}};
}
