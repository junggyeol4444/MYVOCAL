import React,{useState} from 'react';
import {Button,Notice,Panel} from './UI';
import {planMvBatch,runMvBatch} from '../lib/mvBatchProduction.js';
export default function LocalMvBatchPanel({project,data,checkpoint,videoModel,imagePort,imageSteps,imageSize,videoFrames,videoFps,videoSteps,videoMotion,current,commit,session,notify}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 let info;try{info=planMvBatch(project)}catch(e){info={total:0,already:0,linked:0,error:e.message}}
 const create=async()=>{if(busy||!info.total)return;setBusy(true);setMessage('시작 중…');setError('');
  try{
   const [width,height]=String(imageSize).split('x').map(Number);
   const result=await runMvBatch({project,data,checkpoint,videoModel,port:Number(imagePort),session:session(),imageSteps:Number(imageSteps),width,height,frames:Number(videoFrames),fps:Number(videoFps),videoSteps:Number(videoSteps),motion:Number(videoMotion),current,commit,progress:setMessage});
   setMessage(`${result.generatedImages}장 이미지와 ${result.generatedVideos}개 영상 클립 생성·저장 완료. 전체 MV 합성은 별도 출력 기능을 사용하세요.`);notify('장면별 로컬 AI 이미지·영상 생성을 완료했습니다. 원본 파일은 보존했습니다.');
  }catch(e){setError(e.message);notify('장면별 자동 생성 중단: '+e.message)}finally{setBusy(false)}
 };
 return <Panel title="실제 로컬 AI 이미지 → SVD 영상 일괄 생성" description="사용자가 설치한 ComfyUI SD 이미지 모델과 SVD 동영상 모델을 사용합니다. 각 빈 장면에서 실제 이미지와 짧은 영상 파일을 생성하고 기존 프로젝트에 저장합니다.">
  <p className="muted">생성 대상 {info.total}개 · 이미 영상이 있는 장면 {info.already}개 · 실사 사진/캐릭터 원화 별도 경로 {info.linked}개</p>
  <Button variant="primary" disabled={busy||!info.total||!checkpoint||!videoModel} onClick={create}>{busy?'실제 모델 처리 중':'빈 장면 이미지·SVD 클립 일괄 생성'}</Button>
  {message&&<p role="status" className="muted">{message}</p>}
  {(error||info.error)&&<p role="alert" className="mv4-error">{error||info.error}</p>}
  <Notice>이 기능은 설치된 로컬 모델이 실제 실행되는 경우에만 영상 파일을 생성합니다. 사진 기반 실제 사람·등록 캐릭터 장면은 기존 전용 img2img 경로로 처리해야 하며 건너뜁니다. 한 번에 최대 20장면, 장면당 짧은 클립만 생성합니다. 완성 MV 결합과 립싱크는 아직 별도 작업입니다.</Notice>
 </Panel>;
}