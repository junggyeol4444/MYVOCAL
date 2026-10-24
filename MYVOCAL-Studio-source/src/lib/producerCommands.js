import {chordPitches} from './midiEngine.js';
// Apply only explicitly supported music editing commands from the original
// MYVOCAL Producer specification. These are real MIDI/chord edits, not LLM AI.
// Original audio/image assets are never overwritten.
const pitchClasses=Object.freeze({C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11});
const chromatic=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const isChorus=name=>/chorus|후렴/i.test(String(name||''));
const isFinal=name=>/final\s*chorus|마지막\s*후렴/i.test(String(name||''));
const isDrums=track=>track?.instrument==='drums'||track?.type==='rhythm';
const playableNote=note=>Number.isInteger(note?.pitch)&&note.pitch>=0&&note.pitch<=127&&Number.isFinite(note?.startBeat)&&note.startBeat>=0&&Number.isFinite(note?.length)&&note.length>0;
const trimCommand=s=>String(s||'').trim().replace(/[.!。]+$/u,'').trim();

function songWindows(project){
 if(!Array.isArray(project.sections))throw Error('곡 구간 정보가 없습니다.');
 const windows=[];
 let bar=1;
 for(const section of project.sections){
  const bars=Number(section?.bars);
  if(!Number.isSafeInteger(bars)||bars<1||bars>128)throw Error('곡 구간의 마디 수를 확인해 주세요.');
  windows.push({name:section.name||'',fromBeat:(bar-1)*4,toBeat:(bar+bars-1)*4,fromBar:bar,toBar:bar+bars});
  bar+=bars;
 }
 return windows;
}
function transposeChord(symbol){
 const m=String(symbol||'').match(/^([A-G])([#b]?)(maj7|m7|dim|sus4|m|7|maj)?$/);
 if(!m)throw Error('지원하지 않는 코드가 있습니다. 먼저 코드 진행을 확인해 주세요.');
 const root=pitchClasses[m[1]+m[2]];
 return chromatic[(root+1)%12]+(m[3]||'');
}
function editNotes(project,windows,deltaFor){
 let changed=0;
 const tracks=(project.tracks||[]).map(track=>{
  if(!Array.isArray(track.midiNotes))return track;
  let touched=false;
  const notes=track.midiNotes.map(note=>{
   if(!playableNote(note))return note;
   if(!windows.some(w=>note.startBeat>=w.fromBeat&&note.startBeat<w.toBeat))return note;
   const delta=deltaFor(track,note);
   if(!delta)return note;
   const key=Object.keys(delta)[0],value=delta[key];
   if(key==='pitch'&&(value<0||value>127))throw Error('MIDI 음역을 벗어나는 음표가 있어 변경하지 않았습니다.');
   if(note[key]===value)return note;
   changed++;touched=true;
   return {...note,...delta};
  });
  return touched?{...track,midiNotes:notes}:track;
 });
 if(!changed)throw Error('해당 구간에서 수정할 수 있는 MIDI 음표를 찾지 못했습니다. 먼저 곡을 만들어 주세요.');
 return {tracks,changed};
}

// The five concrete changes requested by plan §11: melody, drums, bass,
// harmony and strings. Only local editable MIDI is modified, not recorded audio.
const producerParts11=['melody','drums','bass','harmony','strings'];
function composerRole11(track){
 if(track?.generatedBy!=='composer-v04')return '';
 const role=track.composerRole||/^Composer · (\w+)$/u.exec(String(track.name||''))?.[1]?.toLowerCase()||'';
 return producerParts11.includes(role)?role:'';
}
function chordForBeat11(chords,beat){
 return chords.find(c=>Number.isFinite(Number(c.bar))&&Number.isFinite(Number(c.bars))&&
   Number(c.bars)>0&&beat>=(Number(c.bar)-1)*4&&beat<(Number(c.bar)+Number(c.bars)-1)*4);
}
const within11=(note,windows)=>windows.some(w=>note.startBeat>=w.fromBeat&&note.startBeat<w.toBeat);
function nextNoteId11(used,role){
 let index=used.size;
 while(used.has(`producer11_${role}_${index}`))index++;
 const id=`producer11_${role}_${index}`;
 used.add(id);
 return id;
}
function applyChorusArrangement11(project,windows,selected){
 const wanted=producerParts11.filter(p=>selected.includes(p));
 if(!wanted.length)throw Error('변경할 악기 구성이 없습니다.');
 const found=new Map();
 for(const track of project.tracks){
  const role=composerRole11(track);
  if(wanted.includes(role)){
   if(found.has(role))throw Error(`${role} 자동 작곡 트랙이 중복됩니다. 먼저 트랙을 정리해 주세요.`);
   found.set(role,track);
  }
 }
 // Legacy compositions had only four parts. A requested harmony/strings
 // operation may introduce the missing part, without replacing any old track.
 const created=[];
 const knownIds=new Set(project.tracks.map(t=>t.id));
 const hasLead=project.tracks.some(t=>composerRole11(t)==='melody');
 for(const role of wanted){
  if(found.has(role))continue;
  if((role!=='harmony'&&role!=='strings')||!hasLead)
   throw Error(`${role} 자동 작곡 트랙이 없습니다. 곡 만들기로 음악을 생성한 뒤 사용해 주세요.`);
  let serial=0,id;
  do{id=`trk_producer11_${role}_${serial++}`;}while(knownIds.has(id));
  knownIds.add(id);
  const track={id,name:role==='harmony'?'Composer · Harmony':'Composer · Strings',
   instrument:role==='harmony'?'synth':'strings',type:'instrument',
   volume:role==='harmony'?42:38,mute:false,solo:false,
   generatedBy:'composer-v04',composerRole:role,clips:[],midiNotes:[]};
  created.push(track);found.set(role,track);
 }
 const originalChords=Array.isArray(project.chords)?project.chords:[];
 const getChords=beat=>{
  const chord=chordForBeat11(originalChords,beat);
  if(!chord)return null;
  try{return chordPitches(chord.symbol,4);}catch{return null;}
 };
 // Build the replacements locally. If any required track has no editable
 // chorus notes or chords, reject the entire operation before updating a project.
 const replacements=new Map(),counts={};
 for(const role of wanted){
  const track=found.get(role);
  if(!Array.isArray(track.midiNotes))throw Error(`${role}의 MIDI 음표가 없습니다.`);
  const notes=track.midiNotes;
  let touched=0;
  let updated=notes.map((n,i)=>{
   if(!playableNote(n)||!within11(n,windows))return n;
   const velocity=Math.round(Number(n.velocity)||85);
   let patch=null;
   if(role==='melody'&&i%3===0){
    const pitches=getChords(n.startBeat);
    if(pitches){
     const candidates=pitches.flatMap(p=>[p-12,p,p+12,p+24])
      .filter(p=>p>=0&&p<=127&&p!==n.pitch);
     candidates.sort((a,b)=>Math.abs(a-n.pitch)-Math.abs(b-n.pitch)||a-b);
     if(candidates.length&&Math.abs(candidates[0]-n.pitch)<=12)
      patch={pitch:candidates[0]};
    }
   }else if(role==='drums')patch={velocity:Math.min(127,velocity+15)};
   else if(role==='bass')patch={velocity:Math.min(127,velocity+17)};
   if(!patch||Object.keys(patch).every(key=>n[key]===patch[key]))return n;
   touched++;
   return {...n,...patch};
  });
  if(role==='harmony'){
   const lead=found.get('melody')||project.tracks.find(t=>composerRole11(t)==='melody');
   if(!lead)throw Error('화음을 추가할 멜로디 트랙이 없습니다.');
   const ids=new Set(notes.map(n=>n.id)),occupied=new Set(notes.map(n=>`${n.startBeat}:${n.pitch}`));
   for(const [i,n] of (lead.midiNotes||[]).entries()){
    if(i%3!==0||!playableNote(n)||!within11(n,windows))continue;
    const pitches=getChords(n.startBeat);
    if(!pitches)continue;
    const choices=[...new Set(pitches.flatMap(p=>[p-12,p,p+12]))]
      .filter(p=>p>=36&&p<=n.pitch-3&&p<=127).sort((a,b)=>b-a);
    // A second "add harmony" request picks a new chord tone, not a duplicate.
    const pitch=choices.find(p=>!occupied.has(`${n.startBeat}:${p}`));
    if(pitch===undefined)continue;
    const key=`${n.startBeat}:${pitch}`;
    if(touched>=256)break;
    occupied.add(key);
    updated.push({id:nextNoteId11(ids,'harmony'),pitch,startBeat:n.startBeat,
      length:Math.max(.1,Math.min(n.length,.85)),velocity:58});
    touched++;
   }
  }else if(role==='strings'){
   const ids=new Set(notes.map(n=>n.id)),occupied=new Set(notes.map(n=>`${n.startBeat}:${n.pitch}`));
   for(const w of windows){
    for(const c of originalChords){
     const start=Math.max(w.fromBeat,(Number(c.bar)-1)*4);
     const end=Math.min(w.toBeat,(Number(c.bar)+Number(c.bars)-1)*4);
     if(!(end>start)||!Number.isFinite(start)||!Number.isFinite(end))continue;
     let pitches;
     try{pitches=chordPitches(c.symbol,4);}catch{continue;}
     // Each repeated request can add the next chord voice to the string pad.
     const pitch=[...pitches].reverse().find(p=>!occupied.has(`${start}:${p}`));
     if(pitch===undefined)continue;
     const key=`${start}:${pitch}`;
     if(touched>=256)break;
     occupied.add(key);
     updated.push({id:nextNoteId11(ids,'strings'),pitch,startBeat:start,
      length:Math.max(.1,end-start-.12),velocity:53});
     touched++;
    }
   }
  }
  if(!touched)throw Error(`${role}에서 실제 변경할 음표를 찾지 못했습니다. 먼저 음악 트랙을 확인해 주세요.`);
  counts[role]=touched;
  replacements.set(track.id,{...track,midiNotes:updated});
 }
 const labels={melody:'멜로디 변경',drums:'드럼 강화',bass:'베이스 강화',harmony:'화음 추가',strings:'스트링 추가'};
 const summary=wanted.map(role=>`${labels[role]} ${counts[role]}개`).join(' · ');
 return {project:{...project,tracks:[...project.tracks.map(t=>replacements.get(t.id)||t),
   ...created.map(t=>replacements.get(t.id))]},
  response:`후렴 MIDI 편곡 적용: ${summary}. 녹음 원본은 그대로입니다.`,
  kind:'chorus-arrangement-11',changed:Object.values(counts).reduce((a,b)=>a+b,0),counts};
}


// 원본 66항 #11·#62: 자연어로 구간별 악기를 쉬게 하거나 되돌린다.
// 변경은 새 프로젝트 객체에만 적용한다. 삭제한 MIDI 음표는 복원 자료로 보존한다.
const SECTION_REST_INSTRUMENTS83=Object.freeze({
 drums:['drums','drum','rhythm','드럼'],bass:['bass','베이스'],
 guitar:['guitar','기타'],piano:['piano','keys','keyboard','피아노'],
 strings:['strings','string','스트링'],synth:['synth','synthesizer','신스'],
 pad:['pad','패드']
});
const SECTION_REST_LABELS83=Object.freeze({
 drums:'드럼',bass:'베이스',guitar:'기타',piano:'피아노',
 strings:'스트링',synth:'신스',pad:'패드'
});
function sectionRestWindows83(project,sectionLabel){
 const windows=songWindows(project);
 const named=(w)=>String(w.name||'').trim();
 const verse=windows.filter(w=>/verse|절/u.test(named(w)));
 let selected=[];
 if(sectionLabel==='1절'||sectionLabel==='2절'){
  const number=sectionLabel==='1절'?1:2;
  selected=verse.filter(w=>new RegExp('(?:verse\\s*|^)' +number+'(?:\\b|절)','i').test(named(w)));
  if(!selected.length&&verse.length>=number)selected=[verse[number-1]];
 }else if(sectionLabel==='후렴')selected=windows.filter(w=>isChorus(w.name));
 else if(sectionLabel==='마지막 후렴'){
  const choruses=windows.filter(w=>isChorus(w.name));
  const final=windows.filter(w=>isFinal(w.name)).at(-1)||choruses.at(-1);
  selected=final?[final]:[];
 }else{
  const pattern=sectionLabel==='인트로'||sectionLabel==='전주'?/intro|전주|인트로/i:
   sectionLabel==='브리지'?/bridge|브리지/i:/outro|엔딩|아웃트로/i;
  selected=windows.filter(w=>pattern.test(named(w)));
 }
 if(!selected.length)throw Error(sectionLabel+' 구간이 프로젝트에 없습니다.');
 if(selected.length>1&&sectionLabel!=='후렴')
  throw Error(sectionLabel+' 구간이 중복됩니다. 구간 이름을 구별해 주세요.');
 return selected;
}
function sectionRestTrack83(project,role,allowEmpty=false){
 const aliases=SECTION_REST_INSTRUMENTS83[role];
 const tracks=project.tracks.filter(t=>{
  if(!Array.isArray(t.midiNotes)||(!allowEmpty&&!t.midiNotes.length))return false;
  const fields=[t.instrument,t.composerRole,t.name].map(x=>String(x||'').toLowerCase());
  return fields.some(f=>aliases.some(a=>f===a||new RegExp('(^|[\\s·_/-])'+a+'($|[\\s·_/-])','i').test(f)));
 });
 if(tracks.length!==1)throw Error(SECTION_REST_LABELS83[role]+' MIDI 트랙을 하나로 확정할 수 없습니다. 현재 '+tracks.length+'개입니다.');
 if(!tracks[0].id)throw Error('악기 MIDI 트랙 ID가 없습니다.');
 return tracks[0];
}
function applyProducerSectionRest83(project,cmd){
 const m=/^(마지막\s*후렴|인트로|전주|1절|2절|후렴|브리지|아웃트로|엔딩)(?:에서|의)?\s*(드럼|베이스|기타|피아노|스트링|신스|패드)(?:을|를)?\s*(빼\s*줘|빼\s*주세요|쉬게\s*해\s*줘|쉬게\s*해주세요|다시\s*넣어\s*줘|다시\s*넣어\s*주세요|복원해\s*줘|복원해\s*주세요)$/u.exec(cmd);
 if(!m)return null;
 const sectionLabel=m[1].replace(/\s+/gu,' '),instrument=m[2],action=m[3];
 const role=Object.keys(SECTION_REST_LABELS83).find(k=>SECTION_REST_LABELS83[k]===instrument);
 const windows=sectionRestWindows83(project,sectionLabel),track=sectionRestTrack83(project,role,/다시|복원/u.test(action));
 const saved=Array.isArray(project.producerSectionRests)?project.producerSectionRests:[];
 const overlapping=entry=>entry.trackId===track.id&&
  entry.windows.some(a=>windows.some(b=>a.fromBeat<b.toBeat&&b.fromBeat<a.toBeat));
 const matches=saved.filter(overlapping);
 const restoring=/다시|복원/u.test(action);
 if(restoring){
  if(matches.length!==1||matches[0].sectionLabel!==sectionLabel||matches[0].role!==role)
   throw Error('해당 구간과 악기의 복원 자료를 하나로 확정할 수 없습니다.');
  const record=matches[0];
  const current=track.midiNotes;
  const ids=new Set(current.map(n=>n.id).filter(Boolean));
  if(record.removed.some(n=>n.id&&ids.has(n.id)))
   throw Error('복원할 MIDI 음표 ID가 이미 존재합니다. 프로젝트를 변경하지 않았습니다.');
  const restored=[...current,...record.removed.map(n=>({...n}))].sort((a,b)=>a.startBeat-b.startBeat);
  const tracks=project.tracks.map(t=>t.id===track.id?{...t,midiNotes:restored}:t);
  return {project:{...project,tracks,producerSectionRests:saved.filter(e=>e!==record)},
   response:sectionLabel+'의 '+instrument+' MIDI 음표 '+record.removed.length+'개를 복원했습니다.',
   kind:'section-midi-rest-restore',changed:record.removed.length};
 }
 if(matches.length)throw Error('이 구간의 악기 쉼표 편집이 이미 있습니다. 먼저 복원해 주세요.');
 const removed=track.midiNotes.filter(n=>playableNote(n)&&
  windows.some(w=>n.startBeat>=w.fromBeat&&n.startBeat<w.toBeat));
 if(!removed.length)throw Error(sectionLabel+'에서 '+instrument+' MIDI 음표를 찾지 못했습니다.');
 if(removed.length>4096)throw Error('한 번에 보존할 수 있는 MIDI 음표 수를 초과했습니다.');
 const remaining=track.midiNotes.filter(n=>!removed.includes(n));
 const tracks=project.tracks.map(t=>t.id===track.id?{...t,midiNotes:remaining}:t);
 const record={version:1,trackId:track.id,sectionLabel,role,
  windows:windows.map(w=>({fromBeat:w.fromBeat,toBeat:w.toBeat})),
  removed:removed.map(n=>({...n}))};
 return {project:{...project,tracks,producerSectionRests:[...saved,record]},
  response:sectionLabel+'에서 '+instrument+' MIDI 음표 '+removed.length+'개를 쉬게 했습니다. 같은 구간에 다시 넣어줘 명령으로 복원할 수 있습니다.',
  kind:'section-midi-rest',changed:removed.length};
}

// 원본 66항 #11·#62: 자연어로 특정 악기의 실제 MIDI 연주 강약·길이를 편집한다.
// 녹음 WAV, 원본 트랙 ID, 저장된 다른 구간과 프로젝트 자산은 수정하지 않는다.
function applyProducerSectionDynamics84(project,cmd){
 const match=/^(마지막\s*후렴|인트로|전주|1절|2절|후렴|브리지|아웃트로|엔딩)(?:에서|의)?\s*(드럼|베이스|기타|피아노|스트링|신스|패드)(?:을|를)?\s*(?:더\s*)?(강하게|세게|약하게|작게|길게|짧게)\s*(?:연주\s*)?(?:해\s*줘|해\s*주세요|해줘|해주세요)$/u.exec(cmd);
 if(!match)return null;
 const sectionLabel=match[1].replace(/\s+/gu,' ');
 const instrument=match[2],action=match[3];
 const role=Object.keys(SECTION_REST_LABELS83).find(key=>SECTION_REST_LABELS83[key]===instrument);
 const windows=sectionRestWindows83(project,sectionLabel);
 const track=sectionRestTrack83(project,role);
 const velocityAction=['강하게','세게','약하게','작게'].includes(action);
 let changed=0;
 const notes=track.midiNotes.map(note=>{
  if(!playableNote(note))return note;
  const window=windows.find(w=>note.startBeat>=w.fromBeat&&note.startBeat<w.toBeat);
  if(!window)return note;
  if(velocityAction){
   const old=Number.isFinite(note.velocity)?Math.round(note.velocity):85;
   const next=Math.max(1,Math.min(127,old+(['강하게','세게'].includes(action)?15:-15)));
   if(old===next)return note;
   changed++;return {...note,velocity:next};
  }
  // 기존 MIDI 음표가 구간 경계를 넘어가면 임의로 자르지 않는다.
  if(note.startBeat+note.length>window.toBeat+1e-6)return note;
  const next=Math.round(Math.max(.1,Math.min(window.toBeat-note.startBeat,
   note.length*(action==='길게'?1.25:.75)))*1000)/1000;
  if(Math.abs(next-note.length)<.0005)return note;
  changed++;return {...note,length:next};
 });
 if(!changed)throw Error(sectionLabel+'의 '+instrument+'에서 변경할 MIDI 음표가 없습니다. 기존 곡은 그대로입니다.');
 const tracks=project.tracks.map(t=>t.id===track.id?{...t,midiNotes:notes}:t);
 return {project:{...project,tracks},
  response:sectionLabel+'의 '+instrument+' MIDI 음표 '+changed+'개를 '+action+' 연주하도록 변경했습니다. 녹음·모델·다른 트랙은 그대로입니다.',
  kind:'section-midi-dynamics-84',changed};
}

// 원본 66항 #11·#62: 지정 악기의 MIDI 음높이를 실제 음표에 적용한다.
// 다른 악기·원본 WAV·프로젝트 자산을 변경하지 않고 음역 초과는 전체 거부한다.
function applyProducerSectionTranspose85(project,cmd){
 const match=/^(마지막\s*후렴|인트로|전주|1절|2절|후렴|브리지|아웃트로|엔딩)(?:에서|의)?\s*(베이스|기타|피아노|스트링|신스|패드)(?:을|를)?\s*(반음|한\s*음|한\s*옥타브)\s*(올려\s*줘|올려\s*주세요|내려\s*줘|내려\s*주세요)$/u.exec(cmd);
 if(!match)return null;
 const sectionLabel=match[1].replace(/\s+/gu,' ');
 const instrument=match[2],interval=match[3].replace(/\s+/gu,''),direction=match[4];
 const amount=interval==='반음'?1:interval==='한음'?2:12;
 const delta=/^올려/u.test(direction)?amount:-amount;
 const role=Object.keys(SECTION_REST_LABELS83).find(key=>SECTION_REST_LABELS83[key]===instrument);
 const windows=sectionRestWindows83(project,sectionLabel),track=sectionRestTrack83(project,role);
 let changed=0;
 const notes=track.midiNotes.map(note=>{
  if(!playableNote(note)||!windows.some(w=>note.startBeat>=w.fromBeat&&note.startBeat<w.toBeat))return note;
  const pitch=note.pitch+delta;
  if(pitch<0||pitch>127)throw Error('음역을 벗어나는 MIDI 음표가 있어 '+sectionLabel+'의 '+instrument+'를 변경하지 않았습니다.');
  changed++;return {...note,pitch};
 });
 if(!changed)throw Error(sectionLabel+'에서 '+instrument+' MIDI 음표를 찾지 못했습니다. 원본을 보존합니다.');
 const tracks=project.tracks.map(t=>t.id===track.id?{...t,midiNotes:notes}:t);
 return {project:{...project,tracks},
  response:sectionLabel+'의 '+instrument+' MIDI 음표 '+changed+'개를 '+interval+' '+(delta>0?'올렸습니다.':'내렸습니다.')+' 다른 트랙과 원본 녹음은 그대로입니다.',
  kind:'section-midi-transpose-85',changed};
}

// 원본 #11·#62: 실제 MusicGen 독립 WAV의 재생 음량·음소거를 자연어로 편집한다.
// audioEngine.js의 실시간 재생·오프라인 WAV 믹스가 track.volume/mute를 직접 사용한다.
// 파일·MIDI·모델은 수정하지 않고 기존 프로젝트의 선택된 트랙 메타데이터만 바꾼다.
const NEURAL_WAV_ROLES86=Object.freeze({
 '멜로디':'melody','코드':'chords','베이스':'bass','드럼':'drums','기타':'guitar','패드':'pad'
});
function applyProducerNeuralWav86(project,cmd){
 const mute=/^(멜로디|코드|베이스|드럼|기타|패드)\\s*(?:신경망\\s*)?(?:WAV|오디오)(?:를|을)?\\s*(음소거\\s*해\\s*줘|음소거\\s*해제해\\s*줘|소리\\s*켜\\s*줘)$/iu.exec(cmd);
 const volume=/^(멜로디|코드|베이스|드럼|기타|패드)\\s*(?:신경망\\s*)?(?:WAV|오디오)(?:의)?\\s*음량(?:을)?\\s*(\\d{1,3})\\s*%?(?:로)?\\s*(?:설정해\\s*줘|맞춰\\s*줘)$/iu.exec(cmd);
 if(!mute&&!volume)return null;
 const label=(mute||volume)[1],role=NEURAL_WAV_ROLES86[label];
 const tracks=project.tracks.filter(t=>t?.generatedBy==='musicgen-independent-audio'&&
  t?.sourceRole===role&&t.type==='instrument'&&Array.isArray(t.clips)&&t.clips.some(c=>c.assetId));
 if(tracks.length!==1)
  throw Error(label+' 신경망 MusicGen WAV 트랙이 '+tracks.length+'개입니다. 편집할 트랙 하나를 확정한 뒤 실행하세요.');
 const target=tracks[0];
 let changed,description;
 if(mute){
  const muted=/^음소거\\s*해\\s*줘$/u.test(mute[2]);
  if(Boolean(target.mute)===muted)throw Error(label+' 신경망 WAV가 이미 해당 재생 상태입니다.');
  changed={...target,mute:muted,solo:false};
  description=muted?'음소거':'음소거 해제';
 }else{
  const next=Number(volume[2]);
  if(!Number.isSafeInteger(next)||next<0||next>100)
   throw Error('실제 신경망 WAV 트랙 음량은 0~100%입니다.');
  if(Number(target.volume??75)===next)throw Error(label+' 신경망 WAV가 이미 해당 음량입니다.');
  changed={...target,volume:next};
  description='재생 음량 '+next+'%';
 }
 return {project:{...project,tracks:project.tracks.map(t=>t.id===target.id?changed:t)},
  response:label+' 실제 신경망 WAV '+description+'를 프로젝트 재생·WAV 믹스에 반영했습니다. 원본 오디오·MIDI·모델은 그대로입니다.',
  kind:'neural-wav-mix-86',changed:1};
}

export const PRODUCER_COMMAND_EXAMPLES=Object.freeze(['베이스 오디오 음량을 50%로 설정해줘','드럼 WAV 음소거 해줘','드럼 WAV 음소거 해제해줘','인트로에서 드럼 빼줘','인트로에서 드럼 다시 넣어줘','후렴에서 기타를 더 강하게 해줘','2절에서 피아노를 작게 해줘','브리지에서 스트링을 길게 해줘','2절에서 기타를 반음 내려줘','후렴이 심심해','멜로디 변경','드럼 강화하기','베이스 강화','화음 추가','스트링 추가','후렴을 더 웅장하게','마지막 후렴만 반키 올려줘']);
export function applyProducerCommand(project,rawCommand){
 if(!project?.id||!Array.isArray(project.tracks))throw Error('편집할 음악 프로젝트가 없습니다.');
 if(typeof rawCommand!=='string'||rawCommand.length>300)throw Error('300자 이하의 수정 요청을 입력하세요.');
 const cmd=trimCommand(rawCommand);
 if(!cmd||/[\u0000-\u001f\u007f]/u.test(cmd))throw Error('수정 요청을 확인해 주세요.');
 const neuralWav=applyProducerNeuralWav86(project,cmd);
 if(neuralWav)return neuralWav;
 const sectionRest=applyProducerSectionRest83(project,cmd);
 if(sectionRest)return sectionRest;
 const dynamics=applyProducerSectionDynamics84(project,cmd);
 if(dynamics)return dynamics;
 const transpose=applyProducerSectionTranspose85(project,cmd);
 if(transpose)return transpose;
 const windows=songWindows(project);
 const choruses=windows.filter(w=>isChorus(w.name));
 if(!choruses.length)throw Error('후렴 구간이 없습니다. 곡 구조에서 후렴을 추가해 주세요.');
 const last=windows.filter(w=>isFinal(w.name)).at(-1)||choruses.at(-1);
 if(/^후렴이\s*심심해(?:요)?$/u.test(cmd))
  return applyChorusArrangement11(project,choruses,producerParts11);
 const partCommands=[
  ['melody',/^(?:후렴(?:의|에|에서)?\s*)?멜로디(?:를|를\s*)?\s*(?:변경|바꿔(?:줘|주세요)?|변경해(?:줘|주세요)?)$/u],
  ['bass',/^(?:후렴(?:의|에|에서)?\s*)?베이스\s*(?:강화(?:해(?:줘|주세요)?|하기)?|더\s*강하게(?:\s*해줘)?)$/u],
  ['harmony',/^(?:후렴(?:의|에|에서)?\s*)?화음\s*(?:추가(?:해(?:줘|주세요)?|하기)?|넣어(?:줘|주세요)?)$/u],
  ['strings',/^(?:후렴(?:의|에|에서)?\s*)?스트링\s*(?:추가(?:해(?:줘|주세요)?|하기)?|넣어(?:줘|주세요)?)$/u]
 ];
 for(const [role,pattern] of partCommands)
  if(pattern.test(cmd))return applyChorusArrangement11(project,choruses,[role]);
 if(/^마지막\s*후렴(?:만|을|에서)?\s*(?:반키|반음)\s*(?:올려(?:줘|주세요)?|높여(?:줘|주세요)?|올리기)$/u.test(cmd)){
  const {tracks,changed}=editNotes(project,[last],(track,n)=>isDrums(track)?null:{pitch:n.pitch+1});
  let chordsChanged=0;
  const chords=(project.chords||[]).map(chord=>{
   const begin=Number(chord.bar),end=begin+Number(chord.bars);
   if(!Number.isFinite(begin)||!Number.isFinite(end)||begin<last.fromBar||end>last.toBar||end<=begin)return chord;
   chordsChanged++;
   return {...chord,symbol:transposeChord(chord.symbol)};
  });
  const response=`마지막 후렴의 MIDI 음표 ${changed}개와 코드 ${chordsChanged}개를 반음 올렸습니다. 원본 오디오 파일은 그대로입니다.`;
  return {project:{...project,tracks,chords},response,kind:'final-chorus-semitone',changed};
 }
 if(/^드럼\s*(?:을\s*)?(?:더\s*)?강화(?:해(?:줘|주세요)?|하기)$/u.test(cmd)){
  const {tracks,changed}=editNotes(project,choruses,(track,n)=>isDrums(track)?{velocity:Math.min(127,Math.round(Number(n.velocity)||85)+18)}:null);
  const response=`후렴의 드럼 MIDI 음표 ${changed}개를 더 강하게 연주하도록 바꿨습니다.`;
  return {project:{...project,tracks},response,kind:'chorus-drums',changed};
 }
 if(/^(?:후렴(?:을|이)?\s*(?:더\s*)?웅장하게(?:\s*만들어)?(?:줘|주세요)?|후렴이\s*심심해)$/u.test(cmd)){
  const {tracks,changed}=editNotes(project,choruses,(track,n)=>({velocity:Math.min(127,Math.round(Number(n.velocity)||85)+(isDrums(track)?18:12))}));
  const response=`후렴의 MIDI 음표 ${changed}개를 더 강하게 연주하도록 바꿨습니다. 실제 편곡 결과는 재생해서 확인하세요.`;
  return {project:{...project,tracks},response,kind:'chorus-energy',changed};
 }
 throw Error('아직 지원하지 않는 요청입니다. 제시된 명령만 실제 MIDI에 적용할 수 있습니다.');
}
