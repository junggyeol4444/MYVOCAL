import {composeWithLocalAI} from './localAiComposer.js';
import {applyComposition} from './composer.js';
import {canApplyLocalAiStoryboard,planLocalAiStoryboard,applyLocalAiStoryboard} from './localAiStoryboard.js';
import {storyboardFromSongSections} from './songStoryboard.js';
// All model calls produce a preview; the original project is never mutated here.
export const productionSnapshot=p=>{if(!p?.id)throw Error('프로젝트를 선택하세요.');return JSON.stringify(p)};
export async function planLocalAiMusicVideo(project,options,model,{compose=composeWithLocalAI,storyboard=planLocalAiStoryboard}={}){
 const original=productionSnapshot(project);
 if(!Array.isArray(project.tracks)||!Array.isArray(project.scenes)||!canApplyLocalAiStoryboard(project))
  throw Error('사용자가 편집한 MV 콘티와 원본은 덮어쓸 수 없습니다. 기본 장면에서 시작하세요.');
 const draft=await compose(options,{model});
 if(draft?.source!=='ollama-local'||!draft.lyrics||!Array.isArray(draft.midiTracks))
  throw Error('실제 로컬 AI 작사 결과를 확인하지 못했습니다.');
 const staged=applyComposition(project,draft,{lyrics:true,chords:true,midi:true,settings:true,replace:false});
 staged.scenes=storyboardFromSongSections(staged);
 const scenePlan=await storyboard(staged,model);
 if(scenePlan?.videoGenerated!==false||scenePlan?.scenes?.length!==staged.scenes.length)
  throw Error('로컬 AI 콘티 생성에 실패했습니다.');
 if(productionSnapshot(project)!==original)throw Error('AI 생성 중 원본 프로젝트가 변경됐습니다.');
 return {format:'MYVOCAL_LOCAL_AI_PRODUCTION',projectId:project.id,original,model,draft,staged,scenePlan,neuralSingingGenerated:false,videoFramesGenerated:false};
}
export function applyLocalAiMusicVideo(project,plan){
 if(plan?.format!=='MYVOCAL_LOCAL_AI_PRODUCTION'||plan.projectId!==project?.id||
    plan.original!==productionSnapshot(project)||!canApplyLocalAiStoryboard(project))
  throw Error('AI 미리보기 이후 기존 프로젝트가 변경됐습니다. 다시 생성하세요.');
 if(plan.staged?.id!==project.id||plan.draft?.source!=='ollama-local'||
    plan.neuralSingingGenerated!==false||plan.videoFramesGenerated!==false)
  throw Error('생성 결과 검증 실패');
 const output=applyLocalAiStoryboard(plan.staged,plan.scenePlan);
 return {...output,localAiProduction:{model:plan.model,kind:'lyrics-midi-storyboard',neuralSingingGenerated:false,videoFramesGenerated:false,createdAt:new Date().toISOString()}};
}