// Original #51/#52/#53: turn free-form Korean MV directions into a REVIEW
// of the existing constrained and audited Step93 scene edit plan. The user
// selected a locally installed Ollama model; the EXE talks only to local
// 127.0.0.1, not a cloud service or a website. AI text does NOT directly
// modify scenes or generate videos. The existing SD/SVD Step93 explicit
// button generates selected media only after a separate user confirmation.
import {interpretMvInstruction93} from './mvNaturalEdit93.js';

const allowed={location:'배경',outfit:'의상',camera:'카메라',
 expression:'표정',action:'동작',lighting:'조명'};
const validText=(s,max=180)=>typeof s==='string'&&s.length>=2&&s.length<=max&&
 !/[\u0000-\u001f\u007f]/u.test(s)&&!!s.trim();
const validModel=name=>typeof name==='string'&&
 /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,119}$/.test(name);
export async function previewLocalAIMvEdit51(project,sceneId,instruction,{
 model,session,signal,current=()=>project,request=fetch
}={}){
 if(!project?.id||!Array.isArray(project.scenes)||!sceneId||
  !validText(instruction,1000)||!validModel(model)||
  typeof session!=='string'||session.length<8||
  typeof request!=='function'||typeof current!=='function')
  throw Error('Windows EXE에서 선택한 실제 설치 Ollama 모델과 자유로운 한국어 영상 수정 지시가 필요합니다.');
 const scene=project.scenes.find(s=>s.id===sceneId);
 if(!scene)throw Error('수정할 프로젝트 장면을 선택하세요.');
 const snapshot=JSON.stringify(project.scenes);
 const guards=()=>{if(signal?.aborted||current()!==project||
   JSON.stringify(project.scenes)!==snapshot)
  throw Error('Ollama 영상 지시 해석 중 프로젝트·장면이 변경됐습니다. 원본 보존');};
 guards();
 const fields=['title','description',...Object.keys(allowed)];
 const source=Object.fromEntries(fields.map(k=>[k,String(scene[k]||'').slice(0,k==='description'?1200:200)]));
 const payload={model,instruction,scene:source,
  locks:{outfit:project.outfitLock===true,
   location:project.backgroundLock===true,camera:project.cameraLock===true}};
 const reply=await request('/api/local-ai/mv-edit',{
  method:'POST',headers:{'X-MYVOCAL-Session':session,'Content-Type':'application/json'},
  body:JSON.stringify(payload),cache:'no-store',signal
 });
 const result=await reply.json().catch(()=>null);
 guards();
 if(!reply.ok)throw Error(result?.error||'설치된 로컬 Ollama가 MV 자연어 수정 요청을 처리하지 못했습니다.');
 if(result?.provider!=='local-ollama'||result.model!==model||
  result.textGenerated!==true||result.videoGenerated!==false||
  result.projectModified!==false||!Array.isArray(result.changes)||
  ![1,2].includes(result.changes.length))
  throw Error('로컬 모델의 MV 명령 분석 출처·속성이 올바르지 않습니다.');
 const seen=new Set();
 const commands=result.changes.map(change=>{
  if(!Object.hasOwn(allowed,change?.field)||seen.has(change.field)||
   !validText(change.after)|| 
   (change.field==='outfit'&&project.outfitLock===true)||
   (change.field==='location'&&project.backgroundLock===true)||
   (change.field==='camera'&&project.cameraLock===true))
   throw Error('AI가 원본 보호 범위에 없는 장면 속성·잠긴 값을 제안했습니다.');
  seen.add(change.field);
  // Reuse the original explicit Step93 grammar+snapshot checks rather than
  // accepting an unrestricted model JSON patch or hallucinated asset ID.
  return allowed[change.field]+'을 '+change.after.trim()+'으로 바꿔';
 });
 const canonical=commands.join(' 그리고 ');
 const review=interpretMvInstruction93(project,sceneId,canonical);
 guards();
 if(review.changes?.length!==result.changes.length&&
    !(result.changes.length===1&&review.version===1))
  throw Error('선택한 로컬 AI 해석과 장면 검토 항목 수가 다릅니다.');
 return {...review,
  aiInterpretation51:{provider:'local-ollama',model,
   originalInstruction:instruction.trim(),
   canonical,approved:false,
   note:'로컬 LLM 문구 제안일 뿐. 사용자 검토·기존 잠금 검증·SD/SVD 별도 버튼 필요'}
 };
}
