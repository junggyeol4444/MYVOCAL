// MYVOCAL v1.5 — offline UTAU oto.ini alias metadata management.
// NO audio processing, voicebank installation, phonemizer execution, or AI inference.
const MAX_TEXT=5*1024*1024;
const MAX_ALIASES=16000;
const clean=v=>String(v??'').trim();
function safeAlias(text){
 const s=clean(text);
 if(!s||s.length>160||/[\u0000-\u001f\u007f]/u.test(s))throw Error('발음 별칭에 잘못된 문자가 있거나 길이가 너무 깁니다.');
 return s;
}
export function parseOtoIni(text){
 if(typeof text!=='string'||text.length>MAX_TEXT)throw Error('oto.ini 파일이 비어 있거나 5MB를 초과합니다.');
 const aliases=new Set(),examples=[],issues=[];
 let lines=0,valid=0,empty=0,duplicates=0;
 for(const [i,raw] of text.replace(/^\uFEFF/,'').split(/\r?\n/).entries()){
  const line=raw.trim();if(!line||line.startsWith(';')||line.startsWith('#'))continue;
  lines++;const pos=line.indexOf('=');if(pos<=0){if(issues.length<20)issues.push(`${i+1}행: '=' 형식이 아닙니다.`);continue;}
  const wav=clean(line.slice(0,pos));const parts=line.slice(pos+1).split(',');
  if(!/\.wav$/i.test(wav)||parts.length<6){if(issues.length<20)issues.push(`${i+1}행: wav=별칭,수치5개 형식을 확인하세요.`);continue;}
  // UTAU oto.ini: WAV=alias,offset,consonant,cutoff,preutterance,overlap
  if(parts.slice(1,6).some(x=>!Number.isFinite(Number(x.trim())))){
   if(issues.length<20)issues.push(`${i+1}행: 음소 타이밍 수치가 잘못되었습니다.`);continue;
  }
  let alias=parts[0].trim();if(!alias){alias=wav.split(/[\\/]/).pop().replace(/\.wav$/i,'');empty++;}
  try{alias=safeAlias(alias);}catch{if(issues.length<20)issues.push(`${i+1}행: 별칭이 유효하지 않습니다.`);continue;}
  if(aliases.has(alias))duplicates++;else{aliases.add(alias);if(examples.length<10)examples.push(alias);}
  valid++;if(aliases.size>MAX_ALIASES)throw Error(`발음 별칭이 ${MAX_ALIASES}개를 초과합니다.`);
 }
 if(!valid)throw Error('인식 가능한 oto.ini 항목이 없습니다. 파일 인코딩 또는 내용을 확인하세요.');
 return {aliases:[...aliases].sort(),totalLines:lines,validLines:valid,invalidLines:lines-valid,duplicates,filenameFallbacks:empty,issues,examples};
}
// An explicit user-defined mapping only: one Korean syllable = one target oto alias.
// No automatic phonetic inference is claimed.
export function parseAliasMappings(text){
 if(typeof text!=='string'||text.length>100000)throw Error('발음 대응표가 너무 큽니다.');
 const map={};let count=0;
 for(const [i,raw] of text.split(/\r?\n/).entries()){
  const line=raw.trim();if(!line||line.startsWith('#'))continue;
  const index=line.indexOf('=');if(index<1)throw Error(`${i+1}행: '가사=별칭' 형태로 입력하세요.`);
  const syllable=safeAlias(line.slice(0,index));const alias=safeAlias(line.slice(index+1));
  if(syllable.length>20)throw Error(`${i+1}행: 가사 부분이 너무 깁니다.`);
  map[syllable]=alias;count++;if(count>4000)throw Error('대응표는 최대 4000행까지 지원합니다.');
 }
 return map;
}
export function voicebankCoverage(alignment,profile,mapping={}){
 if(!alignment||!Array.isArray(alignment.cues))throw Error('가사·MIDI 싱크가 없습니다.');
 if(!profile||!Array.isArray(profile.aliases))throw Error('보이스뱅크 별칭 목록이 없습니다.');
 const dictionary=new Set(profile.aliases),rows=[];
 for(const cue of alignment.cues){
  const lyric=clean(cue.lyric);if(!lyric||lyric==='—')continue;
  const target=Object.prototype.hasOwnProperty.call(mapping,lyric)?mapping[lyric]:lyric;
  const present=dictionary.has(target);
  rows.push({lyric,alias:target,present,method:target===lyric?'동일 별칭':'수동 매핑'});
 }
 return {total:rows.length,matched:rows.filter(r=>r.present).length,missing:rows.filter(r=>!r.present).length,
   missingUnique:[...new Set(rows.filter(r=>!r.present).map(r=>r.lyric))],rows};
}
export function validateMappedLyrics(alignment,profile,mapping){
 const report=voicebankCoverage(alignment,profile,mapping);
 if(report.missing)throw Error(`일치하는 oto.ini 별칭이 없는 가사 ${report.missing}개가 있습니다. 대응표를 수정하거나 원본 가사로 내보내세요.`);
 return report;
}
export function makeVoicebankProfile({id,name,singer,renderer='CLASSIC',phonemizer='OpenUtau.Core.DefaultPhonemizer',parsed,encoding='shift_jis',mappingText=''}){
 if(!id||!clean(name)||!parsed?.aliases?.length)throw Error('보이스뱅크 프로필 이름과 oto.ini 자료가 필요합니다.');
 if(!['CLASSIC','DIFFSINGER'].includes(renderer))throw Error('렌더러를 확인하세요.');
 if(parsed.aliases.length>MAX_ALIASES)throw Error('별칭이 너무 많습니다.');
 // Never store uploaded WAV or phoneme voice model; only non-sensitive aliases and user choices.
 return {id,name:clean(name).slice(0,120),singer:clean(singer||name).slice(0,180),renderer,phonemizer:clean(phonemizer).slice(0,180),
   aliases:parsed.aliases,aliasCount:parsed.aliases.length,encoding,mappingText,createdAt:new Date().toISOString(),format:'MYVOCAL_OTO_PROFILE',version:1};
}
