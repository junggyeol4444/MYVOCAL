// #36/#38/#55: Real original stored drum PCM -> direction and SVD motion
// intensity for NEW, unrendered full-song MV scenes. Does not fabricate
// camera tracking, dance AI, or edit authored/rendered footage.
import {analyzeStemPerformanceWav,stemPerformanceLevel} from './neuralStemPerformanceEnvelope.js';
import {savedRhythmSources} from './musicReactiveDance30.js';

const clamp=v=>Math.max(0,Math.min(1,v));
function sceneEnergy(envelope,start,end){
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||
  end<=start||end>360.01)return null;
 const total=Math.min(20,Math.max(3,Math.ceil((end-start)*6))),levels=[];
 for(let i=0;i<total;i++){
  const ms=(start+(end-start)*(i+.5)/total)*1000;
  levels.push(stemPerformanceLevel(envelope,ms));
 }
 if(!levels.length)return null;
 const mean=levels.reduce((a,b)=>a+b,0)/levels.length;
 const peak=Math.max(...levels);
 return clamp(.65*mean+.35*peak);
}
export function planPcmDirectedMv36(project,envelope,{sourceTrackId,sourceAssetId}={}){
 if(!project?.id||!Array.isArray(project.scenes)||project.scenes.length>120||
  !envelope||envelope.version!==1||envelope.source!=='real-neural-stem-pcm'||
  !sourceTrackId||!sourceAssetId||!Number.isInteger(envelope.durationMs)||
  !Array.isArray(envelope.levels))
  throw Error('원본 드럼 WAV와 MYVOCAL MV 장면의 연결이 유효하지 않습니다.');
 const actual=savedRhythmSources(project).some(s=>
  s.trackId===sourceTrackId&&s.assetId===sourceAssetId);
 if(!actual)throw Error('동일 프로젝트의 실제 저장된 독립 드럼 트랙이 필요합니다.');
 let updated=0,scenes=project.scenes.map(scene=>{
  // Only our automatic, *unrendered* shots receive the new audiovisual
  // direction. User-edited shots and existing video/image assets are immutable.
  if(scene.generatedBy!=='full-song-auto-scene'||
   scene.imageAssetId||scene.videoClipAssetId)return scene;
  const energy=sceneEnergy(envelope,Number(scene.start),Number(scene.end));
  if(energy===null||envelope.durationMs+200<scene.end*1000)
   throw Error('실제 드럼 PCM WAV가 자동 MV의 장면 길이를 포함하지 못했습니다.');
  const bucket=energy>=.72?'strong':energy>=.38?'medium':'soft';
  const motion=Math.max(30,Math.min(240,Math.round(52+170*energy)));
  const directive={
   version:1,source:'real-stored-drums-pcm',sourceTrackId,sourceAssetId,
   energy:Math.round(energy*1000)/1000,bucket,svdMotionBucket:motion,
   imageDirection:bucket==='strong'?
    'dramatic energetic framing, vivid contrast, high intensity stage lighting':
    bucket==='medium'?
    'rhythmic cinematic composition, balanced stage lighting':
    'intimate calm framing, gentle low contrast lighting'
  };
  if(JSON.stringify(scene.rhythmDirection36)===JSON.stringify(directive))
   return scene;
  updated++;
  return {...scene,rhythmDirection36:directive};
 });
 return {project:updated?{...project,scenes}:project,updated,
  sourceTrackId,sourceAssetId};
}
export async function applyPcmDirectedMv36(project,{
 loadFile,current=()=>project,onChange,signal,onProgress=()=>{}
}={}){
 if(typeof loadFile!=='function'||typeof current!=='function'||
  typeof onChange!=='function')throw Error('실제 PCM 저장소·프로젝트 업데이트 연결이 필요합니다.');
 const source=savedRhythmSources(project)[0];
 if(!source)throw Error('먼저 원곡에 독립 MusicGen 드럼 PCM WAV 트랙을 생성하세요.');
 const guard=()=>{if(signal?.aborted||current()!==project)
  throw Error('실제 음악 장면 연출이 취소되거나 원곡이 변경됐습니다.');};
 guard();onProgress('실제 드럼 PCM WAV 강약을 읽어 MV 장면별 리듬을 분석하는 중');
 const file=await loadFile(source.assetId);guard();
 if(!(file instanceof Blob)||file.size<44||file.size>90*1024*1024)
  throw Error('등록된 실제 원곡 드럼 WAV가 없습니다.');
 const envelope=analyzeStemPerformanceWav(await file.arrayBuffer(),{hopMs:100});guard();
 const directed=planPcmDirectedMv36(project,envelope,{
  sourceTrackId:source.trackId,sourceAssetId:source.assetId});
 if(directed.updated){
  guard();await Promise.resolve(onChange(directed.project));
  onProgress('실제 드럼 PCM 강약으로 신규 자동 MV '+directed.updated+'개 장면 연출·SVD 강도 연결');
 }
 return directed;
}
export function pcmSceneSvdMotion36(scene,fallback=127){
 const r=scene?.rhythmDirection36;
 if(scene?.generatedBy==='full-song-auto-scene'&&
  r?.version===1&&r.source==='real-stored-drums-pcm'&&
  Number.isInteger(r.svdMotionBucket)&&r.svdMotionBucket>=30&&
  r.svdMotionBucket<=240)return r.svdMotionBucket;
 return fallback;
}
