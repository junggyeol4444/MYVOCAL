import React,{useState} from 'react';
import CharacterLayerEditor from '../components/CharacterLayerEditor.jsx';
import CharacterAnimationEditor from '../components/CharacterAnimationEditor.jsx';
import Character3dEditor from '../components/Character3dEditor.jsx';
import CharacterStage3dEditor from '../components/CharacterStage3dEditor.jsx';
import CharacterLipSyncEditor from '../components/CharacterLipSyncEditor.jsx';
import PersonLipSyncEditor from '../components/PersonLipSyncEditor.jsx';
import CharacterExpressionEditor from '../components/CharacterExpressionEditor.jsx';
import CharacterDanceEditor from '../components/CharacterDanceEditor.jsx';
import CharacterPerformance89Editor from '../components/CharacterPerformance89Editor.jsx';
import {performance89Status} from '../lib/characterPerformance89.js';
import {danceStatus} from '../lib/characterDanceDirector.js';
import {expressionPlanStatus} from '../lib/characterExpressionDirector.js';
import {personVideoAssets} from '../lib/personLipSync.js';
import {personPhotoAssets} from '../lib/imageToMv.js';
import {modelAssets,rigStatus} from '../lib/character3d.js';
import {stageStatus} from '../lib/characterStage3d.js';
import {animationStatus} from '../lib/characterAnimation2d.js';
import {eligibleLayerImages,layerPlanStatus} from '../lib/characterLayers.js';
import {AssetPreview,Button,Empty,Field,Icon,Modal,Notice,SectionHead,Status} from '../components/UI';
import {genId,now,rightsOptions} from '../lib/schema';
import {putFile,removeFile} from '../lib/assetDb';
import {downloadText} from '../lib/store';
import {characterDependents} from '../lib/voiceDeletionSafety.js';
import CharacterRestorePanel from '../components/CharacterRestorePanel.jsx';
import CharacterOutfitStudio from '../components/CharacterOutfitStudio.jsx';
import CharacterStyleTransferStudio from '../components/CharacterStyleTransferStudio.jsx';
import CharacterLearningPanel from '../components/CharacterLearningPanel.jsx';
import {LOOK_FIELDS,LOOK_LIMIT,addCharacterLook,approveCharacterLook,deleteCharacterLook,reviewCharacterLook,summarizeCharacterLooks,updateCharacterLook,exportCharacterLookPack,importCharacterLookPack} from '../lib/characterLooks.js';
import {SHOT_LIMIT,CAMERA_CHOICES,addCharacterShot,updateCharacterShot,deleteCharacterShot,reviewCharacterShot,summarizeCharacterShots,exportCharacterShotPlan,importCharacterShotPlan,getCharacterShotTimeline,SHOT_IMPORT_MAX_BYTES} from '../lib/characterShots.js';
import {buildCharacterCastTimeline,exportCharacterCastTimeline} from '../lib/characterCast.js';
import {auditCharacterProduction,exportCharacterProductionAudit} from '../lib/characterProductionAudit.js';
import {createCharacterHandoff,verifyCharacterHandoff} from '../lib/characterHandoff.js';
import {VOCAL_CUE_LIMIT,VOCAL_PARTS,addCharacterVocalCue,updateCharacterVocalCue,deleteCharacterVocalCue,reviewCharacterVocalCue,buildCharacterVocalTimeline,exportCharacterVocalTimeline,exportCharacterVocalCuePack,importCharacterVocalCuePack,VOCAL_CUE_IMPORT_MAX_BYTES} from '../lib/characterVocalCues.js';
import {characterAppearanceFields,characterAssetRoles,MAX_CHARACTER_ASSETS,normalizeCharacterIdentity,validateCharacterFile,validateCharacterAssetRole,inferCharacterAssetKind,getCharacterReferenceSummary} from '../lib/characterIdentity.js';

const appearanceLabels={hair:'머리 / 헤어스타일',eyes:'눈 / 눈동자',outfit:'기본 의상',palette:'대표 색상',accessories:'장신구',body:'체형 / 비율',personality:'성격 / 분위기'};
const roleLabels={portrait:'대표 이미지',front:'정면',side:'측면',back:'후면','full-body':'전신',expression:'표정 참고',outfit:'의상 참고','motion-reference':'동작 참고 영상',model:'3D 모델',other:'기타'};
function possibleRoles(file){const type=inferCharacterAssetKind(file);return characterAssetRoles.filter(role=>{try{if(type==='unknown')return role==='other';validateCharacterAssetRole(role,type);return true;}catch{return false;}});}
const blankAppearance=()=>Object.fromEntries(characterAppearanceFields.map(k=>[k,'']));
const lookLabels={outfit:'의상',hairStyle:'헤어 변경',expression:'표정',pose:'포즈 / 동작',scene:'장면 / 배경',accessories:'장신구 변경',notes:'연출 메모'};
const blankLook=()=>Object.fromEntries(LOOK_FIELDS.map(k=>[k,'']));
const cameraLabels={wide:'와이드',medium:'미디엄','close-up':'클로즈업',profile:'측면',overhead:'탑뷰',tracking:'트래킹',other:'기타'};
const blankShot=()=>({title:'',lookId:'',startSec:'0',endSec:'5',camera:'medium',direction:''});
const vocalPartLabels={lead:'리드',harmony:'화음',adlib:'애드리브',spoken:'대사'};
const blankVocalCue=()=>({shotId:'',startSec:'0',endSec:'5',part:'lead',lyric:'',note:''});
export default function Characters({data,add,remove,notify,removeCharacterPersisted,listRestorableCharacters,restoreCharacterPersisted}){
 const [layerFor,setLayerFor]=useState(null);
 const [animationFor,setAnimationFor]=useState(null);
 const [modelFor,setModelFor]=useState(null);
 const [stageFor,setStageFor]=useState(null);
 const [lipFor,setLipFor]=useState(null);
 const [personLipFor,setPersonLipFor]=useState(null);
 const [expressionFor,setExpressionFor]=useState(null);
 const [danceFor,setDanceFor]=useState(null);
 const [performanceFor,setPerformanceFor]=useState(null);
 const [castHidden,setCastHidden]=useState([]);
 const [handoffStatus,setHandoffStatus]=useState('');
 const visibleCharacters=data.characters.filter(c=>!castHidden.includes(c.id));
 const castTimeline=buildCharacterCastTimeline(visibleCharacters);
 const vocalTimeline=buildCharacterVocalTimeline(visibleCharacters);
 const productionAudit=auditCharacterProduction(visibleCharacters);
 const [vocalFor,setVocalFor]=useState(null),[vocalEditing,setVocalEditing]=useState(null),[vocalDraft,setVocalDraft]=useState(blankVocalCue);
 const [shotFor,setShotFor]=useState(null),[shotEditing,setShotEditing]=useState(null),[shotDraft,setShotDraft]=useState(blankShot);
 const [lookEditing,setLookEditing]=useState(null),[lookStudio,setLookStudio]=useState(null),[styleTransferFor,setStyleTransferFor]=useState(null),[identityLearningFor,setIdentityLearningFor]=useState(null);
 const [lookFor,setLookFor]=useState(null),[lookName,setLookName]=useState(''),[lookFields,setLookFields]=useState(blankLook),[lookAsset,setLookAsset]=useState('');
 const [open,setOpen]=useState(false),[editing,setEditing]=useState(null),[name,setName]=useState(''),[kind,setKind]=useState('character'),[rights,setRights]=useState('owned'),[rightsNote,setRightsNote]=useState(''),[description,setDescription]=useState(''),[appearance,setAppearance]=useState(blankAppearance),[existingAssets,setExistingAssets]=useState([]),[files,setFiles]=useState([]),[busy,setBusy]=useState(false);
 const close=(force=false)=>{if(busy&&!force)return;setOpen(false);setEditing(null);setName('');setKind('character');setRights('owned');setRightsNote('');setDescription('');setAppearance(blankAppearance());setExistingAssets([]);setFiles([]);};
 const begin=(character=null)=>{setEditing(character);setName(character?.name||'');setKind(character?.kind||'character');setRights(character?.rights||'owned');setRightsNote(character?.rightsNote||'');setDescription(character?.description||'');setAppearance({...blankAppearance(),...(character?.appearance||{})});setExistingAssets((character?.assets||[]).map(a=>({...a})));setFiles([]);setOpen(true);};
 const beginLook=(character,look=null)=>{setLookFor(character);setLookEditing(look?.id||null);setLookName(look?.name||'');setLookFields(Object.fromEntries(LOOK_FIELDS.map(f=>[f,look?.[f]||''])));setLookAsset(look?.referenceAssetId||'');};
 const saveLook=()=>{
  if(!lookFor)return;
  try{
   const draft={name:lookName,...lookFields,referenceAssetId:lookAsset};
   const updated=lookEditing?updateCharacterLook(lookFor,lookEditing,draft):addCharacterLook(lookFor,{id:genId('look'),...draft});
   add('characters',updated);setLookFor(null);setLookEditing(null);notify(lookEditing?'룩 프리셋을 수정했습니다.':'캐릭터 룩 프리셋을 로컬에 저장했습니다.');
  }catch(error){notify('룩 저장 실패: '+error.message);}
 };
 const approveLook=(character,id)=>{
  if(!confirm('현재 캐릭터의 머리·눈·체형·대표 색상을 이 룩의 새 기준으로 승인할까요?'))return;
  try{add('characters',approveCharacterLook(character,id));notify('현재 외형 기준으로 재승인했습니다.');}catch(error){notify(error.message);}
 };
 const removeLook=(character,id)=>{
  if(!confirm('선택한 룩 프리셋만 삭제할까요? 원본 자료는 삭제되지 않습니다.'))return;
  try{add('characters',deleteCharacterLook(character,id));notify('룩 프리셋을 삭제했습니다. 원본 자료는 유지됩니다.');}catch(error){notify(error.message);}
 };
 const exportLooks=(character)=>{
  try{
   const payload=exportCharacterLookPack(character);
   downloadText(JSON.stringify(payload,null,2),`MYVOCAL-looks-${character.id.replace(/[^a-zA-Z0-9_-]/g,'_')}.json`,'application/json');
  }catch(error){notify('JSON 저장 실패: '+error.message);}
 };
 const importLooks=async(character,file)=>{
  if(!file)return;
  try{
   if(file.size>512*1024)throw Error('룩 JSON은 512KB를 넘을 수 없습니다.');
   const updated=importCharacterLookPack(character,await file.text());
   const added=(updated.looks||[]).length-(character.looks||[]).length;
   if(added===0){notify('가져올 룩이 없습니다.');return;}
   add('characters',updated);notify(`룩 ${added}개를 가져왔습니다. 캐릭터 원본 자료는 변경하지 않았습니다.`);
  }catch(error){notify('룩 JSON 가져오기 실패: '+error.message);}
 };
 const beginShot=(character,shot=null)=>{
  setShotFor(character);setShotEditing(shot?.id||null);
  setShotDraft(shot?{title:shot.title,lookId:shot.lookId,startSec:String(shot.startSec),endSec:String(shot.endSec),camera:shot.camera,direction:shot.direction}: {...blankShot(),lookId:character.looks?.[0]?.id||''});
 };
 const saveShot=()=>{
  if(!shotFor)return;
  try{
   const draft={...shotDraft,startSec:shotDraft.startSec.trim()===''?NaN:Number(shotDraft.startSec),endSec:shotDraft.endSec.trim()===''?NaN:Number(shotDraft.endSec)};
   const next=shotEditing?updateCharacterShot(shotFor,shotEditing,draft):addCharacterShot(shotFor,{id:genId('shot'),...draft});
   add('characters',next);notify(shotEditing?'컷 계획을 수정했습니다.':'컷 계획을 저장했습니다.');setShotFor(null);setShotEditing(null);
  }catch(error){notify('컷 저장 실패: '+error.message);}
 };
 const removeShot=(character,id)=>{
  if(!confirm('이 컷 계획만 삭제할까요? 룩과 원본 자료는 보존됩니다.'))return;
  try{add('characters',deleteCharacterShot(character,id));notify('컷 계획을 삭제했습니다.');}catch(error){notify(error.message);}
 };
 const exportShots=(character)=>{
  try{downloadText(JSON.stringify(exportCharacterShotPlan(character),null,2),`MYVOCAL-shots-${character.id.replace(/[^a-zA-Z0-9_-]/g,'_')}.json`,'application/json');}
  catch(error){notify('컷 JSON 저장 실패: '+error.message);}
 };
 const importShots=async(character,file)=>{
  if(!file)return;
  try{
   if(file.size>SHOT_IMPORT_MAX_BYTES)throw Error('컷 계획 JSON은 512KB를 넘을 수 없습니다.');
   const updated=importCharacterShotPlan(character,await file.text());
   const added=(updated.shots||[]).length-(character.shots||[]).length;
   if(!added){notify('추가할 컷 계획이 없습니다.');return;}
   add('characters',updated);notify(`컷 계획 ${added}개를 가져왔습니다. 캐릭터와 원본 자료는 유지됩니다.`);
  }catch(error){notify('컷 계획 가져오기 실패: '+error.message);}
 };
 const beginVocalCue=(character,cue=null)=>{
  const firstShot=character.shots?.[0];
  setVocalFor(character);setVocalEditing(cue?.id||null);
  setVocalDraft(cue?{shotId:cue.shotId,startSec:String(cue.startSec),endSec:String(cue.endSec),part:cue.part,lyric:cue.lyric||'',note:cue.note||''}:
   {...blankVocalCue(),shotId:firstShot?.id||'',startSec:String(firstShot?.startSec??0),endSec:String(firstShot?.endSec??5)});
 };
 const saveVocalCue=()=>{
  if(!vocalFor)return;
  try{
   const draft={...vocalDraft,startSec:vocalDraft.startSec.trim()===''?NaN:Number(vocalDraft.startSec),endSec:vocalDraft.endSec.trim()===''?NaN:Number(vocalDraft.endSec)};
   const updated=vocalEditing?updateCharacterVocalCue(vocalFor,vocalEditing,draft):addCharacterVocalCue(vocalFor,{id:genId('vocalcue'),...draft});
   add('characters',updated);notify(vocalEditing?'보컬 큐를 수정했습니다.':'수동 보컬 큐를 저장했습니다.');setVocalFor(null);setVocalEditing(null);
  }catch(error){notify('보컬 큐 저장 실패: '+error.message);}
 };
 const removeVocalCue=(character,id)=>{
  if(!confirm('수동 보컬 큐만 삭제할까요? 캐릭터·컷·원본 음원은 유지됩니다.'))return;
  try{add('characters',deleteCharacterVocalCue(character,id));notify('보컬 큐를 삭제했습니다.');}catch(error){notify(error.message);}
 };
 const exportVocalCues=()=>{
  try{downloadText(JSON.stringify(exportCharacterVocalTimeline(visibleCharacters),null,2),'MYVOCAL-manual-vocal-cues.json','application/json');}
  catch(error){notify('보컬 큐 JSON 저장 실패: '+error.message);}
 };
 const exportVocalCuePack=character=>{
  try{downloadText(JSON.stringify(exportCharacterVocalCuePack(character),null,2),`MYVOCAL-vocal-cues-${character.id.replace(/[^a-zA-Z0-9_-]/g,'_')}.json`,'application/json');}
  catch(error){notify('보컬 큐 백업 실패: '+error.message);}
 };
 const importVocalCuePack=async(character,file)=>{
  if(!file)return;
  try{
   if(file.size>VOCAL_CUE_IMPORT_MAX_BYTES)throw Error('보컬 큐 JSON은 최대 512KB여야 합니다.');
   const updated=importCharacterVocalCuePack(character,await file.text());
   const added=(updated.vocalCues||[]).length-(character.vocalCues||[]).length;
   if(!added){notify('가져올 보컬 큐가 없습니다.');return;}
   add('characters',updated);
   notify(`보컬 큐 ${added}개를 복원했습니다. 컷·룩·첨부 파일은 변경하지 않았습니다.`);
  }catch(error){notify('보컬 큐 JSON 가져오기 실패: '+error.message);}
 };
 const exportProductionAudit=()=>{
  try{downloadText(JSON.stringify(exportCharacterProductionAudit(visibleCharacters),null,2),'MYVOCAL-production-audit.json','application/json');}
  catch(error){notify('제작 점검 JSON 저장 실패: '+error.message);}
 };
 const saveCharacterHandoff=async()=>{
  try{
   const packageData=await createCharacterHandoff(visibleCharacters);
   downloadText(JSON.stringify(packageData,null,2),'MYVOCAL-character-production-handoff-step70.json','application/json');
   setHandoffStatus(packageData.payload.summary.reviewPassed?'점검된 제작 계획을 저장했습니다. 실제 영상 생성 완료를 뜻하지 않습니다.':'검토 필요 항목이 포함된 계획을 저장했습니다.');
  }catch(error){setHandoffStatus('패키지 저장 실패: '+error.message);notify('패키지 저장 실패: '+error.message);}
 };
 const checkCharacterHandoff=async(file)=>{
  if(!file)return;
  try{
   if(file.size>512*1024)throw Error('Step70 JSON은 최대 512KB입니다.');
   const result=await verifyCharacterHandoff(await file.text(),visibleCharacters);
   setHandoffStatus(result.reviewPassed?'SHA-256 일치 · 현재 계획 일치 · 메타데이터 점검 통과':'SHA-256 일치 · 현재 계획 일치 · 메타데이터에 검토할 항목이 남아 있습니다.');
  }catch(error){setHandoffStatus('패키지 검증 실패: '+error.message);notify('패키지 검증 실패: '+error.message);}
 };
 const exportCast=()=>{
  try{const selected=data.characters.filter(c=>!castHidden.includes(c.id));downloadText(JSON.stringify(exportCharacterCastTimeline(selected),null,2),'MYVOCAL-cast-timeline.json','application/json');}
  catch(error){notify('캐스팅 JSON 저장 실패: '+error.message);}
 };
 const chooseFiles=(selected)=>{
  try{
   if(selected.length+existingAssets.length>MAX_CHARACTER_ASSETS)throw new Error('캐릭터당 첨부 자료는 최대 64개입니다.');
   const items=selected.map(file=>{const type=validateCharacterFile(file);return {file,role:type==='model'?'model':type==='video'?'motion-reference':'portrait'};});
   setFiles(items);
  }catch(error){notify(String(error.message));setFiles([]);}
 };
 const save=async(event)=>{
  event?.preventDefault?.();if(busy)return;
  let assets,profile;
  try{
   const additions=files.map(({file,role})=>{validateCharacterFile(file);validateCharacterAssetRole(role,inferCharacterAssetKind(file));return {id:genId('asset'),name:file.name,type:file.type||'',size:file.size,role};});
   assets=[...existingAssets,...additions];
   profile=normalizeCharacterIdentity({id:editing?.id||genId('char'),name,kind,rights,rightsNote,description,appearance,assets,createdAt:editing?.createdAt||now(),identityLock:editing?.identityLock!==false},editing);
  }catch(error){notify(`등록 정보 확인: ${error.message}`);return;}
  setBusy(true);const saved=[];
  try{
   for(let i=0;i<files.length;i++){await putFile(assets[existingAssets.length+i].id,files[i].file);saved.push(assets[existingAssets.length+i].id);}
   add('characters',profile);notify(editing?'캐릭터 기준 설정을 갱신했습니다.':'캐릭터와 기준 자료를 로컬에 등록했습니다.');
   setBusy(false);close(true);
  }catch(err){await Promise.allSettled(saved.map(id=>removeFile(id)));notify('캐릭터 등록 실패 (새로 저장한 자료는 복구 시도): '+err.message);setBusy(false);}
 };
 const deleteCharacter=character=>{
  if(busy)return;
  const dependents=characterDependents(data,character);
  if(dependents.length){notify('삭제할 수 없습니다: '+dependents.join(', '));return;}
  if(!confirm(`'${character.name}' 캐릭터 프로필을 목록에서 제거할까요? 첨부 원본 파일은 삭제하지 않고 보존합니다.`))return;
  setBusy(true);
  try{
   const result=removeCharacterPersisted(character.id);
   notify(`프로필 제거 완료. 원본 ${result.preservedFileIds.length}개 보존 · 메타데이터 복구 키: ${result.backupKey}`);
  }catch(error){notify('캐릭터 삭제 처리 결과 확인 필요: '+error.message);}
  finally{setBusy(false);}
 };
 return <><CharacterRestorePanel listBackups={listRestorableCharacters} onRestore={restoreCharacterPersisted} notify={notify}/><SectionHead eyebrow="CHARACTER IDENTITY" title="Character Studio" description="캐릭터·실제 사람·3D 모델의 외형 기준을 로컬 라이브러리에 기록하고 수정합니다." action={<Button variant="primary" icon="plus" onClick={()=>begin()}>새 캐릭터 등록</Button>}/>
 <div className="feature-strip"><div className="feature-symbol"><Icon name="user" size={27}/></div><div><strong>MANUAL VOCAL CUE BACKUP · STEP68</strong><p>기존 캐릭터·룩·컷 계획을 유지하면서 컷별 리드·화음·대사 등 수동 보컬 시간표를 등록하고 겹치는 구간을 비교합니다. 음성 생성·립싱크·영상 렌더링은 제공하지 않습니다.</p></div><Status>수동 기준 설정 · AI 미연결</Status></div>
 {data.characters.length>0&&<section className="cast-board" aria-label="다중 캐릭터 출연 보드">
  <div className="cast-board-head"><div><strong>MULTI-CHARACTER CAST · STEP66</strong><p>기존 CHARACTER SHOT BOARD · STEP65의 캐릭터별 수동 컷을 시간순으로 통합합니다. 동시에 등장하는 캐릭터는 의도적인 동시 출연으로 표시하며, 원본 컷은 변경하지 않습니다.</p></div><Button onClick={exportCast}>캐스팅 JSON 저장</Button></div>
  <div className="cast-board-filter" aria-label="타임라인에 표시할 캐릭터">
   {data.characters.map(c=><label key={c.id}><input type="checkbox" checked={!castHidden.includes(c.id)} onChange={e=>setCastHidden(v=>e.target.checked?v.filter(x=>x!==c.id):[...v,c.id])}/>{c.name}</label>)}
  </div>
  <small>출연 {castTimeline.participants}명 · 컷 {castTimeline.shots}개 · 동시 출연 구간 {castTimeline.duetIntervals}곳 · 빈 구간 {castTimeline.gaps.length}곳 · 룩 재검토 컷 {castTimeline.reviewRequiredShots}개</small>
  <div className="cast-board-timeline" role="list" aria-label="다중 캐릭터 컷 시간표">
   {castTimeline.intervals.slice(0,80).map((segment,i)=><div role="listitem" className={`cast-board-interval${segment.reviewRequired?' needs-review':''}`} key={`${segment.startSec}:${segment.endSec}:${i}`}>
    <span className="cast-board-time">{segment.startSec.toFixed(3)}~{segment.endSec.toFixed(3)}초</span>
    <span>{segment.cast.map(c=>`${c.characterName} (${c.lookName||'룩 누락'})`).join(' + ')}{segment.simultaneous?' · 동시 출연':''}{segment.reviewRequired?' · 룩 재검토 필요':''}</span>
   </div>)}
   {castTimeline.intervals.length>80&&<small>화면에는 처음 80개 구간만 표시합니다. JSON에는 전체 구간을 포함합니다.</small>}
   {castTimeline.shots===0&&<small>선택한 캐릭터에 컷 계획이 없습니다. 캐릭터별 컷을 추가하면 이곳에 통합됩니다.</small>}
  </div>
  <div className="cast-board-head"><div><strong>MANUAL VOCAL CUES · STEP67</strong><p>리드·화음·애드리브·대사 구간을 각 캐릭터의 컷 안에 직접 표시합니다. 자동 음원 분석이나 입 모양 생성은 하지 않습니다.</p></div><Button onClick={exportVocalCues}>보컬 큐 JSON 저장</Button></div>
  <small>수동 보컬 큐 {vocalTimeline.cueCount}개 · 참가 {vocalTimeline.participants}명 · 동시 보컬 구간 {vocalTimeline.simultaneousSegments}곳 · 재검토 {vocalTimeline.reviewRequiredCues}개</small>
  <div className="cast-board-timeline" role="list" aria-label="다중 캐릭터 보컬 큐 시간표">
   {vocalTimeline.segments.slice(0,80).map((segment,i)=><div role="listitem" className={`cast-board-interval${segment.reviewRequired?' needs-review':''}`} key={`vocal:${segment.startSec}:${segment.endSec}:${i}`}>
    <span className="cast-board-time">{segment.startSec.toFixed(3)}~{segment.endSec.toFixed(3)}초</span>
    <span>{segment.cast.map(c=>`${c.characterName} (${vocalPartLabels[c.part]||c.part})`).join(' + ')}{segment.simultaneous?' · 동시 보컬':''}{segment.reviewRequired?' · 컷 연결 재검토 필요':''}</span>
   </div>)}
   {vocalTimeline.segments.length>80&&<small>화면에는 80개 구간까지만 표시하며 JSON에는 전체가 포함됩니다.</small>}
   {!vocalTimeline.cueCount&&<small>캐릭터별 컷을 추가한 뒤 보컬 큐를 등록하면 이곳에 표시됩니다.</small>}
  </div>
  <div className="cast-board-head"><div><strong>PRODUCTION AUDIT · STEP69</strong><p>캐릭터·룩·컷·보컬 큐의 수동 계획 연결 상태를 확인합니다. 외형 자동 인식이나 실제 영상 제작 완료 판정이 아닙니다.</p></div><Button onClick={exportProductionAudit}>제작 점검 JSON 저장</Button></div>
  <small>컷 {productionAudit.shots}개 · 큐 {productionAudit.cues}개 · 다른 캐릭터의 동시 보컬 쌍 {productionAudit.duetCuePairs}개 · 오류 {productionAudit.errors}개 · 경고 {productionAudit.warnings}개 · 참고 {productionAudit.information}개 · {productionAudit.metadataReady?'메타데이터 연결 점검 통과':'수동 점검 필요'}</small>
  <div className="cast-board-timeline" role="list" aria-label="캐릭터 MV 제작 점검 결과">
   {productionAudit.issues.slice(0,80).map((issue,i)=><div role="listitem" className={`cast-board-interval${issue.level!=='info'?' needs-review':''}`} key={`audit:${i}`}><span className="cast-board-time">{issue.level==='error'?'오류':issue.level==='warning'?'경고':'참고'}</span><span>{issue.characterId}{issue.shotId?` · 컷 ${issue.shotId}`:''}{issue.cueId?` · 큐 ${issue.cueId}`:''} · {issue.message}</span></div>)}
   {productionAudit.issues.length>80&&<small>화면에는 처음 80개 항목만 표시합니다. JSON에는 전체 항목을 포함합니다.</small>}
   {!productionAudit.issues.length&&<small>현재 선택한 캐릭터의 수동 계획에 발견된 메타데이터 문제는 없습니다.</small>}
  </div>
  <div className="cast-board-head"><div><strong>CHARACTER PRODUCTION HANDOFF · STEP70</strong><p>Step69 검토 결과와 현재 캐릭터·컷·큐의 최소 메타데이터를 SHA-256으로 묶어 저장합니다. 가져온 JSON은 현재 계획과 일치하는지만 검사하며, 자료를 덮어쓰지 않습니다.</p></div><div className="look-actions"><Button onClick={saveCharacterHandoff}>제작 계획 검증 패키지 저장</Button><label className="btn" style={{cursor:'pointer'}}>검증 패키지 확인<input type="file" accept=".json,application/json" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)checkCharacterHandoff(f);e.target.value='';}}/></label></div></div>
  <small role="status" aria-live="polite">{handoffStatus||'패키지를 저장하거나 이전 패키지를 선택해 무결성·현재 계획 일치를 검사하세요. SHA-256은 작성자 진위 증명이 아닙니다.'}</small>
  <small>듀엣 표시는 동시 출연의 시간 정보이며, 음성 배정·립싱크·영상 제작을 자동 수행하지 않습니다.</small>
 </section>}
 {data.characters.length?<div className="asset-grid">{data.characters.map(c=>{const summary=getCharacterReferenceSummary(c),art=c.assets?.find(a=>a.type?.startsWith('image/'));return <div className="asset-card" key={c.id}><div className="character-art">{art?<AssetPreview id={art.id}/>:<Icon name="user" size={45}/>}<span className="char-type">{c.kind==='person'?'PERSON':c.kind==='3d'?'3D MODEL':'CHARACTER'}</span></div><div className="asset-body"><span className="eyebrow">IDENTITY REFERENCE</span><h3>{c.name}</h3><p>{c.description||'설명 없음'}</p><small>첨부 {summary.total}개 · 외형 항목 {summary.described}/7개 · {rightsOptions.find(x=>x.value===c.rights)?.label||'권한 미확인'}</small> <div className="look-overview"><small>STEP81 · 2D 레이어: {layerPlanStatus(c).message}</small>
 {((c.kind==='person'&&personPhotoAssets(c).length>0)||(c.kind==='character'&&eligibleLayerImages(c).length>0))&&
 <div className="look-actions"><Button disabled={busy} onClick={()=>setStyleTransferFor(c.id)}>{c.kind==='person'?'원본 42항 · 사람을 캐릭터화':'원본 43항 · 캐릭터 실사풍 변환'}</Button></div>}
 {(c.kind==='person'||c.kind==='character')&&<div className="look-actions"><Button disabled={busy} onClick={()=>setIdentityLearningFor(c.id)}>{c.kind==='person'?'49 · 실제 사람 LoRA 학습':'48 · 캐릭터 LoRA 학습'}</Button>{c.identityTraining?.modelFileName&&<small>실제 학습 가중치: {c.identityTraining.modelFileName} (추론 미검증)</small>}</div>}
 {(modelAssets(c).length>0||layerPlanStatus(c).status==='ready'||(c.kind==='person'&&personVideoAssets(c).length>0))&&<div className="look-actions"><Button onClick={()=>setLipFor(c)}>STEP85 · 캐릭터 Lip Sync</Button></div>}
 {c.kind==='person'&&personVideoAssets(c).length>0&&<div className="look-actions"><Button disabled={!c.lipSync?.cues?.length} onClick={()=>setPersonLipFor(c)}>STEP86 · 실제 사람 Lip Sync</Button><small>먼저 STEP85 음소·가창 시간표를 저장하세요.</small></div>}
 {(modelAssets(c).length>0||layerPlanStatus(c).status==='ready')&&<div className="look-actions"><Button disabled={!c.lipSync?.cues?.length} onClick={()=>setExpressionFor(c)}>STEP87 · AI 표정 연출</Button><small>{expressionPlanStatus(c)} · 먼저 STEP85 가사 시간표 저장</small></div>}
 {(modelAssets(c).length>0||layerPlanStatus(c).status==='ready')&&<div className="look-actions"><Button onClick={()=>setDanceFor(c)}>STEP88 · AI Dance Director</Button><small>{danceStatus(c)}</small></div>}
 {(modelAssets(c).length>0||layerPlanStatus(c).status==='ready')&&<div className="look-actions"><Button onClick={()=>setPerformanceFor(c)}>STEP89 · 직접 연기 및 악기 연주 연결</Button><small>{performance89Status(c)}</small></div>}
 {modelAssets(c).length>0&&<div className="look-actions"><Button onClick={()=>setModelFor(c)}>STEP83 · 3D 캐릭터 시스템</Button><Button onClick={()=>setStageFor(c)}>STEP84 · 3D 무대 연출</Button><small>{rigStatus(c)} · {stageStatus(c)}</small></div>}
 {eligibleLayerImages(c).length>0&&<div className="look-actions"><Button onClick={()=>setLayerFor(c)}>2D 레이어 분석·수정</Button><Button disabled={layerPlanStatus(c).status!=='ready'} onClick={()=>setAnimationFor(c)}>STEP82 · 2D 애니메이션</Button><small>{animationStatus(c).message}</small></div>}
 </div>
<div className="look-overview"><small>룩 프리셋 {summarizeCharacterLooks(c).total}/{LOOK_LIMIT}개 · 재검토 {summarizeCharacterLooks(c).reviewRequired}개</small>
 {(c.looks||[]).map(look=>{const review=reviewCharacterLook(c,look);return <div className="look-row" key={look.id}>
  <div><strong>{look.name}</strong> · {look.outfit||look.expression||look.scene||'설정 기록'} <small>{review.reviewRequired?`기준 재검토 필요 (${review.changedFields.join(', ')||'자료 누락'})`:'기준 외형 일치 · 수동 검사'}</small></div>
  <div className="look-actions">{review.reviewRequired&&<Button onClick={()=>approveLook(c,look.id)}>기준 재승인</Button>}<Button onClick={()=>beginLook(c,look)}>수정</Button><Button disabled={!((c.kind==='character'&&eligibleLayerImages(c).length)||(c.kind==='person'&&personPhotoAssets(c).length))} onClick={()=>setLookStudio({characterId:c.id,lookId:look.id})}>의상·헤어·장신구 AI 이미지 4종 제작</Button><Button onClick={()=>removeLook(c,look.id)}>룩 삭제</Button></div>
 </div>;})}
 <div className="look-actions"><Button icon="plus" onClick={()=>beginLook(c)}>룩 추가</Button><Button onClick={()=>exportLooks(c)}>룩 JSON 저장</Button><label className="btn" style={{cursor:"pointer"}}>룩 JSON 가져오기<input type="file" accept=".json,application/json" style={{display:"none"}} onChange={e=>{const file=e.target.files?.[0];if(file)importLooks(c,file);e.target.value="";}}/></label></div></div>
 <div className="look-overview"><small>MV 컷 계획 {summarizeCharacterShots(c).total}/{SHOT_LIMIT}개 · 재검토 {summarizeCharacterShots(c).reviewRequired}개 · 수동 스토리보드</small>
 {getCharacterShotTimeline(c).segments.length>0&&<div className="shot-timeline" aria-label={`${c.name} 컷 타임라인`}>
  <div className="shot-timeline-track">{getCharacterShotTimeline(c).segments.map(segment=><div key={segment.id} className={`shot-timeline-segment${segment.reviewRequired?' needs-review':''}`} title={`${segment.title} · ${segment.startSec.toFixed(3)}~${segment.endSec.toFixed(3)}초${segment.reviewRequired?' · 재검토 필요':''}`} style={{left:`${segment.leftPercent}%`,width:`${segment.widthPercent}%`}}><span>{segment.title}</span></div>)}</div>
  <small>0초 → {getCharacterShotTimeline(c).endSec.toFixed(3)}초 · 빈 구간 {getCharacterShotTimeline(c).gaps.length}곳 · 영상 렌더링 없음</small>
 </div>}
 {(c.shots||[]).map(shot=>{const review=reviewCharacterShot(c,shot);const linked=(c.looks||[]).find(l=>l.id===shot.lookId);return <div className="look-row" key={shot.id}>
 <div><strong>{shot.title}</strong> · {shot.startSec.toFixed(3)}~{shot.endSec.toFixed(3)}초 · {cameraLabels[shot.camera]||shot.camera} · 룩: {linked?.name||'삭제된 룩'}<small>{review.reviewRequired?`재검토 필요 (${review.missingLook?'룩 누락':review.missingReference?'참고 자료 누락':'외형 기준 변경'})`:(shot.direction||'수동 연출 계획 · 자동 영상 생성 없음')}</small></div>
 <div className="look-actions"><Button onClick={()=>beginShot(c,shot)}>컷 수정</Button><Button onClick={()=>removeShot(c,shot.id)}>컷 삭제</Button></div>
 </div>;})}
 <div className="look-actions"><Button icon="plus" onClick={()=>beginShot(c)} disabled={!c.looks?.length||(c.shots||[]).length>=SHOT_LIMIT}>컷 추가</Button><Button onClick={()=>exportShots(c)}>컷 계획 JSON 저장</Button><label className="btn" style={{cursor:"pointer"}}>컷 계획 JSON 가져오기<input type="file" accept=".json,application/json" style={{display:"none"}} onChange={e=>{const file=e.target.files?.[0];if(file)importShots(c,file);e.target.value="";}}/></label></div></div>
 <div className="look-overview"><small>STEP68 · 수동 보컬 큐 {(c.vocalCues||[]).length}/{VOCAL_CUE_LIMIT}개 · 자동 립싱크 없음</small>
 {(c.vocalCues||[]).map(cue=>{const review=reviewCharacterVocalCue(c,cue);return <div className="look-row" key={cue.id}>
 <div><strong>{vocalPartLabels[cue.part]||cue.part}</strong> · {cue.startSec.toFixed(3)}~{cue.endSec.toFixed(3)}초 · {cue.lyric||'가사 미입력'}<small>{review.reviewRequired?(review.missingShot?'컷 연결 누락 · 재검토 필요':'컷 범위 변경 · 재검토 필요'):(cue.note||'사용자가 직접 작성한 큐 정보')}</small></div>
 <div className="look-actions"><Button onClick={()=>beginVocalCue(c,cue)}>큐 수정</Button><Button onClick={()=>removeVocalCue(c,cue.id)}>큐 삭제</Button></div>
 </div>;})}
 <div className="look-actions"><Button icon="plus" disabled={!(c.shots||[]).length||(c.vocalCues||[]).length>=VOCAL_CUE_LIMIT} onClick={()=>beginVocalCue(c)}>보컬 큐 추가</Button><Button onClick={()=>exportVocalCuePack(c)}>보컬 큐 개별 백업</Button><label className="btn" style={{cursor:'pointer'}}>보컬 큐 JSON 복원<input type="file" accept=".json,application/json" style={{display:'none'}} onChange={e=>{const file=e.target.files?.[0];if(file)importVocalCuePack(c,file);e.target.value='';}}/></label></div>
 </div>
 <div className="asset-footer"><span className="identity-label"><Icon name="lock" size={14}/> 수동 기준 기록 · 자동 일관성 미구현</span><Button icon="sliders" onClick={()=>begin(c)}>설정 편집</Button><button className="icon-btn danger" title="삭제" onClick={()=>deleteCharacter(c)}><Icon name="trash" size={17}/></button></div></div></div>;})}</div>:<Empty icon="user" title="아직 등록된 캐릭터가 없습니다" description="본인 자료나 사용 허가가 있는 사람·캐릭터 자료를 등록하세요." action={<Button variant="primary" icon="plus" onClick={()=>begin()}>첫 캐릭터 등록</Button>}/>}
 <Notice>MV 컷 계획은 시간 및 텍스트 메타데이터이며 비디오 프레임을 렌더링하지 않습니다. 외형 정보·룩 프리셋·기준 변화 감지는 사용자가 직접 입력한 텍스트를 비교합니다. 룩·컷·보컬 큐 JSON 가져오기는 동일 캐릭터 ID만 허용하고, 컷 ID·시간 충돌·누락된 룩을 검사한 뒤 전부 통과할 때만 저장합니다. 얼굴 인식·AI 캐릭터 생성·고급 3D 무대 자동 생성·자동 Identity Lock·립싱크는 아직 제공하지 않습니다. 기본 3D 모델 프리뷰는 STEP83에서 지원합니다. 원본 자료는 로컬 IndexedDB에 보관됩니다.</Notice>
 {identityLearningFor&&<Modal title="본인·캐릭터 실제 LoRA 학습" onClose={()=>setIdentityLearningFor(null)}><CharacterLearningPanel profile={data.characters.find(c=>c.id===identityLearningFor)} onSave={updated=>{add('characters',updated);setIdentityLearningFor(null);}} notify={notify}/></Modal>}
 {styleTransferFor&&<Modal title="사람·캐릭터 AI 변환" onClose={()=>setStyleTransferFor(null)}><CharacterStyleTransferStudio profile={data.characters.find(c=>c.id===styleTransferFor)} existingIds={data.characters.flatMap(c=>[c.id,...(c.assets||[]).map(a=>a.id)])} onSave={next=>{add('characters',next);setStyleTransferFor(null);}} notify={notify}/></Modal>}
 {lookStudio&&<Modal title="캐릭터 의상·머리·장신구 4종 로컬 AI 제작" onClose={()=>setLookStudio(null)}><CharacterOutfitStudio character={data.characters.find(c=>c.id===lookStudio.characterId)} lookId={lookStudio.lookId} onSave={updated=>{add('characters',updated);setLookStudio(null);}} notify={notify}/></Modal>}
  {modelFor&&<Modal title={`STEP83 · 3D 캐릭터 시스템 · ${modelFor.name}`} onClose={()=>setModelFor(null)}><Character3dEditor character={data.characters.find(c=>c.id===modelFor.id)||modelFor} onSave={profile=>{add('characters',profile);setModelFor(null);}} notify={notify}/></Modal>}
 {performanceFor&&<Modal title={`STEP89 · 직접 연기 및 악기 연주 연결 · ${performanceFor.name}`} onClose={()=>setPerformanceFor(null)}><CharacterPerformance89Editor character={data.characters.find(c=>c.id===performanceFor.id)||performanceFor} projects={data.projects} onSave={profile=>{add('characters',profile);setPerformanceFor(null);}} notify={notify}/></Modal>}
 {danceFor&&<Modal title={`STEP88 · AI Dance Director · ${danceFor.name}`} onClose={()=>setDanceFor(null)}><CharacterDanceEditor character={data.characters.find(c=>c.id===danceFor.id)||danceFor} projects={data.projects} onSave={profile=>{add('characters',profile);setDanceFor(null);}} notify={notify}/></Modal>}
 {expressionFor&&<Modal title={`STEP87 · AI 표정 연출 · ${expressionFor.name}`} onClose={()=>setExpressionFor(null)}><CharacterExpressionEditor character={data.characters.find(c=>c.id===expressionFor.id)||expressionFor} onSave={profile=>{add('characters',profile);setExpressionFor(null);}} notify={notify}/></Modal>}
 {personLipFor&&<Modal title={`STEP86 · 실제 사람 Lip Sync · ${personLipFor.name}`} onClose={()=>setPersonLipFor(null)}><PersonLipSyncEditor character={data.characters.find(c=>c.id===personLipFor.id)||personLipFor} onSave={profile=>{add('characters',profile);setPersonLipFor(null);}} notify={notify}/></Modal>}
 {lipFor&&<Modal title={`STEP85 · 캐릭터 Lip Sync · ${lipFor.name}`} onClose={()=>setLipFor(null)}><CharacterLipSyncEditor character={data.characters.find(c=>c.id===lipFor.id)||lipFor} onSave={profile=>{add('characters',profile);setLipFor(null);}} notify={notify} projects={data.projects||[]}/></Modal>}
 {stageFor&&<Modal title={`STEP84 · 3D 무대 연출 · ${stageFor.name}`} onClose={()=>setStageFor(null)}><CharacterStage3dEditor character={data.characters.find(c=>c.id===stageFor.id)||stageFor} projects={data.projects||[]} onSave={profile=>{add('characters',profile);setStageFor(null);}} notify={notify}/></Modal>}
 {animationFor&&<Modal title={`STEP82 · 2D 캐릭터 애니메이션 · ${animationFor.name}`} onClose={()=>setAnimationFor(null)}>
  <CharacterAnimationEditor character={data.characters.find(c=>c.id===animationFor.id)||animationFor} projects={data.projects||[]} onSave={profile=>{add('characters',profile);setAnimationFor(null);}} notify={notify}/>
 </Modal>}
 {layerFor&&<Modal title={`STEP81 · 2D 캐릭터 레이어 분석 · ${layerFor.name}`} onClose={()=>setLayerFor(null)}>
  <CharacterLayerEditor character={data.characters.find(c=>c.id===layerFor.id)||layerFor} onSave={profile=>{add('characters',profile);setLayerFor(null);}} notify={notify}/>
 </Modal>}
 {vocalFor&&<Modal title={`수동 보컬 큐 ${vocalEditing?'수정':'추가'} · ${vocalFor.name}`} onClose={()=>setVocalFor(null)}><div className="modal-form">
 <Notice>Step68 보컬 큐는 제작 메모이며 실제 음성·립싱크를 생성하지 않습니다. 하나의 캐릭터에서는 큐 시간이 겹칠 수 없지만 다른 캐릭터와의 듀엣은 허용합니다.</Notice>
 <Field label="연결할 MV 컷"><select value={vocalDraft.shotId} onChange={e=>{const shot=(vocalFor.shots||[]).find(s=>s.id===e.target.value);setVocalDraft(v=>({...v,shotId:e.target.value,startSec:String(shot?.startSec??0),endSec:String(shot?.endSec??5)}));}}>{(vocalFor.shots||[]).map(s=><option key={s.id} value={s.id}>{s.title} ({s.startSec}~{s.endSec}초)</option>)}</select></Field>
 <div className="form-two"><Field label="시작 (초)"><input type="number" min="0" max="3600" step="0.001" value={vocalDraft.startSec} onChange={e=>setVocalDraft(v=>({...v,startSec:e.target.value}))}/></Field><Field label="종료 (초)"><input type="number" min="0" max="3600" step="0.001" value={vocalDraft.endSec} onChange={e=>setVocalDraft(v=>({...v,endSec:e.target.value}))}/></Field></div>
 <Field label="보컬 역할"><select value={vocalDraft.part} onChange={e=>setVocalDraft(v=>({...v,part:e.target.value}))}>{VOCAL_PARTS.map(part=><option key={part} value={part}>{vocalPartLabels[part]}</option>)}</select></Field>
 <Field label="가사 / 발화 메모"><input maxLength="240" value={vocalDraft.lyric} onChange={e=>setVocalDraft(v=>({...v,lyric:e.target.value}))} placeholder="실제 목소리를 합성하지 않는 메모"/></Field>
 <Field label="연출 메모"><textarea rows="2" maxLength="500" value={vocalDraft.note} onChange={e=>setVocalDraft(v=>({...v,note:e.target.value}))}/></Field>
 <div className="modal-actions"><Button onClick={()=>setVocalFor(null)}>취소</Button><Button variant="primary" icon="save" onClick={saveVocalCue}>{vocalEditing?'큐 수정 저장':'큐 저장'}</Button></div>
 </div></Modal>}
 {shotFor&&<Modal title={`MV 컷 ${shotEditing?'수정':'추가'} · ${shotFor.name}`} onClose={()=>setShotFor(null)}><div className="modal-form">
 <Notice>등록된 룩을 MV 컷 시간에 배치하는 수동 계획입니다. 겹치는 컷은 저장할 수 없으며 영상 파일을 만들지 않습니다.</Notice>
 <Field label="컷 제목"><input maxLength={120} value={shotDraft.title} onChange={e=>setShotDraft(s=>({...s,title:e.target.value}))} placeholder="예: 1절 첫 등장"/></Field>
 <div className="form-two"><Field label="시작 (초)"><input type="number" min="0" max="3600" step="0.001" value={shotDraft.startSec} onChange={e=>setShotDraft(s=>({...s,startSec:e.target.value}))}/></Field><Field label="종료 (초)"><input type="number" min="0" max="3600" step="0.001" value={shotDraft.endSec} onChange={e=>setShotDraft(s=>({...s,endSec:e.target.value}))}/></Field></div>
 <div className="form-two"><Field label="사용할 룩"><select value={shotDraft.lookId} onChange={e=>setShotDraft(s=>({...s,lookId:e.target.value}))}>{(shotFor.looks||[]).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></Field><Field label="카메라 구도"><select value={shotDraft.camera} onChange={e=>setShotDraft(s=>({...s,camera:e.target.value}))}>{CAMERA_CHOICES.map(k=><option key={k} value={k}>{cameraLabels[k]}</option>)}</select></Field></div>
 <Field label="연출 / 동작 메모"><textarea rows="3" maxLength={800} value={shotDraft.direction} onChange={e=>setShotDraft(s=>({...s,direction:e.target.value}))}/></Field>
 <div className="modal-actions"><Button onClick={()=>setShotFor(null)}>취소</Button><Button variant="primary" onClick={saveShot} icon="save">{shotEditing?'컷 수정 저장':'컷 저장'}</Button></div>
 </div></Modal>}
 {lookFor&&<Modal title={`룩 프리셋 ${lookEditing?'수정':'추가'} · ${lookFor.name}`} onClose={()=>setLookFor(null)}><div className="modal-form">
 <Notice>의상·표정·포즈·배경 등 수동 연출 설정을 추가합니다. 기존 캐릭터나 원본 이미지 파일은 변경하지 않습니다.</Notice>
 <Field label="룩 이름 (필수)"><input autoFocus maxLength={120} value={lookName} onChange={e=>setLookName(e.target.value)} placeholder="예: 야간 공연 의상"/></Field>
 <div className="form-two">{LOOK_FIELDS.map(field=><Field key={field} label={lookLabels[field]}>{field==='notes'?<textarea rows="2" maxLength={800} value={lookFields[field]} onChange={e=>setLookFields(prev=>({...prev,[field]:e.target.value}))}/>:<input maxLength={250} value={lookFields[field]} onChange={e=>setLookFields(prev=>({...prev,[field]:e.target.value}))}/>}</Field>)}</div>
 <Field label="연결할 이미지 / 3D 기준 자료"><select value={lookAsset} onChange={e=>setLookAsset(e.target.value)}><option value="">자료 연결 안 함</option>{(lookFor.assets||[]).filter(asset=>/\.(png|jpe?g|webp|gif|bmp|avif|vrm|glb|gltf)$/i.test(asset.name||'')).map(asset=><option key={asset.id} value={asset.id}>{asset.name} · {roleLabels[asset.role]||'기타'}</option>)}</select></Field>
 <div className="modal-actions"><Button onClick={()=>setLookFor(null)}>취소</Button><Button variant="primary" icon="save" onClick={saveLook}>{lookEditing?'수정 저장':'룩 저장'}</Button></div>
 </div></Modal>}
 {open&&<Modal title={editing?'캐릭터 기준 설정 편집':'사람 / 캐릭터 등록'} onClose={()=>close()}><form className="modal-form" onSubmit={save}>
 <Field label="이름"><input autoFocus required maxLength={120} value={name} onChange={e=>setName(e.target.value)} placeholder="예: LUNA"/></Field>
 <div className="form-two"><Field label="유형"><select value={kind} onChange={e=>setKind(e.target.value)}><option value="character">2D 캐릭터 / 일러스트</option><option value="person">실제 사람</option><option value="3d">3D 캐릭터 / VRM</option></select></Field><Field label="자료 사용 권한"><select value={rights} onChange={e=>setRights(e.target.value)}>{rightsOptions.filter(r=>r.value!=='reference').map(r=><option value={r.value} key={r.value}>{r.label}</option>)}</select></Field></div>
 {rights==='licensed'&&<Field label="사용 허가 출처와 범위 (필수)"><textarea required rows="2" maxLength={500} value={rightsNote} onChange={e=>setRightsNote(e.target.value)} placeholder="예: 캐릭터 제작자로부터 비상업용 MV 사용 허가"/></Field>}
 <Field label="소개 및 세계관"><textarea rows="3" maxLength={1500} value={description} onChange={e=>setDescription(e.target.value)} placeholder="캐릭터 설명, 성격, 세계관 등"/></Field>
 <div className="eyebrow">외형 기준 시트 (사용자 직접 작성)</div>
 <div className="form-two">{characterAppearanceFields.map(field=><Field key={field} label={appearanceLabels[field]}><input maxLength={250} value={appearance[field]||''} onChange={e=>setAppearance(v=>({...v,[field]:e.target.value}))} placeholder={field==='palette'?'예: 네이비 · 코발트':'선택 입력'}/></Field>)}</div>
 {existingAssets.length>0&&<><div className="eyebrow">기존 자료 역할 ({existingAssets.length}개, 유지됨)</div>{existingAssets.map((asset,i)=><div className="form-two" key={asset.id}><Field label={`${i+1}. ${asset.name}`}><select value={asset.role||'other'} onChange={e=>setExistingAssets(old=>old.map((a,j)=>i===j?{...a,role:e.target.value}:a))}>{possibleRoles(asset).map(role=><option key={role} value={role}>{roleLabels[role]}</option>)}</select></Field></div>)}</>}
 <Field label="기준 이미지 · 영상 · VRM 자료 추가"><input type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif,video/mp4,video/webm,video/quicktime,.vrm,.glb,.gltf" onChange={e=>chooseFiles([...(e.target.files||[])])}/></Field>
 {files.map(({file,role},i)=><div className="form-two" key={`${file.name}-${i}`}><Field label={`${i+1}. ${file.name}`}><select value={role} onChange={e=>setFiles(current=>current.map((item,j)=>i===j?{...item,role:e.target.value}:item))}>{possibleRoles(file).map(r=><option key={r} value={r}>{roleLabels[r]}</option>)}</select></Field></div>)}
 <Notice>첨부 자료별 역할은 메타데이터입니다. 자동 전면·측면 생성이나 인물 분석 결과가 아닙니다. 파일당 40MB, 캐릭터당 64개 제한.</Notice>
 <div className="modal-actions"><Button onClick={()=>close()} disabled={busy}>취소</Button><Button variant="primary" onClick={save} icon="save" disabled={busy}>{busy?'저장 중...':editing?'변경 저장':'캐릭터 등록'}</Button></div>
 </form></Modal>}
 </>;
}
