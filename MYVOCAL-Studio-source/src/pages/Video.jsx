import React,{useEffect,useRef,useState} from 'react';
import {Button,Empty,Field,Icon,Notice,Panel,SectionHead,Modal} from '../components/UI';
import VirtualBand90Editor from '../components/VirtualBand90Editor.jsx';
import LocalAiStoryboardPanel from '../components/LocalAiStoryboardPanel.jsx';
import LocalMvBatchPanel from '../components/LocalMvBatchPanel.jsx';
import Pv95Editor from '../components/Pv95Editor.jsx';
import {interpretMvInstruction93,applyMvInstruction93,undoMvInstruction93} from '../lib/mvNaturalEdit93.js';
import {regenerateNaturalMvScene,undoNeuralNaturalMvScene} from '../lib/mvNaturalMediaRegeneration.js';
import {previewSectionNaturalEdit,applySectionNaturalEdit,undoSectionNaturalEdit,regenerateSectionNaturalMvScenes,undoSectionNaturalMvScenes} from '../lib/mvSectionNaturalEdit.js';
import {prepareCharacterReplace94,applyCharacterReplace94,undoCharacterReplace94} from '../lib/characterReplace94.js';
import {eligibleBandCharacters} from '../lib/virtualBand90.js';
import {prepareRegeneration92,verifyRegeneration92,applyRegeneration92,undoRegeneration92} from '../lib/identityRegeneration92.js';
import {genId} from '../lib/schema';
import {downloadText} from '../lib/store';
import {getFile,putFile} from '../lib/assetDb.js';
import {buildSceneImageRequest,applySceneImage,isSceneImageStale,checkComfy,generateComfyImage} from '../lib/mvSceneImages.js';
import {videoSourceKey,applySceneVideo,isSceneVideoStale,checkLocalVideoEngine,generateLocalVideoClip,readSourceFrame} from '../lib/mvSceneVideos.js';
import {personPhotoAssets,validatePersonSource,linkPersonToMvScene,personSceneImageRequest,generatePersonMvImage,personMvSceneStatus} from '../lib/imageToMv.js';
import {characterArtworkAssets,validateCharacterArtwork,linkCharacterToMvScene,characterSceneImageRequest,generateCharacterMvImage,characterMvSceneStatus} from '../lib/characterToMv.js';
import {auditMvStoryboard,exportMvStoryboard,exportMvCutCsv,snapMvSceneToBeat} from '../lib/mvStoryboard.js';
import {inspectMvStoryboardImport,restoreMvStoryboard,MV_STORYBOARD_IMPORT_MAX_BYTES} from '../lib/mvStoryboardImport.js';
import {buildMvAnimatic,findMvAnimaticFrame,advanceMvAnimatic,exportMvAnimaticSrt} from '../lib/mvAnimatic.js';
import {buildMvShotSheet} from '../lib/mvShotSheet.js';
import {buildMvShotBook} from '../lib/mvShotBook.js';
import {buildMvDirectionPlan,exportMvDirectionPlan,setMvSceneRole,MV_DIRECTION_PRESENCE,MV_DIRECTION_MODES} from '../lib/mvDirection.js';
import MvVideoExporter from '../components/MvVideoExporter.jsx';
function SceneImage({assetId,alt}){
 const [url,setUrl]=useState('');const [missing,setMissing]=useState(false);
 useEffect(()=>{let active=true,objectUrl='';setUrl('');setMissing(false);
  if(assetId)getFile(assetId).then(file=>{if(!active)return;if(!file){setMissing(true);return;}objectUrl=URL.createObjectURL(file);setUrl(objectUrl);}).catch(()=>{if(active)setMissing(true);});
  return ()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[assetId]);
 if(!assetId)return <span className="muted">아직 저장된 장면 이미지가 없습니다.</span>;
 if(missing)return <span className="muted">연결된 이미지 파일을 찾지 못했습니다. 백업을 확인하세요.</span>;
 if(!url)return <span className="muted">이미지 읽는 중…</span>;
 return <img src={url} alt={alt||'저장된 AI 장면 이미지'} style={{display:'block',maxWidth:'100%',maxHeight:400,objectFit:'contain',borderRadius:8,margin:'10px auto'}}/>;
}
function SceneVideoClip({assetId,mime,title}){
 const [url,setUrl]=useState(''),[missing,setMissing]=useState(false);
 useEffect(()=>{let active=true,objectUrl='';setUrl('');setMissing(false);
  if(assetId)getFile(assetId).then(file=>{if(!active)return;if(!file){setMissing(true);return;}objectUrl=URL.createObjectURL(file);setUrl(objectUrl);}).catch(()=>{if(active)setMissing(true);});
  return ()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[assetId]);
 if(!assetId)return null;
 if(missing)return <p className="muted">영상 원본 파일을 찾지 못했습니다. 프로젝트 백업을 확인하세요.</p>;
 if(!url)return <p className="muted">영상 읽는 중…</p>;
 return mime==='video/mp4'?<video src={url} controls loop playsInline style={{width:'100%',maxHeight:410,background:'#111'}} aria-label={title||'생성된 영상 클립'}/>:
  <img src={url} alt={title||'SVD 애니메이션 WebP 영상'} style={{display:'block',width:'100%',maxHeight:410,objectFit:'contain',background:'#111'}}/>;
}
export default function Video({data,project,onChange,navigate,notify,mode='video',embedded=false,focusSceneId=''}){
 const p=project||data.projects[0];const [selected,setSelected]=useState(focusSceneId||'');const [pendingImport,setPendingImport]=useState(null);const [animaticPosition,setAnimaticPosition]=useState(0);const [animaticPlaying,setAnimaticPlaying]=useState(false);const [animaticSpeed,setAnimaticSpeed]=useState(1);const [shotSheetPage,setShotSheetPage]=useState(1);const animaticLastTick=useRef(null);
 const [imagePort,setImagePort]=useState('8188');const [checkpoints,setCheckpoints]=useState([]);const [checkpoint,setCheckpoint]=useState('');
 const [natural93,setNatural93]=useState(''),[review93,setReview93]=useState(null),[natural93Busy,setNatural93Busy]=useState(false),[natural93Status,setNatural93Status]=useState(''),[replace94Id,setReplace94Id]=useState(''),[review94,setReview94]=useState(null),[replace94All,setReplace94All]=useState(false);
 const [band90Open,setBand90Open]=useState(false),[regen92Busy,setRegen92Busy]=useState(false),[regen92Status,setRegen92Status]=useState('로컬 이미지 모델·기존 장면 이미지 필요'),[regen92Patch,setRegen92Patch]=useState('');
 const [imageBusy,setImageBusy]=useState(false);const [imageStatus,setImageStatus]=useState('로컬 ComfyUI 확인 필요');
 const [imageSteps,setImageSteps]=useState(20);const [imageSeed,setImageSeed]=useState('');const [imageSize,setImageSize]=useState('768x448');
 const [videoModels,setVideoModels]=useState([]),[videoModel,setVideoModel]=useState(''),[videoBusy,setVideoBusy]=useState(false),[videoStatus,setVideoStatus]=useState('로컬 SVD 영상 모델 확인 필요');
 const [videoFrames,setVideoFrames]=useState(14),[videoFps,setVideoFps]=useState(6),[videoSteps,setVideoSteps]=useState(20),[videoMotion,setVideoMotion]=useState(127),[videoSeed,setVideoSeed]=useState('');
 const [personId,setPersonId]=useState(''),[personPhotoId,setPersonPhotoId]=useState(''),[personDenoise,setPersonDenoise]=useState(0.35);
 const [personBusy,setPersonBusy]=useState(false),[personStatus,setPersonStatus]=useState('실제 사람 사진 선택 필요'),[personSeed,setPersonSeed]=useState('');
 const personAbort=useRef(null);
 const [pvCharacterId,setPvCharacterId]=useState(''),[pvArtworkId,setPvArtworkId]=useState(''),[pvDenoise,setPvDenoise]=useState(0.3),[pvSeed,setPvSeed]=useState('');
 const [pvBusy,setPvBusy]=useState(false),[pvStatus,setPvStatus]=useState('2D 캐릭터 그림 선택 필요');
 const pvAbort=useRef(null);
 const natural93Abort=useRef(null);
 const sectionAbort=useRef(null);
 const [sectionCommand,setSectionCommand]=useState(''),[sectionPlan,setSectionPlan]=useState(null);
 const [sectionBusy,setSectionBusy]=useState(false),[sectionStatus,setSectionStatus]=useState('');
 const latestProject=useRef(null);latestProject.current=p;
 const latestCharacters=useRef([]);latestCharacters.current=data.characters;
 const readSession=()=>typeof window==='undefined'?'':window.__MYVOCAL_SESSION_KEY||'';

 const current=p?.scenes?.find(s=>s.id===selected)||p?.scenes?.[0];
 const eligiblePeople=data.characters.filter(c=>c.kind==='person'&&(c.rights==='self'||(c.rights==='licensed'&&c.rightsNote?.trim()))&&personPhotoAssets(c).length);
 const selectedPerson=eligiblePeople.find(c=>c.id===personId)||null;
 const availablePhotos=personPhotoAssets(selectedPerson);
 const eligibleArtwork=data.characters.filter(c=>c.kind==='character'&&(c.rights==='owned'||c.rights==='self'||(c.rights==='licensed'&&c.rightsNote?.trim()))&&characterArtworkAssets(c).length);
 const pvCharacter=eligibleArtwork.find(c=>c.id===pvCharacterId)||null;
 const pvAssets=characterArtworkAssets(pvCharacter);
 const pvSelectedArtwork=pvAssets.some(a=>a.id===pvArtworkId)?pvArtworkId:pvAssets[0]?.id||'';
 const selectedPersonPhoto=availablePhotos.some(a=>a.id===personPhotoId)?personPhotoId:availablePhotos[0]?.id||'';
 let directionPlan=null,directionError='';
 if(p)try{directionPlan=buildMvDirectionPlan(p,data.characters);}catch(err){directionError=err.message;}
 const currentDirection=directionPlan?.scenes.find(s=>s.id===current?.id);
 const imageCharacter=data.characters.find(c=>c.id===(current?.characterId||p?.characterId))||null;
 const sceneImageRequest=current?buildSceneImageRequest(p,current,imageCharacter,currentDirection):null;
 const imageStale=current&&isSceneImageStale(current,sceneImageRequest);
 let currentVideoKey='';try{if(current?.imageAssetId&&sceneImageRequest)currentVideoKey=videoSourceKey(p,current,sceneImageRequest);}catch{}
 const videoStale=current&&isSceneVideoStale(current,currentVideoKey);
 const storyboardAudit=p?auditMvStoryboard(p,data.characters):null;
 let animatic=null,animaticError='';
 if(p)try{animatic=buildMvAnimatic(p,data.characters);}catch(err){animaticError=err.message;}
 const animaticFrame=animatic?findMvAnimaticFrame(animatic,Math.min(animaticPosition,animatic.durationSec)):null;
 const currentAnimaticDirection=directionPlan?.scenes.find(s=>s.id===animaticFrame?.scene?.id);
 const effectiveSheetPage=animatic?Math.min(shotSheetPage,Math.ceil(animatic.sceneCount/12)):1;
 let shotSheet=null;
 if(animatic)try{shotSheet=buildMvShotSheet(p,data.characters,effectiveSheetPage);}catch{shotSheet=null;}
 useEffect(()=>{if(!animaticPlaying||!animatic){animaticLastTick.current=null;return;}
  animaticLastTick.current=Date.now();
  const timer=setInterval(()=>{const now=Date.now();const elapsed=Math.max(0,now-animaticLastTick.current);animaticLastTick.current=now;
   setAnimaticPosition(old=>{const next=advanceMvAnimatic(animatic,Math.min(old,animatic.durationSec),elapsed,animaticSpeed);if(next.completed)setAnimaticPlaying(false);return next.seconds;});
  },80);
  return ()=>{clearInterval(timer);animaticLastTick.current=null;};
 },[p?.id,animaticPlaying,animaticSpeed,animatic?.durationSec,JSON.stringify(animatic?.scenes.map(s=>[s.id,s.start,s.end]))]);
 const testImageEngine=async()=>{setImageStatus('연결 확인 중…');setCheckpoints([]);setCheckpoint('');try{
  const session=readSession();if(!session)throw Error('Windows EXE에서 실행해야 로컬 이미지 엔진을 연결할 수 있습니다.');
  const port=Number(imagePort);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('포트 번호를 확인하세요.');
  const result=await checkComfy(port,session);setCheckpoints(result.checkpoints||[]);setCheckpoint(result.checkpoints?.[0]||'');
  setImageStatus(result.checkpoints?.length?`로컬 ComfyUI 연결됨 · 체크포인트 ${result.checkpoints.length}개`:'체크포인트가 없습니다. ComfyUI에 SD 모델을 설치하세요.');
 }catch(err){setImageStatus('연결 실패: '+err.message);notify('이미지 엔진 연결 실패: '+err.message);}};
 const renderSceneImage=async()=>{if(!current||imageBusy||pvBusy||personBusy)return;
  const initialId=current.id,initialProject=p.id,request=sceneImageRequest;
  try{
   const session=readSession();if(!session)throw Error('Windows EXE에서 실행해야 실제 AI 이미지 생성이 가능합니다.');
   if(current.personMv)throw Error('이 장면은 실제 사람 사진과 연결되어 있습니다. 사진 기반 생성은 Step79 패널을 이용하세요.');
   if(current.characterMv)throw Error('이 장면은 캐릭터 그림과 연결되어 있습니다. Step80 Character-to-MV 패널을 이용하세요.');
   if(imageCharacter?.rights==='reference')throw Error('참고용으로만 등록된 캐릭터는 직접 생성에 사용할 수 없습니다. 사용 권한을 먼저 확인하세요.');
   if(!checkpoint||!checkpoints.includes(checkpoint))throw Error('로컬 엔진 연결 확인 후 체크포인트를 선택하세요.');
   const port=Number(imagePort),steps=Number(imageSteps);
   const seed=imageSeed.trim()?Number(imageSeed):Math.floor(Math.random()*2000000000);
   if(!Number.isSafeInteger(seed)||seed<0)throw Error('시드 값은 0 이상의 정수여야 합니다.');
   setImageBusy(true);setImageStatus('ComfyUI 생성 진행 중…');
   const [width,height]=imageSize.split('x').map(Number);
   const blob=await generateComfyImage({port,checkpoint,prompt:request.prompt,negative:request.negative,width,height,steps,seed},session);
   const latest=latestProject.current;
   if(!latest||latest.id!==initialProject)throw Error('생성 도중 프로젝트가 바뀌었습니다. 결과를 자동 적용하지 않았습니다.');
   const scene=latest.scenes.find(s=>s.id===initialId);
   const character=latestCharacters.current.find(c=>c.id===(scene?.characterId||latest.characterId));
   let direction=null;try{direction=buildMvDirectionPlan(latest,latestCharacters.current).scenes.find(s=>s.id===initialId);}catch{}
   if(!scene||buildSceneImageRequest(latest,scene,character,direction).key!==request.key)throw Error('생성 중 장면·캐릭터·연출이 변경됐습니다. 기존 이미지를 유지했습니다.');
   const assetId=genId('img');const ext=blob.type==='image/jpeg'?'jpg':'png';
   await putFile(assetId,new File([blob],`MYVOCAL-${initialId}-${seed}.${ext}`,{type:blob.type}));
   onChange(applySceneImage(latest,initialId,assetId,request,{seed,checkpoint}));
   setImageStatus(`생성 완료 · ${Math.round(blob.size/1024)}KiB · 시드 ${seed}`);
   notify('Step77 장면 이미지를 프로젝트에 저장했습니다. 기존 이미지는 삭제하지 않았습니다.');
  }catch(err){setImageStatus('생성 실패: '+err.message);notify('Step77 이미지 생성 실패: '+err.message);}finally{setImageBusy(false);}
 };
 // STEP92: img2img uses only the already-registered consented photo/illustration.
 const regenerate92=async()=>{if(!current||regen92Busy||imageBusy||personBusy||pvBusy||videoBusy)return;
  const target=current.id;setRegen92Busy(true);try{
   if(!readSession())throw Error('Windows 로컬 EXE와 연결된 이미지 엔진이 필요합니다.');
   if(!checkpoint||!checkpoints.includes(checkpoint))throw Error('Step77에서 로컬 ComfyUI 체크포인트를 먼저 확인하세요.');
   const plan=prepareRegeneration92(p,target,data.characters,regen92Patch.trim()?{action:regen92Patch.trim()}:{});
   const blob=await getFile(plan.sourceAssetId);if(!blob)throw Error('등록된 원본 사진/그림 파일이 없습니다.');
   const imageData=await readSourceFrame(blob),[width,height]=imageSize.split('x').map(Number);
   const seed=Math.floor(Math.random()*2000000000);
   setRegen92Status('사용 허가 원본을 이용해 로컬 img2img 실행 중…');
   const inputs={port:Number(imagePort),checkpoint,prompt:plan.prompt,negative:plan.negative,imageData,width,height,steps:Number(imageSteps),seed,denoise:plan.denoise};
   const generated=plan.kind==='person'?await generatePersonMvImage(inputs,readSession()):await generateCharacterMvImage(inputs,readSession());
   const latest=latestProject.current;if(!latest||latest.id!==plan.projectId)throw Error('작업 중 프로젝트가 교체되었습니다.');
   verifyRegeneration92(latest,latestCharacters.current,plan);
   const assetId=genId('img'),ext=generated.type==='image/jpeg'?'jpg':'png';
   await putFile(assetId,new File([generated],`MYVOCAL-regen92-${target}-${seed}.${ext}`,{type:generated.type}));
   try{const updated=applyRegeneration92(latest,latestCharacters.current,plan,assetId,{seed,checkpoint});onChange(updated);setRegen92Status('재생성 성공 · 이전 이미지 ID는 복원 이력에 보존됨 · 정체성 시각적 일치 여부는 수동 검토 필요');}
   catch(e){/* New asset is unreferenced; remove without touching original. */await import('../lib/assetDb.js').then(m=>m.removeFile(assetId));throw e;}
  }catch(e){setRegen92Status('재생성 실패: '+e.message);notify('STEP92: '+e.message);}finally{setRegen92Busy(false);}
 };
 const undo92=()=>{try{if(!current)throw Error('장면을 선택하세요.');onChange(undoRegeneration92(p,current.id));setRegen92Status('이전 저장 이미지로 연결 복원 완료 · 기존 원본 파일은 그대로 보존됩니다.');}catch(e){notify('STEP92 복원 실패: '+e.message);}};
 const testVideoEngine=async()=>{setVideoStatus('SVD 로컬 엔진 확인 중…');setVideoModels([]);setVideoModel('');try{
  const session=readSession();if(!session)throw Error('Windows EXE에서 실행해야 로컬 영상 엔진에 연결됩니다.');
  const port=Number(imagePort);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('ComfyUI 포트를 확인하세요.');
  const result=await checkLocalVideoEngine(port,session);setVideoModels(result.models||[]);setVideoModel(result.models?.[0]||'');
  setVideoStatus(result.missingNodes?.length?`필수 SVD 노드 없음: ${result.missingNodes.join(', ')}`:result.ready?`ComfyUI SVD 연결됨 · 모델 ${result.models.length}개`:'SVD 모델이 없습니다. ComfyUI에 SVD/SVD-XT 체크포인트를 설치하세요.');
 }catch(err){setVideoStatus('연결 실패: '+err.message);notify('Step78 영상 엔진 연결 실패: '+err.message);}};
 const renderSceneVideo=async()=>{if(!current||videoBusy||pvBusy||personBusy)return;
  const sceneId=current.id,projectId=p.id,sourceKey=currentVideoKey,sourceAssetId=current.imageAssetId;
  try{
   const session=readSession();if(!session)throw Error('Windows EXE에서 실행해야 AI 영상 생성이 가능합니다.');
   if(!sourceKey||!sourceAssetId)throw Error('먼저 77단계에서 장면 이미지를 생성하세요.');
   if(imageStale)throw Error('장면 설정 변경으로 기존 이미지가 오래됐습니다. 이미지를 먼저 다시 생성하세요.');
   if(imageCharacter?.rights==='reference')throw Error('Reference 전용 캐릭터의 영상 생성은 허용되지 않습니다.');
   if(!videoModel||!videoModels.includes(videoModel))throw Error('로컬 ComfyUI에서 SVD 체크포인트를 선택하세요.');
   const file=await getFile(sourceAssetId);if(!file)throw Error('장면 원본 이미지가 없습니다.');
   const imageData=await readSourceFrame(file);
   const seed=videoSeed.trim()?Number(videoSeed):Math.floor(Math.random()*2000000000);
   if(!Number.isSafeInteger(seed)||seed<0)throw Error('시드는 0 이상의 정수여야 합니다.');
   setVideoBusy(true);setVideoStatus('ComfyUI SVD 영상 생성 중…');
   const frames=Number(videoFrames),fps=Number(videoFps);
   const blob=await generateLocalVideoClip({port:Number(imagePort),checkpoint:videoModel,imageData,frames,fps,steps:Number(videoSteps),motion:Number(videoMotion),seed},session);
   const latest=latestProject.current;
   if(!latest||latest.id!==projectId)throw Error('작업 중 프로젝트가 바뀌어 영상 자동 적용을 중지했습니다.');
   const scene=latest.scenes.find(x=>x.id===sceneId);
   const character=latestCharacters.current.find(c=>c.id===(scene?.characterId||latest.characterId));
   let direction=null;try{direction=buildMvDirectionPlan(latest,latestCharacters.current).scenes.find(x=>x.id===sceneId);}catch{}
   const newImageRequest=scene&&buildSceneImageRequest(latest,scene,character,direction);
   if(!scene||videoSourceKey(latest,scene,newImageRequest)!==sourceKey)throw Error('장면·이미지·캐릭터·연출 변경을 감지했습니다. 기존 영상을 보존했습니다.');
   const assetId=genId('vid'),ext=blob.type==='video/mp4'?'mp4':'webp';
   await putFile(assetId,new File([blob],`MYVOCAL-${sceneId}-${seed}.${ext}`,{type:blob.type}));
   onChange(applySceneVideo(latest,sceneId,assetId,sourceKey,{checkpoint:videoModel,seed,frames,fps,mime:blob.type}));
   setVideoStatus(`생성 완료 · ${frames}프레임 / ${fps}fps · ${Math.round(blob.size/1024)}KiB`);
   notify('Step78 영상 클립을 기존 프로젝트에 추가했습니다. 기존 이미지와 영상 원본은 보존됩니다.');
  }catch(err){setVideoStatus('생성 실패: '+err.message);notify('Step78 영상 생성 실패: '+err.message);}finally{setVideoBusy(false);}
 };
 // Step79: full local real-person photo -> scene still -> short moving clip chain.
 // Each completed scene is saved separately, and the original photo is never overwritten.
 const createPersonMv=async(allScenes=false)=>{
  if(personBusy||pvBusy||!p)return;
  const controller=new AbortController();personAbort.current=controller;
  try{
   if(!selectedPerson||!selectedPersonPhoto)throw Error('사용 권한이 확인된 실제 사람과 등록 사진을 선택하세요.');
   validatePersonSource(selectedPerson,selectedPersonPhoto);
   const session=readSession();if(!session)throw Error('Windows EXE에서만 로컬 AI 추론 엔진을 호출할 수 있습니다.');
   if(!checkpoint||!checkpoints.includes(checkpoint))throw Error('Step77에서 SD 이미지 모델을 먼저 확인하고 선택하세요.');
   if(!videoModel||!videoModels.includes(videoModel))throw Error('Step78에서 SVD 영상 모델을 먼저 확인하고 선택하세요.');
   const chosen=allScenes?p.scenes.filter(s=>!s.characterId||s.characterId===selectedPerson.id):[current];
   if(!chosen?.length)throw Error('선택한 사람을 배치할 장면이 없습니다. 기존 다른 캐릭터 장면은 덮어쓰지 않습니다.');
   if(!allScenes&&current.characterId&&current.characterId!==selectedPerson.id&&!confirm('이 장면에 지정된 다른 캐릭터 대신 선택한 실제 사람을 연결할까요? 기존 이미지와 영상 파일은 삭제되지 않습니다.'))return;
   if(allScenes&&!confirm(`${chosen.length}개 장면에 선택한 사람의 사진을 연결해 이미지 및 SVD 클립을 순차 생성할까요? 기존 저장 파일은 삭제하지 않습니다. 긴 작업이 될 수 있습니다.`))return;
   const photo=await getFile(selectedPersonPhoto);if(!photo)throw Error('등록된 사람 사진 원본을 찾을 수 없습니다.');
   const imageData=await readSourceFrame(photo);
   const baseSeed=personSeed.trim()?Number(personSeed):Math.floor(Math.random()*2000000000);
   if(!Number.isSafeInteger(baseSeed)||baseSeed<0||baseSeed>9007199254720000)throw Error('시드 범위 오류');
   const [width,height]=imageSize.split('x').map(Number),frames=Number(videoFrames),fps=Number(videoFps);
   const projectId=p.id,photoId=selectedPersonPhoto,personIdentity=selectedPerson.id;
   setPersonBusy(true);
   for(let i=0;i<chosen.length;i++){
    if(controller.signal.aborted)throw Error('사용자 요청으로 작업 중단');
    const targetId=chosen[i].id;
    const person=latestCharacters.current.find(c=>c.id===personIdentity);
    validatePersonSource(person,photoId);
    const base=latestProject.current;
    if(!base||base.id!==projectId)throw Error('프로젝트가 변경되어 작업을 중단했습니다.');
    const prior=base.scenes.find(s=>s.id===targetId);
    if(!prior)throw Error('대상 장면이 삭제되었습니다.');
    if(allScenes&&prior.characterId&&prior.characterId!==personIdentity)throw Error('다른 사람으로 바뀐 장면은 덮어쓰지 않습니다.');
    const linked=linkPersonToMvScene(base,targetId,person,photoId,Number(personDenoise));
    let direction=null;try{direction=buildMvDirectionPlan(linked,latestCharacters.current).scenes.find(x=>x.id===targetId);}catch{}
    const linkedScene=linked.scenes.find(x=>x.id===targetId);
    const request=personSceneImageRequest(linked,linkedScene,person,direction);
    // Persist the association first, so backup/recovery can continue from the photo source.
    latestProject.current=linked;onChange(linked);
    const seed=baseSeed+i;
    setPersonStatus(`장면 ${i+1}/${chosen.length} · ${linkedScene.title} · 실제 사진 기반 이미지 생성 중`);
    const still=await generatePersonMvImage({port:Number(imagePort),checkpoint,prompt:request.prompt,negative:request.negative,imageData,width,height,steps:Number(imageSteps),seed,denoise:Number(personDenoise)},session,controller.signal);
    const latest=latestProject.current;
    if(!latest||latest.id!==projectId)throw Error('프로젝트가 변경되어 결과를 저장하지 않았습니다.');
    const latestScene=latest.scenes.find(x=>x.id===targetId);
    const latestPerson=latestCharacters.current.find(c=>c.id===personIdentity);
    validatePersonSource(latestPerson,photoId);
    let latestDirection=null;try{latestDirection=buildMvDirectionPlan(latest,latestCharacters.current).scenes.find(x=>x.id===targetId);}catch{}
    if(!latestScene||personSceneImageRequest(latest,latestScene,latestPerson,latestDirection).key!==request.key)throw Error('생성 도중 장면·사람·사진·연출 변경. 결과를 자동 적용하지 않았습니다.');
    const imageId=genId('img');
    await putFile(imageId,new File([still],`MYVOCAL-PersonMV-${targetId}-${seed}.${still.type==='image/jpeg'?'jpg':'png'}`,{type:still.type}));
    let updated=applySceneImage(latest,targetId,imageId,request,{seed,checkpoint,source:'person-img2img'});
    latestProject.current=updated;onChange(updated);
    const newScene=updated.scenes.find(x=>x.id===targetId),videoKey=videoSourceKey(updated,newScene,request);
    setPersonStatus(`장면 ${i+1}/${chosen.length} · ${linkedScene.title} · SVD 영상 클립 생성 중 (이미지 저장됨)`);
    const stillData=await readSourceFrame(still);
    const moving=await generateLocalVideoClip({port:Number(imagePort),checkpoint:videoModel,imageData:stillData,frames,fps,steps:Number(videoSteps),motion:Number(videoMotion),seed:seed+10001},session,controller.signal);
    // Stop on edits; do not attach a mismatched clip to a newly edited scene.
    const again=latestProject.current;
    const sceneNow=again?.scenes.find(x=>x.id===targetId);
    const personNow=latestCharacters.current.find(c=>c.id===personIdentity);
    validatePersonSource(personNow,photoId);
    let directionNow=null;try{directionNow=buildMvDirectionPlan(again,latestCharacters.current).scenes.find(x=>x.id===targetId);}catch{}
    if(!again||again.id!==projectId||!sceneNow||videoSourceKey(again,sceneNow,personSceneImageRequest(again,sceneNow,personNow,directionNow))!==videoKey)throw Error('영상 생성 도중 장면 설정이 변경됐습니다. 이전 파일을 보존했습니다.');
    const videoId=genId('vid');
    await putFile(videoId,new File([moving],`MYVOCAL-PersonMV-${targetId}-${seed}.${moving.type==='video/mp4'?'mp4':'webp'}`,{type:moving.type}));
    updated=applySceneVideo(again,targetId,videoId,videoKey,{checkpoint:videoModel,frames,fps,seed:seed+10001,mime:moving.type});
    latestProject.current=updated;onChange(updated);
    setPersonStatus(`${i+1}/${chosen.length}개 장면 저장 완료 · 사진 기반 이미지 + ${frames}프레임 영상`);
   }
   notify(`Step79: ${chosen.length}개 장면의 사진 기반 이미지 및 SVD 영상 클립을 저장했습니다.`);
  }catch(e){setPersonStatus('중지/오류: '+e.message);notify('Step79 Image-to-MV: '+e.message);}finally{personAbort.current=null;setPersonBusy(false);}
 };
 // Step80: registered original illustration -> local img2img still -> local SVD clip.
 // Source artwork remains untouched. Project tracks and existing scene media are not deleted.
 const createCharacterPv=async(allScenes=false)=>{
  if(pvBusy||personBusy||imageBusy||videoBusy||!p)return;
  const controller=new AbortController();pvAbort.current=controller;
  try{
   if(!pvCharacter||!pvSelectedArtwork)throw Error('사용 권한이 있는 2D 캐릭터와 등록 그림을 선택하세요.');
   validateCharacterArtwork(pvCharacter,pvSelectedArtwork);
   const session=readSession();if(!session)throw Error('Windows EXE에서만 로컬 AI 영상 제작이 가능합니다.');
   if(!checkpoint||!checkpoints.includes(checkpoint))throw Error('Step77 이미지 SD 체크포인트 확인이 필요합니다.');
   if(!videoModel||!videoModels.includes(videoModel))throw Error('Step78 영상 SVD 모델 확인이 필요합니다.');
   const eligible=allScenes?p.scenes.filter(s=>!s.characterId||s.characterId===pvCharacter.id):[current];
   if(!eligible.length||eligible.some(s=>!s))throw Error('제작할 장면이 없습니다.');
   if(!allScenes&&current.characterId&&current.characterId!==pvCharacter.id&&!confirm('현재 장면의 다른 인물을 선택한 2D 캐릭터로 교체할까요? 원본과 기존 장면 이미지·영상 파일은 삭제하지 않습니다.'))return;
   if(allScenes&&!confirm(`${eligible.length}개 장면에 등록된 2D 캐릭터 그림을 연결하고 짧은 SVD 애니메이션 클립을 순서대로 만들까요? 기존 파일은 삭제하지 않습니다.`))return;
   const artwork=await getFile(pvSelectedArtwork);if(!artwork)throw Error('등록된 캐릭터 원본 그림 파일을 찾지 못했습니다.');
   const imageData=await readSourceFrame(artwork);
   const baseSeed=pvSeed.trim()?Number(pvSeed):Math.floor(Math.random()*2000000000);
   if(!Number.isSafeInteger(baseSeed)||baseSeed<0||baseSeed>9007199254720000-eligible.length-10001)throw Error('시드 범위 오류');
   const [width,height]=imageSize.split('x').map(Number),frames=Number(videoFrames),fps=Number(videoFps);
   const projectId=p.id,characterId=pvCharacter.id,artId=pvSelectedArtwork;
   setPvBusy(true);
   for(let i=0;i<eligible.length;i++){
    if(controller.signal.aborted)throw Error('사용자가 제작을 중단했습니다.');
    const targetId=eligible[i].id;
    const character=latestCharacters.current.find(c=>c.id===characterId);
    validateCharacterArtwork(character,artId);
    const before=latestProject.current;
    if(!before||before.id!==projectId)throw Error('프로젝트가 변경되어 중단했습니다.');
    const prior=before.scenes.find(s=>s.id===targetId);
    if(!prior)throw Error('대상 장면이 삭제됐습니다.');
    if(allScenes&&prior.characterId&&prior.characterId!==characterId)throw Error('다른 캐릭터가 지정된 장면은 덮어쓰지 않습니다.');
    const linked=linkCharacterToMvScene(before,targetId,character,artId,Number(pvDenoise));
    const linkedScene=linked.scenes.find(s=>s.id===targetId);
    let direction=null;try{direction=buildMvDirectionPlan(linked,latestCharacters.current).scenes.find(s=>s.id===targetId);}catch{}
    const request=characterSceneImageRequest(linked,linkedScene,character,direction);
    latestProject.current=linked;onChange(linked); // Persist link before compute, supports recovery.
    const seed=baseSeed+i;
    setPvStatus(`장면 ${i+1}/${eligible.length} · ${linkedScene.title} · 2D 캐릭터 원본 그림 기반 이미지 생성 중`);
    const still=await generateCharacterMvImage({port:Number(imagePort),checkpoint,prompt:request.prompt,negative:request.negative,imageData,width,height,steps:Number(imageSteps),seed,denoise:Number(pvDenoise)},session,controller.signal);
    const latest=latestProject.current;
    if(!latest||latest.id!==projectId)throw Error('이미지 생성 도중 프로젝트가 바뀌었습니다. 기존 파일은 보존됩니다.');
    const scene=latest.scenes.find(s=>s.id===targetId),nowCharacter=latestCharacters.current.find(c=>c.id===characterId);
    validateCharacterArtwork(nowCharacter,artId);
    let currentDirection=null;try{currentDirection=buildMvDirectionPlan(latest,latestCharacters.current).scenes.find(s=>s.id===targetId);}catch{}
    if(!scene||characterSceneImageRequest(latest,scene,nowCharacter,currentDirection).key!==request.key)throw Error('이미지 생성 중 장면·그림·연출이 바뀌어 저장을 중단했습니다.');
    const imgId=genId('img');
    await putFile(imgId,new File([still],`MYVOCAL-CharacterPV-${targetId}-${seed}.${still.type==='image/jpeg'?'jpg':'png'}`,{type:still.type}));
    let updated=applySceneImage(latest,targetId,imgId,request,{seed,checkpoint,source:'character-img2img'});
    latestProject.current=updated;onChange(updated);
    const imageScene=updated.scenes.find(s=>s.id===targetId),videoKey=videoSourceKey(updated,imageScene,request);
    setPvStatus(`장면 ${i+1}/${eligible.length} · ${linkedScene.title} · 짧은 애니메이션 WebP 생성 중 (장면 이미지 저장됨)`);
    const stillData=await readSourceFrame(still);
    const clip=await generateLocalVideoClip({port:Number(imagePort),checkpoint:videoModel,imageData:stillData,frames,fps,steps:Number(videoSteps),motion:Number(videoMotion),seed:seed+10001},session,controller.signal);
    const finalProject=latestProject.current;
    if(!finalProject||finalProject.id!==projectId)throw Error('영상 생성 도중 프로젝트가 변경됐습니다.');
    const finalScene=finalProject.scenes.find(s=>s.id===targetId),finalCharacter=latestCharacters.current.find(c=>c.id===characterId);
    validateCharacterArtwork(finalCharacter,artId);
    let lastDirection=null;try{lastDirection=buildMvDirectionPlan(finalProject,latestCharacters.current).scenes.find(s=>s.id===targetId);}catch{}
    if(!finalScene||videoSourceKey(finalProject,finalScene,characterSceneImageRequest(finalProject,finalScene,finalCharacter,lastDirection))!==videoKey)throw Error('영상 생성 도중 장면·캐릭터·그림·연출이 변경돼 자동 적용하지 않았습니다.');
    const vidId=genId('vid');
    await putFile(vidId,new File([clip],`MYVOCAL-CharacterPV-${targetId}-${seed}.${clip.type==='video/mp4'?'mp4':'webp'}`,{type:clip.type}));
    updated=applySceneVideo(finalProject,targetId,vidId,videoKey,{checkpoint:videoModel,frames,fps,seed:seed+10001,mime:clip.type});
    latestProject.current=updated;onChange(updated);
    setPvStatus(`${i+1}/${eligible.length}개 장면 저장 · 2D 그림 기반 이미지 + ${frames}프레임 애니메이션`);
   }
   notify(`Step80: ${eligible.length}개 장면의 캐릭터 PV 클립을 저장했습니다. 원본 그림은 그대로 유지됩니다.`);
  }catch(err){setPvStatus('중지/오류: '+err.message);notify('Step80 Character-to-MV: '+err.message);}
  finally{pvAbort.current=null;setPvBusy(false);}
 };
 const exportSceneVideo=async()=>{if(!current?.videoClipAssetId)return;try{
  const file=await getFile(current.videoClipAssetId);if(!file)throw Error('저장된 영상 파일을 찾지 못했습니다.');
  const ext=file.type==='video/mp4'?'mp4':'webp';const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=`MYVOCAL-${String(current.id).replace(/[^a-zA-Z0-9_-]/g,'_')}.${ext}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }catch(err){notify('영상 내보내기 실패: '+err.message);}};
 const exportSceneImage=async()=>{if(!current?.imageAssetId)return;try{const file=await getFile(current.imageAssetId);if(!file)throw Error('원본 이미지를 찾을 수 없습니다.');const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=`MYVOCAL-${String(current.id).replace(/[^a-zA-Z0-9_-]/g,'_')}.${file.type==='image/jpeg'?'jpg':'png'}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(err){notify('이미지 내보내기 실패: '+err.message);}};
 const seekAnimatic=next=>{setAnimaticPlaying(false);setAnimaticPosition(Number(next));};
 const downloadShotSheet=()=>{try{if(!shotSheet)throw Error('컷 시트가 없습니다.');const suffix=String(p.id||'project').replace(/[^a-zA-Z0-9_-]/g,'_');downloadText(shotSheet.svg,`MYVOCAL-shots-${suffix}-page-${effectiveSheetPage}.svg`,'image/svg+xml;charset=utf-8');notify('수동 컷 시트 SVG를 저장했습니다. 이미지·영상 원본은 포함되지 않습니다.');}catch(e){notify('컷 시트 내보내기 실패: '+e.message);}};
 const downloadDirectionPlan=()=>{try{const guide=exportMvDirectionPlan(p,data.characters);const suffix=String(p.id||'project').replace(/[^a-zA-Z0-9_-]/g,'_');downloadText(JSON.stringify(guide,null,2),`MYVOCAL-direction-${suffix}.json`,'application/json;charset=utf-8');notify('연출 계획 메타데이터 JSON을 저장했습니다. 오디오·사진·영상은 포함되지 않습니다.');}catch(e){notify('연출 계획 저장 실패: '+e.message);}};
 const setSceneDirection=(role)=>{try{onChange(setMvSceneRole(p,current.id,role));notify('해당 장면의 연출 역할을 프로젝트에 저장했습니다.');}catch(e){notify('장면 연출 변경 실패: '+e.message);}};
 const downloadShotBook=()=>{try{const book=buildMvShotBook(p,data.characters);const suffix=String(p.id||'project').replace(/[^a-zA-Z0-9_-]/g,'_');downloadText(book.html,`MYVOCAL-shotbook-${suffix}.html`,'text/html;charset=utf-8');notify(`전체 ${book.sceneCount}컷 / ${book.pageCount}페이지 컷북 HTML을 저장했습니다. 로컬 브라우저에서 열어 인쇄할 수 있습니다.`);}catch(e){notify('전체 컷북 저장 실패: '+e.message);}};
 const downloadAnimaticSrt=()=>{try{const suffix=String(p.id||'project').replace(/[^a-zA-Z0-9_-]/g,'_');downloadText(exportMvAnimaticSrt(p,data.characters),`MYVOCAL-scene-guide-${suffix}.srt`,'application/x-subrip;charset=utf-8');notify('수동 장면 제목 기반 SRT 가이드를 저장했습니다. 실제 보컬 자막은 아닙니다.');}catch(e){notify('장면 SRT 저장 실패: '+e.message);}};

 const exportStoryboard=(kind)=>{try{const suffix=String(p.id||'project').replace(/[^a-zA-Z0-9_-]/g,'_');if(kind==='json')downloadText(JSON.stringify(exportMvStoryboard(p,data.characters),null,2),`MYVOCAL-storyboard-${suffix}.json`,'application/json');else downloadText(exportMvCutCsv(p,data.characters),`MYVOCAL-cutlist-${suffix}.csv`,'text/csv;charset=utf-8');notify('로컬 스토리보드 목록을 저장했습니다. 원본 미디어는 포함되지 않습니다.');}catch(e){notify('목록 내보내기 실패: '+e.message);}};
 const snapCurrent=(grid)=>{if(!current)return;try{const next=snapMvSceneToBeat(p,current.id,grid);onChange(next);notify(grid==='bar'?'선택 장면을 4/4 마디 기준으로 맞췄습니다.':'선택 장면을 BPM 박자 기준으로 맞췄습니다.');}catch(e){notify('박자 맞춤 실패: '+e.message);}};
 const inspectImportFile=async event=>{const file=event.target.files?.[0];event.target.value='';setPendingImport(null);if(!file)return;
  try{if(file.size>MV_STORYBOARD_IMPORT_MAX_BYTES)throw Error('파일이 512 KiB를 초과합니다.');const content=await file.text();const review=inspectMvStoryboardImport(p,content,data.characters);setPendingImport({content,review,projectId:p.id,sceneSnapshot:JSON.stringify(p.scenes),bpm:p.bpm});notify(`스토리보드 ${review.importedSceneCount}개 장면 확인 완료. 적용 버튼을 눌러야 변경됩니다.`);}
  catch(e){notify('스토리보드 읽기 실패: '+e.message);}};
 const applyImportedScenes=()=>{if(!pendingImport)return;try{if(p.id!==pendingImport.projectId||p.bpm!==pendingImport.bpm||JSON.stringify(p.scenes)!==pendingImport.sceneSnapshot)throw Error('미리보기 이후 프로젝트 장면이 변경됐습니다. 파일을 다시 확인하세요.');const updated=restoreMvStoryboard(p,pendingImport.content,data.characters);onChange(updated);setSelected('');setPendingImport(null);notify('장면 목록을 로컬 프로젝트에 복원했습니다. 기존 미디어·트랙은 변경하지 않았습니다.');}catch(e){notify('스토리보드 복원 실패: '+e.message);setPendingImport(null);}};
 const reviewNatural93=()=>{try{if(!current)throw Error('장면을 선택하세요.');setReview93(interpretMvInstruction93(p,current.id,natural93));}catch(e){setReview93(null);notify('STEP93: '+e.message);}};
 const applyNatural93=()=>{try{if(!review93)throw Error('검토할 지시가 없습니다.');onChange(applyMvInstruction93(p,review93));setReview93(null);notify('자연어 장면 수정 적용. 이미지·영상 원본은 보존되며 필요하면 재생성하세요.');}catch(e){setReview93(null);notify('STEP93 적용 실패: '+e.message);}};
 const regenerateNatural93=async()=>{
  if(!review93||natural93Busy||imageBusy||videoBusy||personBusy||pvBusy||regen92Busy)return;
  const controller=new AbortController();natural93Abort.current=controller;
  setNatural93Busy(true);setNatural93Status('실제 SD/SVD 생성 준비 중');
  try{
   if(!checkpoint||!checkpoints.includes(checkpoint)||!videoModel||!videoModels.includes(videoModel))
    throw Error('로컬 이미지 SD와 영상 SVD 모델을 먼저 확인하세요.');
   const [width,height]=imageSize.split('x').map(Number);
   const result=await regenerateNaturalMvScene(p,review93,data.characters,{
    port:Number(imagePort),session:readSession(),checkpoint,videoModel,width,height,
    imageSteps:Number(imageSteps),frames:Number(videoFrames),fps:Number(videoFps),
    videoSteps:Number(videoSteps),motion:Number(videoMotion),signal:controller.signal,
    current:()=>latestProject.current,currentCharacters:()=>latestCharacters.current,
    commit:next=>{latestProject.current=next;onChange(next)},onProgress:setNatural93Status
   });
   setReview93(null);notify('실제 SD 이미지·SVD 영상 '+result.sceneId+' 장면 수정 완료 · 원본 보존');
  }catch(e){setNatural93Status('생성 중단: '+e.message);notify('자연어 실제 영상 수정: '+e.message);}
  finally{natural93Abort.current=null;setNatural93Busy(false);}
 };
 const undoNaturalMedia93=()=>{try{
  const next=undoNeuralNaturalMvScene(p);onChange(next);setReview93(null);
  setNatural93Status('직전 장면과 이전 이미지·영상 연결 복원 완료');
 }catch(e){notify('실제 영상 수정 복원: '+e.message);}};
 const reviewSection93=()=>{
  try{const plan=previewSectionNaturalEdit(p,sectionCommand);setSectionPlan(plan);setSectionStatus(plan.summary);}
  catch(e){setSectionPlan(null);notify('구간 편집 검토: '+e.message);}
 };
 const applySection93=()=>{
  try{
   if(!sectionPlan)throw Error('먼저 구간 편집 내용을 검토하세요.');
   const next=applySectionNaturalEdit(p,sectionPlan);
   latestProject.current=next;onChange(next);setSectionPlan(null);
   setSectionStatus('구간 장면 '+sectionPlan.sceneIds.length+'개 설명 수정 완료');
  }catch(e){setSectionPlan(null);notify('구간 설명 수정: '+e.message);}
 };
 const undoSection93=()=>{
  try{const next=undoSectionNaturalEdit(p);latestProject.current=next;onChange(next);
   setSectionStatus('직전 구간 장면 설명 복원 완료');setSectionPlan(null);}
  catch(e){notify('구간 설명 복원: '+e.message);}
 };
 const renderSection93=async()=>{
  if(!sectionPlan||sectionBusy||natural93Busy||imageBusy||videoBusy||personBusy||pvBusy||regen92Busy)return;
  const controller=new AbortController();sectionAbort.current=controller;setSectionBusy(true);
  try{
   if(!checkpoint||!checkpoints.includes(checkpoint)||!videoModel||!videoModels.includes(videoModel))
    throw Error('로컬 SD 이미지·SVD 영상 모델을 먼저 확인하세요.');
   const [width,height]=imageSize.split('x').map(Number);
   const result=await regenerateSectionNaturalMvScenes(p,sectionPlan,data.characters,{
    port:Number(imagePort),session:readSession(),checkpoint,videoModel,width,height,
    imageSteps:Number(imageSteps),frames:Number(videoFrames),fps:Number(videoFps),
    videoSteps:Number(videoSteps),motion:Number(videoMotion),signal:controller.signal,
    current:()=>latestProject.current,currentCharacters:()=>latestCharacters.current,
    commit:next=>{latestProject.current=next;onChange(next)},onProgress:setSectionStatus
   });
   setSectionPlan(null);setSectionStatus(result.generatedVideos+'개 실제 SD/SVD 장면 신규 저장 완료');
   notify('구간 실제 영상 '+result.generatedVideos+'개 생성 완료');
  }catch(e){setSectionStatus('구간 생성 중단: '+e.message);notify('구간 실제 영상 생성: '+e.message);}
  finally{sectionAbort.current=null;setSectionBusy(false);}
 };
 const undoSectionVideo93=()=>{
  try{const next=undoSectionNaturalMvScenes(p);latestProject.current=next;onChange(next);
   setSectionStatus('직전 구간의 원래 이미지·영상 연결을 일괄 복원했습니다.');setSectionPlan(null);}
  catch(e){notify('구간 영상 연결 복원: '+e.message);}
 };
 const reviewReplacement94=()=>{try{setReview94(prepareCharacterReplace94(p,replace94All?p.scenes.map(s=>s.id):[current.id],replace94Id,data.characters));}catch(e){setReview94(null);notify('STEP94: '+e.message);}};
 const applyReplacement94=()=>{try{if(!review94)throw Error('교체 내용을 먼저 확인하세요.');onChange(applyCharacterReplace94(p,review94,data.characters));setReview94(null);notify('캐릭터 링크 교체 완료. 이전 미디어는 복원 이력에 보존되고 새 인물의 이미지 생성은 별도로 필요합니다.');}catch(e){setReview94(null);notify('STEP94 적용 실패: '+e.message);}};
 const change=(patch)=>onChange({...p,...patch});
 const setScene=(id,patch)=>change({scenes:p.scenes.map(s=>s.id===id?{...s,...patch}:s)});
 const addScene=()=>{const last=p.scenes.at(-1);const start=last?Number(last.end):0;const id=genId('scn');change({scenes:[...p.scenes,{id,start,end:start+12,title:`Scene ${String(p.scenes.length+1).padStart(2,'0')}`,description:'새 장면',characterId:p.characterId||'',location:'',outfit:'',expression:'',action:'',camera:'',lighting:''}]});setSelected(id);};
 if(!p)return <>{!embedded&&<SectionHead eyebrow="VIDEO STUDIO" title={mode==='pv'?'Vocal Synth PV':'Music Video Studio'}/>}<Empty icon="video" title="프로젝트를 먼저 만들어 주세요" description="각 프로젝트에서 씬 구성과 캐릭터 연출을 설정할 수 있습니다." action={<Button variant="primary" icon="plus" onClick={()=>navigate('create')}>프로젝트 만들기</Button>}/></>;
 return <>{!embedded&&<SectionHead eyebrow={mode==='pv'?'VOCAL SYNTH PV':'STORYBOARD EDITOR'} title={mode==='pv'?'Vocal Synth PV':'Music Video Studio'} description="곡에 맞춰 장면을 편집하고, 실제 화면과 음악을 이어 WebM 뮤직비디오로 저장합니다." action={<Button icon="folder" onClick={()=>navigate('projects')}>프로젝트 보기</Button>}/>}
 <div className="video-project-banner"><Icon name="music" size={20}/><strong>{p.title}</strong><span>·</span><span>{p.bpm} BPM</span><span className="banner-stretch"/><span>Step78 로컬 SVD 장면별 영상 클립 연결</span></div>
 <LocalAiStoryboardPanel project={p} onChange={onChange} notify={notify}/>
 <LocalMvBatchPanel project={p} data={data} checkpoint={checkpoint} videoModel={videoModel} imagePort={imagePort} imageSteps={imageSteps} imageSize={imageSize} videoFrames={videoFrames} videoFps={videoFps} videoSteps={videoSteps} videoMotion={videoMotion} current={()=>latestProject.current} commit={next=>{latestProject.current=next;onChange(next)}} session={readSession} notify={notify}/>
 <Panel title="STEP93 · AI 영상 자연어 수정" description="로컬 명령 문법으로 선택한 장면의 속성 하나 또는 서로 다른 두 속성을 함께 검토·편집합니다. 미리보기·확인 후 적용하며 AI 모델 추론이 아닙니다.">
 <Field label="장면 자연어 명령"><input aria-label="Step93 자연어 명령" maxLength={500} value={natural93} onChange={e=>{setNatural93(e.target.value);setReview93(null);}} placeholder="배경을 비 오는 밤거리로 바꿔 그리고 조명을 네온 불빛으로 바꿔"/></Field>
 <div className="hstack" style={{gap:8,flexWrap:'wrap'}}><Button disabled={!current} onClick={reviewNatural93}>변경 내용 검토</Button><Button disabled={!review93} onClick={applyNatural93}>검토한 수정 적용</Button><Button disabled={!p.videoEdits93?.history?.length} onClick={()=>{try{onChange(undoMvInstruction93(p));notify('직전 장면 문구 복원 완료');}catch(e){notify(e.message);}}}>직전 수정 되돌리기</Button></div>
 <div className="hstack" style={{gap:8,flexWrap:'wrap'}}>
   <Button variant="primary" disabled={!review93||natural93Busy||imageBusy||videoBusy||personBusy||pvBusy||regen92Busy||!checkpoint||!videoModel} onClick={regenerateNatural93}>{natural93Busy?'실제 SD/SVD 생성 중…':'검토한 자연어 수정으로 실제 장면 영상 재생성'}</Button>
   <Button disabled={!p.mvNeuralNaturalEdits?.history?.length||natural93Busy} onClick={undoNaturalMedia93}>이전 실제 이미지·영상 복원</Button>
   {natural93Busy&&<Button onClick={()=>natural93Abort.current?.abort()}>실제 생성 취소</Button>}
  </div>
  {natural93Status&&<p role="status" className="muted">{natural93Status}</p>}
  <p className="muted">설치된 로컬 SD 모델로 수정된 장면 이미지를 새로 만들고 SVD 모델로 실제 움직이는 클립을 생성합니다. 등록된 인물·캐릭터는 먼저 허가된 사진·원화를 장면에 연결해야 합니다. 이전 이미지·영상은 덮어쓰지 않고 복원 이력에 남깁니다. GPU가 필요하며 짧은 SVD 클립은 장면 길이 동안 반복됩니다.</p>
  {review93&&<p className="muted">적용 대기 · {review93.summary} · 다른 장면이나 원본 영상은 변경하지 않습니다.</p>}
 <p className="muted">지원: 배경/장소, 의상/옷, 카메라, 표정/감정, 동작/행동, 조명 변경. 장면 타임라인·원본 사진·영상은 보존합니다. 잠긴 속성과 지원하지 않는 지시는 거부됩니다.</p>
 </Panel>
 <Panel title="STEP93 · 곡 구간 자연어 편집·실제 SD/SVD" description="기존 곡 BPM·마디 구간을 기준으로 후렴·절·브리지·전체 장면의 배경·의상·카메라·표정·동작·조명을 함께 수정합니다.">
  <Field label="구간 자연어 지시"><input aria-label="구간 장면 자연어 지시" maxLength={500} value={sectionCommand}
   onChange={e=>{setSectionCommand(e.target.value);setSectionPlan(null);}}
   placeholder="후렴 장면들의 배경을 밤거리로 바꿔 그리고 조명을 푸른빛으로 바꿔"/></Field>
  <div className="hstack" style={{gap:8,flexWrap:'wrap'}}>
   <Button disabled={sectionBusy} onClick={reviewSection93}>구간 변경 검토</Button>
   <Button disabled={!sectionPlan||sectionBusy} onClick={applySection93}>검토한 구간 설명 일괄 적용</Button>
   <Button disabled={!p.mvSectionEdits?.history?.length||sectionBusy} onClick={undoSection93}>구간 설명 복원</Button>
  </div>
  <div className="hstack" style={{gap:8,flexWrap:'wrap'}}>
   <Button variant="primary" disabled={!sectionPlan||sectionBusy||natural93Busy||imageBusy||videoBusy||personBusy||pvBusy||regen92Busy||!checkpoint||!videoModel}
    onClick={renderSection93}>{sectionBusy?'실제 구간 SD/SVD 제작 중…':'검토한 구간 실제 영상 일괄 재생성'}</Button>
   <Button disabled={!p.mvSectionNeuralEdits?.history?.length||sectionBusy} onClick={undoSectionVideo93}>구간 이전 영상 연결 복원</Button>
   {sectionBusy&&<Button onClick={()=>sectionAbort.current?.abort()}>이후 생성 취소</Button>}
  </div>
  {sectionPlan&&<p className="muted">검토: {sectionPlan.summary} · 대상 장면 {sectionPlan.sceneIds.length}개</p>}
  {sectionStatus&&<p role="status" className="muted">{sectionStatus}</p>}
  <Notice>실제 설치된 Windows 로컬 SD/SVD 모델을 사용합니다. 여러 장면은 순차 제작되며 중단 시 완료된 장면만 신규 자산으로 저장됩니다. 기존 원본 이미지·영상·캐릭터·프로젝트 파일은 삭제하지 않습니다. 사용 허가된 등록 사진·원화를 장면에 먼저 연결해야 합니다.</Notice>
 </Panel>
 <Panel title="STEP94 · Character Replace" description="장면·카메라·시간을 유지하면서 출연 캐릭터만 교체합니다. 구 캐릭터 이미지·영상은 이력에 보존되고 새 이미지로 재사용하지 않습니다.">
 <div className="hstack" style={{gap:9,flexWrap:'wrap'}}><Field label="교체할 캐릭터"><select aria-label="Step94 새 캐릭터" value={replace94Id} onChange={e=>{setReplace94Id(e.target.value);setReview94(null);}}><option value="">대상 선택</option>{data.characters.filter(c=>['owned','self','licensed'].includes(c.rights)&&(c.rights!=='licensed'||c.rightsNote?.trim())).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><label className="muted"><input type="checkbox" checked={replace94All} onChange={e=>{setReplace94All(e.target.checked);setReview94(null);}}/> 모든 장면</label><Button disabled={!current||!replace94Id} onClick={reviewReplacement94}>교체 검토</Button><Button disabled={!review94} onClick={applyReplacement94}>검토한 캐릭터 교체</Button><Button disabled={!current?.characterReplace94?.history?.length} onClick={()=>{try{onChange(undoCharacterReplace94(p,current.id));notify('이전 캐릭터·이미지 연결을 복구했습니다.');}catch(e){notify(e.message);}}}>이 장면 캐릭터 복원</Button></div>
 {review94&&<p className="muted">{review94.preview}</p>}
 <p className="muted">정체성 잠금이 활성화된 프로젝트에서는 교체할 수 없습니다. 실제 새 캐릭터의 영상·이미지 생성은 별도 로컬 엔진에서 수행해야 합니다.</p>
 </Panel>
 <Pv95Editor project={p} onSave={onChange} notify={notify}/>
 <Panel title="MV Storyboard Preflight · Step71" description="로컬 수동 스토리보드 시간 충돌·공백 점검 및 편집 목록 내보내기 (실제 영상 렌더링 아님)"><div className="hstack" style={{flexWrap:'wrap',gap:12}}><span>장면 <strong>{storyboardAudit.scenes}</strong></span><span>마지막 종료 <strong>{storyboardAudit.durationSec}초</strong></span><span>시간 오류 <strong>{storyboardAudit.errors}</strong></span><span>경고 <strong>{storyboardAudit.warnings}</strong></span><span>공백 <strong>{storyboardAudit.gapSeconds}초</strong></span></div><div className="hstack" style={{flexWrap:'wrap',gap:8,marginTop:12}}><Button icon="download" onClick={()=>exportStoryboard('json')}>장면 계획 JSON</Button><Button icon="download" onClick={()=>exportStoryboard('csv')}>편집 컷 목록 CSV</Button><Button onClick={()=>snapCurrent('beat')} disabled={!current}>현재 씬 박자 맞춤</Button><Button onClick={()=>snapCurrent('bar')} disabled={!current}>현재 씬 4/4 마디 맞춤</Button></div><div style={{marginTop:10}}>{storyboardAudit.issues.slice(0,12).map((item,i)=><p key={`${item.sceneId}-${item.code}-${i}`} className="muted" style={{margin:'4px 0'}}>{item.severity==='error'?'오류':'경고'} · {item.sceneId||'프로젝트'} · {item.message}</p>)}{storyboardAudit.issues.length>12&&<p className="muted">추가 점검 항목 {storyboardAudit.issues.length-12}개</p>}{storyboardAudit.issues.length===0&&<p className="muted">장면 시간 검증 통과 (영상 생성 여부와 무관)</p>}</div></Panel>
 <Panel title="스토리보드 JSON 복원 · Step72" description="Step71에서 저장한 동일 프로젝트의 장면 계획만 미리 검사합니다. 실제 미디어 파일은 가져오지 않으며 적용 전에는 아무 데이터도 변경되지 않습니다."><div className="hstack" style={{flexWrap:'wrap',gap:10}}><label className="muted">장면 계획 JSON 선택 <input type="file" accept=".json,application/json" onChange={inspectImportFile}/></label><Button disabled={!pendingImport} onClick={applyImportedScenes}>검사한 장면 계획 적용 (기존 장면 교체)</Button><Button disabled={!pendingImport} onClick={()=>setPendingImport(null)}>적용 취소</Button></div>{pendingImport&&<div style={{marginTop:10}}><p className="muted">현재 {pendingImport.review.currentSceneCount}개 → 복원 {pendingImport.review.importedSceneCount}개 · 마지막 종료 {pendingImport.review.durationSec}초 · 공백 {pendingImport.review.gapSeconds}초 · 경고 {pendingImport.review.warnings}개</p><p className="muted">적용하면 현재 장면 목록만 교체됩니다. 음악·보컬·미디어·캐릭터 자료는 보존됩니다.</p></div>}</Panel>
 <Panel title="Step73 · 스토리보드 애니매틱" description="장면 제목과 카메라·연출 메모를 시간축에 맞춰 로컬 미리보기합니다. 실제 영상 프레임이나 음악·보컬 재생은 아닙니다.">
 {animatic?<><div className="hstack" style={{gap:8,flexWrap:'wrap'}}><Button onClick={()=>{if(animaticFrame?.completed)setAnimaticPosition(0);setAnimaticPlaying(!animaticPlaying);}}>{animaticPlaying?'일시정지':'장면 계획 재생'}</Button><Button onClick={()=>seekAnimatic(0)}>처음으로</Button><select aria-label="애니매틱 재생 속도" value={animaticSpeed} onChange={e=>setAnimaticSpeed(Number(e.target.value))}><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option></select><Button icon="download" onClick={downloadAnimaticSrt}>장면 제목 SRT 가이드</Button></div>
 <input type="range" aria-label="애니매틱 타임라인 이동" min="0" max={Math.max(1,Math.round(animatic.durationSec*1000))} step="1" value={Math.min(Math.round(animaticFrame.seconds*1000),Math.max(1,Math.round(animatic.durationSec*1000)))} onChange={e=>seekAnimatic(Number(e.target.value)/1000)} style={{width:'100%',marginTop:12}}/>
 <div className="hstack spread" style={{marginTop:8,flexWrap:'wrap'}}><span className="muted">{animaticFrame.timecode} / {animatic.durationSec}초 · {animatic.sceneCount}장면 · 공백 {animatic.gapSeconds}초</span><span className="muted">{animaticFrame.completed?'재생 종료':animaticFrame.gap?'장면 없는 구간':'계획된 장면 미리보기'}</span></div>
 <div className="video-preview" style={{minHeight:170,marginTop:12,padding:20,textAlign:'center',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>{(()=>{const scene=p.scenes?.find(s=>s.id===animaticFrame.scene?.id);return scene?.characterMv&&scene.videoClipAssetId?<SceneVideoClip key={scene.id} assetId={scene.videoClipAssetId} mime={scene.videoGeneration?.mime} title="Step80 캐릭터 PV: 현재 장면의 짧은 반복 영상"/>:scene?.imageAssetId?<SceneImage assetId={scene.imageAssetId} alt="Step77 스토리보드 정지 이미지"/>:null;})()}<strong>{animaticFrame.scene?.title|| (animaticFrame.completed?'애니매틱 종료':'장면 없는 구간')}</strong><span>{animaticFrame.scene?.description||'영상 프레임은 생성되지 않았습니다.'}</span><span>{animaticFrame.scene?.camera&&`카메라: ${animaticFrame.scene.camera}`}{animaticFrame.scene?.location&&` · 장소: ${animaticFrame.scene.location}`}</span><span>{animaticFrame.scene?.action&&`동작: ${animaticFrame.scene.action}`}</span>{currentAnimaticDirection&&<span>Step76 연출 · {currentAnimaticDirection.direction} · 인물 등장 목표 {currentAnimaticDirection.targetPresencePercent}% (연출 목표이며 영상에 자동 적용되지 않음)</span>}{(p.scenes||[]).some(s=>s.id===animaticFrame.scene?.id&&s.characterMv&&s.videoClipAssetId)&&<span>Step80 장면 타임라인 위치에 캐릭터 PV 클립을 반복 표시합니다. 음악 오디오 동기화·전체 길이 영상 합성은 아닙니다.</span>}</div>
 <div className="hstack" style={{flexWrap:'wrap',gap:6,marginTop:10}}>{animatic.scenes.map(s=><Button key={s.id} variant={animaticFrame.scene?.id===s.id?'primary':undefined} onClick={()=>seekAnimatic(s.start)}>{s.title||s.id} · {s.start}초</Button>)}</div></>:<p className="muted">{animaticError} 타임라인 오류를 수정하면 재생할 수 있습니다.</p>}
 </Panel>
 <MvVideoExporter project={p} characters={data.characters} positionSeconds={animaticPosition} playing={animaticPlaying} notify={notify}/>
  <Panel title="Step74 · 시각적 스토리보드 컷 시트" description="12컷씩 정리한 로컬 SVG 계획표입니다. 추상적인 자리표시자만 사용하며 원본 이미지·음악·영상 또는 생성된 영상 프레임을 포함하지 않습니다.">
 {shotSheet?<><div className="hstack" style={{gap:8,flexWrap:'wrap',alignItems:'center'}}><Button disabled={effectiveSheetPage<=1} onClick={()=>setShotSheetPage(Math.max(1,effectiveSheetPage-1))}>이전 12컷</Button><span className="muted">{effectiveSheetPage} / {shotSheet.pageCount} 페이지 · 총 {shotSheet.sceneCount}컷</span><Button disabled={effectiveSheetPage>=shotSheet.pageCount} onClick={()=>setShotSheetPage(Math.min(shotSheet.pageCount,effectiveSheetPage+1))}>다음 12컷</Button><Button icon="download" onClick={downloadShotSheet}>현재 페이지 SVG 저장</Button><Button icon="download" onClick={downloadShotBook}>전체 컷북 HTML 저장 · Step75</Button></div>
 <img alt={`스토리보드 컷 시트 ${effectiveSheetPage}페이지, 실제 영상 프레임 없음`} src={'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(shotSheet.svg)} style={{display:'block',width:'100%',maxWidth:1000,marginTop:12,borderRadius:8}}/>
 <p className="muted">이미지 미리보기에는 장면 이름·시간·출연·카메라·동작 메모만 표시됩니다. SVG는 로컬 편집용 컷 계획표입니다. 전체 컷북 HTML은 인터넷 연결 없이 열어 인쇄할 수 있습니다.</p></>:<p className="muted">유효한 스토리보드 장면이 있어야 컷 시트를 만들 수 있습니다.</p>}
 </Panel>
 <Panel title="Step76 · MV 연출 모드" description="Performance / Story / Mixed MV 연출 역할과 인물 등장 목표를 장면별로 계산합니다. 기존 장면 속성은 덮어쓰지 않으며 실제 영상 생성이나 AI 연출 실행은 아닙니다.">
 <div className="mv-options"><Field label="MV 타입"><select aria-label="Step76 MV 연출 모드" value={p.mvMode||(mode==='pv'?'Vocal Synth PV':'Story MV')} onChange={e=>change({mvMode:e.target.value})}>{[...MV_DIRECTION_MODES,'Vocal Synth PV'].map(m=><option key={m}>{m}</option>)}</select></Field><Field label="캐릭터 등장 강도"><select aria-label="Step76 캐릭터 등장 강도" value={p.presence||'AI가 결정'} onChange={e=>change({presence:e.target.value})}>{MV_DIRECTION_PRESENCE.map(x=><option key={x}>{x}</option>)}</select></Field></div>
 {directionPlan?<><div className="hstack" style={{gap:12,flexWrap:'wrap',marginTop:12}}><span>공연 <strong>{directionPlan.performanceSec}초</strong></span><span>스토리 <strong>{directionPlan.storySec}초</strong></span><span>목표 인물 등장 <strong>{directionPlan.targetPresencePercent}%</strong></span><span>장면 <strong>{directionPlan.sceneCount}</strong></span><Button icon="download" onClick={downloadDirectionPlan}>연출 큐시트 JSON 저장 · Step76</Button></div>
 <div className="scene-list" style={{maxHeight:260,overflow:'auto',marginTop:12}}>{directionPlan.scenes.map(s=><button key={s.id} className={`scene-card ${current?.id===s.id?'selected':''}`} onClick={()=>{setSelected(s.id);seekAnimatic(s.start);}}><div><strong>{s.title||s.id}</strong><p>{s.direction} · {s.framing} · {s.targetPresencePercent}% · {s.source==='manual'?'사용자 지정':'모드 자동 배치'}</p><small>{s.start}s – {s.end}s {s.characterAvailable?'· 캐릭터 연결':'· 캐릭터 미연결'}</small></div></button>)}</div>
 {directionPlan.issues.map((warning,i)=><p key={i} className="muted" style={{margin:'6px 0'}}>주의 · {warning}</p>)}
 </>:<p className="muted">연출 계획 계산 불가: {directionError}</p>}
 </Panel>
 <Panel title="Step79 · Image-to-MV · 실제 사람 사진 기반 장면 제작" description="본인 또는 사용 허가를 받은 실제 사람 사진 → ComfyUI img2img 장면 이미지 → 기존 Step78 SVD 짧은 애니메이션 클립. 등록 사진은 보존됩니다. 가창 Lip Sync·전체 영상 합성·얼굴 동일성 보장은 제공하지 않습니다.">
 <div className="hstack" style={{gap:10,flexWrap:'wrap'}}>
 <Field label="등록된 실제 사람"><select aria-label="Image-to-MV 실제 사람" value={personId} onChange={e=>{setPersonId(e.target.value);setPersonPhotoId('');}}><option value="">사람 선택</option>{eligiblePeople.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></Field>
 <Field label="등록 사진"><select aria-label="Image-to-MV 참고 사진" value={selectedPersonPhoto} onChange={e=>setPersonPhotoId(e.target.value)}><option value="">사진 선택</option>{availablePhotos.map(a=><option key={a.id} value={a.id}>{a.role} · {a.name}</option>)}</select></Field>
 <Field label="사진 변환 강도"><select aria-label="사진 변환 강도" value={personDenoise} onChange={e=>setPersonDenoise(Number(e.target.value))}><option value={0.2}>0.20 · 원본 보존 우선</option><option value={0.35}>0.35 · 기본</option><option value={0.5}>0.50 · 연출 변화</option><option value={0.65}>0.65 · 변화 큼</option></select></Field>
 <Field label="시드 (비우면 자동)"><input aria-label="Image-to-MV 시드" value={personSeed} onChange={e=>setPersonSeed(e.target.value)} style={{maxWidth:120}} placeholder="자동"/></Field></div>
 {selectedPersonPhoto&&<div style={{maxWidth:280}}><SceneImage assetId={selectedPersonPhoto} alt="Step79 등록된 실제 사람 참고 사진"/></div>}
 <p className="muted">선택 장면과 인물 미지정 장면에 적용할 수 있습니다. 다른 캐릭터가 지정된 장면은 전체 순차 제작에서 제외됩니다. 사진은 PC 내 등록 자료로만 로컬 ComfyUI에 전달됩니다. 컴퓨터에 ComfyUI 이미지 및 SVD 모델이 각각 필요합니다.</p>
 <p className="muted">이미지: {checkpoint||'Step77 이미지 모델 미선택'} · 영상: {videoModel||'Step78 SVD 모델 미선택'} · 장면 {p.scenes.length}개 · 처리 결과는 각각 기존 프로젝트에 자동 저장됩니다.</p>
 <div className="hstack" style={{gap:10,flexWrap:'wrap'}}><Button variant="primary" disabled={personBusy||pvBusy||imageBusy||videoBusy||!selectedPersonPhoto||!checkpoint||!videoModel} onClick={()=>createPersonMv(false)}>{personBusy?'생성 중…':'선택 장면 사진→MV 클립 생성'}</Button><Button disabled={personBusy||pvBusy||imageBusy||videoBusy||!selectedPersonPhoto||!checkpoint||!videoModel} onClick={()=>createPersonMv(true)}>전체 해당 장면 순차 생성</Button>{personBusy&&<Button onClick={()=>personAbort.current?.abort()}>진행 중 생성 요청 중단</Button>}</div>
 <p role="status" className="muted">진행 상태: {personStatus}</p><div className="hstack" style={{gap:10,flexWrap:'wrap'}}>{p.scenes.map(s=><span key={s.id} className="muted">{s.title||s.id}: {personMvSceneStatus(s)}</span>)}</div>
 <Notice>사람의 얼굴이 매 장면 동일하게 생성된다는 보장은 없습니다. SVD 클립은 짧은 WebP 영상이며, 음악과 합친 완성 MP4 또는 입 모양 동기화는 이 단계에 포함되지 않습니다.</Notice>
 </Panel>
 <Panel title="Step80 · Character-to-MV · 내 2D 캐릭터 애니메이션 PV" description="직접 등록한 PNG/JPEG 2D 캐릭터 그림 → 로컬 ComfyUI img2img 장면 이미지 → Step78 SVD 짧은 움직이는 WebP 클립. 기존 원본과 프로젝트를 유지합니다.">
 <div className="hstack" style={{gap:10,flexWrap:'wrap'}}>
 <Field label="내 2D 캐릭터"><select aria-label="Character-to-MV 캐릭터" value={pvCharacterId} onChange={e=>{setPvCharacterId(e.target.value);setPvArtworkId('');}}><option value="">2D 캐릭터 선택</option>{eligibleArtwork.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
 <Field label="등록 일러스트"><select aria-label="Character-to-MV 등록 그림" value={pvSelectedArtwork} onChange={e=>setPvArtworkId(e.target.value)}><option value="">원본 그림 선택</option>{pvAssets.map(a=><option key={a.id} value={a.id}>{a.role} · {a.name}</option>)}</select></Field>
 <Field label="그림 보존 강도"><select aria-label="캐릭터 그림 변환 강도" value={pvDenoise} onChange={e=>setPvDenoise(Number(e.target.value))}><option value={0.2}>0.20 · 원본 우선</option><option value={0.3}>0.30 · 기본</option><option value={0.45}>0.45 · 스타일 변화</option><option value={0.6}>0.60 · 변화 큼</option></select></Field>
 <Field label="시드 (비우면 자동)"><input aria-label="Character-to-MV 시드" value={pvSeed} onChange={e=>setPvSeed(e.target.value)} style={{maxWidth:140}} placeholder="자동"/></Field></div>
 {pvSelectedArtwork&&<div style={{maxWidth:320}}><SceneImage assetId={pvSelectedArtwork} alt="Step80 직접 등록한 원본 캐릭터 일러스트"/></div>}
 <p className="muted">캐릭터가 배치된 스토리보드 장면의 시간과 음악 프로젝트 구성을 그대로 사용합니다. 원본 그림을 실제 img2img 입력으로 사용하며, 전체 순차 제작은 캐릭터 미지정 또는 선택한 캐릭터가 배치된 장면만 처리합니다. 3D VRM, 실제 사람, Reference 전용 자료는 이 모드에서 사용할 수 없습니다.</p>
 <p className="muted">이미지 SD: {checkpoint||'선택 필요'} · 영상 SVD: {videoModel||'선택 필요'} · 총 {p.scenes.length}장면 · 별도로 설치된 로컬 모델이 필요합니다.</p>
 <div className="hstack" style={{gap:10,flexWrap:'wrap'}}><Button variant="primary" disabled={pvBusy||personBusy||imageBusy||videoBusy||!pvSelectedArtwork||!checkpoint||!videoModel} onClick={()=>createCharacterPv(false)}>{pvBusy?'PV 생성 중…':'선택 장면 캐릭터→PV 클립 생성'}</Button><Button disabled={pvBusy||personBusy||imageBusy||videoBusy||!pvSelectedArtwork||!checkpoint||!videoModel} onClick={()=>createCharacterPv(true)}>전체 해당 장면 순차 제작</Button>{pvBusy&&<Button onClick={()=>pvAbort.current?.abort()}>진행 중 생성 요청 중단</Button>}</div>
 <p role="status" className="muted">진행 상태: {pvStatus}</p><div className="hstack" style={{gap:10,flexWrap:'wrap'}}>{p.scenes.map(s=><span className="muted" key={s.id}>{s.title||s.id}: {characterMvSceneStatus(s)}</span>)}</div>
 <Notice>Step80은 등록 캐릭터 기반 짧은 AI 애니메이션 장면 클립을 만드는 단계입니다. 그림 레이어 애니메이션(81~82), Lip Sync(85), 음악·가창 동기화된 완성 MP4(후속 단계)는 아직 제공하지 않습니다. 일관된 얼굴·그림체·움직임도 모델에 따라 달라집니다.</Notice>
 </Panel>
 <div className="video-grid"><section className="panel"><div className="panel-top"><div><h3>Storyboard Timeline</h3><p>장면 순서와 시작/끝 시간을 편집하세요</p></div><Button icon="plus" onClick={addScene}>씬 추가</Button></div><div className="scene-list">{p.scenes.map((s,i)=><button className={`scene-card ${current?.id===s.id?'selected':''}`} key={s.id} onClick={()=>setSelected(s.id)}><div className="scene-thumb">{s.imageAssetId?<SceneImage assetId={s.imageAssetId} alt={`${s.title} 정지 이미지`}/>:<Icon name="image" size={24}/>}<span>{String(i+1).padStart(2,'0')}</span></div><div><strong>{s.title||`Scene ${i+1}`}</strong><p>{s.description||'장면 내용 없음'}</p><small>{s.start}s – {s.end}s</small></div><Icon name="chevron" size={16}/></button>)}</div></section>
 <div className="scene-details"><Panel title="장면 프리뷰" description="Step77 이미지 및 Step78 장면별 생성 영상 (장면 전체 MV 편집·합성은 이후 단계)"><div className="video-preview">{current?.videoClipAssetId?<SceneVideoClip assetId={current.videoClipAssetId} mime={current.videoGeneration?.mime} title={current.title+" 생성 영상"}/>:<><div className="preview-ring"><Icon name="play" size={30}/></div><strong>STEP78 · 로컬 영상 클립</strong><span>아직 이 장면에 생성된 영상이 없습니다.</span></>}</div><div className="scene-view-label">{current?.title||'씬 없음'} <span>· 장면별 생성 클립 연결</span></div></Panel>

 {current&&<Panel title="Step77 · AI 장면 이미지 생성" description="실제 사용자 설치 로컬 ComfyUI + SD 체크포인트로 선택 장면 정지 이미지를 생성합니다. 인터넷 전송 없음. 모델은 ZIP/EXE에 포함되지 않습니다. 영상 생성은 아래 Step78에서 별도로 실행합니다.">
  <div className="hstack" style={{gap:9,flexWrap:'wrap'}}><Field label="ComfyUI 로컬 포트"><input aria-label="ComfyUI 포트" type="number" min="1024" max="65535" value={imagePort} onChange={e=>{setImagePort(e.target.value);setCheckpoint('');setCheckpoints([]);}} style={{maxWidth:110}}/></Field><Button onClick={testImageEngine} disabled={imageBusy}>로컬 AI 엔진 연결 확인</Button><Field label="모델 (Checkpoint)"><select aria-label="ComfyUI 이미지 모델" value={checkpoint} onChange={e=>setCheckpoint(e.target.value)}><option value="">모델 선택</option>{checkpoints.map(n=><option key={n} value={n}>{n}</option>)}</select></Field></div>
  <div className="hstack" style={{gap:10,flexWrap:'wrap',margin:'12px 0'}}><Field label="이미지 해상도"><select aria-label="생성 이미지 해상도" value={imageSize} onChange={e=>setImageSize(e.target.value)}><option value="512x512">512 × 512 · 정방형</option><option value="768x448">768 × 448 · 가로형</option><option value="1024x576">1024 × 576 · 16:9</option></select></Field><Field label="생성 스텝"><input type="number" min="1" max="50" value={imageSteps} onChange={e=>setImageSteps(e.target.value)} style={{maxWidth:85}}/></Field><Field label="시드 (비우면 자동)"><input value={imageSeed} onChange={e=>setImageSeed(e.target.value)} placeholder="자동" style={{maxWidth:145}}/></Field><Button variant="primary" disabled={imageBusy||pvBusy||personBusy||!checkpoint} onClick={renderSceneImage}>{imageBusy?'이미지 생성 중…':'현재 장면 AI 이미지 생성'}</Button></div>
  <p className="muted">엔진 상태: {imageStatus} · {imageSize.replace('x','×')} PNG/JPEG · 프롬프트는 장면 설명/배경/인물 이름/의상/표정/행동/카메라/조명과 Step76 연출을 사용합니다.</p>
  <Field label="생성에 보낼 장면 프롬프트 (읽기 전용)"><textarea rows={4} readOnly value={sceneImageRequest?.prompt||''}/></Field>
  {current.imageAssetId?<><SceneImage assetId={current.imageAssetId} alt={current.title+' 생성 장면 이미지'}/><p className="muted">{imageStale?'장면/연출이 변경되어 저장된 이미지와 현재 설정이 다릅니다. 재생성 전 기존 이미지 유지.':'현재 장면의 저장된 이미지'} · {current.imageGeneration?.source||'기존 첨부 자료'} · 모델 {current.imageGeneration?.checkpoint||'미확인'}</p><Button icon="download" onClick={exportSceneImage}>현재 장면 이미지 PNG/JPG 저장</Button></>:<p className="muted">아직 이 장면에 연결된 이미지가 없습니다. 설치된 로컬 이미지 모델이 없으면 AI 생성은 실행되지 않습니다.</p>}
 </Panel>}
 {current&&<Panel title="Step78 · AI 영상 생성 엔진" description="77단계에서 생성한 장면 이미지를 실제 로컬 ComfyUI SVD/SVD-XT 모델로 움직이는 짧은 클립으로 변환합니다. 78단계는 장면별 클립 생성·저장까지만 지원하며 한 곡 전체 MV 합성은 아닙니다.">
 <div className="hstack" style={{gap:10,flexWrap:'wrap'}}><Button onClick={testVideoEngine} disabled={videoBusy}>ComfyUI 영상 모델 확인</Button><Field label="SVD 영상 체크포인트"><select aria-label="SVD 영상 체크포인트" value={videoModel} onChange={e=>setVideoModel(e.target.value)}><option value="">모델 선택</option>{videoModels.map(m=><option value={m} key={m}>{m}</option>)}</select></Field></div>
 <div className="hstack" style={{gap:10,flexWrap:'wrap',marginTop:12}}><Field label="생성 프레임"><select aria-label="영상 프레임" value={videoFrames} onChange={e=>setVideoFrames(Number(e.target.value))}><option value={14}>14프레임 · SVD</option><option value={25}>25프레임 · SVD-XT</option></select></Field><Field label="FPS"><select aria-label="생성 FPS" value={videoFps} onChange={e=>setVideoFps(Number(e.target.value))}><option value={6}>6 fps</option><option value={8}>8 fps</option></select></Field><Field label="스텝"><input aria-label="영상 스텝" type="number" min="1" max="40" value={videoSteps} onChange={e=>setVideoSteps(e.target.value)} style={{maxWidth:75}}/></Field><Field label="Motion Bucket"><input aria-label="Motion Bucket" type="number" min="1" max="255" value={videoMotion} onChange={e=>setVideoMotion(e.target.value)} style={{maxWidth:85}}/></Field><Field label="시드"><input aria-label="영상 시드" value={videoSeed} onChange={e=>setVideoSeed(e.target.value)} placeholder="자동" style={{maxWidth:125}}/></Field></div>
 <div className="hstack" style={{margin:'12px 0',gap:12,flexWrap:'wrap'}}><Button variant="primary" disabled={videoBusy||pvBusy||personBusy||!videoModel||!current.imageAssetId||imageStale} onClick={renderSceneVideo}>{videoBusy?'실제 영상 생성 중…':'선택 장면 AI 영상 생성'}</Button></div>
 <p className="muted">엔진: {videoStatus}. 영상 길이는 {Number(videoFrames)/Number(videoFps)}초입니다. 현재 장면의 {Number(current.end)-Number(current.start)}초 길이로 자동 확장하거나 배경음악과 합성하지 않습니다. 결과는 애니메이션 WebP 파일입니다. MP4 합성·내보내기는 98단계에서 다룹니다.</p>
 {current.videoClipAssetId?<><SceneVideoClip assetId={current.videoClipAssetId} mime={current.videoGeneration?.mime} title={current.title+' 생성 영상'}/><p className="muted">{videoStale?'장면 이미지 또는 연출 설정이 생성 당시와 다릅니다. 이전 영상은 그대로 보존됩니다.':'저장된 장면 영상'} · {current.videoGeneration?.frames}프레임 / {current.videoGeneration?.fps}fps · {current.videoGeneration?.checkpoint||'모델 미확인'}</p><Button icon="download" onClick={exportSceneVideo}>이 장면의 실제 영상 파일 저장</Button></>:<p className="muted">저장된 장면 영상이 없습니다. 로컬 SVD 모델과 Step77 장면 이미지가 모두 있어야 합니다.</p>}
 </Panel>}
 {current&&<Panel title="Step76 · 선택 장면 연출" description="자동 배치를 유지하거나 이 장면의 공연/스토리 역할만 직접 정합니다. 변경 사항은 프로젝트에 저장되고 실제 장면 내용은 바뀌지 않습니다."><Field label="장면 역할"><select aria-label="Step76 선택 장면 역할" value={p.mvDirectionOverrides?.[current.id]||'auto'} onChange={e=>setSceneDirection(e.target.value)}><option value="auto">현재 MV 모드에 맞춰 자동</option><option value="performance">공연 중심</option><option value="story">스토리 중심</option></select></Field>{currentDirection&&<p className="muted">{currentDirection.direction} · 인물 등장 목표 {currentDirection.targetPresencePercent}% · {currentDirection.framing} · {currentDirection.characterAvailable?'캐릭터 연결됨':'캐릭터 미연결'}</p>}</Panel>}
 {current&&<Panel title="Scene Properties" description="장면별 캐릭터, 표정, 카메라 등 설정"><div className="form-two"><Field label="장면 이름"><input value={current.title} onChange={e=>setScene(current.id,{title:e.target.value})}/></Field><Field label="등장 캐릭터"><select value={current.characterId||''} onChange={e=>setScene(current.id,{characterId:e.target.value})}><option value="">지정 안 함</option>{data.characters.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field></div><Field label="장면 설명"><textarea rows={3} value={current.description} onChange={e=>setScene(current.id,{description:e.target.value})}/></Field><div className="form-two">{[['location','배경 / 장소'],['outfit','의상'],['expression','표정'],['action','동작'],['camera','카메라'],['lighting','조명']].map(([key,label])=><Field key={key} label={label}><input value={current[key]||''} onChange={e=>setScene(current.id,{[key]:e.target.value})} placeholder={`${label} 설명`}/></Field>)}<Field label="시작 (초)"><input type="number" min="0" value={current.start} onChange={e=>setScene(current.id,{start:Number(e.target.value)})}/></Field><Field label="종료 (초)"><input type="number" min="0" value={current.end} onChange={e=>setScene(current.id,{end:Number(e.target.value)})}/></Field></div><div className="hstack spread"><span className="muted">자동 저장됨</span><Button icon="trash" onClick={()=>{if(p.scenes.length<=1){notify('최소 한 장면은 필요합니다.');return;}if(confirm('이 씬을 삭제하시겠습니까?')){change({scenes:p.scenes.filter(s=>s.id!==current.id)});setSelected('');}}}>현재 씬 삭제</Button></div></Panel>}
 </div></div>
 <Panel title="STEP90 · 다중 캐릭터·가상 밴드" description="권한이 확인된 2D/VRM/실제 사람 등록 영상을 함께 배치해 무음 WebM 공연을 제작합니다.">
 <p className="muted">현재 음악 프로젝트의 공연 멤버: {p.band90?.members?.length||0}명 · 등장 시간과 역할·가창 입모양은 캐릭터별 로컬 데이터 사용 · 최대 6명</p>
 <Button disabled={!eligibleBandCharacters(data.characters).length} onClick={()=>setBand90Open(true)}>STEP90 가상 밴드 공연 편집</Button>
 {band90Open&&<Modal title="STEP90 · 다중 캐릭터·가상 밴드" onClose={()=>setBand90Open(false)}><VirtualBand90Editor project={p} characters={data.characters} onSave={next=>{onChange(next);setBand90Open(false);}} notify={notify}/></Modal>}
 </Panel>
 {current&&<Panel title="STEP92 · Identity-Safe Regeneration" description="이미 등록된 사람/2D 캐릭터 원본으로 해당 씬 이미지만 로컬 img2img 재생성. 이전 결과는 되돌릴 수 있습니다.">
 <Field label="변경할 동작 지시 (잠기지 않은 action 항목만)"><input value={regen92Patch} maxLength={500} onChange={e=>setRegen92Patch(e.target.value)} placeholder="예: 하늘을 바라보며 노래하기"/></Field>
 <div className="hstack" style={{gap:8,flexWrap:'wrap'}}><Button variant="primary" disabled={regen92Busy||imageBusy||personBusy||pvBusy||videoBusy||!current.imageAssetId||!checkpoint} onClick={regenerate92}>{regen92Busy?'로컬 이미지 재생성 중…':'잠금 유지하고 이 장면만 재생성'}</Button><Button disabled={!current.regeneration92?.history?.length||regen92Busy} onClick={undo92}>이전 장면 이미지 복원</Button></div>
 <p role="status">{regen92Status}</p><Notice>장면 메타데이터 잠금과 기존 이미지 이력은 보호하지만, 생성 이미지 픽셀의 얼굴·의상·배경 완전 동일성은 AI 모델이 보장하지 않습니다. 2D 캐릭터와 실제 사람의 Step79/80 등록 원본 필요, 로컬 ComfyUI 별도 설치 필요. 3D 모델과 완성 영상의 직접 재생성은 지원하지 않습니다.</Notice>
 </Panel>}
 <Panel title="Identity-Safe Regeneration 기본 설정" description="씬 재생성 시 보존하고 싶은 속성 (추후 영상 생성 엔진에서 사용)"><div className="lock-grid">{[['identityLock','캐릭터 정체성 유지'],['outfitLock','의상 유지'],['backgroundLock','배경 유지'],['cameraLock','카메라 유지']].map(([key,label])=><label key={key} className="check-item"><input type="checkbox" checked={!!p[key]} onChange={e=>change({[key]:e.target.checked})}/><Icon name="lock" size={15}/>{label}</label>)}</div></Panel>
 <Notice>Step80은 등록된 2D 캐릭터 그림, Step79는 실제 사람 사진을 로컬 img2img→SVD에 연결하며, Step78은 로컬 SVD 영상 클립 생성만 지원합니다. 장편 MV 합성, 2D/3D 모션, 자동 Lip Sync, Dance Director, 캐릭터 Identity Lock 보장은 아직 구현되지 않았습니다.</Notice></>;
}
