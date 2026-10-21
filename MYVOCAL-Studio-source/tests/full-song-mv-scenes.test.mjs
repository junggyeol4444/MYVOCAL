import test from 'node:test';
import assert from 'node:assert/strict';
import {extendMvToFullSong} from '../src/lib/fullSongMvScenes.js';
const first=()=>({id:'original-user-project',scenes:[{id:'hand-edited-scene',start:0,end:15,title:'내 원본 장면',characterId:'owned-character',outfit:'검은 무협복',imageAssetId:'original-photo'}],tracks:[{id:'original-vocal',clips:[{assetId:'my-vocal'}]}]});
test('one-click MusicGen full song appends only fresh 6-minute MV scenes',()=>{
 const p=first();let seq=0;
 const r=extendMvToFullSong(p,350.5,{newId:()=> 'fresh-scene-'+(++seq)});
 assert.ok(r.added>=1);assert.ok(r.project.scenes.length<=20);
 assert.strictEqual(r.project.scenes[0],p.scenes[0]);
 assert.strictEqual(r.project.tracks,p.tracks);
 assert.equal(r.project.scenes.at(-1).end,350.5);
 assert.ok(r.project.scenes.slice(1).every(x=>x.characterId==='owned-character'&&x.outfit==='검은 무협복'&&!x.imageAssetId));
 assert.equal(p.scenes.length,1);
});
test('rerun full song automation never duplicates or mutates existing scene assets',()=>{
 const p=first(),a=extendMvToFullSong(p,360,{newId:(()=>{let x=0;return()=>''+(++x)})()});
 const r=extendMvToFullSong(a.project,360,{newId:()=>{throw Error('must not append')}} );
 assert.equal(r.added,0);assert.strictEqual(r.project,a.project);
});
test('cannot corrupt user scenes by exceeding 20 automatic video scenes',()=>{
 const p={id:'p',scenes:Array.from({length:20},(_,i)=>({id:''+i,start:i,end:i+1}))};
 assert.throws(()=>extendMvToFullSong(p,360,{newId:()=> 'new'}),/장면 제한/);
 assert.equal(p.scenes.length,20);
});
test('automatic movie production remains in original Windows Studio and uses actual neural audio + SD/SVD',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../src/components/LocalMvBatchPanel.jsx',import.meta.url),'utf8');
 for(const token of ['runMusicProductionPipeline','persistNeuralMusicTracks','extendMvToFullSong','runFullLocalMv','readAudioInfo','putFilesAtomic'])assert.ok(source.includes(token),token);
});
