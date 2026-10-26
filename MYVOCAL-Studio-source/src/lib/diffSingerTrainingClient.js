// Windows EXE 내부 세션을 통한 설치형 DiffSinger 신경망 학습.
// 합성 샘플/가짜 체크포인트/외부 웹 서비스를 사용하지 않는다.
const endpoint='/api/training/diffsinger/';
const sessionHeader=session=>{
 if(typeof session!=='string'||session.length<8)throw Error('MYVOCAL Windows EXE 세션이 필요합니다.');
 return {'X-MYVOCAL-Session':session};
};
export function validateDiffSingerTrainer(settings){
 const {python,root,script,args,voiceId,rightsConfirmed,mode='official',config}=settings||{};
 if(rightsConfirmed!==true)throw Error('실제 녹음·학습 모델 사용 권한을 확인하세요.');
 if(!voiceId||typeof voiceId!=='string'||voiceId.length>128)throw Error('학습할 Voice를 선택하세요.');
 if(mode==='official'){
  if([python,root,config].some(v=>typeof v!=='string'||!v||v.length>2048)||
    !/(?:^|[\\/])python\.exe$/i.test(python)||!(/\.ya?ml$/i.test(config)))
   throw Error('실제 로컬 DiffSinger/Python.exe/모델 학습 설정 YAML을 지정하세요.');
  return [];
 }
 if(mode!==''&&mode!=='custom')throw Error('지원하지 않는 가창 학습 방식입니다.');
 if([python,root,script].some(v=>typeof v!=='string'||!v||v.length>2048)||
   !/(?:^|[/\\])python\.exe$/i.test(python)||!/\.py$/i.test(script))
  throw Error('로컬 Python.exe와 실제 DiffSinger 학습 스크립트(.py)가 필요합니다.');
 let parsed;
 try{parsed=JSON.parse(args);}catch{throw Error('실제 설치된 학습 스크립트의 인수 JSON 배열을 입력하세요.');}
 if(!Array.isArray(parsed)||parsed.length<2||parsed.length>30||
  parsed.some(v=>typeof v!=='string'||v.length>1000||/[\r\n\0]/.test(v))||
  !parsed.some(v=>v.includes('{dataset}'))||!parsed.some(v=>v.includes('{output}')))
  throw Error('학습 인수 JSON에는 {dataset}과 {output}이 포함되어야 합니다.');
 return parsed;
}
async function resultOrError(res,message){
 if(!res.ok){const e=await res.json().catch(()=>({}));throw Error(e.error||message+' (HTTP '+res.status+')');}
 return res;
}
export async function startDiffSingerTraining(bundle,settings,{session,signal,request=fetch}={}){
 const args=validateDiffSingerTrainer(settings);
 if(!(bundle instanceof Blob)||bundle.size<100||bundle.size>128*1024*1024)
  throw Error('MYVOCAL에서 만든 128MiB 이하 가창 학습 데이터 ZIP을 선택하세요.');
 const form=new FormData();
 form.set('bundle',bundle,'MYVOCAL-한국어노래학습.zip');
 for(const key of ['python','root','voiceId'])form.set(key,settings[key]);
 form.set('mode',settings.mode||'official');
 if(settings.mode==='official'||!settings.mode)form.set('config',settings.config);
 else form.set('script',settings.script);
 form.set('args',JSON.stringify(args));
 form.set('rights','confirmed');
 const res=await resultOrError(await request(endpoint+'start',{
  method:'POST',headers:sessionHeader(session),body:form,signal,cache:'no-store'
 }), 'DiffSinger 로컬 학습 시작 실패');
 const job=await res.json();
 if(job?.state!=='running'||!(/^[a-f0-9]{24}$/.test(job?.id||'')))
  throw Error('학습 엔진 프로세스 시작 응답을 확인하지 못했습니다.');
 return job;
}
export async function readDiffSingerTrainingStatus({session,request=fetch,signal}={}){
 const res=await resultOrError(await request(endpoint+'status',{
  method:'GET',headers:sessionHeader(session),signal,cache:'no-store'
 }),'DiffSinger 학습 상태 조회 실패');
 const state=await res.json();
 if(!['','idle','preparing','running','completed','failed','cancelled'].includes(state?.state))
  throw Error('DiffSinger 학습 상태 응답이 올바르지 않습니다.');
 return state;
}
export async function stopDiffSingerTraining({session,request=fetch}={}){
 const res=await resultOrError(await request(endpoint+'cancel',{
  method:'POST',headers:sessionHeader(session),cache:'no-store'
 }),'DiffSinger 로컬 학습 취소 실패');
 return res.json();
}
export async function downloadDiffSingerWeights(id,{session,request=fetch}={}){
 if(!/^[a-f0-9]{24}$/.test(id||''))throw Error('학습 작업 ID 오류');
 const res=await resultOrError(await request(endpoint+'model?id='+encodeURIComponent(id),{
  method:'GET',headers:sessionHeader(session),cache:'no-store'
 }),'가창 학습 체크포인트 수신 실패');
 if(res.headers.get('Content-Type')?.split(';')[0]!=='application/octet-stream')
  throw Error('실제 학습 가중치 파일 유형이 다릅니다.');
 const blob=await res.blob();
 if(blob.size<4096||blob.size>500*1024*1024)throw Error('학습 가중치 크기 오류');
 const disposition=res.headers.get('Content-Disposition')||'';
 const suffix=/\.ckpt\b/i.test(disposition)?'.ckpt':'.pth';
 return new File([blob],'MYVOCAL-DiffSinger-trained'+suffix,{type:'application/octet-stream'});
}

export async function downloadDiffSingerTrainingDictionary(id,{session,request=fetch,signal}={}){
 if(!/^[a-f0-9]{24}$/.test(id||''))throw Error('학습 작업 ID 오류');
 const res=await resultOrError(await request(endpoint+'dictionary?id='+encodeURIComponent(id),{
  method:'GET',headers:sessionHeader(session),cache:'no-store',signal
 }),'학습에 사용한 한국어 발음 사전 수신 실패');
 if(!/^text\/plain(?:;|$)/i.test(res.headers.get('Content-Type')||''))
  throw Error('학습 발음 사전의 파일 형식이 올바르지 않습니다.');
 const blob=await res.blob();
 if(blob.size<10||blob.size>2*1024*1024)throw Error('학습 발음 사전 크기가 올바르지 않습니다.');
 return new File([blob],'MYVOCAL-DiffSinger-dictionary.txt',{type:'text/plain'});
}
