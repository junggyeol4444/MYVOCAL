// MYVOCAL Studio v1.6 — UTAU voicebank folder inventory (metadata only).
// Inspects provided folder file *names and sizes*, not the waveform payload.
import {parseOtoIni} from './voicebankAliases.js';

export const MAX_FOLDER_ENTRIES=25000;
export const MAX_OTO_FILES=48;

function pathKey(value){
 const str=String(value??'').replace(/\\/g,'/').replace(/^\/+|\/+$/g,'');
 const bits=str.split('/');
 if(!str||bits.some(x=>!x||x==='.'||x==='..')||str.includes('\0')||/^[A-Za-z]:/.test(str))throw Error('허용되지 않는 파일 경로입니다.');
 return bits.join('/').toLowerCase();
}
function entryName(f){return pathKey(f.path||f.webkitRelativePath||f.name);}
function trimFolder(entries){
 // Folder picker includes the selected directory name as its first component.
 const paths=entries.map(entryName);
 const folders=paths.map(p=>p.split('/'));
 const prefix=folders[0]?.[0];
 return prefix&&folders.every(parts=>parts.length>1&&parts[0]===prefix) ? paths.map(p=>p.slice(prefix.length+1)) : paths;
}
function collectOtoReferences(text){
 const targets=[];
 for(const raw of String(text).replace(/^\uFEFF/,'').split(/\r?\n/)){
  const line=raw.trim();if(!line||line.startsWith('#')||line.startsWith(';'))continue;
  const pos=line.indexOf('=');if(pos<=0)continue;
  const name=line.slice(0,pos).trim();const values=line.slice(pos+1).split(',');
  if(!/\.wav$/i.test(name)||values.length<6||values.slice(1,6).some(x=>!Number.isFinite(Number(x.trim()))))continue;
  targets.push(name);
 }
 return targets;
}
export function inspectVoicebankFolder(entries){
 if(!Array.isArray(entries)||entries.length===0)throw Error('선택한 폴더에 파일이 없습니다.');
 if(entries.length>MAX_FOLDER_ENTRIES)throw Error('파일 25,000개를 초과하는 폴더는 검사할 수 없습니다.');
 const paths=trimFolder(entries),files=new Map(),otos=[];
 for(let i=0;i<entries.length;i++){
  const path=paths[i],e=entries[i];
  if(files.has(path))throw Error('같은 경로의 파일이 중복됐습니다: '+path);
  files.set(path,{size:Number(e.size)||0});
  if(path==='oto.ini'||path.endsWith('/oto.ini'))otos.push({path,text:e.otoText});
 }
 if(!otos.length)throw Error('선택한 폴더에서 oto.ini를 찾지 못했습니다.');
 if(otos.length>MAX_OTO_FILES)throw Error('oto.ini 파일은 최대 48개까지 검사합니다.');
 const aliases=new Set(),warnings=[],missing=[],suspicious=[],invalidOto=[];
 let referenced=0,found=0,validLines=0;
 for(const oto of otos){
  if(typeof oto.text!=='string'){invalidOto.push(oto.path+' (내용을 읽지 못함)');continue;}
  let parsed;
  try{parsed=parseOtoIni(oto.text);}catch(e){invalidOto.push(`${oto.path} (${e.message})`);continue;}
  validLines+=parsed.validLines;
  parsed.aliases.forEach(a=>aliases.add(a));
  if(parsed.invalidLines)warnings.push(`${oto.path}: 형식 오류 ${parsed.invalidLines}행`);
  const prefix=oto.path.includes('/')?oto.path.slice(0,oto.path.lastIndexOf('/')+1):'';
  for(const wav of collectOtoReferences(oto.text)){
   let relative;
   try{relative=pathKey(wav);}catch{if(suspicious.length<40)suspicious.push(`${oto.path}: ${wav}`);continue;}
   const target=prefix+relative;
   referenced++;
   const entry=files.get(target);
   if(!entry){if(missing.length<60)missing.push(target);}
   else if(entry.size<44){if(suspicious.length<40)suspicious.push(`${target} (${entry.size}바이트)`);}
   else found++;
  }
 }
 if(!validLines)throw Error('유효한 oto.ini를 찾지 못했습니다. 인코딩을 확인하세요.');
 return {otoCount:otos.length,invalidOto,wavCount:paths.filter(x=>x.endsWith('.wav')).length,referenced,found,
  missingCount:referenced-found-suspicious.filter(s=>s.endsWith('바이트)')).length,
  missing, suspicious,warnings,aliasCount:aliases.size,
  parsed:{aliases:[...aliases].sort(),validLines,invalidLines:warnings.length,duplicates:0},
  // Metadata only. No raw WAV blobs or full file listings are kept in the project.
  summary:`${otos.length}개 oto.ini · ${found}/${referenced}개 WAV 참조 확인`};
}
