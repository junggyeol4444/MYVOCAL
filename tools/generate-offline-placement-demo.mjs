// Standalone local demonstration for selected MIDI guide WAV placement.
// No network, GitHub, user project file or external voice model is used.
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {renderOfflineVocalGuideSelection} from '../MYVOCAL-Studio-source/src/lib/offlineVocalGuide.js';
import {makeImportedVocalTrack} from '../MYVOCAL-Studio-source/src/lib/lyricAlignment.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../');
const wavPath=process.argv[2] || resolve(root,'MYVOCAL-selection-placement-sample.wav');
const jsonPath=process.argv[3] || resolve(root,'MYVOCAL-selection-placement-example.json');
const alignment={cues:[
  {lyric:'아',pitch:60,startSec:0,endSec:.35,velocity:92},
  {lyric:'아사',pitch:64,startSec:.55,endSec:1.25,velocity:105},
  {lyric:'노래',pitch:67,startSec:1.45,endSec:2.25,velocity:95},
  {lyric:'이',pitch:69,startSec:2.45,endSec:2.90,velocity:90},
]};
const preview=renderOfflineVocalGuideSelection(alignment,null,2,3);
const wav=new Uint8Array(await preview.blob.arrayBuffer());
const bpm=120,project={id:'step30-local-demo',bpm};
const clip=makeImportedVocalTrack(project,{name:'offline-selected.wav',size:wav.length},'demo-only',preview.seconds,preview.selection.startSec).clips[0];
writeFileSync(wavPath,wav);
const result={format:'MYVOCAL_OFFLINE_GUIDE_PLACEMENT_DEMO',bpm,cues:[2,3],
 selectedAudioSeconds:preview.seconds,originalSongStartSeconds:preview.selection.startSec,
 originalSongEndSeconds:preview.selection.endSec,
 storedClipStartBar:clip.startBar,
 roundTripStartSeconds:(clip.startBar-1)*240/bpm,
 wavBytes:wav.length,mediaSavedToProject:false,
 note:'Example only. No project, personal voice, or user media was changed.'};
writeFileSync(jsonPath,JSON.stringify(result,null,2)+'\n','utf8');
console.log(JSON.stringify(result,null,2));
