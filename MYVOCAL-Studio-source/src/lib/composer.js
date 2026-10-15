import {retainSectionGenreMix,sectionGenreMix} from './sectionGenre.js';
// MYVOCAL Studio v0.4 — offline song draft and MIDI arrangement.
// This is a rule-based local arranger, NOT a trained generative AI model.
// All notes are original procedurally generated note patterns, not reproductions.
import {chordPitches} from './midiEngine.js';
import {resolveGenreMix,genreMixText} from './genreMix.js';

export const songMoods=['희망적','감성적','웅장한','경쾌한','차분한','어두운'];
export const songLengths=[16,24,32];
const limit=(n,a,b)=>Math.min(b,Math.max(a,n));
const rootNames=['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
const majorSteps=[0,2,4,5,7,9,11],minorSteps=[0,2,3,5,7,8,10];
const parseKey=key=>{
 const match=String(key||'C Major').match(/^([A-G])([#b]?)\s+(Major|Minor)$/i);
 const roots={C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11};
 return {root:roots[(match?.[1]||'C')+(match?.[2]||'')]??0,minor:match?.[3]?.toLowerCase()==='minor'};
};
function chordAt(degree,root,isMinor){
 const triads=isMinor?['m','dim','', 'm','m','','']:['','m','m','','','m','dim'];
 const scale=isMinor?minorSteps:majorSteps;
 const step=(root+scale[degree%7])%12;
 return rootNames[step]+triads[degree%7];
}
const suggested=(genre,mood)=>{
 const g=String(genre||'Pop').toLowerCase();
 if(/rock|metal|punk/.test(g))return [98,156];
 if(/house|edm|techno/.test(g))return [112,146];
 if(/ballad|acoustic|lo-fi/.test(g))return [64,96];
 return mood==='차분한'?[70,98]:[86,132];
};
function hash(input){let h=2166136261;for(const c of String(input)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function random(seed){let x=(seed||1)>>>0;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};}
function note(pitch,startBeat,length,velocity=85){return {id:`n_${Math.round(startBeat*100)}_${Math.round(pitch)}_${Math.round(velocity)}_${Math.round(length*100)}`,pitch:Math.round(limit(pitch,0,127)),startBeat:+startBeat.toFixed(3),length:+length.toFixed(3),velocity:Math.round(limit(velocity,1,127))};}
const asTheme=s=>{const str=String(s||'').replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').replace(/(?:만들어줘|작곡해줘|써줘|노래|음악|뮤직비디오|마지막 후렴|장르|BPM|Key|rock|ballad|k-pop)/ig,'').replace(/[.!,]+$/,'').trim();return (str.slice(0,40)||'새로운 내일');};
const passages=(theme,mood)=>{
 const feeling=mood==='어두운'?'멀어진 그림자':mood==='희망적'?'밝아지는 하늘':mood==='경쾌한'?'새로운 리듬':mood==='웅장한'?'다시 울리는 심장':'조용한 마음';
 return `[Intro]\n(연주)\n\n[Verse 1]\n${theme}을 떠올리는 밤\n천천히 스며드는 ${feeling}\n지나간 순간을 다시 적으며\n아직 남아 있는 말을 꺼내\n\n[Pre-Chorus]\n한 걸음 더, 손을 뻗으면\n흐릿한 마음도 선명해져\n\n[Chorus]\n다시 이 노래를 부를게\n우리의 시간이 빛나도록\n끝나지 않을 이야기를\n지금 이 순간 함께 써 내려가\n\n[Verse 2]\n어제와 다른 길을 걸어도\n기억은 내 곁에 남아 있어\n\n[Bridge]\n(잠시 악기를 줄이고 감정을 쌓기)\n\n[Final Chorus]\n다시 이 노래를 부를게\n가장 먼 곳까지 닿을 수 있게\n\n[Outro]\n(연주)`;
};
function sectionsFor(bars){
 // Sections are a structural guide; MIDI pattern builds against this bar count.
 const widths=bars===16?[2,4,4,4,2]:bars===24?[2,6,8,6,2]:[4,8,8,8,4];
 const names=['Intro','Verse 1','Chorus','Final Chorus','Outro'];
 return widths.map((width,i)=>({id:`sec_comp_${i}`,name:names[i],bars:width}));
}
function chordsFor({bars,key,mood,genre}){
 const {root,minor}=parseKey(key);
 const highEnergy=/rock|edm|metal|punk/i.test(genre||'');
 const degrees=minor?(mood==='어두운'?[0,5,3,4]:[0,3,5,4]):mood==='웅장한'||highEnergy?[0,4,5,3]:[0,5,3,4];
 return Array.from({length:Math.floor(bars/2)},(_,i)=>({id:`ch_comp_${i}`,bar:1+i*2,bars:2,symbol:chordAt(degrees[i%4],root,minor)}));
}
// Existing projects have no section overrides; those render with the original
// arrangement algorithm. Explicit per-section genres change local MIDI note
// density/velocity only, not the original song's audio, lyrics, or user tracks.
export function sectionMidiStyleMap(sections,bars,projectMix,genre='Pop') {
 const length=Number(bars);
 if(!Number.isSafeInteger(length)||length<1||length>512)throw new Error('MIDI 마디 범위가 올바르지 않습니다.');
 const styles=Array(length).fill(null);
 if(sections==null)return styles;
 if(!Array.isArray(sections)||sections.length>128)throw new Error('곡 구간 목록이 올바르지 않습니다.');
 let start=0;
 for(const section of sections){
  if(!section||typeof section!=='object'||Array.isArray(section)||!Number.isSafeInteger(section.bars)||section.bars<1||section.bars>512)
   throw new Error('곡 구간의 마디 수가 올바르지 않습니다.');
  const end=Math.min(length,start+section.bars);
  if(section.genreMix!=null){
   const mix=sectionGenreMix(section,projectMix,genre);
   const share=pattern=>mix.reduce((value,item)=>value+(pattern.test(item.name)?item.weight:0),0);
   const energetic=share(/rock|metal|punk|edm|house|techno|dance/i)>=45;
   const gentle=share(/ballad|acoustic|lo-fi|jazz|cinematic|orchestral/i)>=50;
   const style={bassStep:energetic?1:2,hatStep:energetic?.5:1,
    melodySkip:energetic?.04:gentle?.30:.13,
    velocityOffset:energetic?12:gentle?-12:0};
   for(let bar=start;bar<end;bar++)styles[bar]=style;
  }
  start+=section.bars;
  if(start>=length)break;
 }
 return styles;
}
export function buildMidiArrangement({chords,bars=24,key='C Major',genre='Pop',mood='희망적',seed=1,sections,projectMix}){
 const rand=random(seed),{root,minor}=parseKey(key),scale=minor?minorSteps:majorSteps;
 const tracks=[
  {role:'chords',name:'Composer · Chords',instrument:/rock|punk|metal/i.test(genre)?'guitar':'piano',volume:68,midiNotes:[]},
  {role:'bass',name:'Composer · Bass',instrument:'bass',volume:76,midiNotes:[]},
  {role:'drums',name:'Composer · Drums',instrument:'drums',volume:65,midiNotes:[]},
  {role:'melody',name:'Composer · Melody',instrument:'synth',volume:72,midiNotes:[]},
 ];
 const [pad,bass,drums,melody]=tracks;
 const energize=/rock|edm|dance|punk|techno/i.test(genre||'')||mood==='경쾌한';
 const barStyles=sectionMidiStyleMap(sections,bars,projectMix,genre);
 const midiBase=60+root;
 for(const c of chords){
  let chord;
  try{chord=chordPitches(c.symbol,4);}catch{continue;}
  const beat=(c.bar-1)*4,span=c.bars*4;
  for(const p of chord)pad.midiNotes.push(note(p,beat,span-.12,68));
  const base=chord[0]-24;
  for(let b=0;b<span;){
   const style=barStyles[Math.floor((beat+b)/4)];
   bass.midiNotes.push(note(base,beat+b,.7,style?78+style.velocityOffset:78));
   b+=style?style.bassStep:(energize?1:2);
  }
 }
 for(let bar=0;bar<bars;bar++){
  const start=bar*4,intensity=bar>=Math.floor(bars*.65)?1.1:1;
  const style=barStyles[bar];
  for(const b of [0,2])drums.midiNotes.push(note(36,start+b,.16,(95+(style?.velocityOffset||0))*intensity));
  for(const b of [1,3])drums.midiNotes.push(note(38,start+b,.17,(82+(style?.velocityOffset||0))*intensity));
  for(let b=0;b<4;b+=(style?style.hatStep:(energize?.5:1)))drums.midiNotes.push(note(42,start+b,.09,42+rand()*16+(style?.velocityOffset||0)));
  if(bar===0||bar===bars-1)continue;
  for(let b=0;b<4;b+=1){
   if(rand()<(style?style.melodySkip:.13))continue;
   const chord=chords.find(c=>bar+1>=c.bar&&bar+1<c.bar+c.bars)||chords[0];
   const chordPitch=chord?chordPitches(chord.symbol,4):[midiBase];
   const tone=rand()<.6?chordPitch[Math.floor(rand()*chordPitch.length)]:(midiBase+scale[Math.floor(rand()*scale.length)]);
   const pitch=limit(tone+(rand()<.3?12:0),60,84);
   const vel=70+Math.round(rand()*25)+(style?.velocityOffset||0);
   melody.midiNotes.push(note(pitch,start+b,rand()<.4?.5:.9,vel));
  }
 }
 return tracks.map(t=>({...t,midiNotes:t.midiNotes.map((n,i)=>({...n,id:`${t.role}_${i}_${seed}`}))}));
}
export function generateOfflineDraft({prompt='',title='',genre='Pop',genreMix,mood='희망적',key='C Major',bpm=0,bars=24,variation=0}={}){
 const safeBars=songLengths.includes(Number(bars))?Number(bars):24;
 const normalizedMix=resolveGenreMix(genreMix,genre);
 const primaryGenre=[...normalizedMix].sort((a,b)=>b.weight-a.weight)[0].name;
 const [min,max]=normalizedMix.reduce(([a,b],item)=>{const [low,high]=suggested(item.name,mood);return [a+low*item.weight/100,b+high*item.weight/100];},[0,0]);
 const genreSignature=genreMixText(normalizedMix);
 const seed=hash([prompt,title,genreSignature,mood,key,safeBars,variation].join('|'));
 const chosenBpm=bpm?limit(Number(bpm),40,240):Math.round((min+max)/2);
 const theme=asTheme(prompt||title),chords=chordsFor({bars:safeBars,key,mood,genre:primaryGenre});
 return {source:'offline-rules',createdAt:new Date().toISOString(),title:String(title||theme).slice(0,80),prompt,genre:primaryGenre,genreMix:normalizedMix,mood,key,bpm:chosenBpm,bars:safeBars,lyrics:passages(theme,mood),chords,sections:sectionsFor(safeBars),seed,midiTracks:buildMidiArrangement({chords,bars:safeBars,key,genre:primaryGenre,mood,seed})};
}
export function normalizeRemoteProposal(result,options={}){
 if(!result||typeof result!=='object'||typeof result.lyrics!=='string'||!result.lyrics.trim())throw Error('AI가 가사 데이터를 반환하지 않았습니다.');
 const base=generateOfflineDraft(options),rawChords=Array.isArray(result.chords)?result.chords:[];
 const parsed=rawChords.slice(0,16).map((c,i)=>typeof c==='string'?{symbol:c,bar:i*2+1,bars:2}:({symbol:String(c?.symbol||'').trim(),bar:Number(c?.bar)||i*2+1,bars:Number(c?.bars)||2}));
 const chords=parsed.filter(c=>{try{chordPitches(c.symbol,4);return c.bar>=1&&c.bar<=64&&c.bars>=1&&c.bars<=16;}catch{return false;}}).map((c,i)=>({...c,id:`ch_ai_${i}`}));
 const selected=chords.length?Array.from({length:Math.ceil(base.bars/2)},(_,i)=>({...chords[i%chords.length],id:`ch_ai_${i}`,bar:i*2+1,bars:2})):base.chords;
 const bpm=Number(result.bpm),validBpm=Number.isFinite(bpm)&&bpm>=40&&bpm<=240?Math.round(bpm):base.bpm;
 const validKey=/^[A-G][#b]? (Major|Minor)$/.test(String(result.key||''))?result.key:base.key;
 return {...base,source:'openai-lyrics',title:String(result.title||base.title).slice(0,80),lyrics:result.lyrics.slice(0,12000),bpm:validBpm,key:validKey,chords:selected,midiTracks:buildMidiArrangement({...base,chords:selected,key:validKey,seed:base.seed})};
}
export function applyComposition(project,draft,{lyrics=true,chords=true,midi=true,settings=true,replace=true}={}){
 if(!project||!draft)throw Error('프로젝트 및 생성 초안이 필요합니다.');
 const existing=Array.isArray(project.tracks)?project.tracks:[];
 const old=replace?existing.filter(t=>t.generatedBy!=='composer-v04'):existing;
 const mergedSections=chords?retainSectionGenreMix(project.sections,draft.sections):project.sections;
 // Rebuild only procedural composer MIDI, and only when an applied section
 // explicitly overrides its project genre. This avoids changing old projects,
 // external MIDI, manual tracks, or previously authored audio/video assets.
 const styled=Array.isArray(mergedSections)&&mergedSections.some(section=>section?.genreMix!=null);
 const canRender=styled&&midi&&Array.isArray(draft.midiTracks)&&draft.midiTracks.length===4&&
  draft.midiTracks.every(track=>['chords','bass','drums','melody'].includes(track.role))&&
  Array.isArray(draft.chords)&&Number.isSafeInteger(draft.seed)&&Number.isSafeInteger(draft.bars);
 const midiTracks=canRender?buildMidiArrangement({chords:draft.chords,bars:draft.bars,key:draft.key,
  genre:draft.genre,mood:draft.mood,seed:draft.seed,sections:mergedSections,
  projectMix:settings?draft.genreMix:project.genreMix}):(draft.midiTracks||[]);
 const newTracks=midi?midiTracks.map((t,i)=>({id:`trk_composer_${Date.now()}_${i}`,name:t.name,instrument:t.instrument,type:t.role==='drums'?'rhythm':'instrument',generatedBy:'composer-v04',mute:false,solo:false,volume:t.volume,clips:[],midiNotes:t.midiNotes})):[];
 return {...project,...(lyrics?{lyrics:draft.lyrics}:{}),...(chords?{chords:draft.chords,sections:mergedSections}:{}),...(settings?{bpm:draft.bpm,key:draft.key,genreMix:draft.genreMix?resolveGenreMix(draft.genreMix,draft.genre):resolveGenreMix(null,draft.genre)}:{}),tracks:[...old,...newTracks],compositionHistory:[...(project.compositionHistory||[]).slice(-9),{time:new Date().toISOString(),source:draft.source,title:draft.title,notes:newTracks.reduce((s,t)=>s+t.midiNotes.length,0)}]};
}
