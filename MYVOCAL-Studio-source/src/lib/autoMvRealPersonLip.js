// One-click ORIGINAL-MYVOCAL single-person performance MV.
 // The finished existing music+video is fed to the user's installed Wav2Lip
 // with its REAL mono PCM music mix, not fake lips or synthetic demo audio.
 // Mixed cast/story scenes are deliberately rejected to avoid face swapping.
import {renderNeuralPersonLip} from './neuralPersonLipClient.js';
import {assertUsableSingingWav} from './singingOutputValidation.js';
import {isolatedPersonSingingMix} from './personLipVocalAudio.js';

export async function applyNeuralFaceLipToMv(movie,project,characters,{
 personId,python,root,checkpoint,resize=2,consent=false,modelRights=false,
 session,signal,run=renderNeuralPersonLip,mix=null
}={}){
 if(!project?.id||!Array.isArray(project.scenes)||!project.scenes.length||
 !Array.isArray(project.tracks)||!Array.isArray(characters)||!(movie instanceof Blob)||
 movie.type!=='video/webm'||movie.size<128)
  throw Error('실제 음악이 들어 있는 기존 MV WebM 프로젝트가 필요합니다.');
 const selected=characters.find(p=>p.id===personId);
 if(!selected||!['self','owned','licensed'].includes(selected.rights)||
  (selected.rights==='licensed'&&!String(selected.rightsNote||'').trim())||
  !consent||!modelRights)
  throw Error('실제 사람 본인/사용 허가, 영상·음성 및 Wav2Lip 모델의 이용 권한이 필요합니다.');
 if(project.scenes.some(s=>s.characterId!==personId||s.personMv?.personId!==personId))
  throw Error('Wav2Lip 전자동 출력은 동일한 등록 실제 사람이 등장하는 장면으로만 사용할 수 있습니다.');
 if(!project.tracks.some(t=>t.type==='vocal'&&!t.mute&&Array.isArray(t.clips)&&t.clips.length))
  throw Error('가창 WAV 보컬 트랙을 먼저 생성하거나 가져오세요.');
 if(signal?.aborted)throw Error('실제 사람 립싱크를 취소했습니다.');
 const renderAudio=mix||(await import('./audioEngine.js')).mixdownWav;
 const isolated=isolatedPersonSingingMix(project,personId);
 // 입 모양은 지정한 사람의 진짜 보컬로, 최종 MP4 오디오는 기존 완성 반주+보컬 믹스로 유지한다.
 const soundtrack=await renderAudio(project,{bitDepth:16,sampleRate:44100,channels:2});
 if(!(soundtrack instanceof Blob))throw Error('원곡 전체 오디오 믹스 WAV가 없습니다.');
 const fullInfo=assertUsableSingingWav(await soundtrack.arrayBuffer(),{maxDurationSec:360});
 if(signal?.aborted)throw Error('실제 사람 립싱크를 취소했습니다.');
 const audio=await renderAudio(isolated.project,{bitDepth:16,sampleRate:44100,channels:1});
 if(!(audio instanceof Blob))throw Error('인물에 연결된 실제 보컬 WAV가 없습니다.');
 const vocalInfo=assertUsableSingingWav(await audio.arrayBuffer(),{maxDurationSec:360});
 if(Math.abs(fullInfo.durationSec-vocalInfo.durationSec)>.35)
  throw Error('보컬 발성 WAV와 원곡 전체 믹스의 재생 길이가 맞지 않습니다.');
 if(signal?.aborted)throw Error('실제 사람 립싱크를 취소했습니다.');
 const converted=await run(movie,audio,{
  python,root,checkpoint,resize,rightsConfirmed:consent,modelRights,soundtrack
 },{session,signal});
 if(!(converted instanceof Blob)||converted.type!=='video/mp4'||converted.size<128)
  throw Error('Wav2Lip가 실제 MP4 뮤직비디오를 생성하지 못했습니다.');
 if(signal?.aborted)throw Error('실제 사람 립싱크를 취소했습니다.');
 return {file:converted,audioIncluded:true,personId,vocalTrackId:isolated.trackId,engine:'installed-local-wav2lip'};
}
