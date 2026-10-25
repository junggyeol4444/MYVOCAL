// 원본 20·21·62항: 두 신경망 가수의 실제 WAV 트랙을 한국어로 비파괴 믹스.
// 기존 audioEngine의 트랙 음량·음소거 및 클립 스테레오 팬을 그대로 사용한다.
import {editClipPan,editClipLevel,editClipTiming,editClipFadeCurve,clipWindow} from './clipTiming.js';
const ROLE={주보컬:'lead',첫번째보컬:'lead',화음보컬:'harmony',두번째보컬:'harmony'};
const SINGER='(주보컬|첫\\s*번째\\s*보컬|화음\\s*보컬|두\\s*번째\\s*보컬)';
const VOLUME=new RegExp('^'+SINGER+'(?:의)?\\s*(?:음량|볼륨)(?:을|를)?\\s*(\\d{1,3})\\s*%(?:로)?\\s*(?:설정해\\s*줘|맞춰\\s*줘|설정해\\s*주세요)$','u');
const MUTE=new RegExp('^'+SINGER+'(?:을|를)?\\s*(음소거\\s*해제|음소거|소리\\s*켜)\\s*(?:해\\s*줘|해\\s*주세요|줘|주세요)$','u');
const PAN=new RegExp('^'+SINGER+'(?:의)?\\s*좌우\\s*위치(?:를|을)?\\s*(-?\\d{1,3})\\s*%(?:로)?\\s*(?:설정해\\s*줘|맞춰\\s*줘|설정해\\s*주세요)$','u');

// 원본 #20·#21·#62: 두 실제 가창 WAV의 독립 클립 비파괴 편집.
// PCM·보컬 모델·사용자 원본은 변경하지 않고 기존 오디오 엔진 메타데이터만 변경한다.
const CLIP_MUTE=new RegExp('^'+SINGER+'(?:의)?\\s*(?:WAV\\s*)?클립\\s*(음소거\\s*해제|음소거|소리\\s*켜)\\s*(?:해\\s*줘|해\\s*주세요|줘|주세요)$','u');
const CLIP_CURVE=new RegExp('^'+SINGER+'(?:의)?\\s*(?:WAV\\s*)?클립\\s*(페이드인|페이드아웃)\\s*곡선(?:을|를)?\\s*(선형|부드럽게|동일\\s*파워)(?:으로|로)?\\s*(?:설정해\\s*줘|바꿔\\s*줘|설정해\\s*주세요|바꿔\\s*주세요)$','u');
const CLIP_EDIT=new RegExp('^'+SINGER+'(?:의)?\\s*(?:WAV\\s*)?클립\\s*(음량|페이드인|페이드아웃|좌우\\s*위치|시작|재생\\s*길이)\\s*(-?\\d{1,3}(?:\\.\\d{1,3})?)\\s*(%|초)\\s*(?:로\\s*)?(설정해\\s*줘|맞춰\\s*줘|잘라\\s*줘|설정해\\s*주세요)$','u');

export function applyDuetVocalNaturalEdit(project,command){
 if(typeof command!=='string')return null;
 const text=command.trim();
 const volume=VOLUME.exec(text),mute=MUTE.exec(text),pan=PAN.exec(text);
 const clipMute=CLIP_MUTE.exec(text),clipCurve=CLIP_CURVE.exec(text),clipEdit=CLIP_EDIT.exec(text);
 if(!volume&&!mute&&!pan&&!clipMute&&!clipCurve&&!clipEdit)return null;
 const match=volume||mute||pan||clipMute||clipCurve||clipEdit;
 const role=ROLE[match[1].replace(/\s+/gu,'')];
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
 }else if(pan){
  const value=Number(pan[2]);
  if(!Number.isSafeInteger(value)||value< -100||value>100)
   throw Error('듀엣 보컬 좌우 위치는 -100~100%로 지정하세요.');
  if(track.clips.length>128)throw Error('한 번에 변경할 보컬 클립은 최대 128개입니다.');
  changed={...track,clips:track.clips.map(c=>editClipPan(c,value))};
  description='좌우 위치 '+value+'%';
 }else{
  if(track.clips.length!==1)throw Error('가수별 WAV 클립이 여러 개입니다. 편집할 클립을 하나로 선택하세요.');
  const original=track.clips[0];
  if(!Number.isFinite(original.durationSec)||original.durationSec<=0)
   throw Error('실제 보컬 WAV의 원본 재생 길이가 없습니다.');
  let edited,label;
  if(clipMute){
   const muted=!/해제|켜/u.test(clipMute[2]);
   edited=editClipLevel(original,'clipMuted',muted);
   label=muted?'클립 음소거':'클립 음소거 해제';
  }else if(clipCurve){
   const curve={선형:'linear',부드럽게:'smooth',동일파워:'equalPower'}[clipCurve[3].replace(/\s+/gu,'')];
   edited=editClipFadeCurve(original,clipCurve[2]==='페이드인'?'in':'out',curve);
   label='클립 '+clipCurve[2]+' 곡선 '+clipCurve[3];
  }else{
   const field=clipEdit[2].replace(/\s+/gu,''),value=Number(clipEdit[3]);
   const unit=clipEdit[4],verb=clipEdit[5].replace(/\s+/gu,'');
   if(!Number.isFinite(value))throw Error('보컬 클립 편집 값이 올바르지 않습니다.');
   if((field==='음량'||field==='좌우위치')!==(unit==='%'))
    throw Error('보컬 클립 음량·좌우 위치는 %, 시간 편집은 초 단위로 지정하세요.');
   if((field==='시작')!==(verb==='잘라줘'))
    throw Error('시작 부분만 잘라 줘 명령을 사용하고 다른 항목은 설정해 줘를 사용하세요.');
   if(field==='음량')edited=editClipLevel(original,'gainPercent',value);
   else if(field==='좌우위치')edited=editClipPan(original,value);
   else if(field==='페이드인'||field==='페이드아웃'){
    if(value<0||value>clipWindow(original,Number(project.bpm)).durationSec)
     throw Error('페이드 길이는 보컬 WAV의 실제 재생 구간 안쪽이어야 합니다.');
    edited=editClipTiming(original,field==='페이드인'?'fadeInSec':'fadeOutSec',value);
   }else if(field==='시작')edited=editClipTiming(original,'sourceOffsetSec',value);
   else if(field==='재생길이')edited=editClipTiming(original,'playDurationSec',value);
   else throw Error('지원하지 않는 보컬 클립 편집 항목입니다.');
   label='클립 '+field+' '+value+unit;
  }
  changed={...track,clips:[edited]};
  description=label;
 }
 if(JSON.stringify(changed)===JSON.stringify(track))
  throw Error('해당 가수의 보컬은 이미 지정한 재생 설정입니다.');
 return {project:{...project,tracks:project.tracks.map(t=>t.id===track.id?changed:t)},
  kind:'duet-neural-vocal-mix-20-21-62',changed:1,
  response:(role==='lead'?'주보컬':'화음 보컬')+' 실제 신경망 WAV '+description+
   '를 기존 음악 재생·최종 WAV 믹스에 적용했습니다. 원본 보컬·캐릭터·자산은 보존됩니다.'};
}
