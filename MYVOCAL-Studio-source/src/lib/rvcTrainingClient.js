// Windows EXE calls an installed trainer. No bundled neural model or remote API.
export const MAX_TRAIN_BUNDLE=151*1024*1024;
const headers=session=>{
 if(typeof session!=='string'||!session)throw Error('Windows EXE 세션이 필요합니다.');
 return {'X-MYVOCAL-Session':session};
};
export function validateTrainerSettings(settings){
 const {root,python,script,args,voiceId,rightsConfirmed}=settings||{};
 if(rightsConfirmed!==true)throw Error('학습 데이터 사용 권한을 확인하세요.');
 if(typeof voiceId!=='string'||!voiceId||voiceId.length>128)throw Error('학습할 목소리를 선택하세요.');
 if([root,python,script].some(x=>typeof x!=='string'||!x.trim()||x.length>1024))throw Error('RVC 설치 폴더·Python.exe·학습 스크립트 경로를 입력하세요.');
 if(!/(?:^|[/\\])python\.exe$/i.test(python)||!/\.py$/i.test(script))throw Error('Python.exe와 실제 학습 Python 스크립트(.py)를 선택하세요.');
 let arr;try{arr=JSON.parse(args)}catch{throw Error('학습 인수는 JSON 배열이어야 합니다.');}
 if(!Array.isArray(arr)||arr.length<2||arr.length>30||arr.some(s=>typeof s!=='string'||s.length>1000||/[\0\r\n]/.test(s)))throw Error('학습 인수 JSON 배열이 올바르지 않습니다.');
 if(!arr.some(x=>x.includes('{dataset}'))||!arr.some(x=>x.includes('{output}')))throw Error('학습 인수에 {dataset}과 {output}이 모두 필요합니다.');
 return arr;
}
export async function startLocalRVCTraining(bundle,settings,{session,request=fetch,signal}={}){
 const args=validateTrainerSettings(settings);
 if(!(bundle instanceof Blob)||bundle.size<100||bundle.size>MAX_TRAIN_BUNDLE)throw Error('학습 자료 ZIP은 151MiB 이하이어야 합니다.');
 const form=new FormData();form.set('bundle',bundle,'MYVOCAL-training.zip');
 for(const key of ['root','python','script','voiceId'])form.set(key,settings[key]);
 form.set('args',JSON.stringify(args));form.set('rights','confirmed');
 const res=await request('/api/training/rvc/start',{method:'POST',headers:headers(session),body:form,signal,cache:'no-store'});
 if(!res.ok){const e=await res.json().catch(()=>({error:`HTTP ${res.status}`}));throw Error(e.error||'외부 학습 시작 실패');}
 const data=await res.json();if(data?.state!=='running'||typeof data?.id!=='string'||!data.id)throw Error('학습 작업이 실제로 시작됐는지 확인할 수 없습니다.');
 return data;
}
export async function getLocalRVCTrainingStatus({session,request=fetch,signal}={}){
 const res=await request('/api/training/rvc/status',{method:'GET',headers:headers(session),signal,cache:'no-store'});
 if(!res.ok)throw Error('학습 상태 조회 실패: '+res.status);
 const data=await res.json();if(!['idle','preparing','running','completed','failed','cancelled',''].includes(data?.state))throw Error('알 수 없는 학습 상태 응답');
 return data;
}
export async function cancelLocalRVCTraining({session,request=fetch}={}){
 const res=await request('/api/training/rvc/cancel',{method:'POST',headers:headers(session)});
 if(!res.ok)throw Error('학습 취소 실패: '+res.status);
 return res.json();
}
export async function getLocalRVCTrainedModel(jobId,{session,request=fetch}={}){
 if(typeof jobId!=='string'||!/^[a-f0-9]{24}$/.test(jobId))throw Error('학습 작업 ID가 잘못되었습니다.');
 const res=await request('/api/training/rvc/model?id='+jobId,{method:'GET',headers:headers(session),cache:'no-store'});
 if(!res.ok){const body=await res.json().catch(()=>({error:'HTTP '+res.status}));throw Error(body.error||'학습된 모델 수신 실패');}
 if(res.headers?.get('Content-Type')?.split(';')[0]!=='application/octet-stream')throw Error('학습 결과 파일 유형이 올바르지 않습니다.');
 const blob=await res.blob();if(blob.size<1024||blob.size>200*1024*1024)throw Error('학습 모델 크기가 올바르지 않습니다.');
 return new File([blob],'MYVOCAL-RVC-trained.pth',{type:'application/octet-stream'});
}