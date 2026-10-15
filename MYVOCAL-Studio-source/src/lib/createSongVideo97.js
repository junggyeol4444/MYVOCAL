// STEP97: an executable local orchestration of existing composer/storyboard pieces.
// Selected AI-only tasks remain blocked; they are not marked "generated".
import {generateOfflineDraft,applyComposition} from './composer.js';
const ORDER=['lyrics','composition','arrangement','singing','mix','master','storyboard','musicVideo'];
const AI_ONLY=new Set(['singing','musicVideo']);
export const CREATE97_ORDER=Object.freeze(ORDER);
const snap=p=>JSON.stringify({id:p.id,title:p.title,prompt:p.prompt,tracks:p.tracks,scenes:p.scenes,lyrics:p.lyrics,sections:p.sections,chords:p.chords,bpm:p.bpm});
export function planCreateSongVideo97(project,selected={}){
 if(!project?.id||!Array.isArray(project.tracks)||!Array.isArray(project.scenes))throw Error('프로젝트가 유효하지 않습니다.');
 const options=Object.fromEntries(ORDER.map(k=>[k,selected[k]===true]));
 const hasWork=Object.values(options).some(Boolean);if(!hasWork)throw Error('제작할 작업을 하나 이상 선택하세요.');
 // Only fresh projects get a generated storyboard automatically. Never erase previously made scenes.
 const canStoryboard=project.scenes.length===1&&project.scenes[0].title==='Scene 01'&&!project.scenes[0].imageAssetId;
 const draft=generateOfflineDraft({prompt:project.prompt,title:project.title,genre:project.genreMix?.[0]?.name||'Pop',genreMix:project.genreMix,key:project.key||'C Major',bpm:project.bpm||120,bars:24});
 const tasks=ORDER.filter(key=>options[key]).map(key=>({key,status:AI_ONLY.has(key)?'requires-local-model':key==='storyboard'&&!canStoryboard?'manual-existing-scenes':key==='mix'||key==='master'?'ready-for-export':'local-ready',detail:AI_ONLY.has(key)?'모델 설치 및 사용 허가 확인 필요':key==='mix'||key==='master'?'기존 DAW에서 확인 후 WAV 출력':key==='storyboard'&&!canStoryboard?'사용자 장면 원본 보존':'오프라인 규칙 기반 초안'}));
 return {format:'MYVOCAL_CREATE97_PLAN',version:1,projectId:project.id,source:snap(project),options,tasks,draft,canStoryboard};
}
export function applyCreateSongVideo97(project,plan){
 if(plan?.format!=='MYVOCAL_CREATE97_PLAN'||plan.projectId!==project?.id||plan.source!==snap(project))throw Error('프로젝트 변경이 감지되어 생성 결과를 적용하지 않았습니다.');
 const x=plan.options||{};if(!Object.keys(x).every(k=>ORDER.includes(k)))throw Error('허용되지 않은 작업 항목입니다.');
 const compose=!!(x.lyrics||x.composition||x.arrangement);
 let next=compose?applyComposition(project,plan.draft,{lyrics:!!x.lyrics,chords:!!x.composition,midi:!!x.arrangement,settings:!!x.composition,replace:false}):{...project};
 if(x.storyboard&&plan.canStoryboard){
  const duration=plan.draft.bars*4*60/(Number(next.bpm)||120);
  const names=['Intro','Verse','Chorus','Bridge','Final Chorus','Outro'];
  const time=names.map((name,i)=>({id:`scn_create97_${i}_${project.id}`,start:+(duration*i/names.length).toFixed(3),end:+(duration*(i+1)/names.length).toFixed(3),title:name,description:`${name} — ${String(project.prompt||'음악 구성').slice(0,90)}`,characterId:project.characterId||'',location:'',outfit:'',expression:'',action:'',camera:'',lighting:''}));
  next={...next,scenes:time};
 }
 const outcomes=plan.tasks.map(task=>({...task,status:task.status==='local-ready'?'prepared':task.status}));
 return {...next,createPipeline97:{version:1,source:'offline-rules',tasks:outcomes,updatedAt:new Date().toISOString(),note:'가창 및 AI 영상은 실제 모델 결과가 없어 미완료'}};
}
