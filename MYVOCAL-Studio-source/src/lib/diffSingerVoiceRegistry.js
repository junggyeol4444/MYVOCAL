// MYVOCAL #6/#7/#25: reusable official local DiffSinger singing model entry.
// A registry entry refers only to an actually completed new local checkpoint.
// No checkpoint bytes, paths, recordings or source files are overwritten.
const authorized = new Set(['self','owned','licensed']);
const jobIdPattern=/^[a-f0-9]{24}$/;
const experimentPattern=/^myvocal-[a-f0-9]{24}$/;
const winAbs=/^(?:[a-zA-Z]:[\\/]|\\\\[^\\/]+[\\/])/;
const pythonExe=/(?:^|[\\/])python\.exe$/i;
const safeString=(s,max)=>typeof s==='string'&&s.length>0&&s.length<=max&&!/[\x00\r\n]/.test(s);

export function officialDiffSingerModelFromJob(job,voice,{date=new Date().toISOString()}={}){
 if(!voice?.id||!authorized.has(voice.rights))throw Error('사용 허가된 목소리만 모델 라이브러리에 등록할 수 있습니다.');
 if(job?.state!=='completed'||job.checkpointAvailable!==true||job.mode!=='official'||
    job.voiceId!==voice.id||!jobIdPattern.test(job.id||'')||
    job.experiment!=='myvocal-'+job.id||!experimentPattern.test(job.experiment||''))
  throw Error('현재 본인 목소리에 대해 공식 DiffSinger가 실제 가중치를 생성한 학습 작업만 등록합니다.');
 if(!safeString(job.root,2048)||!safeString(job.python,2048)||
    !winAbs.test(job.root)||!winAbs.test(job.python)||!pythonExe.test(job.python))
  throw Error('설치된 로컬 DiffSinger/Python 모델 경로가 없습니다.');
 if(!Number.isFinite(Date.parse(date)))throw Error('가창 모델 등록 시간이 올바르지 않습니다.');
 return {
  id:'ds-'+job.id,voiceId:voice.id,engineId:'diffsinger',name:'실제 DiffSinger 가창 모델 '+job.experiment,
  modelKind:'local-installed-acoustic',status:'checkpoint-produced-in-unverified-environment',
  source:'official-diffsinger-acoustic-training',
  root:job.root,python:job.python,experiment:job.experiment,
  trainingJobId:job.id,createdAt:date,
  rights:voice.rights,
  notice:'실제 새 Acoustic 체크포인트 생성 후 경로만 등록한 기록. 보코더·발음 사전·추론 호환/음질은 별도 확인하며 모델 파일은 기존 로컬 DiffSinger 설치 폴더에 유지됩니다.'
 };
}

export function listedDiffSingerModels(voice,models=[]){
 if(!voice?.id||!authorized.has(voice.rights)||!Array.isArray(models))return [];
 return models.filter(m=>
  m?.engineId==='diffsinger'&&m?.voiceId===voice.id&&
  m?.modelKind==='local-installed-acoustic'&&
  m?.status==='checkpoint-produced-in-unverified-environment'&&
  experimentPattern.test(m.experiment||'')&&
  safeString(m.root,2048)&&safeString(m.python,2048)&&
  winAbs.test(m.root)&&winAbs.test(m.python)&&pythonExe.test(m.python)
 ).map(m=>({...m}));
}
