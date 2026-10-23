// 원본 66항 #35·#36·#61: 기존 Windows EXE Ollama 스토리보드 모델을
// 3~6분 Music+MV의 새 자동 장면에 연결한다. 실제 생성 이미지/영상은 보존한다.
// 모델은 장면 텍스트만 만들며 실행·저장은 기존 SD/SVD 파이프라인이 수행한다.
const MODEL=/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,119}$/;
export async function directAutoMvScenesWithLocalAI(project,{
 model,session,signal,current,onChange,request=fetch,onProgress=()=>{}
}={}){
 if(!project?.id||!Array.isArray(project.scenes)||project.scenes.length>120||
   typeof current!=='function'||typeof onChange!=='function'||!MODEL.test(String(model||''))||
   typeof session!=='string'||session.length<8)
  throw Error('실제 Ollama 모델·Windows EXE 및 3~6분 MV 프로젝트를 확인하세요.');
 const candidates=project.scenes.filter(scene=>scene.generatedBy==='full-song-auto-scene'&&
  !scene.imageAssetId&&!scene.videoClipAssetId);
 if(!candidates.length)return {project,updated:0};
 if(candidates.length>120||new Set(candidates.map(s=>s.id)).size!==candidates.length)
  throw Error('자동 MV 신규 장면의 ID가 잘못됐습니다.');
 const guard=()=>{if(signal?.aborted||current()!==project)
  throw Error('로컬 AI MV 연출 중 취소·프로젝트 변경: 사용자 원본 보존');};
 guard();
 const snapshot=JSON.stringify(project.scenes);
 const updated=new Map();
 // 설치된 기존 Ollama API는 한 요청에 최대 20개 장면을 반환한다.
 // 각 모델 구간의 실제 위치를 명시하고 이전 장면을 변형하지 않는다.
 const groups=[];
 for(let i=0;i<candidates.length;i+=8)groups.push(candidates.slice(i,i+8));
 for(let groupIndex=0;groupIndex<groups.length;groupIndex++){
  guard();
  const batch=groups[groupIndex];
  const sections=batch.map(scene=>({
   name:String(scene.title||'음악 장면').slice(0,85)+' '+Number(scene.start).toFixed(2)+'~'+
    Number(scene.end).toFixed(2)+'초',bars:1
  }));
  const prompt=String(project.prompt||project.title||'한국어 오리지널 음악 MV')
   .slice(0,900);
  const res=await request('/api/local-ai/storyboard',{method:'POST',
   headers:{'X-MYVOCAL-Session':session,'Content-Type':'application/json'},
   body:JSON.stringify({model,prompt,lyrics:String(project.lyrics||'').slice(0,8000),sections}),
   cache:'no-store',signal});
  if(!res.ok){const error=await res.json().catch(()=>null);
   throw Error(error?.error||'실제 로컬 신경망 MV 장면 연출 요청 실패');}
  const result=await res.json().catch(()=>null);
  if(result?.provider!=='local-ollama'||result.model!==model||
   result.textGenerated!==true||result.videoGenerated!==false||
   !Array.isArray(result.scenes)||result.scenes.length!==batch.length)
   throw Error('Ollama가 원곡의 자동 장면 수와 맞는 실제 연출 결과를 반환하지 않았습니다.');
  const safe=(value,max)=>typeof value==='string'&&value.length<=max&&
   !/[\u0000-\u001f\u007f]/u.test(value);
  for(let i=0;i<batch.length;i++){
   const response=result.scenes[i];
   if(!response||!safe(response.title,120)||!response.title.trim()||
    !safe(response.description,1200)||!response.description.trim()||
    !safe(response.location,200)||!safe(response.action,200)||
    !safe(response.camera,200)||!safe(response.lighting,200))
    throw Error('Ollama MV 신규 장면 정보가 불완전하여 사용자 장면을 변경하지 않습니다.');
   const source=batch[i];
   updated.set(source.id,{...source,
    title:response.title.trim(),description:response.description.trim(),
    location:source.location||response.location,
    action:response.action||source.action,
    camera:response.camera||source.camera,
    lighting:response.lighting||source.lighting,
    neuralSceneDirection:{provider:'local-ollama',model,
     source:'new-auto-scene-only',at:new Date().toISOString()}});
  }
  onProgress('실제 로컬 AI 자동 MV 연출 '+(groupIndex+1)+'/'+groups.length+'구간');
 }
 guard();
 if(JSON.stringify(project.scenes)!==snapshot)throw Error('AI 연출 중 원곡 MV 장면이 변경됐습니다.');
 const next={...project,scenes:project.scenes.map(s=>updated.get(s.id)||s)};
 await Promise.resolve(onChange(next));
 return {project:next,updated:updated.size,neuralDirection:true,model};
}
