// Native Windows MYVOCAL #48/#49: genuine sd-scripts character/person LoRA training.
// Original registered images are read-only. Never use remote AI services.
const endpoint='/api/training/character/';
const headers=session=>{
 if(typeof session!=='string'||session.length<8)
  throw Error('MYVOCAL Windows EXE의 로컬 작업 세션이 필요합니다.');
 return {'X-MYVOCAL-Session':session};
};
async function checked(res,label){
 if(!res.ok){const json=await res.json().catch(()=>({}));
  throw Error(json.error||label+' (HTTP '+res.status+')');}
 return res;
}
export function validateCharacterLearning(character,{root,python,base,steps,rank,consent,assetIds}={}){
 if(!character?.id||!['person','character'].includes(character.kind)||
  !['self','owned','licensed'].includes(character.rights))
  throw Error('권리가 확인된 등록 사람 또는 2D 캐릭터가 필요합니다.');
 if(character.kind==='person'&&!['self','licensed'].includes(character.rights))
  throw Error('실제 사람은 본인·명시적으로 허가된 자료만 학습합니다.');
 if(character.rights==='licensed'&&!String(character.rightsNote||'').trim())
  throw Error('사진/원화의 신경망 학습 허가 범위를 기입하세요.');
 if(consent!==true)throw Error('원본 사진·캐릭터 원화와 신경망 학습에 대한 사용 권한 동의가 필요합니다.');
 const abs=x=>typeof x==='string'&&x.length<2048&&
  (/^[a-zA-Z]:[\\/]/.test(x)||/^\\\\[^\\/]+[\\/]/.test(x))&&!/[\0\r\n]/.test(x);
 if(!abs(root)||!abs(python)||!abs(base)||!/(?:^|[\\/])python\.exe$/i.test(python)||
  !/\.(?:safetensors|ckpt)$/i.test(base))
  throw Error('실제 설치된 sd-scripts, Python.exe, SD 1.5 기본 모델의 절대 경로가 필요합니다.');
 if(!Number.isInteger(steps)||steps<100||steps>3000||![8,16,32].includes(rank))
  throw Error('LoRA 학습 스텝 100~3000·차원 8/16/32만 지원합니다.');
 if(!Array.isArray(assetIds)||assetIds.length<4||assetIds.length>20||
  new Set(assetIds).size!==assetIds.length)
  throw Error('서로 다른 원본 사진·원화 4~20장을 선택하세요.');
 const originals=new Set((character.assets||[]).filter(a=>
  (a.type==='image/png'||a.type==='image/jpeg')&&
  /\.(?:png|jpe?g)$/i.test(a.name)).map(a=>a.id));
 if(assetIds.some(id=>!originals.has(id)))
  throw Error('등록된 실제 PNG/JPEG 원본 자료만 학습할 수 있습니다.');
 return true;
}
export async function startCharacterIdentityTraining(character,settings,{
 session,loadAsset,signal,request=fetch,onProgress=()=>{}
}={}){
 validateCharacterLearning(character,settings);
 if(typeof loadAsset!=='function')throw Error('캐릭터 라이브러리 원본 파일 로더가 필요합니다.');
 const form=new FormData();
 for(const key of ['root','python','base'])form.set(key,settings[key]);
 form.set('kind',character.kind);
 form.set('characterId',character.id);
 form.set('rights',character.rights);
 form.set('rightsNote',character.rightsNote||'');
 form.set('steps',String(settings.steps));form.set('rank',String(settings.rank));
 form.set('consent','confirmed');
 let total=0;
 for(const [i,id] of settings.assetIds.entries()){
  if(signal?.aborted)throw Error('학습 원본 준비가 취소됐습니다.');
  const original=character.assets.find(a=>a.id===id);
  const blob=await loadAsset(id);
  if(!(blob instanceof Blob)||blob.size<128||blob.size>12*1024*1024)
   throw Error('등록된 원본 이미지 '+original.name+'을 읽을 수 없거나 파일 크기를 초과했습니다.');
  if(!['image/png','image/jpeg'].includes(blob.type))
   throw Error('실제 PNG/JPEG 원본 이미지가 필요합니다: '+original.name);
  total+=blob.size;
  if(total>128*1024*1024)throw Error('학습 원본 전체 파일은 128MiB 이하만 가능합니다.');
  form.append('images',blob,original.name);
  form.set('assetId'+i,id);
  onProgress(i+1,settings.assetIds.length);
 }
 const res=await checked(await request(endpoint+'start',{
  method:'POST',headers:headers(session),body:form,signal,cache:'no-store'
 }),'캐릭터·실제 사람 LoRA 학습 시작 실패');
 const job=await res.json();
 if(job?.state!=='running'||!/^[a-f0-9]{24}$/.test(job?.id||''))
  throw Error('실제 학습 프로세스 실행 응답이 올바르지 않습니다.');
 return job;
}
export async function getCharacterIdentityTrainingStatus({session,request=fetch,signal}={}){
 const res=await checked(await request(endpoint+'status',{method:'GET',
  headers:headers(session),signal,cache:'no-store'}),'캐릭터 학습 상태 조회 실패');
 const job=await res.json();
 if(!['','idle','preparing','running','completed','failed','cancelled'].includes(job?.state))
  throw Error('로컬 캐릭터 학습 상태 응답이 올바르지 않습니다.');
 return job;
}
export async function cancelCharacterIdentityTraining({session,request=fetch}={}){
 const res=await checked(await request(endpoint+'cancel',{method:'POST',
  headers:headers(session),cache:'no-store'}),'캐릭터 학습 중단 실패');
 return res.json();
}
export async function downloadCharacterIdentityLoRA(id,{session,request=fetch,signal}={}){
 if(!/^[a-f0-9]{24}$/.test(id||''))throw Error('실제 학습 작업 ID 오류');
 const res=await checked(await request(endpoint+'model?id='+encodeURIComponent(id),{
  method:'GET',headers:headers(session),cache:'no-store',signal
 }),'실제 LoRA 가중치 수신 실패');
 if(res.headers.get('Content-Type')?.split(';')[0]!=='application/octet-stream')
  throw Error('신경망 학습 가중치 형식이 올바르지 않습니다.');
 const blob=await res.blob();
 if(blob.size<4096||blob.size>1024*1024*1024)
  throw Error('생성된 LoRA 가중치 파일 크기가 올바르지 않습니다.');
 return new File([blob],'MYVOCAL-Identity-'+id+'.safetensors',
  {type:'application/octet-stream'});
}
