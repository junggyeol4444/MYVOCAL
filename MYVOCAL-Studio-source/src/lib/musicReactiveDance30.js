// Original requirements #30/#46/#47: produce an ACTUAL audio-reactive
// 2D/VRM choreography from the user's saved drum WAV PCM, not fabricated
// beat metadata. The original stem, authored motion cues, and character are
// read-only; the returned candidate is separately approved in Character Studio.
import {analyzeStemPerformanceWav,stemPerformanceLevel} from './neuralStemPerformanceEnvelope.js';
import {createDancePlan,createFullSongDancePlan,validateDancePlan} from './characterDanceDirector.js';

const finite=(n,a,b)=>Number.isFinite(n)&&n>=a&&n<=b;
const clamp=n=>Math.max(0,Math.min(1,n));
export function savedRhythmSources(project){
 if(!project?.id)return [];
 return (project.tracks||[]).filter(t=>
  t&&!t.mute&&t.generatedBy==='musicgen-independent-audio'&&
  t.sourceRole==='drums'&&t.clips?.length===1&&
  t.clips[0]?.assetId&&
  t.clips[0].startBar===1&&
  Number(t.clips[0].sourceOffsetSec||0)===0).map(t=>({
    trackId:t.id,assetId:t.clips[0].assetId,name:t.name||'독립 드럼 PCM',
    source:'musicgen-independent-audio',role:'drums'
  }));
}
function averagePulse(envelope,from,to){
 if(!finite(from,0,360000)||!finite(to,0,360200)||to<=from)return 0;
 const step=Math.max(1,Math.floor((to-from)/10)),samples=[];
 for(let t=from;t<to;t+=step)samples.push(stemPerformanceLevel(envelope,t));
 if(!samples.length)return 0;
 const mean=samples.reduce((a,b)=>a+b,0)/samples.length;
 const hi=samples.reduce((a,b)=>Math.max(a,b),0);
 return clamp(.72*mean+.28*hi);
}
export function scoreMusicReactiveDance30(character,project,envelope,{
 durationSec=0,sourceTrackId='',sourceAssetId=''
}={}){
 if(!project?.id||!Number.isInteger(envelope?.durationMs)||
  envelope.version!==1||!Array.isArray(envelope.levels)||
  !finite(durationSec,2,360)||!sourceTrackId||!sourceAssetId)
  throw Error('실제 드럼 PCM과 MYVOCAL 원곡·악기 연결이 필요합니다.');
 if(envelope.source!=='real-neural-stem-pcm'||envelope.durationMs+200<durationSec*1000)
  throw Error('실제 드럼 WAV가 영상 전곡 길이보다 짧거나 PCM 분석에 실패했습니다.');
 const full=durationSec>=150;
 if(!full&&durationSec>30)
  throw Error('31~149초 춤은 장편 3~6분 모드 또는 30초 이하 구간을 선택하세요.');
 let candidate=full?
  createFullSongDancePlan(character,project,{durationSec}):
  createDancePlan(character,project,{durationSec});
 // The original generator already maps BPM, genre and song sections to
 // human-readable moves. PCM energy modifies actual beat intensity and
 // picks accents without inventing motion capture / dance neural inference.
 const cues=candidate.cues.map((cue,index)=>{
  const duration=cue.endMs-cue.startMs;
  let energy=averagePulse(envelope,cue.startMs,cue.endMs);
  const prev=averagePulse(envelope,Math.max(0,cue.startMs-duration),cue.startMs);
  // Dynamic onset from successive REAL PCM windows changes intensity
  // and moves. The 120ms fade in existing dancePose prevents pops.
  const onset=Math.max(0,energy-prev);
  const accent=onset>.17&&energy>.28;
  const chorus=/후렴|chorus|drop|final/i.test(cue.section);
  const move=accent?(chorus?(index%2?'wave':'bounce'):'step'):cue.move;
  const strength=clamp(.18+.68*energy+.14*Math.min(1,onset*3));
  return {...cue,move,strength:Math.round(strength*1000)/1000};
 });
 candidate={...candidate,cues,
  audioReactive30:{version:1,source:'real-stored-drums-pcm',sourceTrackId,sourceAssetId,
   analyzedDurationMs:envelope.durationMs,
   beatsFrom:'project-bpm-and-saved-wav-energy',
   createdAt:new Date().toISOString(),
   notes:'실제 등록 드럼 PCM의 에너지/액센트로 VRM·2D 타임라인 동작 큐를 조절. 신경망 춤 학습·모션캡처 아님'}};
 validateDancePlan(character,candidate);
 return candidate;
}
export async function createMusicReactiveDance30(character,project,{
 loadFile,current=()=>project,signal,durationSec=0,onProgress=()=>{},
 sourceTrackId=''
}={}){
 if(typeof loadFile!=='function'||typeof current!=='function')
  throw Error('원곡 저장 WAV의 로컬 파일 로더가 필요합니다.');
 const available=savedRhythmSources(project);
 const choice=available.find(s=>s.trackId===sourceTrackId)||
  (!sourceTrackId?available[0]:null);
 if(!choice)throw Error('먼저 이 프로젝트의 실제 MusicGen 독립 드럼 WAV 트랙을 생성하세요.');
 if(!finite(durationSec,2,360))
  throw Error('실제 뮤직비디오 길이를 2~360초로 지정하세요.');
 const check=()=>{if(signal?.aborted||current()!==project)
  throw Error('드럼 PCM 춤 생성이 취소됐거나 원곡이 변경됐습니다.');};
 check();onProgress('독립 드럼 WAV 원본 읽는 중');
 const blob=await loadFile(choice.assetId);check();
 if(!(blob instanceof Blob)||blob.size<44||blob.size>90*1024*1024)
  throw Error('실제 원본 드럼 WAV를 찾지 못했거나 크기를 초과했습니다.');
 const envelope=analyzeStemPerformanceWav(await blob.arrayBuffer(),{hopMs:100});
 check();onProgress('실제 드럼 PCM 강약과 원곡 BPM·구간으로 2D/VRM 춤 동작 생성 중');
 const result=scoreMusicReactiveDance30(character,project,envelope,{
  durationSec,sourceTrackId:choice.trackId,sourceAssetId:choice.assetId});
 check();onProgress('실제 PCM 기반 춤 큐 '+result.cues.length+'개 생성 · 저장 전 검토 필요');
 return result;
}
