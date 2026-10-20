// Project SECTION guidance for independently generated MusicGen audio segments.
// This is not automatic song-structure synchronization or neural continuation.
export function musicGenSectionPrompts(project,basePrompt,{maxSegments=8}={}){
 if(!project||!Array.isArray(project.sections)||!project.sections.length)throw Error('프로젝트에 Intro/Verse/Chorus 구간을 먼저 설정하세요.');
 if(typeof basePrompt!=='string'||basePrompt.trim().length<2)throw Error('기본 음악 설명을 입력하세요.');
 if(!Number.isInteger(maxSegments)||maxSegments<2||maxSegments>8)throw Error('구간 수는 2~8이어야 합니다.');
 const sections=project.sections.slice(0,maxSegments);
 if(sections.length<2)throw Error('긴 반주 제작에는 2개 이상의 노래 구간이 필요합니다.');
 const base=basePrompt.trim().slice(0,280);
 const prompts=sections.map((section,i)=>{
  const name=String(section?.name||'Section '+(i+1)).replace(/[\r\n]/g,' ').slice(0,70);
  const mix=Array.isArray(section?.genreMix)?section.genreMix:project.genreMix;
  const genres=(Array.isArray(mix)?mix:[]).slice(0,5).map(g=>String(g?.name||'').trim().slice(0,35)).filter(Boolean).join(', ');
  const energy=/final|chorus|후렴/i.test(name)?'strong full ensemble':/verse|벌스/i.test(name)?'clear restrained arrangement':/intro|outro|도입|마무리/i.test(name)?'gentle transition':'moderate dynamics';
  return (base+'; instrumental arrangement; section '+name+'; '+energy+(genres?'; genres '+genres:'')).slice(0,590);
 });
 return {segments:prompts.length,prompts,names:sections.map((s,i)=>String(s?.name||'Section '+(i+1)).slice(0,70))};
}
