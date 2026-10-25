// 원본 62항: 한국어 사용자가 지정한 가수·실제 목소리·음악 구간별
// 공연 위치를 기존 Music/Video 타임라인에 동시에 배치한다.
// 등록된 원본 사람/캐릭터와 프로젝트·녹음·생성 자산은 절대 삭제하지 않는다.
// 모든 자유 문장의 의미를 해석한다고 주장하지 않는 명시적 사용자 명령이다.
const RIGHTS=new Set(['self','owned','licensed']);
const named=(list,name)=>list.filter(x=>x?.name===name);
const permitted=x=>x&&RIGHTS.has(x.rights)&&
 (x.rights!=='licensed'||String(x.rightsNote||'').trim());
const signature=(p,lib)=>JSON.stringify({
 projectId:p.id,voiceId:p.voiceId,characterId:p.characterId,sections:p.sections,
 bpm:p.bpm,scenes:p.scenes,autoVirtualSinger:p.autoVirtualSingerImageV1,
 characters:(lib?.characters||[]).map(c=>[c.id,c.name,c.kind,c.rights,c.rightsNote,c.assets?.map(a=>a.id)]),
 voices:(lib?.voices||[]).map(v=>[v.id,v.name,v.rights,v.rightsNote])
});
const trim=s=>String(s||'').replace(/\s+/gu,' ').trim();
export function parseOriginalNarrative62(command){
 const sentence=trim(command).replace(/[,，]/gu,'');
 // 이 형식은 원본 66항 #62의 예시만 명시적으로 지원한다.
 const expression=/^내 캐릭터\s+([^\s]{1,50})(?:을|를)\s*사용하고\s*내 목소리로 노래하게 해[.]?\s*처음에는 방 안에서 혼자 노래하고\s*후렴부터 밤거리로 나가게 해[.]?\s*마지막 후렴에서는 밴드와 같이 무대에서 노래하게 해줘[.]?$/u;
 const found=sentence.match(expression);
 return found?{characterName:found[1]}:null;
}
function songChoruses(project){
 const bpm=Number(project?.bpm),sections=project?.sections;
 if(!Number.isFinite(bpm)||bpm<40||bpm>240||
 !Array.isArray(sections)||sections.length<2||sections.length>256)
  throw Error('원본 이야기 연출에는 실제 BPM과 곡 구간이 필요합니다.');
 let elapsed=0,choruses=[];
 for(const section of sections){
  if(!Number.isSafeInteger(section?.bars)||section.bars<1||section.bars>128)
   throw Error('원곡 구간마다 실제 마디 수를 설정하세요.');
  if(/후렴|chorus/i.test(String(section.name)))
   choruses.push({start:elapsed,section:section.name});
  elapsed+=section.bars*4*60/bpm;
 }
 if(choruses.length<2||choruses.at(-1).start<=choruses[0].start)
  throw Error('후렴 시작과 마지막 후렴을 구분하려면 두 개 이상의 실제 후렴 구간이 필요합니다.');
 return {first:choruses[0].start,last:choruses.at(-1).start,duration:elapsed};
}
function chooseVideoSceneStyle(scene,sections){
 const midpoint=(Number(scene.start)+Number(scene.end))/2;
 const part=midpoint>=sections.last?'final':midpoint>=sections.first?'chorus':'intro';
 return part==='intro'?{location:'혼자 있는 방 안',action:'등록한 캐릭터가 혼자 노래하는 공연',
  camera:'실내 주인공 중심',lighting:'실내 부드러운 조명'}:
 part==='chorus'?{location:'밤거리',action:'등록한 캐릭터가 밤거리로 나가 노래하는 공연',
  camera:'거리 이동 추적 촬영',lighting:'밤거리 가로등과 도시 야경'}:
 {location:'가상 밴드 무대',action:'등록한 캐릭터가 밴드와 함께 노래하는 공연',
  camera:'무대 공연 카메라',lighting:'밴드 공연 조명'};
}
export function previewOriginalNarrative62(project,command,library){
 const parsed=parseOriginalNarrative62(command);
 if(!parsed)return null;
 if(!project?.id||!Array.isArray(project.scenes)||!project.scenes.length)
  throw Error('이미 생성한 Music+MV 프로젝트 장면이 필요합니다.');
 if(project.autoVirtualSingerImageV1)
  throw Error('자동 생성 가수 원본이 고정된 기존 프로젝트에는 다른 캐릭터를 혼합하지 않습니다.');
 const characters=named(library?.characters||[],parsed.characterName)
  .filter(c=>c.kind==='character'&&permitted(c));
 if(characters.length!==1)
  throw Error('등록된 본인/허가 캐릭터 이름이 없거나 중복됩니다: '+parsed.characterName);
 const voices=(library?.voices||[]).filter(v=>v.rights==='self');
 if(voices.length!==1)
  throw Error('본인 목소리로 등록한 Voice가 정확히 1개 필요합니다. 여러 개라면 Voice를 먼저 선택해 주세요.');
 const character=characters[0],voice=voices[0],window=songChoruses(project);
 if(project.scenes.some(s=>!s?.id||!Number.isFinite(s.start)||!Number.isFinite(s.end)||
    s.end<=s.start||s.start<0||s.end>360||
    s.personMv||s.characterMv&&s.characterMv.characterId!==character.id))
  throw Error('다른 실사 인물·캐릭터가 이미 연결된 장면이나 시간이 잘못된 장면은 기존 원본을 보호하기 위해 변경하지 않습니다.');
 if(!project.scenes.some(s=>s.start<window.first)||
    !project.scenes.some(s=>s.end>window.last))
  throw Error('인트로와 마지막 후렴 양쪽에 편집할 MV 장면이 필요합니다.');
 const changes=project.scenes.map(s=>({sceneId:s.id,...chooseVideoSceneStyle(s,window)}));
 return {version:1,domain:'both',field:'narrative62',projectId:project.id,
  characterId:character.id,voiceId:voice.id,changes,source:signature(project,library),
  summary:'기존 '+character.name+' 캐릭터 · 본인 '+voice.name+
  ' 음색을 지정하고 실내→후렴 밤거리→마지막 후렴 밴드 무대 장면 '+changes.length+
  '개에 실제 시간축 연출을 배치합니다. 가창/이미지/영상은 로컬 생성 실행 필요.'};
}
export function applyOriginalNarrative62(project,plan,library){
 if(plan?.version!==1||plan.field!=='narrative62'||plan.projectId!==project?.id||
    signature(project,library)!==plan.source)
  throw Error('원본 Music+MV 데이터 또는 사용자 Voice/Character가 미리보기 이후 변경됐습니다.');
 const actual=previewOriginalNarrative62(project,
  '내 캐릭터 '+(library?.characters||[]).find(c=>c.id===plan.characterId)?.name+
  '를 사용하고 내 목소리로 노래하게 해. 처음에는 방 안에서 혼자 노래하고, 후렴부터 밤거리로 나가게 해. 마지막 후렴에서는 밴드와 같이 무대에서 노래하게 해줘.',
  library);
 if(!actual||JSON.stringify(actual)!==JSON.stringify(plan))
  throw Error('미리보기와 적용할 실제 프로젝트 연출이 다릅니다.');
 const change=new Map(actual.changes.map(row=>[row.sceneId,row]));
 const before={voiceId:project.voiceId,characterId:project.characterId,
  scenes:project.scenes,sceneIds:project.scenes.map(s=>s.id)};
 const result={...project,voiceId:plan.voiceId,characterId:plan.characterId,
  scenes:project.scenes.map(s=>{const row=change.get(s.id);if(!row)return s;
   return {...s,characterId:plan.characterId,location:row.location,action:row.action,
    camera:row.camera,lighting:row.lighting};}),
  directorNarrative62:{version:1,needsNeuralSinging:true,needsMvRegeneration:true,
   history:[...(project.directorNarrative62?.history||[]),
    {before,characterId:plan.characterId,voiceId:plan.voiceId,
     at:new Date().toISOString()}].slice(-8)}};
 return result;
}
export function undoOriginalNarrative62(project){
 const state=project?.directorNarrative62,last=state?.history?.at(-1);
 if(!last||!Array.isArray(last.before?.scenes))
  throw Error('되돌릴 이전 음악/영상 전체 연출이 없습니다.');
 const changed=project.scenes||[];
 if(changed.length!==last.before.scenes.length||
    changed.some((scene,index)=>scene.id!==last.before.sceneIds[index]))
  throw Error('연출 후 추가/삭제한 장면이 있어 자동 되돌리기를 중단했습니다.');
 if(project.voiceId!==last.voiceId||project.characterId!==last.characterId)
  throw Error('이후 가수 또는 목소리가 다시 변경되어 자동 되돌리기를 중단했습니다.');
 return {...project,voiceId:last.before.voiceId,characterId:last.before.characterId,
  scenes:last.before.scenes,
  directorNarrative62:{...state,history:state.history.slice(0,-1),
   needsNeuralSinging:true,needsMvRegeneration:true}};
}
