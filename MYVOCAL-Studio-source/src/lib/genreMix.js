// Section 4 of the original MYVOCAL specification: 1-3 genre weights sum to 100%.
// Pure validation shared by project creation and the rule-based composer.
import {genreList} from './genres.js';

export const MAX_MIX_GENRES = 3;

export function validateGenreMix(input) {
 if (!Array.isArray(input) || input.length < 1 || input.length > MAX_MIX_GENRES) {
  throw new Error('장르는 1~3개까지 선택할 수 있습니다.');
 }
 const names = new Set();
 let total = 0;
 const mix = input.map(item => {
  const name = item?.name;
  const weight = Number(item?.weight);
  if (!genreList.includes(name) || names.has(name)) throw new Error('장르가 중복되었거나 지원되지 않습니다.');
  if (!Number.isSafeInteger(weight) || weight < 1 || weight > 100) throw new Error('장르 비율은 1~100 사이의 정수여야 합니다.');
  names.add(name);
  total += weight;
  return {name,weight};
 });
 if (total !== 100) throw new Error(`장르 비율 합계가 ${total}%입니다. 100%로 맞춰 주세요.`);
 return mix;
}

export function singleGenreMix(name='Rock') {
 return [{name:genreList.includes(name)?name:'Rock',weight:100}];
}

// Existing projects created before genre mixing still work unchanged.
export function resolveGenreMix(mix,legacyGenre='Rock') {
 if (mix === undefined || mix === null) return singleGenreMix(legacyGenre);
 return validateGenreMix(mix);
}

export function genreMixText(mix) {
 return validateGenreMix(mix).map(({name,weight})=>`${name} ${weight}%`).join(' + ');
}

export function addGenreToMix(mix) {
 const current = validateGenreMix(mix);
 if (current.length >= MAX_MIX_GENRES) return current;
 const spare = genreList.find(name=>!current.some(x=>x.name===name));
 const largest = current.reduce((best,item,i)=>item.weight>current[best].weight?i:best,0);
 const portion = Math.min(20,current[largest].weight-1);
 if (!spare || portion < 1) return current;
 return [...current.map((item,i)=>i===largest?{...item,weight:item.weight-portion}:item),{name:spare,weight:portion}];
}

export function removeGenreFromMix(mix,index) {
 const current = validateGenreMix(mix);
 if (current.length===1 || index < 0 || index >= current.length) return current;
 const removed=current[index].weight;
 const rest=current.filter((_,i)=>i!==index);
 return rest.map((item,i)=>i===0?{...item,weight:item.weight+removed}:item);
}
