// Existing authorized project vocal clips are reusable; instrument backing and
// MusicGen tracks are intentionally excluded from vocal/mouth generation.
export function projectVocalSources(project){
 if(!project||!Array.isArray(project.tracks))return [];
 const ids=new Set(),list=[];
 for(const track of project.tracks){
  if(track?.type!=='vocal'||!Array.isArray(track.clips))continue;
  for(const clip of track.clips){
   if(!clip?.assetId||typeof clip.assetId!=='string'||ids.has(clip.assetId))continue;
   if(typeof clip.startBar==='number'&&Math.abs(clip.startBar-1)>.0001)continue; // project cue begins at zero
   if(typeof clip.durationSec==='number'&&(!Number.isFinite(clip.durationSec)||clip.durationSec<=0||clip.durationSec>300))continue;
   ids.add(clip.assetId);
   list.push({assetId:clip.assetId,trackId:track.id,trackName:String(track.name||'보컬').slice(0,100),name:String(clip.fileName||'보컬 WAV').slice(0,160),durationSec:clip.durationSec||null});
  }
 }
 return list;
}
