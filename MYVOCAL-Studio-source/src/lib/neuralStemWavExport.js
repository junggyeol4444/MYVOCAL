// MYVOCAL Windows EXE: 신경망 원천 악기 6개를 WAV 개별 편집 파일로 내보낸다.
// 3~6분 6트랙을 ZIP 한 개에 복사하면 256MiB를 넘어갈 수 있으므로,
// 기존 IndexedDB 파일을 순차 검사한 뒤 선택 악기 하나만 원본 WAV로 내보낸다.
// MusicGen의 개별 악기 독립성은 모델 품질에 좌우되며 여기서 합성/분리하지 않는다.
import {getFile} from './assetDb.js';
import {NEURAL_SCORE_ROLES,latestCompleteNeuralScore} from './neuralScoreBatch.js';
import {inspectGeneratedMusicPcm} from './musicProductionPcmSync.js';

export const NEURAL_STEM_EXPORT_LABELS=Object.freeze({
 melody:'멜로디',chords:'코드',bass:'베이스',drums:'드럼',guitar:'기타',pad:'패드'
});
const validId=v=>typeof v==='string'&&v.length>0&&v.length<140;
export function identifyOriginalNeuralWavTracks(project){
 if(!project?.id||!Array.isArray(project.tracks))
  throw Error('기존 MYVOCAL 음악 프로젝트를 선택해 주세요.');
 const score=latestCompleteNeuralScore(project);
 if(!score)throw Error('동일 회차의 실제 신경망 원곡 MIDI 6악기가 필요합니다.');
 const result=new Map();
 for(const track of project.tracks){
  if(track?.generatedBy!=='musicgen-independent-audio')continue;
  const role=track.sourceRole;
  if(!NEURAL_SCORE_ROLES.includes(role))continue;
  const expected=score.get(role);
  if(!expected||track.sourceMidiTrackId!==expected.id||
      !validId(track.id)||!Array.isArray(track.clips)||track.clips.length!==1)
   continue;
  const clip=track.clips[0];
  if(!validId(clip.assetId)||clip.startBar!==1||
     !Number.isFinite(clip.durationSec)||clip.durationSec<150||clip.durationSec>360)
   continue;
  if(result.has(role))throw Error('동일 악기의 실제 신경망 WAV 트랙이 둘 이상입니다. 원본은 유지하고 선택해 주세요.');
  result.set(role,{role,track,assetId:clip.assetId,durationSec:clip.durationSec});
 }
 if(result.size!==6||NEURAL_SCORE_ROLES.some(role=>!result.has(role)))
  throw Error('동일 회차 MusicGen 원천 6악기 편집 WAV 트랙이 모두 필요합니다.');
 return NEURAL_SCORE_ROLES.map(role=>result.get(role));
}
export async function exportOriginalNeuralWav(project,{
 role,current,loadFile=getFile,signal,onProgress=()=>{}
}={}){
 if(!NEURAL_SCORE_ROLES.includes(role)||typeof loadFile!=='function'||
   typeof current!=='function')throw Error('내보낼 신경망 악기·프로젝트 저장소가 올바르지 않습니다.');
 const ordered=identifyOriginalNeuralWavTracks(project);
 const guard=()=>{if(signal?.aborted||current()!==project)
  throw Error('악기 WAV 내보내기가 취소됐거나 프로젝트가 변경됐습니다. 원본은 보존합니다.');};
 guard();
 let baseline=null,selectedFile=null;
 for(let i=0;i<ordered.length;i++){
  guard();
  const stem=ordered[i],raw=await loadFile(stem.assetId);
  guard();
  if(!(raw instanceof Blob)||raw.size<44||raw.size>90*1024*1024)
   throw Error('등록 악기 '+NEURAL_STEM_EXPORT_LABELS[stem.role]+' PCM WAV 파일이 없습니다.');
  const pcm=await inspectGeneratedMusicPcm(raw,NEURAL_STEM_EXPORT_LABELS[stem.role]+' 원천 MusicGen');
  if(Math.abs(pcm.durationSec-stem.durationSec)>.08)
   throw Error('실제 WAV 프레임 길이가 '+NEURAL_STEM_EXPORT_LABELS[stem.role]+'의 편집 클립 길이와 다릅니다.');
  if(baseline){
   if(baseline.rate!==pcm.rate||baseline.channels!==pcm.channels||baseline.frames!==pcm.frames)
    throw Error('독립 6악기 WAV의 실제 PCM 프레임/샘플레이트/채널이 다릅니다. 원본을 수정하지 않습니다.');
  }else baseline=pcm;
  if(stem.role===role)selectedFile=raw;
  onProgress(i+1,ordered.length);
 }
 guard();
 if(!selectedFile||!baseline||baseline.durationSec<150||baseline.durationSec>360)
  throw Error('실제 신경망 악기 WAV를 내보낼 수 없습니다.');
 // 새 파일명만 생성한다. 기존 WAV 원본 바이트는 다시 인코딩하지 않는다.
 const title=String(project.title||'원곡').replace(/[^\p{L}\p{N}_-]/gu,'_').slice(0,55);
 return {file:new File([selectedFile],`MYVOCAL-${title}-원천신경망-${role}.wav`,{type:'audio/wav'}),
  role,durationSec:baseline.durationSec,frames:baseline.frames,sampleRate:baseline.rate,
  sources:ordered.length,generatedBy:'musicgen-independent-audio'};
}
