// 원본 20·21·59항: 두 실제 신경망 보컬을 개별 편집 WAV로 내보낸다.
// 기존 Windows EXE의 오프라인 믹스 엔진만 사용한다. 원본 녹음·모델·트랙 불변.
import {mixdownWav} from './audioEngine.js';
import {assertUsableSingingWav} from './singingOutputValidation.js';

export async function exportDuetVocalWav(project,role,{
 current=()=>project,render=mixdownWav,signal
}={}){
 if(!project?.id||!Array.isArray(project.tracks)||!['lead','harmony'].includes(role)||
  typeof current!=='function'||typeof render!=='function')
  throw Error('두 가수의 기존 음악 프로젝트와 WAV 렌더러가 필요합니다.');
 const duet=project.duetSingers;
 if(duet?.version!==1||!duet.lead?.trackId||!duet.harmony?.trackId||
  duet.lead.trackId===duet.harmony.trackId||
  !duet.lead.characterId||!duet.harmony.characterId||
  duet.lead.characterId===duet.harmony.characterId||
  !duet.lead.voiceId||!duet.harmony.voiceId||
  duet.lead.voiceId===duet.harmony.voiceId)
  throw Error('서로 다른 두 Voice·캐릭터와 실제 보컬 WAV 매핑이 필요합니다.');
 const singer=duet[role],track=project.tracks.find(t=>t?.id===singer.trackId);
 if(!track||track.type!=='vocal'||!Array.isArray(track.clips)||
  !track.clips.length||track.clips.some(c=>!c?.assetId))
  throw Error('선택한 가수의 원본 WAV가 현재 프로젝트에 없습니다.');
 if(track.singerCharacterId&&track.singerCharacterId!==singer.characterId)
  throw Error('가수 캐릭터와 원본 WAV 트랙 연결이 일치하지 않습니다.');
 const check=()=>{
  if(signal?.aborted||current()!==project)
   throw Error('듀엣 보컬 내보내기가 취소되거나 원본 프로젝트가 변경됐습니다.');
 };
 check();
 // 음소거된 가수도 파일로 내보낼 수 있으나 기존 음소거 상태는 보존한다.
 const isolated={...project,tracks:project.tracks.map(t=>({
  ...t,mute:t.id!==track.id,solo:false
 }))};
 const wav=await render(isolated,{bitDepth:16,sampleRate:44100,channels:2});
 check();
 if(!(wav instanceof Blob)||wav.size<128||!['audio/wav','audio/x-wav'].includes(wav.type))
  throw Error('기존 Windows 오디오 엔진이 실제 듀엣 보컬 WAV를 반환하지 않았습니다.');
 const info=assertUsableSingingWav(await wav.arrayBuffer(),{maxDurationSec:360});
 check();
 const name=role==='lead'?'주보컬':'화음보컬';
 const file=new File([wav],'MYVOCAL-듀엣-'+name+'-독립가창.wav',{type:'audio/wav'});
 return {file,role,trackId:track.id,characterId:singer.characterId,
  voiceId:singer.voiceId,durationSec:info.durationSec,engine:'existing-offline-audio-mix'};
}
