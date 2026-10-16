// Existing song structure is the timing source for an editable MV storyboard.
// This creates metadata only. It never creates a video or overwrites user media.
const DEFAULT_SCENE={
 start:0,end:12,title:'Scene 01',description:'첫 장면을 설명해 주세요',
 characterId:'',location:'',outfit:'',expression:'',action:'',camera:'',lighting:''
};
const FIELDS=new Set(['id',...Object.keys(DEFAULT_SCENE)]);
const roundMs=value=>Math.round(value*1000)/1000;
const safeText=(value,limit)=>String(value||'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,limit);

export function canReplaceDefaultStoryboard(project){
 if(!Array.isArray(project?.scenes)||project.scenes.length!==1)return false;
 const scene=project.scenes[0];
 if(!scene||typeof scene!=='object'||Array.isArray(scene)||
    typeof scene.id!=='string'||!scene.id.trim())return false;
 // An image, clip, edited description, camera, outfit or unknown field is
 // user data. Be conservative: don't replace even slightly customized scenes.
 return Object.keys(scene).every(key=>FIELDS.has(key))&&
  Object.entries(DEFAULT_SCENE).every(([key,value])=>scene[key]===value);
}
export function storyboardFromSongSections(project){
 const sections=project?.sections,bpm=project?.bpm;
 if(typeof bpm!=='number'||!Number.isFinite(bpm)||bpm<40||bpm>240)
  throw Error('스토리보드에 사용할 곡 BPM이 올바르지 않습니다.');
 if(!Array.isArray(sections)||!sections.length||sections.length>256)
  throw Error('스토리보드에 사용할 곡 구간이 없습니다.');
 const prompt=safeText(project.prompt||'음악 구성',90);
 let beat=0;
 const scenes=sections.map((section,index)=>{
  if(!section||typeof section!=='object'||!Number.isSafeInteger(section.bars)||
     section.bars<1||section.bars>128)throw Error('곡 구간의 마디 수를 확인해 주세요.');
  const from=roundMs(beat*60/bpm);
  beat+=section.bars*4;
  const to=roundMs(beat*60/bpm);
  if(to<=from||to>7200)throw Error('곡 구간이 영상 길이 범위를 벗어났습니다.');
  const title=safeText(section.name||'',100)||`Scene ${String(index+1).padStart(2,'0')}`;
  return {
   id:`scn_create97_${index}_${project.id}`,
   start:from,end:to,title,description:`${title} — ${prompt}`,
   characterId:project.characterId||'',location:'',outfit:'',expression:'',
   action:'',camera:'',lighting:''
  };
 });
 return scenes;
}
