// 원본 66항 #24/#28/#33/#35/#55: 등록·검토한 2D 캐릭터 이미지의 실제
// 음악 포함 3~6분 WebM 공연. 기존 81/82 레이어·모션, 한국어 음소/립싱크,
// 87 표정·88 춤·89 연주를 동일 PCM 시간축으로 연결한다.
// 원본 사진/캐릭터·IndexedDB·기존 클립/영상은 수정하지 않는다.
import {validateAnimationSettings,drawAnimationFrame} from './characterAnimation2d.js';
import {validateLayerPlan} from './characterLayers.js';
import {validateLipSync,phonemeViseme} from './characterLipSync.js';
import {usableExpressionPlan} from './characterExpressionDirector.js';
import {usableDancePlan} from './characterDanceDirector.js';
import {usablePerformance89} from './characterPerformance89.js';
import {isAlignmentStale} from './lyricAlignment.js';
import {isPhonemePlanStale,validatePhonemePlan} from './phonemePlan.js';
import {assertUsableSingingWav} from './singingOutputValidation.js';
import {recordStageWebM} from './stage3dRecording.js';

export function fullSong2dKoreanLipSync(project,character){
 if(!project?.id||!character?.id)throw Error('2D 공연 원곡과 캐릭터 정보가 필요합니다.');
 const allowed=project.characterId===character.id||
   project.scenes?.some(s=>s.characterId===character.id);
 if(!allowed)throw Error('현재 캐릭터와 연결한 원곡 프로젝트를 선택하세요.');
 const alignment=project.vocalAlignment,phonemes=project.phonemePlan;
 if(alignment&&!isAlignmentStale(project,alignment)&&phonemes&&
    !isPhonemePlanStale(alignment,phonemes)){
  validatePhonemePlan(phonemes,alignment);
  // 음절의 핵심 모음과 입술 폐쇄음을 사용한다. 실제 신경망
  // 음성 인식/강제 정렬을 수행한 것으로 표시하지 않는다.
  const cues=phonemes.segments.filter(s=>s.kind==='nucleus'||
    s.kind==='onset'&&['ㅁ','ㅂ','ㅃ','ㅍ'].includes(s.token))
   .map(s=>{
    const startMs=Math.round(s.startSec*1000),endMs=Math.round(s.endSec*1000);
    return {startMs,endMs,phoneme:s.token,lyric:s.syllable||'',
     viseme:phonemeViseme(s.token)};
   }).filter(s=>s.endMs>s.startMs&&s.viseme!=='sil')
   .sort((a,b)=>a.startMs-b.startMs||a.endMs-b.endMs);
  if(cues.length>2000)throw Error('3~6분 노래의 한국어 입 모양 2,000개 제한을 초과했습니다. 음소를 정리하세요.');
  if(cues.length){
   const nonoverlap=[];let end=0;
   for(const cue of cues){
    const start=Math.max(cue.startMs,end);
    if(cue.endMs<=start)continue;
    nonoverlap.push({...cue,startMs:start});end=cue.endMs;
   }
   return validateLipSync({version:1,cues:nonoverlap});
  }
 }
 if(character.lipSync?.cues?.length)return validateLipSync(character.lipSync);
 throw Error('실제 한국어 가사·MIDI 음소 시간표 또는 검토해 저장한 캐릭터 립싱크가 필요합니다.');
}
export async function recordFullSong2dCharacter({
 project,character,canvas,image,settings,audioBlob,prewarmedAudioContext=null,
 signal,onProgress=()=>{},record=recordStageWebM
}={}){
 if(!project?.id||!character?.id||!canvas||typeof canvas.getContext!=='function'||
    !image||typeof record!=='function')
  throw Error('2D 전곡 공연에는 기존 MYVOCAL 프로젝트·검토한 원화·Canvas가 필요합니다.');
 if(character.kind!=='character'||!['owned','self','licensed'].includes(character.rights)||
    character.rights==='licensed'&&!String(character.rightsNote||'').trim())
  throw Error('본인 또는 허가된 2D 캐릭터만 공연에 사용할 수 있습니다.');
 validateLayerPlan(character,character.layerPlan);
 if(character.layerPlan.reviewed!==true)throw Error('원본 2D 캐릭터 입·눈·몸 영역의 사용자 검토가 필요합니다.');
 validateAnimationSettings(character,settings);
 if(image.naturalWidth!==character.layerPlan.width||
    image.naturalHeight!==character.layerPlan.height)
  throw Error('2D 원화 이미지 크기가 검토한 영역과 일치하지 않습니다.');
 if(!(audioBlob instanceof Blob)||audioBlob.type!=='audio/wav')
  throw Error('실제 원곡 Singing+반주 PCM WAV를 먼저 생성해 주세요.');
 if(signal?.aborted)throw Error('2D 캐릭터 공연 제작이 취소됐습니다.');
 const info=assertUsableSingingWav(await audioBlob.arrayBuffer(),{maxDurationSec:360});
 const duration=info.durationSec;
 if(duration<150||duration>360)throw Error('2D 전곡 공연은 실제 가창+반주 3~6분 길이가 필요합니다.');
 if(!Array.isArray(project.tracks)||!project.tracks.some(t=>t.type==='vocal'&&!t.mute&&t.clips?.length))
  throw Error('현재 음악 프로젝트에 실제 음성 WAV 보컬 트랙이 필요합니다.');
 const lipSync=fullSong2dKoreanLipSync(project,character);
 if(lipSync.cues.some(c=>c.endMs>duration*1000+65))
  throw Error('한국어 원곡 입 모양이 실제 완성 음악보다 깁니다.');
 const expressionPlan=usableExpressionPlan(character),dancePlan=usableDancePlan(character),
   performancePlan=usablePerformance89(character);
 const config={...settings,durationSec:duration},ctx=canvas.getContext('2d');
 if(!ctx)throw Error('현재 Windows WebView2가 2D 공연 Canvas를 지원하지 않습니다.');
 const draw=time=>drawAnimationFrame(ctx,image,character.layerPlan,config,
  Math.min(time,duration),canvas.width,canvas.height,lipSync,expressionPlan,
  character,dancePlan,performancePlan);
 const webm=await record({canvas,duration,fps:settings.fps,draw,onProgress,signal,audioBlob,prewarmedAudioContext});
 if(signal?.aborted)throw Error('2D 공연 녹화 완료 전 취소됐습니다.');
 if(!(webm instanceof Blob)||webm.size<1000||webm.type!=='video/webm')
  throw Error('실제 음악·2D 한국어 립싱크 공연 WebM 파일이 생성되지 않았습니다.');
 return {file:new File([webm],'MYVOCAL-2D-한국어가창-전체공연.webm',{type:'video/webm'}),
  durationSec:duration,phonemeCues:lipSync.cues.length,audioIncluded:true,
  renderSource:'real-2d-layer-motion-and-score-phonemes'};
}
