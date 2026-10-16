import test from 'node:test';
import assert from 'node:assert/strict';
import {validateGenreMix,resolveGenreMix,singleGenreMix,genreMixText,addGenreToMix,removeGenreFromMix} from '../src/lib/genreMix.js';
import {newProject} from '../src/lib/schema.js';
import {generateOfflineDraft,applyComposition,COMPOSER_PARTS} from '../src/lib/composer.js';

const mixed=[{name:'Ballad',weight:50},{name:'Rock',weight:30},{name:'Orchestral',weight:20}];
test('accepts the product-specification mixed genre example without changing percentages',()=>{
 assert.deepEqual(validateGenreMix(mixed),mixed);
 assert.equal(genreMixText(mixed),'Ballad 50% + Rock 30% + Orchestral 20%');
});
test('rejects malformed, unsafe, duplicated, fractional and non-100 percent genre weights',()=>{
 for(const input of [[],Array(4).fill({name:'Rock',weight:25}),[{name:'Rock',weight:60},{name:'Rock',weight:40}],
  [{name:'Rock',weight:95}], [{name:'Rock',weight:0},{name:'Pop',weight:100}],
  [{name:'Rock',weight:99.5},{name:'Pop',weight:0.5}], [{name:'__proto__',weight:100}],
  [{name:'Rock',weight:'not-a-number'}], [{name:'Rock',weight:Infinity}], [{name:'Rock',weight:100},null]]) {
  assert.throws(()=>validateGenreMix(input));
 }
});
test('adding and removing a genre preserves a 100% total',()=>{
 const start=singleGenreMix('Rock');
 const two=addGenreToMix(start);const three=addGenreToMix(two);
 assert.equal(two.length,2);assert.equal(three.length,3);
 assert.equal(three.reduce((sum,x)=>sum+x.weight,0),100);
 assert.deepEqual(addGenreToMix(three),three);
 assert.deepEqual(removeGenreFromMix(two,1),start);
});
test('new project saves a mixed genre and never mutates input',()=>{
 const input=structuredClone(mixed),project=newProject({title:'혼합 작곡',genreMix:input});
 assert.deepEqual(project.genreMix,mixed);assert.deepEqual(input,mixed);assert.equal(project.genreAuto,false);
 assert.deepEqual(newProject({genre:'Rock'}).genreMix,[{name:'Rock',weight:100}]);
 assert.throws(()=>newProject({genreMix:[{name:'Rock',weight:90}]}));
});
test('offline composer computes BPM from genre weights and produces deterministic editable tracks',()=>{
 const opts={title:'장르 혼합',prompt:'친구에게 보내는 노래',genreMix:mixed,mood:'희망적',bpm:0,variation:0};
 const d=generateOfflineDraft(opts);
 // Ballad [64,96], Rock [98,156], Orchestral/Pop [86,132] -> weighted midpoint 100.
 assert.equal(d.bpm,100);
 assert.deepEqual(d.genreMix,mixed);assert.equal(d.genre,'Ballad');
 assert.equal(d.midiTracks.length,COMPOSER_PARTS.length);
 assert.deepEqual(d.midiTracks,generateOfflineDraft(opts).midiTracks);
 assert.notDeepEqual(d.midiTracks,generateOfflineDraft({...opts,genreMix:[{name:'Rock',weight:100}]}).midiTracks);
});
test('applying composition preserves saved mix, voice, video, and manual audio clips',()=>{
 const before=newProject({title:'보존 대상',genreMix:mixed,voiceId:'myvoice',characterId:'char-1'});
 before.tracks[0].clips=[{id:'audio-a',assetId:'original-audio',startBar:1}];
 const draft=generateOfflineDraft({genreMix:mixed});
 const after=applyComposition(before,draft);
 assert.deepEqual(after.genreMix,mixed);assert.equal(after.voiceId,'myvoice');assert.equal(after.characterId,'char-1');
 assert.deepEqual(after.tracks[0].clips,before.tracks[0].clips);
 assert.deepEqual(before.genreMix,mixed);
 const backward=applyComposition(before,generateOfflineDraft({genre:'Pop'}));
 assert.deepEqual(backward.genreMix,[{name:'Pop',weight:100}]);
});
test('legacy projects without genreMix remain compatible',()=>{
 assert.deepEqual(resolveGenreMix(null,'Rock'),[{name:'Rock',weight:100}]);
 assert.deepEqual(resolveGenreMix(undefined,'Ballad'),[{name:'Ballad',weight:100}]);
});
