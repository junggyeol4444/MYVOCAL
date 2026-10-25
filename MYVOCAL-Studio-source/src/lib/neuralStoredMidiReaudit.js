// 이전 회차의 기존 MusicGen 독립 악기 PCM을 읽기 전용으로 재분석한다.
// 원본 음악·MIDI·IndexedDB·트랙 메타데이터는 변경하지 않는다.
import {getFile} from './assetDb.js';
import {identifyOriginalNeuralWavTracks} from './neuralStemWavExport.js';
import {latestCompleteNeuralScore} from './neuralScoreBatch.js';
import {analyzeNeuralMidiWavAlignment} from './neuralStemMidiPcmAlignment.js';

export async function reanalyzeStoredNeuralMidiWaves(project,{
 current,signal,load=getFile,onProgress=()=>{}
}={}){
 if(!project?.id||typeof current!=='function'||typeof load!=='function')
  throw Error('저장된 독립 악기 프로젝트·로컬 파일 저장소가 필요합니다.');
 const score=latestCompleteNeuralScore(project);
 if(!score)throw Error('기존 동일 회차 6악기 MIDI 원본을 찾지 못했습니다.');
 const existing=identifyOriginalNeuralWavTracks(project,{requireAll:false});
 const guard=()=>{if(signal?.aborted||current()!==project)
  throw Error('재분석이 취소되거나 프로젝트가 변경됐습니다. 원본은 그대로 보존합니다.');};
 const audits=[];
 for(const [index,entry] of existing.entries()){
  guard();
  const file=await load(entry.assetId);guard();
  if(!(file instanceof Blob)||file.size<44||file.size>90*1024*1024)
   throw Error('저장된 독립 악기 '+entry.role+'의 실제 WAV를 읽을 수 없습니다.');
  const wav=await file.arrayBuffer();guard();
  const diagnosis=analyzeNeuralMidiWavAlignment(wav,score.get(entry.role).midiNotes,
   Number(project.bpm),{signal});
  if(Math.abs(diagnosis.durationSec-entry.durationSec)>.12)
   throw Error(entry.role+' 원본 WAV 프레임과 기존 편집 클립 길이가 일치하지 않습니다.');
  audits.push({role:entry.role,sourceTrackId:entry.track.id,assetId:entry.assetId,
   diagnosis});
  onProgress(index+1,existing.length);
 }
 guard();
 return {projectId:project.id,bpm:Number(project.bpm),
  source:'기존 IndexedDB 저장 원천 신경망 WAV PCM 및 동일 MIDI 회차',
  analyzedRoles:audits.length,audits,
  limitation:'다성음/드럼의 음정 정확도를 판정하지 않으며 WAV·MIDI/프로젝트를 변경하지 않습니다.'};
}
