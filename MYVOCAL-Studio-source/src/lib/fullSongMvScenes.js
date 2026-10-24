// 3~6분 원곡 MV의 빈 구간만 기존 SD/SVD 모델의 새 자동 장면으로 연결한다.
// 사용자 작성 장면·기존 미디어·인물/의상 원본은 수정하지 않는다.
import {describeOriginalSongMvScene} from './mvSongSectionDirection.js';
import {personPhotoAssets,validatePersonSource} from './imageToMv.js';
import {characterArtworkAssets,validateCharacterArtwork} from './characterToMv.js';

// 두 가수의 실제 등록 사진·원화를 원곡 자동 생성 장면에 연결한다.
// 기존 수동 장면과 이미 생성된 이미지/영상, 원본 자산은 수정하지 않는다.
export function bindRegisteredDuetToAutoScenes(project,characters,{includeReferences=false}={}){
 if(!project?.id||!Array.isArray(project.scenes)||!Array.isArray(characters))
  throw Error('듀엣 MV에는 기존 프로젝트와 등록 인물 목록이 필요합니다.');
 const duet=project.duetSingers;
 if(duet?.version!==1)return {project,updated:0};
 if(includeReferences!==true)
  throw Error('듀엣의 등록된 원본 사진·원화 사용 동의가 필요합니다.');
 const leadId=duet.lead?.characterId,harmonyId=duet.harmony?.characterId;
 if(!leadId||!harmonyId||leadId===harmonyId)
  throw Error('듀엣은 서로 다른 두 명의 등록 인물이 필요합니다.');
 const bpm=Number(project.bpm);
 if(!Number.isFinite(bpm)||bpm<40||bpm>240)
  throw Error('듀엣 자동 MV 장면은 원곡 BPM이 필요합니다.');
 const referenceFor=id=>{
  const character=characters.find(item=>item?.id===id);
  if(!character)throw Error('듀엣 가수의 등록 인물을 찾지 못했습니다.');
  const person=character.kind==='person';
  if(!person&&character.kind!=='character')
   throw Error('듀엣 자동 MV는 등록된 실제 사람 또는 2D 캐릭터 원화가 필요합니다.');
  const assets=person?personPhotoAssets(character):characterArtworkAssets(character);
  const preferred=['portrait','front','full-body','expression','side','back','outfit'];
  const original=assets.slice().sort((a,b)=>
   preferred.indexOf(a.role)-preferred.indexOf(b.role)).find(asset=>asset?.id);
  if(!original)throw Error('듀엣 가수마다 본인 또는 허가된 원본 사진·원화가 필요합니다.');
  if(person)validatePersonSource(character,original.id);
  else validateCharacterArtwork(character,original.id);
  return person?{characterId:id,personMv:{personId:id,referenceAssetId:original.id,denoise:.35}}:
   {characterId:id,characterMv:{characterId:id,referenceAssetId:original.id,denoise:.35}};
 };
 // 인물·권한 검사를 모든 장면 수정 전에 완료한다.
 const lead=referenceFor(leadId),harmony=referenceFor(harmonyId);
 let updated=0;
 const scenes=project.scenes.map(scene=>{
  if(scene?.generatedBy!=='full-song-auto-scene'||scene.imageAssetId||scene.videoClipAssetId)
   return scene;
  const start=Number(scene.start);
  if(!Number.isFinite(start)||start<0||start>360)
   throw Error('듀엣 자동 MV 장면의 원곡 시간이 올바르지 않습니다.');
  const role=scene.duetSingerRole==='lead'||scene.duetSingerRole==='harmony'?
   scene.duetSingerRole:Math.floor(start*bpm/240)%2===0?'lead':'harmony';
  const ref=role==='lead'?lead:harmony;
  const linked=ref.personMv?scene.personMv:scene.characterMv;
  if(scene.characterId===ref.characterId&&
    linked?.referenceAssetId===(ref.personMv||ref.characterMv).referenceAssetId&&
    !((ref.personMv&&scene.characterMv)||(ref.characterMv&&scene.personMv))&&
    scene.duetSingerRole===role)return scene;
  // 원본 수동 장면이 아닌 미생성 자동 장면만 교체한다.
  // 생성 전에 상속한 다른 가수의 참조를 제거해 얼굴 혼합을 막는다.
  const {personMv:oldPerson,characterMv:oldCharacter,...rest}=scene;
  updated++;
  return {...rest,...ref,duetSingerRole:role};
 });
 return {project:updated?{...project,scenes}:project,updated};
}
const CLOCK=1000;
const FRAME_SECONDS=3; // 실제 SVD 25프레임·8fps 출력 3.125초 이내
const at=seconds=>Math.round(seconds*CLOCK)/CLOCK;
export function extendMvToFullSong(project,duration,{newId,sceneLimit=120}={}){
 if(!project?.id||!Array.isArray(project.scenes)||typeof newId!=='function')
  throw Error('기존 MYVOCAL 뮤직비디오 프로젝트가 필요합니다.');
 if(!Number.isFinite(duration)||duration<2||duration>360)
  throw Error('완성 음악은 2~360초여야 합니다.');
 if(!Number.isInteger(sceneLimit)||sceneLimit<1||sceneLimit>120)
  throw Error('SVD 전체 장면 수는 최대 120개입니다.');
 if(project.scenes.length>sceneLimit)
  throw Error('기존 MV 장면이 허용된 최대 장면 수를 초과합니다. 원본은 보존됩니다.');
 const ordered=project.scenes.slice().sort((a,b)=>Number(a.start)-Number(b.start));
 const used=new Set(project.scenes.map(s=>s.id)),added=[];
 let cursor=0,previous=null;
 function fillGap(from,to,reference){
  const a=at(Math.max(0,from)),b=at(Math.min(duration,to));
  if(b-a<.04)return;
  let start=a;
  while(b-start>=.04){
   const end=at(Math.min(b,start+FRAME_SECONDS));
   if(end-start<.04)break;
   if(project.scenes.length+added.length>=sceneLimit)
    throw Error('원본 3~6분 음악의 공백을 채울 MV 장면 수가 120개를 초과합니다. 기존 장면을 보존합니다.');
   const id=newId('auto-mv');
   if(typeof id!=='string'||!id||used.has(id))
    throw Error('자동 MV 장면 ID가 중복되거나 누락됐습니다.');
   used.add(id);
   const direction=describeOriginalSongMvScene(project,start,end,{index:added.length});
   // 원곡의 실제 두 독립 Singing WAV가 연결된 경우 새 자동 장면만
   // 주보컬↔화음 캐릭터로 번갈아 캐스팅한다. 기존 장면은 일절 변경하지 않는다.
   const duet=project.duetSingers?.version===1?project.duetSingers:null;
   const bpm=Number(project.bpm),bar=Number.isFinite(bpm)&&bpm>=40&&bpm<=240?
    Math.floor(start*bpm/240):added.length;
   const assigned=duet?(bar%2===0?duet.lead?.characterId:duet.harmony?.characterId):null;
   if(duet&&(typeof assigned!=='string'||!assigned||assigned.length>120))
    throw Error('등록된 듀엣 가수 캐릭터가 누락됐습니다. 원본 MV 장면은 보존합니다.');
   const sameSource=!!assigned&&reference?.characterId===assigned;
   const inherited=!assigned||sameSource;
   added.push({id,start,end,title:direction.title,
    generatedBy:'full-song-auto-scene',
    description:direction.description,action:direction.action,
    expression:direction.expression,camera:direction.camera,lighting:direction.lighting,
    ...(assigned?{characterId:assigned,duetSingerRole:bar%2===0?'lead':'harmony'}:
     reference?.characterId?{characterId:reference.characterId}:{}),
    ...(reference?.location?{location:reference.location}:{}),
    ...(inherited&&reference?.outfit?{outfit:reference.outfit}:{}),
    ...(inherited&&reference?.personMv?{personMv:{...reference.personMv}}:{}),
    ...(inherited&&reference?.characterMv?{characterMv:{...reference.characterMv}}:{})});
   start=end;
  }
 }
 for(const scene of ordered){
  const start=Number(scene.start),end=Number(scene.end);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>duration+.01)
   throw Error('기존 MV 장면 시간이 음악 구간과 맞지 않습니다. 장면은 변경하지 않습니다.');
  if(start>cursor+.04)fillGap(cursor,start,previous||scene);
  if(end>=cursor){cursor=end;previous=scene;}
 }
 if(cursor<duration-.04)fillGap(cursor,duration,previous);
 if(!added.length)return {project,added:0};
 const scenes=[...project.scenes,...added].sort((a,b)=>a.start-b.start||a.end-b.end);
 return {project:{...project,scenes},added:added.length};
}
