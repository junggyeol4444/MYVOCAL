// Step71: offline storyboard continuity checks and editor interchange.
// Metadata only. Does not generate, embed, copy or upload any video/audio/media.
export const MV_STORYBOARD_FORMAT = 'myvocal-mv-storyboard';
export const MV_SCENE_LIMIT = 256;
export const MV_MAX_DURATION_SEC = 7200;
const allowed = ['id','start','end','title','description','characterId','location','outfit','expression','action','camera','lighting','imageAssetId','imageGeneration','videoClipAssetId','videoGeneration','personMv','characterMv'];
const textual = ['title','description','characterId','location','outfit','expression','action','camera','lighting'];
const safeText = (v,max=500) => typeof v==='string' && v.length<=max && !/[\u0000-\u001f\u007f]/.test(v);
const precision = n => Math.abs(n*1000-Math.round(n*1000))<1e-7;
const roundMs = n => Math.round(n*1000)/1000;
function checkList(scenes) {
 if(!Array.isArray(scenes)) throw Error('장면 목록은 배열이어야 합니다.');
 if(scenes.length > MV_SCENE_LIMIT) throw Error(`장면은 최대 ${MV_SCENE_LIMIT}개까지 지원합니다.`);
 return scenes;
}
// Does not mutate user scene data; detailed errors remain visible in the UI.
export function auditMvStoryboard(project, characters=[]) {
 if(!project || typeof project!=='object' || Array.isArray(project)) throw Error('프로젝트 형식이 올바르지 않습니다.');
 const scenes=checkList(project.scenes||[]);
 const issues=[], rows=[], ids=new Set();
 const characterIds = new Set(Array.isArray(characters)?characters.filter(c=>c && typeof c.id==='string').map(c=>c.id):[]);
 for(let i=0;i<scenes.length;i++) {
  const s=scenes[i];const prefix={index:i,sceneId:typeof s?.id==='string'?s.id:''};
  const error=(code,message)=>issues.push({...prefix,severity:'error',code,message});
  const warn=(code,message)=>issues.push({...prefix,severity:'warning',code,message});
  if(!s||typeof s!=='object'||Array.isArray(s)){error('SCENE_SHAPE','장면 데이터가 올바르지 않습니다.');continue;}
  if(Object.keys(s).some(k=>!allowed.includes(k)))error('UNSUPPORTED_FIELDS','지원하지 않는 장면 필드가 있습니다.');
  if(typeof s.id!=='string'||!s.id.trim()||s.id.length>80||/[\u0000-\u001f\u007f]/.test(s.id))error('SCENE_ID','장면 ID가 올바르지 않습니다.');
  else if(ids.has(s.id))error('DUPLICATE_ID','장면 ID가 중복됩니다.');
  else ids.add(s.id);
  for(const key of textual)if(s[key]!==undefined&&!safeText(s[key],key==='description'?2000:500))error('INVALID_TEXT',`${key} 텍스트 형식이 올바르지 않습니다.`);
  if(typeof s.title!=='string'||!s.title.trim())warn('UNTITLED','장면 제목이 비어 있습니다.');
  if(s.characterId && !characterIds.has(s.characterId))warn('UNKNOWN_CHARACTER','연결된 캐릭터를 찾을 수 없습니다.');
  const from=s.start,to=s.end;
  if(typeof from!=='number'||typeof to!=='number'||!Number.isFinite(from)||!Number.isFinite(to)||from<0||to>MV_MAX_DURATION_SEC||to<=from||!precision(from)||!precision(to)){
   error('INVALID_TIME','시간은 0~7200초 범위, 밀리초 단위여야 하고 종료가 시작보다 커야 합니다.');continue;
  }
  rows.push({index:i,id:s.id,start:from,end:to,duration:roundMs(to-from),title:s.title||'',characterId:s.characterId||''});
 }
 rows.sort((a,b)=>a.start-b.start||a.end-b.end||a.index-b.index);
 let lastEnd=0, gapSeconds=0, overlapSeconds=0, lastRow=null;
 for(const row of rows){
  if(row.start>lastEnd){const gap=roundMs(row.start-lastEnd);gapSeconds=roundMs(gapSeconds+gap);issues.push({index:row.index,sceneId:row.id,severity:'warning',code:'GAP',message:`앞 장면과 ${gap}초 공백이 있습니다.`});}
  if(row.start < lastEnd){overlapSeconds=roundMs(overlapSeconds+Math.max(0,Math.min(row.end,lastEnd)-row.start));issues.push({index:row.index,sceneId:row.id,severity:'error',code:'OVERLAP',message:`다른 장면과 시간이 겹칩니다${lastRow?' ('+lastRow.id+')':''}.`});}
  if(row.end>lastEnd){lastEnd=row.end;lastRow=row;}
 }
 if(!scenes.length)issues.push({index:-1,sceneId:'',severity:'warning',code:'EMPTY','message':'장면이 없습니다.'});
 return {scenes:scenes.length,validScenes:rows.length,durationSec:roundMs(lastEnd),gapSeconds,overlapSeconds,
  errors:issues.filter(i=>i.severity==='error').length,warnings:issues.filter(i=>i.severity==='warning').length,
  renderReady:false,issues,rows};
}
export function exportMvStoryboard(project,characters=[]) {
 const audit=auditMvStoryboard(project,characters);
 if(audit.errors)throw Error(`장면 검증 오류 ${audit.errors}개를 수정한 뒤 내보내세요.`);
 if(!audit.scenes)throw Error('내보낼 장면이 없습니다.');
 if(typeof project.id!=='string'||!project.id.trim())throw Error('프로젝트 ID가 없습니다.');
 const scenes=audit.rows.map(row=>{
  const src=project.scenes[row.index];return {id:src.id,start:src.start,end:src.end,title:src.title||'',description:src.description||'',characterId:src.characterId||'',location:src.location||'',outfit:src.outfit||'',expression:src.expression||'',action:src.action||'',camera:src.camera||'',lighting:src.lighting||''};
 });
 return {format:MV_STORYBOARD_FORMAT,version:1,kind:'manual-storyboard-metadata-only',projectId:project.id,
  bpm:typeof project.bpm==='number'&&Number.isFinite(project.bpm)?project.bpm:null,
  scenes,summary:{sceneCount:scenes.length,durationSec:audit.durationSec,gapSeconds:audit.gapSeconds,warnings:audit.warnings},
  capabilities:{renderedVideo:false,aiVideoGeneration:false,automaticLipSync:false}};
}
// Editorial cut list, deliberately not an EDL claiming video sources exist.
const quoteCsv=value=>{
 let s=String(value??'');
 // Prevent formula interpretation in Excel when user-entered text begins with a formula prefix.
 if(/^[\s\t\r\n]*[=+@-]/.test(s))s="'"+s;
 return '"'+s.replaceAll('"','""')+'"';
};
export function exportMvCutCsv(project,characters=[]) {
 const sheet=exportMvStoryboard(project,characters);
 const columns=['scene_id','start_sec','end_sec','duration_sec','title','character_id','camera','description'];
 const lines=[columns.join(',')];
 for(const s of sheet.scenes)lines.push([s.id,s.start,s.end,roundMs(s.end-s.start),s.title,s.characterId,s.camera,s.description].map(quoteCsv).join(','));
 return '\uFEFF'+lines.join('\r\n')+'\r\n';
}
export function snapMvSceneToBeat(project, sceneId, grid='beat') {
 if(grid!=='beat'&&grid!=='bar')throw Error('박자 맞춤 단위가 올바르지 않습니다.');
 const bpm=project?.bpm;
 if(typeof bpm!=='number'||!Number.isFinite(bpm)||bpm<20||bpm>400)throw Error('BPM은 20~400이어야 합니다.');
 const scenes=checkList(project.scenes);
 const selected=scenes.find(s=>s?.id===sceneId);
 if(!selected)throw Error('장면을 찾을 수 없습니다.');
 if(!Number.isFinite(selected.start)||!Number.isFinite(selected.end)||selected.end<=selected.start)throw Error('장면 시간부터 수정하세요.');
 const step=60/bpm*(grid==='bar'?4:1);
 const start=roundMs(Math.max(0,Math.round(selected.start/step)*step));
 const end=roundMs(Math.round(selected.end/step)*step);
 if(end<=start)throw Error('박자 맞춤 시 장면 길이가 0이 됩니다. 시간을 넓혀 주세요.');
 const result={...project,scenes:scenes.map(s=>s===selected?{...s,start,end}:s)};
 if(auditMvStoryboard(result).issues.some(i=>i.severity==='error'&&['INVALID_TIME','OVERLAP','DUPLICATE_ID'].includes(i.code)))throw Error('박자 맞춤으로 시간 충돌이 생깁니다.');
 return result;
}
