// One user-facing path, reusing the installed local SD / SVD models, MYVOCAL
// mixdown and real WebView2 Canvas recorder. No model/API access is faked.
import {runMvBatch} from './mvBatchProduction.js';
import {planMvVideoRender,loadMvVideoAssets} from './mvVideoRender.js';
import {recordMvWebm,assertMvExportEnvironment} from './mvWebmRecorder.js';
import {mixdownWav,audioEnd} from './audioEngine.js';
import {buildMvLyricCaptions} from './mvLyricCaptions.js';
import {planMvLipSyncOverlay} from './mvLipSyncOverlay.js';
import {mvExportRevision,verifyMvExportRevision} from './mvExportRevision.js';
import {getFile} from './assetDb.js';

export async function runFullLocalMv({
 project,data,current,currentData,commit,session,checkpoint,videoModel,port,
 imageSteps,width,height,frames,fps,videoSteps,motion,includeReferences=false,
 includeAudio=true,includeCaptions=true,lipPlacement=null,prewarmedAudioContext=null,
 signal,onProgress=()=>{}
},{
 batch=runMvBatch,plan=planMvVideoRender,load=loadMvVideoAssets,record=recordMvWebm,
 mix=mixdownWav,audioDuration=audioEnd,captions=buildMvLyricCaptions,
 overlay=planMvLipSyncOverlay,revision=mvExportRevision,verify=verifyMvExportRevision,
 getAsset=getFile,preflight=assertMvExportEnvironment
}={}){
 if(!project?.id||typeof current!=='function'||typeof commit!=='function'||!session)
  throw Error('완성 MV 제작에는 현재 프로젝트와 Windows EXE 세션이 필요합니다.');
 if(signal?.aborted)throw Error('완성 MV 제작을 취소했습니다.');
 const characterList=()=>currentData?.()?.characters||data?.characters||[];
 const before=plan(project,characterList());
 preflight();
 if(before.durationSec>300)throw Error('현재 자동 MV는 최대 5분입니다.');
 const safeLip=lipPlacement?overlay(project,characterList(),lipPlacement):null;
 // Preflight the selected media and optional user-placed visemes before GPU calls.
 if(safeLip&&!safeLip.matchedScenes)throw Error('배치에 연결된 립싱크 입 모양이 없습니다.');
 let generated=null,resources=null;
 try{
  generated=await batch({project,data,checkpoint,videoModel,port,session,imageSteps,width,height,
    frames,fps,videoSteps,motion,includeReferences,current,currentData,commit,signal,
    progress:s=>onProgress('이미지/영상 생성: '+s)});
  if(signal?.aborted)throw Error('완성 MV 제작을 취소했습니다.');
  const latest=current();
  if(!latest||latest.id!==project.id)throw Error('자동 생성 중 프로젝트가 바뀌었습니다.');
  const chars=characterList(),movie=plan(latest,chars);
  // Use only the *current* completed assets, never stale initial scene links.
  const mouth=lipPlacement?overlay(latest,chars,lipPlacement):null;
  const captionsState=includeCaptions?captions(latest):null;
  const useCaptions=!!includeCaptions&&captionsState?.status==='ready';
  const useAudio=!!includeAudio&&audioDuration(latest)>0;
  const snapshot=revision(latest,chars,{includeLipSync:!!mouth});
  onProgress('완성 MV 오디오·장면 불러오는 중');
  resources=await load(movie,{loadFile:getAsset,signal});
  if(signal?.aborted)throw Error('완성 MV 제작을 취소했습니다.');
  const recording=await record(movie,resources,{
    includeAudio:useAudio,renderAudio:()=>mix(latest,{bitDepth:16,channels:2,sampleRate:44100}),
    showCaptions:useCaptions,captions:useCaptions?captionsState.captions:[],
    lipSyncOverlays:mouth,signal,prewarmedAudioContext,
    onProgress:n=>onProgress('WebM 실시간 녹화 '+n+'%')
  });
  if(signal?.aborted)throw Error('완성 MV 제작을 취소했습니다.');
  verify(snapshot,current(),characterList(),{includeLipSync:!!mouth});
  if(!(recording?.blob instanceof Blob)||recording.blob.size<100)throw Error('실제 WebM 출력 데이터가 없습니다.');
  return {file:new File([recording.blob],'MYVOCAL-완성뮤직비디오.webm',{type:'video/webm'}),scenes:movie.scenes.length,
    seconds:movie.durationSec,audioIncluded:useAudio,captionsIncluded:useCaptions,lipIncluded:!!mouth,
    generatedImages:generated?.generatedImages||0,generatedVideos:generated?.generatedVideos||0};
 }finally{resources?.dispose?.();}
}
