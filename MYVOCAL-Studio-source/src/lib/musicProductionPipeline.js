// MYVOCAL Windows EXE: local MusicGen -> installed Demucs -> actual PCM master.
// The pipeline never writes to IndexedDB. The existing panel commits one NEW
// asset only after all stages succeed and the original project is unchanged.
import {generateMusicGenAudio} from './musicGenClient.js';
import {generateMusicGenSequence} from './musicGenSequence.js';
import {splitMusicGenStems} from './musicStemsClient.js';
import {renderStemRemixMaster} from './stemRemixMaster.js';
import {inspectDemucsMusicAlignment,inspectRemixedMusicAlignment} from './musicProductionPcmSync.js';

function requireLive(signal){
 if(signal?.aborted)throw new DOMException('원클릭 제작이 취소됐습니다. 기존 프로젝트는 그대로 유지됩니다.','AbortError');
}

export async function runMusicProductionPipeline({settings,sequence=false,segments=4,crossfadeSec=.5,continuation=false,prompts=[],segmentSeconds=[],trimToSeconds=null,demucs,stemMix={},signal,onProgress=()=>{},generate=generateMusicGenAudio,generateSequence=generateMusicGenSequence,split=splitMusicGenStems,remix=renderStemRemixMaster}={}){
 if(!settings||!demucs)throw Error('MusicGen 및 Demucs 로컬 설정을 입력하세요.');
 requireLive(signal);
 onProgress('실제 MusicGen 신경망으로 반주 생성 중');
 const wav=sequence
  ?await generateSequence(settings,{segments,crossfadeSec,continuation,prompts,segmentSeconds,trimToSeconds,signal,onProgress:(done,total)=>onProgress(`MusicGen 구간 ${done}/${total}개 완료`),generate})
  :await generate(settings,{signal});
 requireLive(signal);
 if(!(wav instanceof Blob)||wav.size<44)throw Error('MusicGen이 WAV를 생성하지 않았습니다.');
 onProgress('로컬 Demucs 신경망으로 4/6개 악기 분리 중');
 const stems=await split(wav,demucs,{signal});
 requireLive(signal);
 if(!stems||![4,6].includes(stems.stems?.length))throw Error('Demucs가 유효한 분리 트랙을 생성하지 않았습니다.');
 const pcmAlignment=await inspectDemucsMusicAlignment(wav,stems.stems,{signal});
 onProgress('분리 WAV 실제 PCM 믹싱·마스터링 중');
 const master=await remix(stems.stems,stemMix,{signal,onProgress:(done,total)=>onProgress(`PCM 믹싱 ${done}/${total}프레임`)});
 requireLive(signal);
 if(!(master instanceof Blob)||master.size<44)throw Error('마스터 WAV가 생성되지 않았습니다.');
 requireLive(signal);
 const finalPcm=await inspectRemixedMusicAlignment(master,pcmAlignment);
 requireLive(signal);
 return {wav,stems,master,pcmTiming:{durationSec:finalPcm.durationSec,frames:finalPcm.frames,rate:finalPcm.rate,channels:finalPcm.channels}};
}
