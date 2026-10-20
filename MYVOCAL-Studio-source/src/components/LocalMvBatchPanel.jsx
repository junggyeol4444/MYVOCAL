import React,{useRef,useState} from 'react';
import {Button,Notice,Panel} from './UI';
import {planMvBatch,runMvBatch} from '../lib/mvBatchProduction.js';
import {runFullLocalMv} from '../lib/fullMvProduction.js';
import {readMvLipPlacement} from '../lib/mvLipPlacement.js';
import {audioEnd} from '../lib/audioEngine.js';
export default function LocalMvBatchPanel({project,data,checkpoint,videoModel,imagePort,imageSteps,imageSize,videoFrames,videoFps,videoSteps,videoMotion,current,commit,session,notify}){
 const cancelRef=useRef(null);
 const dataRef=useRef(data);dataRef.current=data;
 const [includeReferences,setIncludeReferences]=useState(false);
 const [saveFullMovie,setSaveFullMovie]=useState(false),[fullMouth,setFullMouth]=useState(false);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 let info;try{info=planMvBatch(project,{includeReferences})}catch(e){info={total:0,already:0,linked:0,error:e.message}}
 const create=async()=>{
  if(busy||(!info.total&&!saveFullMovie))return;
  const controller=new AbortController();cancelRef.current=controller;setBusy(true);setMessage('시작 중…');setError('');
  let warmed=null;
  try{
   const [width,height]=String(imageSize).split('x').map(Number);
   const base={project,data,checkpoint,videoModel,port:Number(imagePort),session:session(),
     imageSteps:Number(imageSteps),width,height,frames:Number(videoFrames),fps:Number(videoFps),videoSteps:Number(videoSteps),
     motion:Number(videoMotion),includeReferences,current,currentData:()=>dataRef.current,commit,signal:controller.signal};
   if(saveFullMovie){
    // Create/resume AudioContext immediately during this user click, BEFORE the
    // potentially long model inference. WebView2 may otherwise block autoplay.
    if(audioEnd(current())>0){
     const C=window.AudioContext||window.webkitAudioContext;
     if(!C)throw Error('음악 포함 MV 녹화를 지원하지 않는 WebView2입니다.');
     warmed=new C();await warmed.resume();
    }
    let lipPlacement=null;
    if(fullMouth){
     lipPlacement=readMvLipPlacement(window.localStorage,project.id);
     if(!Object.keys(lipPlacement).length)throw Error('MV 내보내기 화면에서 캐릭터 입 위치를 먼저 저장하세요.');
    }
    const result=await runFullLocalMv({...base,includeAudio:true,includeCaptions:true,lipPlacement,prewarmedAudioContext:warmed,onProgress:setMessage});
    const blob=result.file,url=URL.createObjectURL(blob),a=document.createElement('a');
    try{a.href=url;a.download='MYVOCAL-'+String(project.title||'project').replace(/[^가-힣a-zA-Z0-9_-]/g,'_').slice(0,40)+'-auto-MV.webm';document.body.append(a);a.click();a.remove();}
    finally{setTimeout(()=>URL.revokeObjectURL(url),30000);}
    setMessage(`전체 MV ${result.seconds.toFixed(1)}초 저장: 신규 이미지 ${result.generatedImages}장, 영상 클립 ${result.generatedVideos}개. 보컬·반주 믹스 ${result.audioIncluded?'포함':'없음'}.`);
    notify('전체 MV WebM을 저장했습니다. 실제 사람이 부르는 신경망 모델은 별도 설치가 필요합니다.');
   }else{
    const result=await runMvBatch({...base,progress:setMessage});
    setMessage(`${result.generatedImages}장 이미지와 ${result.generatedVideos}개 영상 클립 생성·저장 완료. 완성 MV는 별도 출력도 가능합니다.`);
    notify('장면별 로컬 AI 이미지·영상 생성을 완료했습니다.');
   }
  }catch(e){setError(e.message);notify('장면별 자동 생성 중단: '+e.message)}finally{try{await warmed?.close()}catch{}cancelRef.current=null;setBusy(false)}
 };
 return <Panel title="실제 로컬 AI 이미지 → SVD 영상 일괄 생성" description="사용자가 설치한 ComfyUI SD 이미지 모델과 SVD 동영상 모델을 사용합니다. 각 빈 장면에서 실제 이미지와 짧은 영상 파일을 생성하고 기존 프로젝트에 저장합니다.">
  <p className="muted">생성 대상 {info.total}개 · 이미 영상이 있는 장면 {info.already}개 · 등록된 사람·캐릭터 연결 장면 {info.linked}개</p>
  <label><input type="checkbox" disabled={busy} checked={includeReferences} onChange={e=>setIncludeReferences(e.target.checked)}/> 등록된 본인·허가받은 사람 사진·2D 캐릭터 원화 장면도 일괄 이미지·영상 생성에 포함</label>
  <label><input type="checkbox" disabled={busy} checked={saveFullMovie} onChange={e=>setSaveFullMovie(e.target.checked)}/> 생성 후 음악·보컬·가사 포함 완성 MV WebM까지 한 번에 저장 (Windows WebView2 사용)</label>
  {saveFullMovie&&<label><input type="checkbox" disabled={busy} checked={fullMouth} onChange={e=>setFullMouth(e.target.checked)}/> 저장된 캐릭터 2D 립싱크 입 모양도 영상에 포함</label>}
  <Button variant="primary" disabled={busy||(!info.total&&!saveFullMovie)||(info.total>0&&(!checkpoint||!videoModel))} onClick={create}>{busy?'실제 모델 + 영상 렌더 처리 중':saveFullMovie?'이미지·영상 생성부터 전체 MV 저장까지':'빈 장면 이미지·SVD 클립 일괄 생성'}</Button>
  {busy&&<Button onClick={()=>cancelRef.current?.abort()}>이후 장면 생성 취소</Button>}
  {message&&<p role="status" className="muted">{message}</p>}
  {(error||info.error)&&<p role="alert" className="mv4-error">{error||info.error}</p>}
  <Notice>이 기능은 설치된 로컬 모델이 실제 실행되는 경우에만 영상 파일을 생성합니다. 기본 설정에서는 등록 인물·캐릭터 장면을 건너뜁니다. 포함을 켜면 권한을 검사한 원본을 기존 img2img→SVD로 실제 생성합니다. 원본을 바꾸거나 일치하지 않는 사람으로 생성하지 않습니다. 한 번에 최대 20장면, 장면당 짧은 클립만 생성합니다. 완성 WebM 자동 저장을 선택하면 기존 음악·보컬 믹스를 포함해 실제 MV를 녹화합니다. 립싱크 2D 입 위치는 기존 MV 화면에서 먼저 지정해야 합니다. 등록 인물의 얼굴 추적·3D 애니메이션이나 사용자 목소리 신경망 학습은 자동 수행하지 않습니다.</Notice>
 </Panel>;
}