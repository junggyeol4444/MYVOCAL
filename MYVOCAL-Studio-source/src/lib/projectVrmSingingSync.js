// MYVOCAL 원본 33·35·29·55항: 기존 한국어 MIDI/음소 가창 프로젝트를
// 등록 VRM/GLB 공연의 실제 Morph 립싱크 시간표로 연결한다.
// 학습/추론 성공을 대신하지 않으며 캐릭터·프로젝트 원본은 수정하지 않는다.
import {automaticSingingVisemes} from './autoMvPhonemeLip.js';
import {createExpressionPlan,usableExpressionPlan,validateExpressionPlan} from './characterExpressionDirector.js';
import {validateLipSync,phonemeViseme} from './characterLipSync.js';
import {isAlignmentStale} from './lyricAlignment.js';
import {isPhonemePlanStale,validatePhonemePlan} from './phonemePlan.js';

const toPhoneme={A:'a',I:'i',U:'u',E:'e',O:'o',M:'m',F:'f',sil:'sil'};
function directProjectSingingVisemes(project,character){
 if((Array.isArray(project.scenes)&&project.scenes.length)||
    project.characterId!==character.id||!project.vocalAlignment||!project.phonemePlan||
    isAlignmentStale(project,project.vocalAlignment)||
    isPhonemePlanStale(project.vocalAlignment,project.phonemePlan))return null;
 validatePhonemePlan(project.phonemePlan,project.vocalAlignment);
 const cues=[];
 for(const segment of project.phonemePlan.segments){
  const startMs=Math.round(segment.startSec*1000),endMs=Math.round(segment.endSec*1000);
  if(!Number.isInteger(startMs)||!Number.isInteger(endMs)||startMs<0||
     endMs<=startMs||endMs>360000)continue;
  cues.push({startMs,endMs,viseme:phonemeViseme(segment.token),
   lyric:project.vocalAlignment.cues[segment.cueIndex-1]?.lyric||''});
 }
 cues.sort((a,b)=>a.startMs-b.startMs||a.endMs-b.endMs);
 return cues.length?{characterId:character.id,cues,source:'existing-korean-phoneme-hints'}:null;
}
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
 const hints=automaticSingingVisemes(project,[character])||directProjectSingingVisemes(project,character);
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

/**
 * 원본 66항 #29/#33/#35: 저장된 3D 캐릭터는 수정하지 않고 현재
 * 음악 프로젝트의 한국어 립싱크와 같은 시간축으로 VRM 표정을 구동한다.
 * 같은 음소에 저장된 사용자의 수동 표정은 자동 표정보다 우선한다.
 */
export function resolveProjectVrmExpression(character,lipSync){
 if(!character?.id||!lipSync?.cues?.length)return null;
 const linkedCharacter={...character,lipSync};
 try{
  const saved=usableExpressionPlan(linkedCharacter);
  if(saved)return {character:linkedCharacter,plan:saved,source:'저장된 사용자 표정'};
  const generated=createExpressionPlan(linkedCharacter);
  validateExpressionPlan(linkedCharacter,generated);
  return {character:linkedCharacter,plan:generated,source:'원곡 한국어 가사 표정'};
 }catch{return null;}
}
export function linkedVrmSingingProjects(character,projects=[]){
 if(!character?.id||!Array.isArray(projects))return [];
 return projects.filter(project=>{
  if(project?.characterId!==character.id)return false;
  try{return !!resolveProjectVrmLipSync(project,character);}catch{return false;}
 });
}
