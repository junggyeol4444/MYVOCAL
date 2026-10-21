// 기존 MYVOCAL 음소 시간표와, 사용자가 검토한 2D 입 영역을 MV 립싱크에 직접 연결.
// 음성 인식/얼굴 탐지가 아니다. 두 명 이상 동시 출연 또는 다른 이미지 구도는 자동 추정을 거부.
import {phonemeViseme} from './characterLipSync.js';
import {isAlignmentStale} from './lyricAlignment.js';
import {isPhonemePlanStale,validatePhonemePlan} from './phonemePlan.js';
import {validateLayerPlan} from './characterLayers.js';

export function singleAuthorizedMvSinger(project,characters=[]){
 if(!project?.id||!Array.isArray(project.scenes)||!project.scenes.length)return null;
 const ids=new Set(project.scenes.map(s=>s.characterId||project.characterId).filter(Boolean));
 if(ids.size!==1)return null;
 const id=[...ids][0],candidate=characters.find(c=>c.id===id);
 if(!candidate||!['self','owned','licensed'].includes(candidate.rights)||
  candidate.rights==='licensed'&&!String(candidate.rightsNote||'').trim())return null;
 if(project.scenes.some(s=>s.characterId&&s.characterId!==id))return null;
 return candidate;
}
export function automaticSingingVisemes(project,characters=[]){
 const singer=singleAuthorizedMvSinger(project,characters);
 if(!singer||!project.vocalAlignment||!project.phonemePlan||
 isAlignmentStale(project,project.vocalAlignment)||
 isPhonemePlanStale(project.vocalAlignment,project.phonemePlan))return null;
 validatePhonemePlan(project.phonemePlan,project.vocalAlignment);
 const cues=[],lastByCue=new Map();
 for(const segment of project.phonemePlan.segments){
  const startMs=Math.round(segment.startSec*1000),endMs=Math.round(segment.endSec*1000);
  if(endMs<=startMs||startMs<0||endMs>360000)continue;
  // Onsets, vowel nuclei and closing consonants preserve their exact MIDI-derived timings.
  const previous=lastByCue.get(segment.cueIndex)||0;
  if(startMs<previous)throw Error('한국어 가창 음소 시간표에 겹치는 구간이 있습니다.');
  lastByCue.set(segment.cueIndex,endMs);
  const lyric=project.vocalAlignment.cues[segment.cueIndex-1]?.lyric||'';
  cues.push({startMs,endMs,viseme:phonemeViseme(segment.token),lyric});
 }
 cues.sort((a,b)=>a.startMs-b.startMs||a.endMs-b.endMs);
 if(!cues.length)return null;
 return {characterId:singer.id,cues,source:'existing-korean-phoneme-hints'};
}
export function reviewedCharacterMouthPlacement(project,characters=[]){
 const singer=singleAuthorizedMvSinger(project,characters);
 if(!singer||singer.kind!=='character'||singer.layerPlan?.reviewed!==true)return null;
 validateLayerPlan(singer,singer.layerPlan);
 const plan=singer.layerPlan,r=plan.parts.mouth;
 if(!r?.enabled)return null;
 const xPercent=100*(r.x+r.w/2)/plan.width;
 const yPercent=100*(r.y+r.h/2)/plan.height;
 const sizePercent=100*r.w/plan.width;
 if(![xPercent,yPercent,sizePercent].every(Number.isFinite)||
 xPercent<5||xPercent>95||yPercent<5||yPercent>95||sizePercent<2||sizePercent>18)return null;
 return {xPercent,yPercent,sizePercent,source:'user-reviewed-2d-mouth-region-approximation'};
}
