// MYVOCAL 원본 #20·#21·#29·#35: 사용자 보컬 WAV 발성으로 동작하는
// 2D/VRM 가수별 임시 표정 계획. 본인/허가 캐릭터 원본은 수정하지 않는다.
// 신경망 감정 인식이 아닌 PCM 발성 게이트와 가사 규칙에 따른 표정 변화.
import {validateLipSync} from './characterLipSync.js';
import {createExpressionPlan,validateExpressionPlan} from './characterExpressionDirector.js';
export function stageSingerExpressionFromVocal(character,lipSync){
 if(!character?.id||!['self','owned','licensed'].includes(character.rights)||
  (character.rights==='licensed'&&!String(character.rightsNote||'').trim()))
  throw Error('보컬 무대 인물의 사용 권한을 확인하세요.');
 validateLipSync(lipSync);
 if(!lipSync.cues.length)throw Error('가창 보컬 WAV에서 실제 발성이 감지되지 않았습니다.');
 const temporary={...character,lipSync};
 const base=createExpressionPlan(temporary);
 const cues=base.cues.map(cue=>{
  const length=cue.endMs-cue.startMs;
  let sungMs=0;
  for(const c of lipSync.cues){
   if(c.startMs>=cue.endMs)break;
   if(c.endMs<=cue.startMs||c.viseme==='sil')continue;
   sungMs+=Math.max(0,Math.min(c.endMs,cue.endMs)-Math.max(c.startMs,cue.startMs));
  }
  const activity=Math.max(0,Math.min(1,sungMs/length));
  return {...cue,emotion:'auto',
   dynamics:Math.round((.2+.75*activity)*1000)/1000,
   energy:Math.round((.2+.7*activity)*1000)/1000};
 });
 const plan=validateExpressionPlan(temporary,{...base,cues});
 return {character:temporary,plan,source:'개별 가창 WAV 발성 구간·한국어 가사'};
}
