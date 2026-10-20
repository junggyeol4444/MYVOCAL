import test from 'node:test';
import assert from 'node:assert/strict';
import {planLocalAiStoryboard,applyLocalAiStoryboard,canApplyLocalAiStoryboard} from '../src/lib/localAiStoryboard.js';
import {storyboardFromSongSections} from '../src/lib/songStoryboard.js';
const p={id:'prjA',title:'우리의 만남',prompt:'친구와 재회하는 노래',lyrics:'다시 만난 우리',bpm:120,characterId:'',sections:[{id:'sec1',name:'Verse',bars:2},{id:'sec2',name:'Chorus',bars:2}],scenes:[{id:'orig',start:0,end:12,title:'Scene 01',description:'첫 장면을 설명해 주세요',characterId:'',location:'',outfit:'',expression:'',action:'',camera:'',lighting:''}]};
test('a real model response maps to exact song timing without overwriting originals',async()=>{
 const next=await planLocalAiStoryboard(p,'qwen3:4b',{key:'key',fetchImpl:async(url,opt)=>{
 assert.equal(url,'/api/local-ai/storyboard');assert.equal(JSON.parse(opt.body).sections.length,2);
 return {ok:true,json:async()=>({provider:'local-ollama',model:'qwen3:4b',textGenerated:true,videoGenerated:false,scenes:[{title:'귀가',description:'도시 저녁',location:'서울',action:'걷기',camera:'wide',lighting:'soft'},{title:'재회',description:'웃으며 만남',location:'공원',action:'달리기',camera:'close',lighting:'bright'}]})};
 }});
 assert.equal(next.scenes.length,2);assert.equal(next.scenes[0].start,0);assert.equal(next.scenes[0].end,4);assert.equal(next.scenes[1].end,8);
 const after=applyLocalAiStoryboard(p,next);assert.equal(p.scenes.length,1);assert.equal(after.scenes[1].title,'재회');
 assert.equal(after.localAiStoryboard.videoGenerated,false);
 assert.throws(()=>applyLocalAiStoryboard({...p,lyrics:'수정된 가사'},next),/변경/);
});
test('existing edited storyboard cannot be overwritten',async()=>{
 await assert.rejects(()=>planLocalAiStoryboard({...p,scenes:[{...p.scenes[0],description:'내가 직접 쓴 장면'}]},'qwen3:4b',{key:'key'}),/덮어쓰지/);
});
test('tampered model scenes are not accepted',async()=>{
 await assert.rejects(()=>planLocalAiStoryboard(p,'qwen3:4b',{key:'key',fetchImpl:async()=>({ok:true,json:async()=>({provider:'local-ollama',model:'qwen3:4b',textGenerated:true,videoGenerated:true,scenes:[]})})}),/형식/);
});

test('unmodified automatically generated Create97 storyboard can be used safely',async()=>{
 const auto={...p,scenes:storyboardFromSongSections(p)};
 assert.equal(canApplyLocalAiStoryboard(auto),true);
 const edited={...auto,scenes:auto.scenes.map((s,i)=>i===0?{...s,camera:'user handcrafted angle'}:s)};
 assert.equal(canApplyLocalAiStoryboard(edited),false);
});