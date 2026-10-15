// Generates a synthetic test fixture only. NOT a user's real learned music style.
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createMusicStyleProfile} from '../src/lib/musicStyleProfile.js';
import {createLearningRights} from '../src/lib/learningRights.js';
import {composeStyleSketch} from '../src/lib/styleComposition.js';
import {arrangeStyleSketch,exportArrangementMidi} from '../src/lib/styleArrangement.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'examples');mkdirSync(output,{recursive:true});
const rights=createLearningRights({category:'self-created',consentConfirmed:true,sourceLabel:'Synthetic demonstration only'});
const profile=createMusicStyleProfile({id:'synthetic_demo',name:'SYNTHETIC DEMO — NOT TRAINED',entries:[{
  music:{id:'synthetic_audio',sha256:'a'.repeat(64),rights},
  analysis:{analysisType:'signal-energy-only',durationSeconds:10,peak:.7,rms:.25,activeRegions:[{startSeconds:0,endSeconds:7.5}]}
}]});
const sketch=composeStyleSketch({profile,seed:56,bars:4,bpm:105});
const arrangement=arrangeStyleSketch({profile,sketch});
writeFileSync(resolve(output,'Step56-SYNTHETIC-DEMO-profile.json'),JSON.stringify(profile,null,2)+'\n');
writeFileSync(resolve(output,'Step56-SYNTHETIC-DEMO-arrangement.mid'),exportArrangementMidi(arrangement));
console.log('Created synthetic demonstration fixtures in',output);
