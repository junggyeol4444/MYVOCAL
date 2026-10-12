import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject} from '../src/lib/schema.js';
import {sectionGenreMix,setSectionGenreMix,retainSectionGenreMix,singleSectionGenre} from '../src/lib/sectionGenre.js';
import {generateOfflineDraft,applyComposition} from '../src/lib/composer.js';
const mix=[{name:'Ballad',weight:50},{name:'Rock',weight:30},{name:'Orchestral',weight:20}];

test('legacy and new sections inherit the project-level genre mix without new storage keys',()=>{
 const project=newProject({title:'legacy',genreMix:mix});
 for(const section of project.sections){assert.deepEqual(sectionGenreMix(section,project.genreMix),mix);assert.equal(Object.hasOwn(section,'genreMix'),false)}
 const oldSection={id:'a',name:'Intro',bars:4};
 assert.deepEqual(sectionGenreMix(oldSection,undefined,'Pop'),[{name:'Pop',weight:100}]);
});
test('apply single genre to a section without altering other sections or the project mix',()=>{
 const before=newProject({genreMix:mix});
 const original=structuredClone(before);
 const changes=setSectionGenreMix(before.sections,before.sections[0].id,singleSectionGenre('Rock'));
 assert.deepEqual(changes[0].genreMix,[{name:'Rock',weight:100}]);
 assert.equal(changes[1],before.sections[1]);
 assert.deepEqual(sectionGenreMix(changes[0],before.genreMix),[{name:'Rock',weight:100}]);
 assert.deepEqual(before,original);
});
test('supports three-genre per-section mixes totaling 100 percent',()=>{
 const project=newProject({genreMix:[{name:'Rock',weight:100}]});
 const result=setSectionGenreMix(project.sections,project.sections[2].id,mix);
 assert.deepEqual(sectionGenreMix(result[2],project.genreMix),mix);
 assert.deepEqual(project.genreMix,[{name:'Rock',weight:100}]);
});
test('inherit removes the override field without mutating originals',()=>{
 const old=[{id:'a',name:'Verse',bars:8,genreMix:mix},{id:'b',name:'Chorus',bars:8}];
 const reset=setSectionGenreMix(old,'a',null);
 assert.equal(Object.hasOwn(reset[0],'genreMix'),false);
 assert.deepEqual(reset[1],old[1]);
 assert.deepEqual(old[0].genreMix,mix);
 assert.deepEqual(sectionGenreMix(reset[0],[{name:'Pop',weight:100}]),[{name:'Pop',weight:100}]);
});
test('rejects malformed section data and non-100 percent overrides before persistence',()=>{
 const p=newProject();
 for(const input of [[],[{name:'Rock',weight:60}],Array(4).fill({name:'Pop',weight:25}),[{name:'__proto__',weight:100}]]){
  assert.throws(()=>setSectionGenreMix(p.sections,p.sections[0].id,input));
 }
 assert.throws(()=>setSectionGenreMix(p.sections,'missing',mix));
 assert.throws(()=>sectionGenreMix(null,mix));
 assert.throws(()=>sectionGenreMix({genreMix:[]},mix));
});
test('composition preserves section overrides by matching name and occurrence, not by index',()=>{
 const old=[
  {id:'old-intro',name:'Intro',bars:4,genreMix:singleSectionGenre('Cinematic')},
  {id:'old-verse',name:'Verse 1',bars:8,genreMix:singleSectionGenre('Ballad')},
  {id:'old-chorus',name:'Chorus',bars:8,genreMix:mix},
  {id:'old-outro',name:'Outro',bars:4},
 ];
 const next=[{id:'new-intro',name:'Intro',bars:2},{id:'new-chorus',name:'Chorus',bars:8},{id:'new-outro',name:'Outro',bars:2},{id:'new-bridge',name:'Bridge',bars:4}];
 const merged=retainSectionGenreMix(old,next);
 assert.deepEqual(merged[0].genreMix,old[0].genreMix);
 assert.deepEqual(merged[1].genreMix,old[2].genreMix);
 assert.equal(Object.hasOwn(merged[2],'genreMix'),false);
 assert.equal(Object.hasOwn(merged[3],'genreMix'),false);
 assert.equal(Object.hasOwn(next[0],'genreMix'),false);
});
test('duplicate section names preserve their own occurrence without cross-assignment',()=>{
 const old=[{name:'Chorus',genreMix:singleSectionGenre('Pop')},{name:'Chorus',genreMix:singleSectionGenre('Rock')}];
 const next=[{name:'Chorus'},{name:'Bridge'},{name:'Chorus'}];
 const result=retainSectionGenreMix(old,next);
 assert.equal(result[0].genreMix[0].name,'Pop');
 assert.equal(result[2].genreMix[0].name,'Rock');
 assert.equal(Object.hasOwn(result[1],'genreMix'),false);
});
test('existing project saving and reloading preserve section overrides',()=>{
 const project=newProject({genreMix:mix});
 project.sections=setSectionGenreMix(project.sections,project.sections[2].id,singleSectionGenre('Orchestral'));
 const restored=JSON.parse(JSON.stringify(project));
 assert.deepEqual(restored.sections[2].genreMix,[{name:'Orchestral',weight:100}]);
 assert.deepEqual(restored.genreMix,mix);
});
test('applying offline composition retains compatible section styles and unrelated project data',()=>{
 const project=newProject({genreMix:mix,voiceId:'voice0',characterId:'person0',withVideo:true});
 project.sections=setSectionGenreMix(project.sections,project.sections[2].id,singleSectionGenre('Rock'));
 project.tracks[0].clips=[{id:'clip0',assetId:'kept',startBar:1}];
 const draft=generateOfflineDraft({genreMix:mix,bars:24});
 const next=applyComposition(project,draft);
 assert.deepEqual(next.sections.find(s=>s.name==='Chorus').genreMix,[{name:'Rock',weight:100}]);
 assert.deepEqual(next.genreMix,mix);
 assert.equal(next.voiceId,'voice0');assert.equal(next.characterId,'person0');assert.equal(next.withVideo,true);
 assert.deepEqual(next.tracks[0].clips,project.tracks[0].clips);
 assert.equal(project.sections[2].id!==next.sections.find(s=>s.name==='Chorus').id,true);
});
