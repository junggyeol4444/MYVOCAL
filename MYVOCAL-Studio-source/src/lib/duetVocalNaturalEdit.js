// 원본 20·21·62항: 두 신경망 가수의 실제 WAV 트랙을 한국어로 비파괴 믹스.
// 기존 audioEngine의 트랙 음량·음소거 및 클립 스테레오 팬을 그대로 사용한다.
import {editClipPan} from './clipTiming.js';
const ROLE={주보컬:'lead',첫번째보컬:'lead',화음보컬:'harmony',두번째보컬:'harmony'};
const SINGER='(주보컬|첫\\s*번째\\s*보컬|화음\\s*보컬|두\\s*번째\\s*보컬)';
const VOLUME=new RegExp('^'+SINGER+'(?:의)?\\s*(?:음량|볼륨)(?:을|를)?\\s*(\\d{1,3})\\s*%(?:로)?\\s*(?:설정해\\s*줘|맞춰\\s*줘|설정해\\s*주세요)$','u');
const MUTE=new RegExp('^'+SINGER+'(?:을|를)?\\s*(음소거\\s*해제|음소거|소리\\s*켜)\\s*(?:해\\s*줘|해\\s*주세요|줘|주세요)$','u');
const PAN=new RegExp('^'+SINGER+'(?:의)?\\s*좌우\\s*위치(?:를|을)?\\s*(-?\\d{1,3})\\s*%(?:로)?\\s*(?:설정해\\s*줘|맞춰\\s*줘|설정해\\s*주세요)$','u');

export function applyDuetVocalNaturalEdit(project,command){
 if(typeof command!=='string')return null;
 const volume=VOLUME.exec(command),mute=MUTE.exec(command),pan=PAN.exec(command);
 if(!volume&&!mute&&!pan)return null;
 const match=volume||mute||pan,role=ROLE[match[1].replace(/\s+/gu,'')];
 const duet=project?.duetSingers;
 if(duet?.version!==1||!duet.lead?.trackId||!duet.harmony?.trackId||
  duet.lead.trackId===duet.harmony.trackId||
  !duet.lead.characterId||!duet.harmony.characterId||
  duet.lead.characterId===duet.harmony.characterId||
  !duet.lead.voiceId||!duet.harmony.voiceId||
  duet.lead.voiceId===duet.harmony.voiceId)
  throw Error('서로 다른 두 Voice·캐릭터와 실제 독립 보컬 WAV 연결이 필요합니다.');
 const singer=duet[role],track=project.tracks.find(t=>t?.id===singer.trackId);
 if(!track||track.type!=='vocal'||!Array.isArray(track.clips)||
  !track.clips.length||track.clips.some(c=>!c?.assetId))
  throw Error('선택한 가수의 실제 저장된 보컬 WAV 클립을 찾지 못했습니다.');
 if(track.singerCharacterId&&track.singerCharacterId!==singer.characterId)
  throw Error('가수와 원본 보컬 트랙의 캐릭터 연결이 일치하지 않습니다.');
 let changed,description;
 if(volume){
  const value=Number(volume[2]);
  if(!Number.isSafeInteger(value)||value<0||value>100)
   throw Error('듀엣 보컬 음량은 0~100%로 지정하세요.');
  changed={...track,volume:value};description='음량 '+value+'%';
 }else if(mute){
  const value=!/해제|켜/u.test(mute[2]);
  changed={...track,mute:value,solo:value?false:track.solo};
  description=value?'음소거':'음소거 해제';
 }else{
  const value=Number(pan[2]);
  if(!Number.isSafeInteger(value)||value< -100||value>100)
   throw Error('듀엣 보컬 좌우 위치는 -100~100%로 지정하세요.');
  if(track.clips.length>128)throw Error('한 번에 변경할 보컬 클립은 최대 128개입니다.');
  changed={...track,clips:track.clips.map(c=>editClipPan(c,value))};
  description='좌우 위치 '+value+'%';
 }
 if(JSON.stringify(changed)===JSON.stringify(track))
  throw Error('해당 가수의 보컬은 이미 지정한 재생 설정입니다.');
 return {project:{...project,tracks:project.tracks.map(t=>t.id===track.id?changed:t)},
  kind:'duet-neural-vocal-mix-20-21-62',changed:1,
  response:(role==='lead'?'주보컬':'화음 보컬')+' 실제 신경망 WAV '+description+
   '를 기존 음악 재생·최종 WAV 믹스에 적용했습니다. 원본 보컬·캐릭터·자산은 보존됩니다.'};
}
