// Original #51/#52/#53: user-selected installed Ollama can interpret one
// free-language Korean direction scoped to an existing verse/chorus/bridge.
// Each existing project's scene is validated by the ORIGINAL section editor.
// This produces a review ONLY; image/video creation remains an explicit
// separate user action using the existing exact-scene SD/SVD renderer.
import {previewLocalAIMvEdit51} from './localAIMvNaturalEdit51.js';
import {previewSectionNaturalEdit,sectionNaturalTargets} from './mvSectionNaturalEdit.js';

const REQUEST=/^(전체|마지막\s*후렴|후렴|브리지|인트로|아웃트로|1절|2절)(?:\s*(?:장면(?:들)?|부분))?(?:\s*(?:의|에서|에서는|을|은))?\s+(.+)$/u;
export async function previewLocalAISectionMvEdit51(project,instruction,options={}){
 if(!project?.id||typeof instruction!=='string'||!instruction.trim()||
   instruction.length>500)throw Error('기존 음악 구간에 적용할 한국어 자연어 지시(500자 이하)가 필요합니다.');
 const match=instruction.trim().match(REQUEST);
 if(!match)throw Error('수정할 음악 구간을 먼저 지정하세요. 예: 후렴에서 빗속 네온 야경으로 바꾸고 카메라가 천천히 돌게 해줘');
 const scope=match[1].replace(/\s+/g,' '),command=match[2].trim();
 if(!command||command.length<3)
  throw Error('후렴·절·전체 중 원하는 구간과 수정할 내용을 함께 적어 주세요.');
 const selected=sectionNaturalTargets(project,scope);
 if(!selected.length)throw Error('실제 원곡에서 변경할 장면이 없습니다.');
 const candidate=await previewLocalAIMvEdit51(project,selected[0].id,command,options);
 const canonical=scope+' 장면 '+candidate.aiInterpretation51.canonical;
 if(canonical.length>500)throw Error('한 번에 적용할 새 장면 문구가 너무 깁니다.');
 const plan=previewSectionNaturalEdit(project,canonical);
 if(plan.sceneIds.length!==selected.length||
  plan.sceneIds.some((id,i)=>id!==selected[i].id))
  throw Error('로컬 모델의 구간 해석과 실제 BPM·장면 시간표가 일치하지 않습니다.');
 return {plan,model:options.model,source:instruction,
  summarized:plan.summary,
  generatedInterpretation:candidate.aiInterpretation51.canonical,
  actualNeuralVideoGenerated:false,approvalRequired:true};
}
