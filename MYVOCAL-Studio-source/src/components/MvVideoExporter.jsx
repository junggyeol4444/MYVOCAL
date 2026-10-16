import React,{useEffect,useRef,useState} from 'react';
import {Button,Notice,Panel} from './UI';
import {getFile} from '../lib/assetDb.js';
import {AudioEngine,audioEnd,mixdownWav} from '../lib/audioEngine.js';
import {planMvVideoRender,loadMvVideoAssets,findMvVideoScene,drawMvVideoFrame,MV_VIDEO_WIDTH,MV_VIDEO_HEIGHT} from '../lib/mvVideoRender.js';
import {recordMvWebm,assertMvExportEnvironment} from '../lib/mvWebmRecorder.js';
import {buildMvLyricCaptions} from '../lib/mvLyricCaptions.js';

function saveMovie(blob,project){
 const name=String(project.title||'myvocal').replace(/[^가-힣A-Za-z0-9_-]/g,'_').slice(0,64);
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=`MYVOCAL-${name}-music-video.webm`;
 document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export default function MvVideoExporter({project,characters=[],positionSeconds=0,playing=false,notify}){
 const canvas=useRef(null),abort=useRef(null),mounted=useRef(true),previewAudio=useRef(null);
 const [prepared,setPrepared]=useState(null),[loadError,setLoadError]=useState('');
 const [busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[includeSound,setIncludeSound]=useState(true),[showCaptions,setShowCaptions]=useState(true);
 let plan=null,planError='';
 try{plan=planMvVideoRender(project,characters);}catch(e){planError=e.message;}
 const assetsSignature=JSON.stringify((project?.scenes||[]).map(s=>[s.id,s.imageAssetId,s.videoClipAssetId,s.videoGeneration?.mime]));
 const musicExists=project&&audioEnd(project)>0;
 const lyricCaptions=buildMvLyricCaptions(project);
 const captionsEnabled=showCaptions&&lyricCaptions.status==='ready';
 const captionSignature=JSON.stringify(lyricCaptions.captions);
 const sceneTimeline=JSON.stringify(plan?.scenes.map(s=>[s.id,s.start,s.end,s.title])||[]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;abort.current?.abort();previewAudio.current?.stop();};},[]);
 useEffect(()=>{
  if(!previewAudio.current)previewAudio.current=new AudioEngine();
  const audio=previewAudio.current;
  if(!playing||!musicExists){audio.stop(0);return;}
  // The storyboard player is the time clock; its Seek action pauses first,
  // stopping audio before an optional restart at the selected position.
  audio.play(project,Math.max(0,Math.min(Number(positionSeconds)||0,plan?.durationSec||0)))
   .catch(e=>{if(mounted.current)notify('음악 미리 듣기 실패: '+e.message);});
  return()=>audio.stop();
 },[playing,project?.id,musicExists]);
 useEffect(()=>{
  let alive=true,resources=null;
  const controller=new AbortController();
  setPrepared(null);setLoadError('');
  if(!plan)return;
  loadMvVideoAssets(plan,{loadFile:getFile,signal:controller.signal}).then(x=>{
   if(!alive)x.dispose();
   else{resources=x;setPrepared(x);}
  }).catch(e=>{if(alive&&!controller.signal.aborted)setLoadError(e.message);});
  return()=>{alive=false;controller.abort();resources?.dispose();};
 // Scenes and original asset links, not the moving timeline position.
 },[project?.id,assetsSignature,!!plan]);
 const activeScene=plan?findMvVideoScene(plan,Number(positionSeconds)||0):null;
 useEffect(()=>{
  if(!prepared||!plan||!canvas.current)return;
  for(const s of plan.scenes){
   if(s.kind!=='video')continue;
   const video=prepared.assets.get(s.assetId)?.element;
   if(!video)continue;
   if(activeScene?.id===s.id){
    if(!playing){
     video.pause();
     const sec=Math.max(0,(Number(positionSeconds)||0)-s.start);
     if(Number.isFinite(video.duration)&&video.duration>0&&Math.abs(video.currentTime-(sec%video.duration))>.2){
      try{video.currentTime=sec%video.duration;}catch{}
     }
    }else if(video.paused)video.play()?.catch(()=>{});
   }else video.pause();
  }
  try{drawMvVideoFrame(canvas.current,plan,prepared.assets,Number(positionSeconds)||0,{captions:lyricCaptions.captions,showCaptions:captionsEnabled});}catch{}
 },[prepared,assetsSignature,sceneTimeline,positionSeconds,playing,activeScene?.id,project?.id,captionsEnabled,captionSignature]);
 const startExport=async()=>{
  if(!plan||busy)return;
  const controller=new AbortController();abort.current=controller;
  setBusy(true);setProgress(0);
  let resources=null;
  try{
   assertMvExportEnvironment();
   // Fresh playback elements keep the preview untouched throughout export.
   resources=await loadMvVideoAssets(plan,{loadFile:getFile,signal:controller.signal});
   const useAudio=!!includeSound&&musicExists;
   const result=await recordMvWebm(plan,resources,{
    includeAudio:useAudio,renderAudio:()=>mixdownWav(project,{bitDepth:16,channels:2,sampleRate:44100}),
    showCaptions:captionsEnabled,captions:lyricCaptions.captions,
    signal:controller.signal,onProgress:n=>{if(mounted.current)setProgress(n);}
   });
   if(controller.signal.aborted)throw Error('영상 저장을 취소했습니다.');
   saveMovie(result.blob,project);
   notify(`장면 ${plan.scenes.length}개 · ${plan.durationSec.toFixed(1)}초짜리 실제 WebM 영상을 저장했습니다. 음악 ${useAudio?'포함':'제외'} · 싱크 가사 자막 ${captionsEnabled?'포함':'제외'}.`);
  }catch(e){notify('MV 영상 저장 실패: '+e.message);}
  finally{resources?.dispose();if(mounted.current){setBusy(false);setProgress(0);}abort.current=null;}
 };
 return <Panel title="음악·장면 전체 영상 미리보기와 WebM 저장" description="현재 곡의 장면별 이미지·짧은 영상 클립을 실제 시간에 맞춰 연결합니다. 내장 음악 믹스를 포함한 WebM 파일을 저장할 수 있습니다. 새로운 AI 영상이나 립싱크를 생성하는 기능은 아닙니다.">
  {plan?<><div className="hstack" style={{flexWrap:'wrap',gap:12}}>
   <span>총 <strong>{plan.durationSec.toFixed(1)}초</strong></span>
   <span>장면 <strong>{plan.scenes.length}개</strong></span>
   <span>이미지/영상 <strong>{plan.mediaScenes}개</strong></span>
   <span>이미지 없는 스토리보드 카드 <strong>{plan.cardScenes}개</strong></span>
  </div>
  <canvas ref={canvas} width={MV_VIDEO_WIDTH} height={MV_VIDEO_HEIGHT} aria-label="실제 MV 영상 미리보기" style={{display:'block',width:'100%',maxWidth:MV_VIDEO_WIDTH,aspectRatio:'16 / 9',background:'#111623',borderRadius:10,margin:'12px auto'}}/>
  <p className="muted">위 장면은 기존 스토리보드의 재생·일시정지·위치 이동 버튼과 연결되며, 재생 중에는 프로젝트 음악도 함께 들을 수 있습니다. 저장된 짧은 MP4 클립은 해당 장면 길이 동안 반복합니다. 이미지가 없는 구간은 텍스트 카드로 표시됩니다.</p>
  {loadError&&<Notice>연결된 원본 미디어 읽기 실패: {loadError}. 프로젝트 백업 또는 이미지·영상 원본을 확인하세요.</Notice>}
  {!prepared&&!loadError&&<p className="muted">장면 이미지·영상 파일 확인 중…</p>}
  <div className="hstack" style={{gap:12,flexWrap:'wrap',alignItems:'center'}}>
   <label className="muted"><input type="checkbox" disabled={!musicExists||busy} checked={includeSound&&musicExists} onChange={e=>setIncludeSound(e.target.checked)}/> 기존 곡의 음악·보컬 믹스 포함 {musicExists?'':'(재생 가능한 음악 없음)'}</label>
   <label className="muted"><input type="checkbox" aria-label="가사 싱크 자막 영상 포함" disabled={lyricCaptions.status!=='ready'||busy} checked={captionsEnabled} onChange={e=>setShowCaptions(e.target.checked)}/> 싱크된 가사 자막 포함 {lyricCaptions.status==='ready'?(`(${lyricCaptions.captions.length}개 구간)`):'(가사 싱크 확인 필요)'}</label>
   <Button icon="download" variant="primary" disabled={!prepared||!!loadError||busy} onClick={startExport}>{busy?`WebM 기록 중 ${progress}%`:'전체 MV WebM 저장'}</Button>
   {busy&&<Button onClick={()=>abort.current?.abort()}>저장 취소</Button>}
  </div>
  <p className="muted">{lyricCaptions.note}</p>
  {busy&&<progress aria-label="MV 영상 저장 진행률" max="100" value={progress} style={{width:'100%',marginTop:12}}/>}
  <p className="muted">640×360 · 12fps · 최대 5분 · 실시간 녹화(WebView2의 WebM 지원 필요). 영상 길이만큼 프로그램 창을 켜 두어야 합니다. MP4가 아닌 WebM으로 저장하며, 모델 없는 장면은 AI 영상으로 바뀌지 않습니다.</p>
  </>:<Notice>{planError}</Notice>}
 </Panel>;
}
