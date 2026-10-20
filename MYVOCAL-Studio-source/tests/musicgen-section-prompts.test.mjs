import test from 'node:test';import assert from 'node:assert/strict';
import {musicGenSectionPrompts} from '../src/lib/musicGenSectionPrompts.js';
test('song project sections become distinguishable intro/verse/chorus MusicGen instructions',()=>{
 const p={genreMix:[{name:'Rock',weight:50},{name:'Orchestral',weight:50}],sections:[{name:'Intro',bars:4},{name:'Verse 1',bars:8},{name:'Final Chorus',genreMix:[{name:'Metal',weight:100}]}]};
 const before=JSON.stringify(p),v=musicGenSectionPrompts(p,'Heroic cinematic Korean rock');
 assert.equal(v.segments,3);assert.match(v.prompts[0],/gentle transition/);assert.match(v.prompts[1],/restrained/);assert.match(v.prompts[2],/Metal/);
 assert.equal(JSON.stringify(p),before);
});
test('invalid or empty project sections produce no fake music results',()=>{
 assert.throws(()=>musicGenSectionPrompts({sections:[]},'ok'),/구간/);
 assert.throws(()=>musicGenSectionPrompts({sections:[{name:'Only'}]},'valid music'),/2개/);
});
