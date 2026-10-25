// 원본 61·62항: 기존 Windows EXE에서 실제 설치된 Ollama가 만든
// 한국어 음악·영상 명령 제안을 기존 Creative Director 문법으로 미리보기.
// AI가 직접 프로젝트를 변경하거나 외부 모델·신규 웹앱을 실행하지 않는다.
import {previewCreativeDirection96} from './creativeDirector96.js';
const validName=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,119}$/.test(value);

export async function proposeLocalCreativeEdit61(project,instruction,model,library,{
 session=globalThis.__MYVOCAL_SESSION_KEY,request=fetch,signal
}={}){
 if(!project?.id||!Array.isArray(project.scenes)||!project.scenes.length||
  !Array.isArray(library?.characters)||!Array.isArray(library?.voices))
  throw Error('기존 Windows MYVOCAL Music+MV 프로젝트 및 캐릭터 목록이 필요합니다.');
 if(!validName(model)||typeof session!=='string'||session.length<8)
  throw Error('Windows EXE에 설치된 Ollama 모델을 먼저 선택하세요.');
 if(typeof instruction!=='string'||instruction.trim().length<5||
  instruction.length>1200||/[\u0000-\u001f\u007f]/u.test(instruction))
  throw Error('기존 음악·영상 변경을 설명하는 한국어 문장을 입력하세요.');
 if(signal?.aborted)throw Error('로컬 AI 감독이 취소됐습니다.');
 const sceneTitles=project.scenes.slice(0,48).map(s=>String(s.title||'장면').slice(0,120));
 const reply=await request('/api/local-ai/director',{
  method:'POST',headers:{'Content-Type':'application/json','X-MYVOCAL-Session':session},
  body:JSON.stringify({model,instruction:instruction.trim(),
   sceneTitles,songTitle:String(project.title||'').slice(0,120)}),
  cache:'no-store',signal
 });
 if(!reply?.ok){
  const content=await reply?.json?.().catch(()=>({}));
  throw Error(content?.error||'설치된 로컬 AI가 음악·영상 편집 계획을 제안하지 못했습니다.');
 }
 const result=await reply.json();
 if(result?.provider!=='local-ollama'||result.model!==model||
  result.proposedOnly!==true||result.projectEdited!==false||
  result.videoGenerated!==false||result.audioGenerated!==false||
  !Array.isArray(result.commands)||result.commands.length<1||result.commands.length>2||
  result.commands.some(s=>typeof s!=='string'||s.length>500||
   /[\u0000-\u001f\u007f]/u.test(s)))
  throw Error('현재 로컬 AI 제안 출처 또는 명령 형식이 올바르지 않습니다.');
 const command=result.commands.join(' 그리고 ');
 if(command.length>500)throw Error('기존 감독 입력에 담을 수 있는 편집 명령의 총길이를 초과했습니다.');
 // 모델 제안이 무슨 뜻인지 추측하지 않는다. 기존 명령 엔진이 실제 편집으로
 // 판정하지 못하는 문장은 사용자 프로젝트에 적용하거나 확인하지 않는다.
 const plan=previewCreativeDirection96(project,command,library);
 if(!plan?.summary||plan.action?.domain==='both'&&result.commands.length!==2)
  throw Error('로컬 모델이 제안한 한국어 명령을 기존 MYVOCAL 편집기로 실행할 수 없습니다.');
 return {source:'installed-local-ollama',model,originalInstruction:instruction,
  command,explanation:String(result.explanation||'').slice(0,500),
  preview:plan,sourceProjectId:project.id,sourceSnapshot:plan.source};
}
