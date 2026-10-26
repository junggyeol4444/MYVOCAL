// MYVOCAL 원본 66항 #42·#43: 실제 설치된 로컬 Stable Diffusion(img2img)
// 를 사용한 본인/허가 인물의 캐릭터화 또는 소유 캐릭터의 실사풍 표현.
// 기존 사람·캐릭터 프로필, 이미지, 모델, 작업 결과를 삭제/덮어쓰지 않는다.
// SD 출력의 시각적 동일성은 보증하지 않는다. 새 3D 모델을 만든다고 주장하지 않는다.
import {characterArtworkAssets,validateCharacterArtwork,generateCharacterMvImage} from './characterToMv.js';
import {personPhotoAssets,validatePersonSource,generatePersonMvImage} from './imageToMv.js';
import {checkComfy,validateGeneratedImage} from './mvSceneImages.js';
import {attachIdentityLoRA} from './characterIdentityLoRA.js';
import {readSourceFrame} from './mvSceneVideos.js';
import {getFile,putFileNew,removeFile} from './assetDb.js';
import {normalizeCharacterIdentity,MAX_CHARACTER_ASSETS} from './characterIdentity.js';
import {genId} from './schema.js';

export const VISUAL_STYLES=Object.freeze({
 realistic:{label:'실사풍',prompt:'photorealistic human studio portrait, real camera perspective, believable natural skin and fabric'},
 anime:{label:'애니메이션',prompt:'anime character illustration, precise line art, professional cel shading'},
 illustration:{label:'2D 일러스트',prompt:'high quality hand painted 2D character illustration with coherent anatomy'},
 threeD:{label:'3D 렌더풍 이미지',prompt:'high quality 3D rendered character portrait, physically based shading, studio CGI lighting'},
 chibi:{label:'치비',prompt:'chibi character illustration, simplified small proportions, same character features'},
 comic:{label:'만화',prompt:'stylized comic book art, strong contours, ink strokes, clean panel quality'}
});
const safe=x=>String(x||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim();
const authorized=profile=>!!profile&&
 (profile.kind==='person'?profile.rights==='self'||(profile.rights==='licensed'&&!!safe(profile.rightsNote)):
 ['owned','self'].includes(profile.rights)||(profile.rights==='licensed'&&!!safe(profile.rightsNote)));
const originalAssets=profile=>profile?.kind==='person'?personPhotoAssets(profile):characterArtworkAssets(profile);
function snapshot(p){return JSON.stringify({id:p.id,name:p.name,kind:p.kind,rights:p.rights,
 rightsNote:p.rightsNote,appearance:p.appearance,assets:p.assets,identityTraining:p.identityTraining});}
function guard(p,current,signal){
 if(signal?.aborted||typeof current!=='function'||current()!==p)
  throw Error('생성 취소 또는 캐릭터 원본 변경. 기존 자료는 유지됩니다.');
}
export function validateStyleTransfer(profile,options={}){
 if(!authorized(profile)||!['person','character'].includes(profile.kind))
  throw Error('본인 또는 명시적으로 사용이 허가된 사람·캐릭터 이미지가 필요합니다.');
 const {assetId,style,port,checkpoint,denoise,seed,consent}=options;
 if(profile.kind==='person'&&consent!==true)
  throw Error('실제 사람 원본 사진과 파생 캐릭터 생성 권한을 명시적으로 확인하세요.');
 if(!Object.hasOwn(VISUAL_STYLES,style))throw Error('지원하는 변환 표현 방식을 선택하세요.');
 if(profile.kind==='character'&&style!=='realistic')
  throw Error('원본 43항 캐릭터 실사풍 변환은 실사풍 스타일을 선택하세요.');
 if(profile.kind==='person')validatePersonSource(profile,assetId);
 else validateCharacterArtwork(profile,assetId);
 if(!Number.isInteger(port)||port<1024||port>65535||port===58319||
    !safe(checkpoint)||checkpoint.length>220||
    !Number.isFinite(denoise)||denoise<.15||denoise>.75||
    !Number.isSafeInteger(seed)||seed<0||seed>2147483643)
  throw Error('실제 설치된 SD 모델과 로컬 포트·시드·이미지 변환 강도를 확인하세요.');
 if(profile.kind==='character'&&(profile.assets||[]).length>=MAX_CHARACTER_ASSETS)
  throw Error('캐릭터의 64개 자산 한도입니다. 원본 자산을 삭제하지 않습니다.');
 return originalAssets(profile).find(a=>a.id===assetId);
}
export function styleTransferPrompt(profile,style){
 if(!authorized(profile)||!Object.hasOwn(VISUAL_STYLES,style))
  throw Error('허가된 출연자와 변환 표현 방식을 확인하세요.');
 const a=profile.appearance||{};
 const context=['hair','eyes','palette','body','outfit','accessories']
  .filter(x=>safe(a[x])).map(x=>x+': '+safe(a[x]).slice(0,140));
 const source=profile.kind==='person'?
  'Use the original consenting photographed person as the exact img2img subject, preserving recognizable individual traits where possible':
  'Use the original licensed 2D character artwork as the exact img2img subject, preserving its distinctive identity features';
 const prompt=[
  source,VISUAL_STYLES[style].prompt,'single same subject, no additional characters',
  'Character reference: '+safe(profile.name).slice(0,100),...context,
  'consistent palette, expression and outfit where possible','production quality, no text, no watermark'
 ].join('. ').slice(0,2800);
 return {prompt,negative:
  'another person, unrelated identity, duplicated subject, extra limbs, distorted eyes, text, watermark, malformed hands'};
}
export async function generateStyleTransferCandidates(profile,options,{
 session,signal,current,load=getFile,encode=readSourceFrame,
 health=checkComfy,personInference=generatePersonMvImage,
 characterInference=generateCharacterMvImage,onProgress=()=>{}
}={}){
 const source=validateStyleTransfer(profile,options);
 if(!session||typeof load!=='function'||typeof encode!=='function')
  throw Error('Windows EXE 내부 로컬 SD 세션이 필요합니다.');
 guard(profile,current,signal);
 const installed=await health(options.port,session,signal);
 guard(profile,current,signal);
 if(!Array.isArray(installed?.checkpoints)||!installed.checkpoints.includes(options.checkpoint))
  throw Error('설치된 로컬 SD 체크포인트 목록에 선택한 모델이 없습니다.');
 const original=await load(source.id);
 guard(profile,current,signal);
 if(!(original instanceof Blob)||original.size<64||original.size>12*1024*1024||
  !['image/png','image/jpeg'].includes(original.type))
  throw Error('원본 사진·캐릭터 그림 PNG/JPEG 파일이 IndexedDB에 없습니다.');
 const imageData=await encode(original);guard(profile,current,signal);
 const {prompt,negative}=styleTransferPrompt(profile,options.style);
 const candidates=[];
 for(let index=0;index<4;index++){
  guard(profile,current,signal);
  const seed=options.seed+index;
  onProgress(index,4,'실제 설치 SD 추론 '+(index+1)+' / 4');
  const payload={port:options.port,checkpoint:options.checkpoint,imageData,
   prompt,negative,width:768,height:768,steps:24,denoise:options.denoise,seed};
  const blob=await (profile.kind==='person'?personInference:characterInference)(
   attachIdentityLoRA(payload,profile),session,signal);
  guard(profile,current,signal);
  validateGeneratedImage(blob);
  candidates.push({blob,seed,style:options.style,sourceAssetId:source.id});
  onProgress(index+1,4,'새 이미지 후보 생성 '+(index+1)+' / 4');
 }
 return {version:1,sourceProfileId:profile.id,sourceSnapshot:snapshot(profile),
  profileKind:profile.kind,style:options.style,sourceAssetId:source.id,candidates,
  checkpoint:options.checkpoint};
}
export async function saveStyleTransferSelection(profile,generated,index,{
 current,existingIds=[],save=putFileNew,remove=removeFile,
 newId=genId,onSave
}={}){
 if(!generated||generated.version!==1||generated.sourceProfileId!==profile?.id||
 generated.sourceSnapshot!==snapshot(profile)||generated.profileKind!==profile.kind||
 !Array.isArray(generated.candidates)||generated.candidates.length!==4||
 !Number.isInteger(index)||index<0||index>3||typeof onSave!=='function')
  throw Error('원본 캐릭터와 AI 변환 후보를 다시 확인하세요.');
 guard(profile,current);
 const chosen=generated.candidates[index];
 validateGeneratedImage(chosen?.blob);
 if(chosen.style!==generated.style||chosen.sourceAssetId!==generated.sourceAssetId)
  throw Error('선택 후보가 등록 원본과 다릅니다.');
 if(profile.kind==='person')validatePersonSource(profile,generated.sourceAssetId);
 else validateCharacterArtwork(profile,generated.sourceAssetId);
 const assetId=newId('asset');
 const existing=new Set([...(profile.assets||[]).map(a=>a.id),...existingIds]);
 if(typeof assetId!=='string'||!/^asset_[A-Za-z0-9_-]{1,90}$/.test(assetId)||existing.has(assetId))
  throw Error('새 이미지 자산 ID가 이미 존재합니다.');
 const ext=chosen.blob.type==='image/jpeg'?'jpg':'png';
 const filename='MYVOCAL-스타일변환-'+chosen.style+'-'+chosen.seed+'.'+ext;
 const file=new File([chosen.blob],filename,{type:chosen.blob.type});
 const asset={id:assetId,name:filename,type:file.type,size:file.size,role:'portrait',
  generatedBy:'installed-local-sd-img2img',sourceProfileId:profile.id,
  sourceAssetId:chosen.sourceAssetId,sourceStyle:generated.style,
  seed:chosen.seed,checkpoint:generated.checkpoint};
 let next;
 if(profile.kind==='person'){
  const id=newId('char');
  if(typeof id!=='string'||!id||existingIds.includes(id)||id===profile.id)
   throw Error('파생 캐릭터 ID가 충돌했습니다.');
  next=normalizeCharacterIdentity({
   id,name:(profile.name+' · '+VISUAL_STYLES[generated.style].label).slice(0,120),
   kind:'character',rights:profile.rights,rightsNote:profile.rightsNote||'',
   description:('원본 등록 인물 '+profile.name+'의 로컬 SD 파생 캐릭터. 본인/허가 인물 연결 ID: '+profile.id).slice(0,1500),
   appearance:{...(profile.appearance||{})},assets:[asset],identityLock:true,
   derivedFromPersonId:profile.id,derivedFromAssetId:chosen.sourceAssetId,
   generatedStyle:generated.style
  });
 }else{
  if((profile.assets||[]).length>=MAX_CHARACTER_ASSETS)throw Error('캐릭터의 등록 자산이 64개입니다.');
  next=normalizeCharacterIdentity({...profile,assets:[...profile.assets,asset]},profile);
 }
 await save(assetId,file);
 try{
  guard(profile,current);
  await Promise.resolve(onSave(next));
 }catch(error){
  try{await remove(assetId);}
  catch(cleanup){throw Error('새 이미지 저장 중단 이후 새 자산 정리 실패: '+cleanup.message+' / '+error.message);}
  throw error;
 }
 return {profile:next,assetId,fileName:filename,
  derivedProfile:profile.kind==='person',sourceProfileId:profile.id};
}
