// MYVOCAL 원본 66항 #44·#45: 기존 등록 원화로 실제 설치된 ComfyUI SD img2img
// 4개의 다른 이미지 후보를 만든다. 선택한 결과만 새로운 IndexedDB 자산으로 저장.
// 원화/룩/프로젝트/기존 미디어/모델은 삭제하거나 덮어쓰지 않는다.
import {validateCharacterArtwork,generateCharacterMvImage,characterArtworkAssets} from './characterToMv.js';
import {readSourceFrame} from './mvSceneVideos.js';
import {validatePersonSource,generatePersonMvImage,personPhotoAssets} from './imageToMv.js';
import {checkComfy,validateGeneratedImage} from './mvSceneImages.js';
import {getFile,putFileNew,removeFile} from './assetDb.js';
import {genId} from './schema.js';
import {updateCharacterLook,reviewCharacterLook} from './characterLooks.js';
import {MAX_CHARACTER_ASSETS} from './characterIdentity.js';

const CATEGORY={outfit:'의상',hair:'머리 모양',accessories:'장신구'};
const TEXT_LIMIT=230;
const eligible=character=>['character','person'].includes(character?.kind)&&
 (character.kind==='person'?['self','licensed'].includes(character.rights):['self','owned','licensed'].includes(character.rights))&&
 (character.rights!=='licensed'||!!String(character.rightsNote||'').trim());
const safeString=x=>typeof x==='string'&&!!x.trim()&&x.length<=TEXT_LIMIT&&!/[\u0000-\u001f\u007f]/.test(x);
export function validateNeuralLookRequest(character,lookId,{sourceAssetId,category,description,port,checkpoint,denoise,seed,consent=false}={}){
 if(!eligible(character)||!character?.id)throw Error('본인 또는 사용 허가된 2D 캐릭터·실제 사람만 제작합니다.');
 if(character.kind==='person'&&consent!==true)throw Error('실제 사람 사진 및 생성 이미지 이용 권한을 확인하세요.');
 const look=character.looks?.find(l=>l.id===lookId);
 if(!look)throw Error('기존 캐릭터 룩 프리셋이 없습니다.');
 if(reviewCharacterLook(character,look).reviewRequired)throw Error('현재 룩의 원본 외형·참고 자료를 먼저 재검토하세요.');
 if(character.kind==='person')validatePersonSource(character,sourceAssetId);else validateCharacterArtwork(character,sourceAssetId);
 if(!Object.hasOwn(CATEGORY,category)||!safeString(description))
  throw Error('의상·머리·장신구 종류와 230자 이하 제작 지시를 입력하세요.');
 if(!Number.isInteger(port)||port<1024||port>65535||port===58319||
  typeof checkpoint!=='string'||!checkpoint.trim()||checkpoint.length>220||
  !Number.isFinite(denoise)||denoise<.15||denoise>.75||
  !Number.isSafeInteger(seed)||seed<0||seed>2147483643)
  throw Error('설치된 로컬 SD 모델·포트·이미지 변환 강도를 확인하세요.');
 if((character.assets||[]).length>=MAX_CHARACTER_ASSETS)
  throw Error('캐릭터 자료 저장 한도 64개입니다. 기존 자산은 삭제하지 않습니다.');
 return {look,source:(character.kind==='person'?personPhotoAssets(character):characterArtworkAssets(character)).find(a=>a.id===sourceAssetId)};
}
export function neuralLookPrompt(character,category,description){
 if(!eligible(character)||!Object.hasOwn(CATEGORY,category)||!safeString(description))
  throw Error('등록된 캐릭터와 변경할 의상·헤어·장신구 지시가 필요합니다.');
 const appearance=character.appearance||{};
 const basis=['eyes','body','palette'].map(key=>appearance[key]?key+': '+String(appearance[key]).slice(0,120):'').filter(Boolean);
 if(category!=='hair'&&appearance.hair)basis.push('unchanged hairstyle: '+String(appearance.hair).slice(0,120));
 if(category!=='outfit'&&appearance.outfit)basis.push('unchanged outfit: '+String(appearance.outfit).slice(0,120));
 const wardrobe=category==='outfit'?'change clothing only':category==='hair'?
  'change hairstyle only, keep eye color and face':'add accessories only, keep outfit and hairstyle';
 const prompt=[
  character.kind==='person'?'photorealistic portrait or full-body photograph of the same consented subject using their exact registered photo as img2img source':'2D animation character design sheet, real user-supplied source illustration img2img',
  'same character, maintain recognizable face, body proportions, art style, palette and identity',
  'subject: '+String(character.name||'character').slice(0,120),
  ...basis,wardrobe,'requested '+CATEGORY[category]+': '+description.trim(),
  'one full character only, clear clothing details, precise outlines, no lettering'
 ].join('. ');
 return {prompt:prompt.slice(0,2800),negative:
  'different person, face swapped, duplicate people, extra limbs, changed eye color, text, logo, watermark, distorted face'};
}
export async function generateNeuralLookCandidates(character,lookId,options,{
 session,signal,current,load=getFile,toImageData=readSourceFrame,
 checkEngine=checkComfy,generate=generateCharacterMvImage,onProgress=()=>{}
}={}){
 const request=validateNeuralLookRequest(character,lookId,options);
 if(!session||typeof current!=='function'||[load,toImageData,checkEngine,generate].some(f=>typeof f!=='function'))
  throw Error('Windows EXE 세션과 로컬 AI 생성 연결이 필요합니다.');
 const guard=()=>{
  if(signal?.aborted||current()?.id!==character.id||current()!==character)
   throw Error('생성 중단 또는 캐릭터 정보 변경. 등록된 원본은 유지됩니다.');
 };
 guard();
 const health=await checkEngine(options.port,session,signal);guard();
 if(!health?.checkpoints?.includes(options.checkpoint))throw Error('실제 로컬 SD 체크포인트 목록에서 선택해야 합니다.');
 const original=await load(options.sourceAssetId);guard();
 if(!(original instanceof Blob)||original.size<64||original.size>12*1024*1024||
  !['image/png','image/jpeg'].includes(original.type))
  throw Error('등록 원화가 없거나 PNG/JPEG 원본 파일이 아닙니다.');
 const imageData=await toImageData(original);guard();
 const {prompt,negative}=neuralLookPrompt(character,options.category,options.description);
 const candidates=[];
 const visualGenerate=character.kind==='person'?generatePersonMvImage:generate;
 for(let i=0;i<4;i++){
  guard();
  onProgress(i,4,'로컬 SD에서 실제 '+CATEGORY[options.category]+' 이미지 '+(i+1)+'/4 생성 중');
  const seed=options.seed+i;
  const image=await visualGenerate({
   port:options.port,checkpoint:options.checkpoint,prompt,negative,
   imageData,width:768,height:768,steps:20,seed,denoise:options.denoise
  },session,signal);
  guard();validateGeneratedImage(image);
  candidates.push({seed,image,sourceAssetId:options.sourceAssetId,
   category:options.category,description:options.description,checkpoint:options.checkpoint});
  onProgress(i+1,4,'실제 생성 이미지 '+(i+1)+'개');
 }
 return {lookId,candidates,characterId:character.id,
  sourceAssetId:options.sourceAssetId,characterSnapshot:JSON.stringify({assets:character.assets,looks:character.looks,appearance:character.appearance,rights:character.rights})};
}
export async function saveSelectedNeuralLook(character,generated,selectedIndex,{
 current,saveFile=putFileNew,deleteFile=removeFile,newId=genId,onSave
}={}){
 if(!generated||!Array.isArray(generated.candidates)||generated.candidates.length!==4||
  !Number.isInteger(selectedIndex)||selectedIndex<0||selectedIndex>=4)
  throw Error('실제 생성된 네 후보 중 하나를 선택하세요.');
 if(typeof current!=='function'||typeof onSave!=='function'||typeof newId!=='function')
  throw Error('현재 캐릭터와 저장 연결이 필요합니다.');
 const same=()=>current()===character&&generated.characterId===character.id&&
  generated.characterSnapshot===JSON.stringify({assets:character.assets,looks:character.looks,appearance:character.appearance,rights:character.rights});
 if(!same())throw Error('후보 생성 후 캐릭터가 변경됐습니다. 다시 생성하세요.');
 const selected=generated.candidates[selectedIndex];
 validateGeneratedImage(selected.image);
 if(character.kind==='person')validatePersonSource(character,selected.sourceAssetId);
 else validateCharacterArtwork(character,selected.sourceAssetId);
 if((character.assets||[]).length>=MAX_CHARACTER_ASSETS)throw Error('캐릭터 자료 64개 한도 초과');
 const id=newId('asset');
 if(typeof id!=='string'||!/^asset_[A-Za-z0-9_-]{1,90}$/.test(id)||
  character.assets?.some(a=>a.id===id))throw Error('새 자산 ID가 중복됐습니다.');
 const ext=selected.image.type==='image/jpeg'?'jpg':'png';
 const filename='MYVOCAL-캐릭터-'+selected.category+'-'+selected.seed+'.'+ext;
 const file=new File([selected.image],filename,{type:selected.image.type});
 const role=character.kind==='person'?'front':selected.category==='outfit'?'outfit':'other';
 const asset={id,name:filename,type:file.type,size:file.size,role,
  generatedBy:'installed-local-comfy-img2img',visualCategory:selected.category,
  sourceAssetId:selected.sourceAssetId,seed:selected.seed,checkpoint:selected.checkpoint};
 const newLook=updateCharacterLook({...character,assets:[...character.assets,asset]},generated.lookId,{
  referenceAssetId:id,
  ...(selected.category==='outfit'?{outfit:selected.description}:
     selected.category==='hair'?{hairStyle:selected.description}:{accessories:selected.description})
 });
 // add-only: IndexedDB 저장에 실패해도 기존 자산을 쓰거나 지우지 않는다.
 await saveFile(id,file);
 try{
  if(!same())throw Error('저장 중 캐릭터 정보가 변경됐습니다.');
  await Promise.resolve(onSave(newLook));
 }catch(err){
  try{await deleteFile(id);}catch(clean){throw Error('새 자산 저장 취소 후 정리에 실패했습니다: '+clean.message+' / '+err.message);}
  throw err;
 }
 return {assetId:id,category:selected.category,seed:selected.seed,fileName:filename,
  savedCandidates:1,discardedCandidates:3};
}
