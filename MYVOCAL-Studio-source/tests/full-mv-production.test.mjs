import test from 'node:test';
import assert from 'node:assert/strict';
import {runFullLocalMv} from '../src/lib/fullMvProduction.js';
const source=()=>({id:'song1',title:'곡',scenes:[{id:'s1',start:0,end:4,description:'공연'}],tracks:[]});
function inject(project,cb={}){
 const {record:recordObserver,...extensions}=cb;
 return {preflight:()=>{},plan:p=>({durationSec:4,scenes:p.scenes}),
  batch:async opts=>{const altered={...project,scenes:project.scenes.map(s=>({...s,videoClipAssetId:'vid_1'}))};cb.afterBatch?.(opts);cb.commit?.(altered);return {generatedImages:1,generatedVideos:1}},
  load:async (plan,opts)=>{cb.loaded?.(plan,opts);return {assets:new Map(),dispose:()=>cb.dispose?.()}},
  record:async (plan,assets,opts)=>{recordObserver?.(plan,opts);return {blob:new Blob([new Uint8Array(256)],{type:'video/webm'})}},
  mix:async()=>new Blob([new Uint8Array(128)],{type:'audio/wav'}),audioDuration:()=>12,
  captions:()=>({status:'ready',captions:[{startSec:0,endSec:1,text:'가사'}]}),
  overlay:()=>({matchedScenes:1,scenes:{}}),
  revision:p=>JSON.stringify(p.scenes),
  verify:(saved,p)=>{if(saved!==JSON.stringify(p.scenes))throw Error('revision changed');return true},
  ...extensions};
}
test('one user action creates all scenes then records a real WebM file from the CURRENT scene list',async()=>{
 let p=source(),dispose=0;
 const dep=inject(p,{commit:updated=>p=updated,loaded:plan=>assert.equal(plan.scenes[0].videoClipAssetId,'vid_1'),
 record:(_plan,opts)=>{assert.equal(opts.includeAudio,true);assert.equal(opts.showCaptions,true);assert.ok(opts.renderAudio);},dispose:()=>dispose++});
 const got=await runFullLocalMv({project:p,data:{characters:[]},current:()=>p,commit:next=>p=next,session:'s',
  checkpoint:'c',videoModel:'v',port:8188,includeReferences:false,includeAudio:true},dep);
 assert.equal(got.file.type,'video/webm');assert.equal(got.generatedVideos,1);
 assert.equal(got.scenes,1);assert.equal(dispose,1);assert.equal(p.scenes[0].videoClipAssetId,'vid_1');
});
test('user cancellation after GPU scenes yields no downloaded movie',async()=>{
 const p=source(),controller=new AbortController();let recorded=0;
 await assert.rejects(runFullLocalMv({project:p,data:{characters:[]},current:()=>p,commit:()=>{},session:'s',signal:controller.signal},
 inject(p,{afterBatch:()=>controller.abort(),record:()=>recorded++})),/취소/);
 assert.equal(recorded,0);
});
test('MV modified while recording: exported movie is rejected, source data stays',async()=>{
 let p=source();
 await assert.rejects(runFullLocalMv({project:p,data:{characters:[]},current:()=>p,commit:next=>p=next,session:'s'},
 inject(p,{commit:updated=>p=updated,record:()=>{p={...p,scenes:p.scenes.map(s=>({...s,title:'편집됨'}))}}})),/revision changed/);
 assert.equal(p.scenes[0].title,'편집됨');
});
test('registered character viseme overlay uses exact saved placement on the final recorder',async()=>{
 let p=source(),overlaySeen=null;
 const settings={xPercent:30,yPercent:40,sizePercent:7};
 await runFullLocalMv({project:p,data:{characters:[{id:'c1'}]},current:()=>p,commit:next=>p=next,session:'s',lipPlacement:settings},inject(p,{
  commit:next=>p=next,overlay:(_project,_cast,s)=>{assert.deepEqual(s,settings);return {matchedScenes:1,scenes:{}}},
  record:(_plan,options)=>{overlaySeen=options.lipSyncOverlays;}
 }));
 assert.equal(overlaySeen.matchedScenes,1);
});
