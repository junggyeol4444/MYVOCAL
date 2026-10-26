// Original #27/#55/#57/#95/#98: export a REAL 3–6 minute lyric/PV movie
// with the actual DAW instrumental + singing audio. Unlike the 30-second
// draft PV, this uses the existing WebView2 Canvas/MediaRecorder and local
// FFmpeg bridge; no HTTP website, synthetic vocals or remote rendering.
// Existing scenes, recorded vocals, checkpoints and original media are never
// overwritten; output is stored as NEW IndexedDB deliverables.
import {audioEnd,mixdownWav} from './audioEngine.js';
import {recordStageWebM} from './stage3dRecording.js';
import {convertRecordedWebMToMP4} from './mvMp4Export.js';
import {pv95Cues,renderPv95Canvas,validatePv95} from './vocalSynthPv95.js';
import {persistProductionDeliverables} from './productionOutputPersist.js';
import {putFilesAtomic,deleteFilesAtomic} from './assetDb.js';
import {genId} from './schema.js';

export function fullSongPv95Eligibility(project){
 if(!project?.id||!Array.isArray(project.tracks)||!Array.isArray(project.scenes))
  return {ready:false,reason:'기존 음악·영상 프로젝트가 필요합니다.'};
 const duration=audioEnd(project);
 if(!Number.isFinite(duration)||duration<150||duration>360)
  return {ready:false,duration,reason:'실제 곡 길이가 150~360초인 원곡의 편집 트랙이 필요합니다.'};
 if(!pv95Cues(project).length)
  return {ready:false,duration,reason:'전곡 가사 PV를 만들려면 실제 가사·MIDI 싱크를 먼저 저장해야 합니다.'};
 if(!project.tracks.some(t=>!t.mute&&(
   (t.clips||[]).some(c=>c.assetId)||(t.midiNotes||[]).length)))
  return {ready:false,duration,reason:'실제 재생되는 반주·보컬 또는 MIDI 음표가 필요합니다.'};
 if(project.scenes.some(s=>!Number.isFinite(s.start)||!Number.isFinite(s.end)||
  s.start<0||s.end<=s.start||s.end>360.01))
  return {ready:false,duration,reason:'장면 시간표가 실제 6분 영상 범위를 벗어났습니다.'};
 return {ready:true,duration,lyricCues:pv95Cues(project).length};
}
export async function exportFullSongPv95(project,settings,{
 canvas,images,session='',mp4=false,signal,current=()=>project,onChange,
 onProgress=()=>{},audioRender=mixdownWav,movieRender=recordStageWebM,
 mp4Convert=convertRecordedWebMToMP4,save=putFilesAtomic,remove=deleteFilesAtomic,
 newId=genId
}={}){
 const eligibility=fullSongPv95Eligibility(project);
 if(!eligibility.ready)throw Error(eligibility.reason);
 validatePv95(settings);
 if(typeof canvas?.captureStream!=='function'||typeof onChange!=='function'||
  typeof current!=='function'||typeof audioRender!=='function'||
  typeof movieRender!=='function'||typeof mp4Convert!=='function')
  throw Error('로컬 Windows EXE 캔버스와 기존 프로젝트 저장 연결을 확인하세요.');
 if(!(images instanceof Map))throw Error('PV 원본 이미지 렌더러가 준비되지 않았습니다.');
 if(mp4&&(typeof session!=='string'||session.length<8))
  throw Error('실제 MP4 제작에는 로컬 Windows EXE의 세션이 필요합니다.');
 const guard=()=>{if(signal?.aborted||current()!==project)
  throw Error('전곡 PV 제작 중 취소 또는 프로젝트 변경 · 모든 기존 원본은 유지했습니다.');};
 guard();
 const duration=eligibility.duration;
 onProgress('실제 기존 DAW 반주·보컬을 16bit PCM WAV로 믹싱 중');
 const audio=await audioRender(project,{sampleRate:44100,channels:2,bitDepth:16});
 guard();
 if(!(audio instanceof Blob)||audio.size<44||audio.size>96*1024*1024)
  throw Error('실제 3~6분 음악·보컬 믹스가 WAV로 생성되지 않았습니다.');
 const ctx=canvas.getContext('2d');
 if(!ctx)throw Error('로컬 PV Canvas 2D 렌더러가 없습니다.');
 const draw=seconds=>{
  guard();
  const s=Math.min(Math.max(0,seconds),Math.max(0,duration-.001));
  const scene=project.scenes.find(scen=>scen.start<=s&&s<scen.end);
  return renderPv95Canvas(ctx,project,settings,s,images.get(scene?.id)||null);
 };
 onProgress('실제 원곡 가사·이미지·리듬 PV 전체 '+Math.ceil(duration)+'초 음악 포함 녹화 중');
 const movie=await movieRender({canvas,duration,fps:settings.fps,draw,
  audioBlob:audio,videoBitsPerSecond:duration>180?1600000:2200000,
  signal,onProgress:fraction=>onProgress('가사·음악 PV 실제 녹화 '+Math.round(fraction*100)+'%')});
 guard();
 if(!(movie instanceof Blob)||movie.type!=='video/webm'||
  movie.size<44||movie.size>96*1024*1024)
  throw Error('실제 전곡 WebM 영상이 잘못됐거나 MP4 변환용 96MB 상한을 넘었습니다.');
 // Preserve a finished WebM even if optional FFmpeg MP4 conversion fails:
 // first write the WebM as a new deliverable before invoking FFmpeg.
 let committed=await persistProductionDeliverables(project,[{kind:'webm',file:movie}],{
  current,onChange,newId,save,remove,signal
 });
 onProgress('음악 포함 가사 PV WebM 프로젝트 새 산출물로 저장 완료');
 let mp4File=null;
 if(mp4){
  guard();onProgress('Windows 로컬 FFmpeg로 완성 PV MP4 변환 중');
  mp4File=await mp4Convert(movie,{session,signal});guard();
  committed=await persistProductionDeliverables(committed.project,[{kind:'mp4',file:mp4File}],{
   current:()=>current()===committed.project?committed.project:null,
   onChange,newId,save,remove,signal
  });
  onProgress('음악 포함 3~6분 PV MP4도 원본과 별개 신규 파일로 저장 완료');
 }
 return {project:committed.project,webm:movie,mp4:mp4File,
  durationSec:duration,lyricCues:eligibility.lyricCues,
  realOriginalMusic:true,realVideo:true,originalsPreserved:true};
}
