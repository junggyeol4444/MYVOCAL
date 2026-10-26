// One user-facing path, reusing the installed local SD / SVD models, MYVOCAL
// mixdown and real WebView2 Canvas recorder. No model/API access is faked.
import {planMvBatch,runMvBatch} from './mvBatchProduction.js';
import {planMvVideoRender,loadMvVideoAssets} from './mvVideoRender.js';
import {recordMvWebm,assertMvExportEnvironment} from './mvWebmRecorder.js';
// AudioEngine is loaded only when performing an actual mixdown, not when
// inspecting the batch plan in the Node test runner.
import {buildMvLyricCaptions} from './mvLyricCaptions.js';
import {planMvLipSyncOverlay} from './mvLipSyncOverlay.js';
import {mvExportRevision,verifyMvExportRevision} from './mvExportRevision.js';
import {getFile} from './assetDb.js';
import {automaticSingingVisemes,reviewedCharacterMouthPlacement} from './autoMvPhonemeLip.js';
import {planRecordedDuetPcmLipOverlay} from './duetMvPcmLipOverlay.js';
import {planRecordedSoloVocalPcmLip33} from './soloVocalPcmLipOverlay33.js';

export async function runFullLocalMv({
 project,data,current,currentData,commit,session,checkpoint,videoModel,port,
 imageSteps,width,height,frames,fps,videoSteps,motion,includeReferences=false,autoVirtualSinger=false,
 includeAudio=true,includeCaptions=true,lipPlacement=null,prewarmedAudioContext=null,duetPcmLip=false,soloPcmLip=false,soloPcmLipTrackId='',
 signal,onProgress=()=>{}
},{
 batch=runMvBatch,plan=planMvVideoRender,load=loadMvVideoAssets,record=recordMvWebm,
 mix=null,audioDuration=null,captions=buildMvLyricCaptions,
 overlay=planMvLipSyncOverlay,revision=mvExportRevision,verify=verifyMvExportRevision,
 getAsset=getFile,preflight=assertMvExportEnvironment
}={}){
 if(!project?.id||typeof current!=='function'||typeof commit!=='function'||!session)
  throw Error('완성 MV 제작에는 현재 프로젝트와 Windows EXE 세션이 필요합니다.');
 if(signal?.aborted)throw Error('완성 MV 제작을 취소했습니다.');
 const characterList=()=>currentData?.()?.characters||data?.characters||[];
 const before=plan(project,characterList());
 preflight();
 if(before.durationSec>360)throw Error('현재 자동 MV는 최대 6분입니다.');
 // 등록된 한 명의 캐릭터·최신 한국어 음소 시간표·검토된 입 영역이 있을 때만 자동 적용.
 if(soloPcmLip&&duetPcmLip)throw Error('한 명 또는 두 명의 실제 보컬 WAV 립싱크 중 하나만 선택하세요.');
 const initialLip=duetPcmLip?null:lipPlacement||(automaticSingingVisemes(project,characterList())
  ?reviewedCharacterMouthPlacement(project,characterList()):null);
 const safeLip=initialLip?overlay(project,characterList(),initialLip):null;
 // Preflight the selected media and optional user-placed visemes before GPU calls.
 if(safeLip&&!safeLip.matchedScenes)throw Error('배치에 연결된 립싱크 입 모양이 없습니다.');
 let generated=null,resources=null;
 try{
  const pending=planMvBatch(project,{includeReferences});
  // A completed project can be exported again without GPU models installed.
  // Never invoke or require an external inference engine when no scenes need it.
  generated={generatedImages:0,generatedVideos:0};
  // Long-form original #55: produce up to 120 short SVD clips in bounded
  // 20-scene groups. Each independently completed scene is committed to the
  // ORIGINAL project's IndexedDB and is automatically skipped on retry.
  // Never clear/recreate a previously generated video after cancellation.
  const groupSize=20;
  for(let offset=0;offset<pending.sceneIds.length;offset+=groupSize){
   if(signal?.aborted)throw Error('실제 긴 곡의 MV 생성 취소. 기존 장면 파일은 유지합니다.');
   const stage=current();
   if(!stage||stage.id!==project.id)throw Error('긴 곡 MV 장면 생성 도중 프로젝트가 변경됐습니다.');
   const group=pending.sceneIds.slice(offset,offset+groupSize);
   const chunk=await batch({
    project:stage,data,checkpoint,videoModel,port,session,
    imageSteps,width,height,frames,fps,videoSteps,motion,
    includeReferences,autoVirtualSinger,onlySceneIds:group,
    current,currentData,commit,signal,
    progress:s=>onProgress('전체 '+pending.total+'장면 중 '+(offset+1)+'~'+
     (offset+group.length)+' / '+s)
   });
   generated.generatedImages+=Number(chunk?.generatedImages||0);
   generated.generatedVideos+=Number(chunk?.generatedVideos||0);
   onProgress('실제 SD/SVD 장면 '+Math.min(pending.total,offset+group.length)+
    '/'+pending.total+'개 구간별 저장 · 완료 파일 보존');
  }
  if(signal?.aborted)throw Error('완성 MV 제작을 취소했습니다.');
  const latest=current();
  if(!latest||latest.id!==project.id)throw Error('자동 생성 중 프로젝트가 바뀌었습니다.');
  const chars=characterList(),movie=plan(latest,chars);
  // A missing real scene image/clip must never turn an advertised AI music video
  // into a storyboard placeholder card. Existing output assets are preserved.
  if(movie?.cardScenes>0||movie?.scenes?.some(scene=>scene.kind==='card'))
   throw Error('실제 영상이 없는 MV 장면이 남아 있습니다. 원본을 보존하고 해당 장면의 로컬 이미지·영상 생성이 완료될 때까지 중단합니다.');
  // Use only the *current* completed assets, never stale initial scene links.
  // 생성 중 캐릭터와 음소 시간표가 바뀌었을 수 있으므로 최신 프로젝트에서 다시 확인.
  const finalLip=duetPcmLip?null:lipPlacement||(automaticSingingVisemes(latest,chars)
   ?reviewedCharacterMouthPlacement(latest,chars):null);
  const mouth=duetPcmLip?await planRecordedDuetPcmLipOverlay(latest,chars,{
   loadFile:getAsset,current,signal,audioContext:prewarmedAudioContext,
   onProgress:message=>onProgress('두 가수 실제 WAV 입모양: '+message)
  }):soloPcmLip?await planRecordedSoloVocalPcmLip33(latest,chars,{
   loadFile:getAsset,current,signal,audioContext:prewarmedAudioContext,
   placement:finalLip,vocalTrackId:soloPcmLipTrackId,
   onProgress:message=>onProgress('한 가수 실제 보컬 WAV 입모양: '+message)
  }):finalLip?overlay(latest,chars,finalLip):null;
  const captionsState=includeCaptions?captions(latest):null;
  const useCaptions=!!includeCaptions&&captionsState?.status==='ready';
  // Resolve the real MYVOCAL audio engine only for requested audio.
  // The original defaults referenced undeclared names and threw ReferenceError
  // before any model inference or video frames could be recorded.
  const nativeAudio=includeAudio&&(!audioDuration||!mix)?await import('./audioEngine.js'):null;
  const audioLength=audioDuration||nativeAudio?.audioEnd;
  const mixdown=mix||nativeAudio?.mixdownWav;
  const useAudio=!!includeAudio&&audioLength(latest)>0;
  const snapshot=revision(latest,chars,{includeLipSync:!!mouth});
  onProgress('완성 MV 오디오·장면 불러오는 중');
  resources=await load(movie,{loadFile:getAsset,signal});
  if(signal?.aborted)throw Error('완성 MV 제작을 취소했습니다.');
  const recording=await record(movie,resources,{
    includeAudio:useAudio,renderAudio:()=>mixdown(latest,{bitDepth:16,channels:2,sampleRate:44100}),
    showCaptions:useCaptions,captions:useCaptions?captionsState.captions:[],
    lipSyncOverlays:mouth,signal,prewarmedAudioContext,
    onProgress:n=>onProgress('WebM 실시간 녹화 '+n+'%')
  });
  if(signal?.aborted)throw Error('완성 MV 제작을 취소했습니다.');
  verify(snapshot,current(),characterList(),{includeLipSync:!!mouth});
  if(!(recording?.blob instanceof Blob)||recording.blob.size<100)throw Error('실제 WebM 출력 데이터가 없습니다.');
  return {file:new File([recording.blob],'MYVOCAL-완성뮤직비디오.webm',{type:'video/webm'}),scenes:movie.scenes.length,
    seconds:movie.durationSec,audioIncluded:useAudio,captionsIncluded:useCaptions,lipIncluded:!!mouth,
    lipMode:!mouth?'none':duetPcmLip?'duet-vocal-pcm':soloPcmLip?'solo-vocal-pcm':'manual-phoneme',
    lipVocalTrackId:soloPcmLip?mouth?.singleVocalAudioActivity?.sourceTrackId||'':'',
    generatedImages:generated?.generatedImages||0,generatedVideos:generated?.generatedVideos||0};
 }finally{resources?.dispose?.();}
}
