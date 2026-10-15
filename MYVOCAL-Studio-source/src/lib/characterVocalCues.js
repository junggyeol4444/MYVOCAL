// Step67: locally authored vocal performance cue sheets for character/MV planning.
// No waveform inspection, model inference, audio rendering, automatic lip sync, or network I/O.
export const VOCAL_CUE_LIMIT=96;
export const VOCAL_PARTS=['lead','harmony','adlib','spoken'];
export const VOCAL_CUE_IMPORT_MAX_BYTES=512*1024;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const ms=v=>{
 if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>3600||Math.abs(v*1000-Math.round(v*1000))>1e-7)throw Error('큐 시간은 0~3600초 범위의 밀리초 단위여야 합니다.');
 return Math.round(v*1000);
};
const text=(v,n)=>{
 if(typeof v!=='string'||v.length>n||/[\u0000-\u001f\u007f]/.test(v))throw Error(`큐 문자열 형식이 올바르지 않습니다 (최대 ${n}자).`);
 return v.trim();
};
const requireProfile=p=>{
 if(!plain(p)||!text(p.id||'',120))throw Error('캐릭터 프로필 ID가 필요합니다.');
 if(!Array.isArray(p.shots||[])||!Array.isArray(p.vocalCues||[])||(p.vocalCues||[]).length>VOCAL_CUE_LIMIT)throw Error('보컬 큐 목록 형식 또는 최대 96개 제한을 확인하세요.');
};
const normalized=(profile,raw)=>{
 if(!plain(raw)||Object.keys(raw).some(k=>!['id','shotId','startSec','endSec','part','lyric','note'].includes(k)))throw Error('보컬 큐에 정의되지 않은 필드가 있습니다.');
 const id=text(raw.id||'',120),shotId=text(raw.shotId||'',120),part=text(raw.part||'',30);
 if(!id||!shotId||!VOCAL_PARTS.includes(part))throw Error('큐 ID·컷 ID·보컬 역할을 확인하세요.');
 const start=ms(raw.startSec),end=ms(raw.endSec);
 if(start>=end)throw Error('큐 종료 시간은 시작 시간보다 커야 합니다.');
 const shot=(profile.shots||[]).find(s=>s.id===shotId);
 if(!shot)throw Error('연결된 캐릭터 컷을 찾지 못했습니다.');
 if(start<ms(shot.startSec)||end>ms(shot.endSec))throw Error('보컬 큐는 연결된 컷 시간 안에 있어야 합니다.');
 return {id,shotId,startSec:start/1000,endSec:end/1000,part,lyric:text(raw.lyric||'',240),note:text(raw.note||'',500)};
};
function checkOverlap(cues,cue){
 if(cues.some(x=>x.id===cue.id))throw Error('보컬 큐 ID가 중복됩니다.');
 if(cues.some(x=>ms(x.startSec)<ms(cue.endSec)&&ms(cue.startSec)<ms(x.endSec)))throw Error('같은 캐릭터의 보컬 큐 시간이 겹칩니다.');
}
export function addCharacterVocalCue(profile,draft){
 requireProfile(profile);const cues=profile.vocalCues||[];
 if(cues.length>=VOCAL_CUE_LIMIT)throw Error('보컬 큐는 캐릭터당 최대 96개입니다.');
 const cue=normalized(profile,draft);checkOverlap(cues,cue);
 return {...profile,vocalCues:[...cues,cue].sort((a,b)=>a.startSec-b.startSec),updatedAt:new Date().toISOString()};
}
export function updateCharacterVocalCue(profile,id,changes){
 requireProfile(profile);const prior=(profile.vocalCues||[]).find(x=>x.id===id);
 if(!prior)throw Error('수정할 보컬 큐를 찾지 못했습니다.');
 if(!plain(changes)||Object.keys(changes).some(k=>!['shotId','startSec','endSec','part','lyric','note'].includes(k)))throw Error('보컬 큐 수정 필드가 올바르지 않습니다.');
 const cue=normalized(profile,{...prior,...changes});
 const remainder=profile.vocalCues.filter(x=>x.id!==id);checkOverlap(remainder,cue);
 return {...profile,vocalCues:[...remainder,cue].sort((a,b)=>a.startSec-b.startSec),updatedAt:new Date().toISOString()};
}
export function deleteCharacterVocalCue(profile,id){
 requireProfile(profile);const old=profile.vocalCues||[];
 if(!old.some(x=>x.id===id))throw Error('삭제할 보컬 큐를 찾지 못했습니다.');
 return {...profile,vocalCues:old.filter(x=>x.id!==id),updatedAt:new Date().toISOString()};
}
export function reviewCharacterVocalCue(profile,cue){
 requireProfile(profile);
 if(!plain(cue))return {reviewRequired:true,missingShot:true,outsideShot:false};
 const shot=(profile.shots||[]).find(s=>s.id===cue.shotId);
 if(!shot)return {reviewRequired:true,missingShot:true,outsideShot:false};
 let outsideShot=true;
 try{outsideShot=ms(cue.startSec)<ms(shot.startSec)||ms(cue.endSec)>ms(shot.endSec)||ms(cue.startSec)>=ms(cue.endSec);}catch{}
 return {reviewRequired:outsideShot,missingShot:false,outsideShot};
}
export function buildCharacterVocalTimeline(characters){
 if(!Array.isArray(characters)||characters.length>64)throw Error('보컬 큐 타임라인 캐릭터는 최대 64명입니다.');
 const ids=new Set(),all=[];
 for(const profile of characters){
  requireProfile(profile);
  if(ids.has(profile.id))throw Error('캐릭터 ID가 중복됩니다.');ids.add(profile.id);
  const cues=profile.vocalCues||[],cueIds=new Set();
  for(const cue of cues){
   if(!plain(cue)||!text(cue.id||'',120)||cueIds.has(cue.id)||!VOCAL_PARTS.includes(cue.part))throw Error('보컬 큐 ID 또는 역할이 유효하지 않거나 중복됩니다.');
   cueIds.add(cue.id);
   const start=ms(cue.startSec),end=ms(cue.endSec);
   if(start>=end)throw Error('보컬 큐 종료 시간은 시작보다 커야 합니다.');
   const review=reviewCharacterVocalCue(profile,cue);
   all.push({characterId:profile.id,characterName:profile.name||profile.id,cueId:cue.id,shotId:cue.shotId,
    part:cue.part,lyric:text(cue.lyric||'',240),note:text(cue.note||'',500),startMs:start,endMs:end,...review});
  }
  const sorted=all.filter(c=>c.characterId===profile.id).sort((a,b)=>a.startMs-b.startMs);
  for(let i=1;i<sorted.length;i++)if(sorted[i].startMs<sorted[i-1].endMs)throw Error('같은 캐릭터의 보컬 큐 시간이 겹칩니다.');
 }
 // Sweep only changed cue boundaries; do not scan every cue for every millisecond segment.
 const endMs=all.reduce((v,c)=>Math.max(v,c.endMs),0),segments=[];
 const changes=new Map();
 for(const cue of all){
  if(!changes.has(cue.startMs))changes.set(cue.startMs,{starts:[],ends:[]});
  if(!changes.has(cue.endMs))changes.set(cue.endMs,{starts:[],ends:[]});
  changes.get(cue.startMs).starts.push(cue);
  changes.get(cue.endMs).ends.push(cue);
 }
 const boundaries=[...new Set([0,endMs,...changes.keys()])].sort((a,b)=>a-b),active=new Map();
 for(let i=0;i<boundaries.length-1;i++){
  const start=boundaries[i],end=boundaries[i+1],change=changes.get(start);
  // Half-open [start,end): a cue ending at the boundary is no longer active.
  for(const cue of change?.ends||[])active.delete(`${cue.characterId}\u0000${cue.cueId}`);
  for(const cue of change?.starts||[])active.set(`${cue.characterId}\u0000${cue.cueId}`,cue);
  if(!active.size)continue;
  const cast=[...active.values()].sort((a,b)=>a.characterId.localeCompare(b.characterId)).map(({startMs,endMs,...fields})=>({...fields,startSec:startMs/1000,endSec:endMs/1000}));
  segments.push({startSec:start/1000,endSec:end/1000,simultaneous:cast.length>1,
   reviewRequired:cast.some(c=>c.reviewRequired),cast});
 }
 return {durationSec:endMs/1000,participants:new Set(all.map(c=>c.characterId)).size,cueCount:all.length,
  simultaneousSegments:segments.filter(s=>s.simultaneous).length,reviewRequiredCues:all.filter(c=>c.reviewRequired).length,
  segments,automatedLipSync:false,renderedAudio:false,renderedVideo:false};
}
export function exportCharacterVocalTimeline(characters){
 return {format:'myvocal-manual-vocal-cue-timeline',version:1,exportedAt:new Date().toISOString(),
  source:'manually-authored-vocal-cues',...buildCharacterVocalTimeline(characters),
  note:'수동 시간표와 가사 메모만 포함합니다. 음원·영상·이미지·목소리 데이터는 포함하지 않으며 립싱크·노래 생성 결과가 아닙니다.'};
}

// Step68: per-character backup and atomic restore of manually authored cues.
// This is deliberately a different schema from the Step67 aggregate timeline:
// segmented duet timeline entries cannot be safely re-imported as source cues.
export const CHARACTER_VOCAL_PACK_FORMAT='myvocal-character-vocal-cues';
export function exportCharacterVocalCuePack(profile){
 requireProfile(profile);
 const cues=(profile.vocalCues||[]).map(cue=>{
  if(!plain(cue)||Object.keys(cue).some(k=>!['id','shotId','startSec','endSec','part','lyric','note'].includes(k)))throw Error('보컬 큐에 허용되지 않은 속성이 있습니다.');
  // Preserve the user's existing timing/shot references, including ones that
  // may now need review after a shot edit, without embedding media contents.
  const id=text(cue.id||'',120),shotId=text(cue.shotId||'',120),part=text(cue.part||'',30);
  if(!id||!shotId||!VOCAL_PARTS.includes(part))throw Error('보컬 큐 ID 또는 역할이 올바르지 않습니다.');
  const start=ms(cue.startSec),end=ms(cue.endSec);
  if(start>=end)throw Error('보컬 큐 시작·종료 시간이 올바르지 않습니다.');
  return {id,shotId,startSec:start/1000,endSec:end/1000,part,lyric:text(cue.lyric||'',240),note:text(cue.note||'',500)};
 });
 const usedIds=new Set();
 for(const cue of cues){if(usedIds.has(cue.id))throw Error('보컬 큐 ID가 중복됩니다.');usedIds.add(cue.id);}
 for(let i=1;i<cues.length;i++)for(let j=0;j<i;j++)if(ms(cues[j].startSec)<ms(cues[i].endSec)&&ms(cues[i].startSec)<ms(cues[j].endSec))throw Error('보컬 큐 시간이 겹칩니다.');
 return {format:CHARACTER_VOCAL_PACK_FORMAT,version:1,characterId:profile.id,characterName:text(profile.name||'',120),
  exportedAt:new Date().toISOString(),cues,automatedLipSync:false,renderedAudio:false,renderedVideo:false,
  note:'사용자가 작성한 보컬 큐 메타데이터만 포함합니다. 원본 음원·영상·이미지·목소리 데이터는 포함하지 않습니다.'};
}
const isIsoDate=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(v)&&!Number.isNaN(Date.parse(v));
export function importCharacterVocalCuePack(profile,json){
 requireProfile(profile);
 if(typeof json!=='string'||!json.length||new TextEncoder().encode(json).length>VOCAL_CUE_IMPORT_MAX_BYTES)throw Error('보컬 큐 JSON은 최대 512KB여야 합니다.');
 let pack;
 try{pack=JSON.parse(json);}catch{throw Error('보컬 큐 JSON을 읽을 수 없습니다.');}
 if(!plain(pack)||pack.format!==CHARACTER_VOCAL_PACK_FORMAT||pack.version!==1)throw Error('지원하지 않는 보컬 큐 JSON 형식 또는 버전입니다.');
 const fields=['format','version','characterId','characterName','exportedAt','cues','automatedLipSync','renderedAudio','renderedVideo','note'];
 if(Object.keys(pack).some(k=>!fields.includes(k)))throw Error('보컬 큐 JSON에 허용되지 않은 속성이 있습니다.');
 if(pack.characterId!==profile.id)throw Error('다른 캐릭터의 보컬 큐는 가져올 수 없습니다.');
 if(typeof pack.characterName!=='string'||pack.characterName.length>120||!isIsoDate(pack.exportedAt)||
    typeof pack.note!=='string'||pack.note.length>500||pack.automatedLipSync!==false||pack.renderedAudio!==false||pack.renderedVideo!==false)
  throw Error('보컬 큐 JSON 내보내기 정보가 올바르지 않습니다.');
 const original=profile.vocalCues||[];
 if(!Array.isArray(pack.cues)||original.length+pack.cues.length>VOCAL_CUE_LIMIT)throw Error('보컬 큐는 캐릭터당 최대 96개입니다.');
 // Validate *all* entries before constructing a replacement object. The
 // current character and its shot/asset/look references remain untouched.
 const pending=[];
 for(const raw of pack.cues){
  const cue=normalized(profile,raw); // checks shot existence, role, times and unknown media fields
  checkOverlap([...original,...pending],cue); // checks ID and half-open intervals
  pending.push(cue);
 }
 return {...profile,vocalCues:[...original,...pending].sort((a,b)=>a.startSec-b.startSec),updatedAt:new Date().toISOString()};
}
