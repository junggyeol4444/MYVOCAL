// Section 4: per-song-section genre overrides remain optional for legacy projects.
// Overrides are stored in project metadata and used by the local MIDI composer
// when new procedural MIDI is applied. They never rewrite existing audio clips.
import {resolveGenreMix,validateGenreMix,singleGenreMix} from './genreMix.js';

export function sectionGenreMix(section,projectMix,legacyGenre='Rock') {
 if (!section || typeof section!=='object' || Array.isArray(section)) throw new Error('곡 구간 형식이 올바르지 않습니다.');
 return section.genreMix == null ? resolveGenreMix(projectMix,legacyGenre) : validateGenreMix(section.genreMix);
}

export function setSectionGenreMix(sections,sectionId,mix) {
 if (!Array.isArray(sections) || !sections.some(section=>section.id===sectionId)) throw new Error('곡 구간을 찾을 수 없습니다.');
 const normalized=mix == null ? null : validateGenreMix(mix);
 return sections.map(section=>{
  if(section.id!==sectionId)return section;
  if(normalized===null){const {genreMix,...rest}=section;return rest;}
  return {...section,genreMix:normalized};
 });
}

// Keep existing overrides only when the generated section has the same name and
// occurrence index. Never silently attach the old Chorus style to another section.
export function retainSectionGenreMix(oldSections,newSections) {
 if(!Array.isArray(newSections))throw new Error('새 곡 구간 형식이 올바르지 않습니다.');
 const byName=new Map();
 for(const old of Array.isArray(oldSections)?oldSections:[]){
  if(!old || typeof old.name!=='string')continue;
  const key=old.name.trim().toLocaleLowerCase();
  if(!byName.has(key))byName.set(key,[]);
  byName.get(key).push(old);
 }
 const counts=new Map();
 return newSections.map(section=>{
  const key=typeof section.name==='string'?section.name.trim().toLocaleLowerCase():'';
  const occurrence=counts.get(key)||0;counts.set(key,occurrence+1);
  const previous=byName.get(key)?.[occurrence];
  if(!previous || previous.genreMix==null)return {...section};
  return {...section,genreMix:validateGenreMix(previous.genreMix)};
 });
}

export function singleSectionGenre(name) {return singleGenreMix(name);}
