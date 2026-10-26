// Original #53/#94: actual authorized Character Replace -> new SD image
// and SVD video for ONLY the scenes explicitly selected in the review plan.
// Old characters, images, videos, source photos and edits are retained in
// the existing per-scene replacement history. No original bytes overwritten.
import {applyCharacterReplace94} from './characterReplace94.js';
import {authorizedAutoSceneReference,runMvBatch} from './mvBatchProduction.js';

export async function applyAndRenderCharacterReplace94(project,plan,characters,{
 checkpoint,videoModel,port,session,imageSteps=20,width=768,height=448,
 frames=14,fps=6,videoSteps=20,motion=127,
 signal,current,currentCharacters=()=>characters,commit,
 onProgress=()=>{},batch=runMvBatch
}={}){
 if(!project?.id||!Array.isArray(characters)||typeof commit!=='function'||
  typeof current!=='function'||typeof batch!=='function')
  throw Error('기존 Windows MV 프로젝트와 로컬 신경망 저장 연결이 필요합니다.');
 if(!checkpoint||!videoModel||typeof session!=='string'||session.length<8||
   !Number.isInteger(port)||port<1024||port>65535||port===58319)
  throw Error('실제 설치된 SD·SVD 모델과 Windows EXE 연결을 선택하세요.');
 const guard=expected=>{
  if(signal?.aborted||current()!==expected||
    JSON.stringify(currentCharacters())!==JSON.stringify(characters))
   throw Error('캐릭터 교체 중 프로젝트·원본 캐릭터가 변경됐습니다. 기존 파일은 보존됩니다.');
 };
 guard(project);
 // This call validates review snapshot, identity lock, rights and chosen IDs.
 // Run the same link replacement that users can undo in Video Studio.
 const changed=applyCharacterReplace94(project,plan,characters);
 // The new character's actual authorized image is required for every new
 // target scene. No plain text-to-image character swap may be mislabelled as
 // replacing the same person or 2D character identity.
 for(const id of plan.sceneIds){
  const scene=changed.scenes.find(s=>s.id===id);
  const character=characters.find(c=>c.id===scene?.characterId);
  if(!scene||!character||!authorizedAutoSceneReference(scene,character,{includeReferences:true}))
   throw Error('교체할 모든 장면마다 해당 새 사람·캐릭터의 사용 허가된 실제 사진/원화가 필요합니다.');
 }
 guard(project);
 onProgress('이전 이미지·영상 연결을 복원 이력에 보존하고 선택한 '+plan.sceneIds.length+'개 장면만 새 캐릭터로 교체하는 중');
 await Promise.resolve(commit(changed));
 guard(changed);
 const result=await batch({
  project:changed,data:{characters},current,currentData:()=>({characters:currentCharacters()}),
  commit,checkpoint,videoModel,port,session,imageSteps,width,height,
  frames,fps,videoSteps,motion,includeReferences:true,
  onlySceneIds:plan.sceneIds,autoVirtualSinger:false,signal,progress:onProgress
 });
 return {...result,project:current(),replacedSceneIds:[...plan.sceneIds],
  originalCharacterMediaPreserved:true,actualNeuralVideoGenerated:result.generatedVideos>0};
}
