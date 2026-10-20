// Non-destructive export of individually edited Demucs stems to real WAV tracks.
// Uses the same validated PCM renderer as the master. Never writes source assets.
import {renderStemRemixMaster} from './stemRemixMaster.js';
const NAMES4=['drums','bass','other','vocals'];
const NAMES6=[...NAMES4,'guitar','piano'];
export async function renderEditedStemTracks(stems,settings={}, {signal,onProgress}={}){
 if(!Array.isArray(stems)||![4,6].includes(stems.length)||stems.map(s=>s.name).join(',')!==(stems.length===4?NAMES4:NAMES6).join(','))throw Error('편집할 분리 트랙이 올바르지 않습니다.');
 const active=stems.filter(s=>!settings[s.name]?.mute);
 if(!active.length)throw Error('편집 가능한 트랙이 모두 음소거되어 있습니다.');
 const result=[];
 for(let i=0;i<active.length;i++){
  if(signal?.aborted)throw new DOMException('편집 WAV 생성이 취소됐습니다.','AbortError');
  const current=active[i];
  const isolated=Object.fromEntries(stems.map(s=>[s.name,{...settings[s.name],mute:s.name!==current.name}]));
  isolated._master={}; // Stem exports do not apply a global fade; only track fades.
  const file=await renderStemRemixMaster(stems,isolated,{signal});
  result.push({name:current.name,file:new File([file],`MYVOCAL-${current.name}-edited.wav`,{type:'audio/wav'})});
  onProgress?.(i+1,active.length);
 }
 return result;
}
