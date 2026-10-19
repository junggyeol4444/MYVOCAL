import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {linkedProfiles,assetsOf} from '../src/lib/projectBundle.js';

test('project backup preserves active person/character MV references and source regeneration assets',()=>{
 const project={
  voiceId:'voice-1',characterId:'lead',band90:{members:[{characterId:'band'}]},
  tracks:[{clips:[{assetId:'original-wav'}]}],
  scenes:[{
   characterId:'lead',personMv:{personId:'person',referenceAssetId:'person-photo'},
   characterMv:{characterId:'singer',referenceAssetId:'character-front'},
   imageAssetId:'scene-image',videoClipAssetId:'scene-video',
   regeneration92:{sourceAssetId:'regeneration-source',history:[{imageAssetId:'regen-image',videoClipAssetId:'regen-video'}]},
   characterReplace94:{history:[{scene:{
    characterId:'history',personMv:{personId:'history-person',referenceAssetId:'old-person-photo'},
    characterMv:{characterId:'history-character',referenceAssetId:'old-character-front'},
    imageAssetId:'old-scene-image',videoClipAssetId:'old-scene-video',
    regeneration92:{sourceAssetId:'old-regen-source',history:[{imageAssetId:'old-regen-image',videoClipAssetId:'old-regen-video'}]}
   }}]}
  }]
 };
 const ids=['lead','band','person','singer','history','history-person','history-character'];
 const data={voices:[{id:'voice-1',name:'My voice'}],characters:[...ids.map(id=>({id,name:id})),{id:'unrelated',name:'unrelated'}]};
 const profiles=linkedProfiles(project,data);
 assert.deepEqual(new Set(profiles.characters.map(c=>c.id)),new Set(ids));
 assert.deepEqual(profiles.voices.map(v=>v.id),['voice-1']);
 const assets=new Set(assetsOf(project,profiles));
 for(const id of ['original-wav','person-photo','character-front','scene-image','scene-video','regeneration-source','regen-image','regen-video','old-person-photo','old-character-front','old-scene-image','old-scene-video','old-regen-source','old-regen-image','old-regen-video'])assert.ok(assets.has(id),id);
 assert.ok(!assets.has('unrelated'));
});
test('project backup includes nested character and voice reference media',()=>{
 const project={tracks:[],scenes:[]};
 const profiles={voices:[{assets:[{id:'voice-take'}],personLipSync:{videoAssetId:'voice-video',audioAssetId:'voice-audio'}}],
  characters:[{assets:[{id:'front'}],looks:[{referenceAssetId:'look-ref'}],
   layerPlan:{sourceAssetId:'layers'},animation2d:{sourceAssetId:'animated'},
   rig3d:{assetId:'vrm'},stage3d:{assetId:'stage'},
   personLipSync:{videoAssetId:'lip-video',audioAssetId:'lip-audio'},
   dance88:{referenceAssetId:'dance'},performance89:{referenceAssetId:'performance'}}]};
 const assets=new Set(assetsOf(project,profiles));
 for(const id of ['voice-take','voice-video','voice-audio','front','look-ref','layers','animated','vrm','stage','lip-video','lip-audio','dance','performance'])assert.ok(assets.has(id),id);
 assert.equal(assets.size,13);
});
test('restored character looks remap reference media instead of retaining old IDs',()=>{
 const source=readFileSync(new URL('../src/lib/projectBundle.js',import.meta.url),'utf8');
 assert.match(source,/if\(result\.looks\)result\.looks=result\.looks\.map\(look=>/);
 assert.match(source,/referenceAssetId:assetMap\[look\.referenceAssetId\]/);
});
