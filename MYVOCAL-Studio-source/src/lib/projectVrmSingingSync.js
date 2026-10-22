// MYVOCAL 원본 33·35·29·55항: 기존 한국어 MIDI/음소 가창 프로젝트를
// 등록 VRM/GLB 공연의 실제 Morph 립싱크 시간표로 연결한다.
// 학습/추론 성공을 대신하지 않으며 캐릭터·프로젝트 원본은 수정하지 않는다.
import {automaticSingingVisemes} from './autoMvPhonemeLip.js';
import {validateLipSync,phonemeViseme} from './characterLipSync.js';

const toPhoneme={A:'a',I:'i',U:'u',E:'e',O:'o',M:'m',F:'f',sil:'sil'};
export function resolveProjectVrmLipSync(project,character){
 if(!project?.id||!character?.id||!['owned','self','licensed'].includes(character.rights)||
    (character.rights==='licensed'&&!String(character.rightsNote||'').trim()))
  return null;
 // 사용자가 STEP85에서 검토하고 저장한 시간표를 최우선으로 보존한다.
 if(character.lipSync?.cues?.length){
  validateLipSync(character.lipSync);
  return {lipSync:character.lipSync,source:'STEP85 수동 검토 립싱크',durationSec:Math.min(360,
    Math.ceil(character.lipSync.cues.at(-1).endMs/1000))};
 }
 const hints=automaticSingingVisemes(project,[character]);
 if(!hints||hints.characterId!==character.id||!hints.cues?.length)return null;
 let end=0;
 const cues=[];
 for(const c of hints.cues){
  const phoneme=toPhoneme[c.viseme];
  if(!phoneme||phonemeViseme(phoneme)!==c.viseme||
    !Number.isInteger(c.startMs)||!Number.isInteger(c.endMs)||c.startMs<end||
    c.endMs<=c.startMs||c.endMs>360000||
    typeof c.lyric!=='string'||c.lyric.length>120)
   throw Error('현재 곡의 한국어 음소 싱크가 겹치거나 6분 범위를 벗어납니다.');
  cues.push({startMs:c.startMs,endMs:c.endMs,phoneme,viseme:c.viseme,lyric:c.lyric});
  end=c.endMs;
 }
 const lipSync=validateLipSync({version:1,cues});
 return {lipSync,source:'현재 프로젝트 한국어 Singing/MIDI 음소 자동 연결',
  durationSec:Math.max(2,Math.ceil(end/1000))};
}
export function linkedVrmSingingProjects(character,projects=[]){
 if(!character?.id||!Array.isArray(projects))return [];
 return projects.filter(project=>{
  if(project?.characterId!==character.id||!Array.isArray(project.scenes))return false;
  try{return !!resolveProjectVrmLipSync(project,character);}catch{return false;}
 });
}
