import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {VOICE_GUIDES,getVoiceGuide,checkSampleQuality,voiceDatasetSummary,voiceDatasetManifest,packageVoiceDataset} from '../src/lib/voiceDataset.js';
import {crc32,makeZip} from '../src/lib/zipStore.js';
const good={duration:8,meanRmsDb:-19,clippedPercent:0,voicedPercent:65,voicedFrames:70,lowNote:'C4',highNote:'E4',medianHz:260};
test('12 unique guide prompts, grouped by vowel and register',()=>{assert.equal(VOICE_GUIDES.length,12);assert.equal(new Set(VOICE_GUIDES.map(g=>g.id)).size,12);assert.equal(getVoiceGuide('low-a').letter,'ㅏ');assert.equal(getVoiceGuide('unknown'),null);});
test('quality accepts measured audio but flags short/quiet/clipped/undetectable',()=>{assert.equal(checkSampleQuality(good).status,'usable');assert.equal(checkSampleQuality(null).status,'pending');assert.equal(checkSampleQuality({...good,duration:2}).status,'attention');assert.equal(checkSampleQuality({...good,clippedPercent:1}).status,'attention');assert.equal(checkSampleQuality({...good,meanRmsDb:-50,voicedPercent:0,voicedFrames:0}).issues.length,2);});
test('completion uses DISTINCT labeled, quality-passed samples only',()=>{const voice={assetId:'one',capturePromptId:'low-a',analysis:good,assets:[{id:'two',capturePromptId:'low-a',analysis:good},{id:'three',capturePromptId:'middle-i',analysis:{...good,duration:2}},{id:'four',capturePromptId:'high-u',analysis:good}]};const x=voiceDatasetSummary(voice);assert.equal(x.total,4);assert.equal(x.passed,3);assert.equal(x.completed,2);assert.equal(x.percent,17);});
test('manifest marks label as user-provided not validated and preserves rights',()=>{const manifest=voiceDatasetManifest({name:'mine',rights:'self',style:'Soft'},[{id:'a',fileName:'test.wav',path:'audio/sample-001.wav',type:'audio/wav',bytes:3,capturePromptId:'low-a',analysis:good}]);assert.equal(manifest.samples[0].register,'저음');assert.match(manifest.notice,/NOT verified/);assert.equal(manifest.voice.rights,'self');});
test('ZIP CRC32 matches standard test vector',()=>{assert.equal(crc32(new TextEncoder().encode('123456789')),0xcbf43926);const zip=makeZip([{name:'a.txt',data:new TextEncoder().encode('abc')}]);assert.equal(zip[0],0x50);assert.equal(zip[zip.length-22],0x50);assert.throws(()=>makeZip([{name:'../evil',data:new Uint8Array()}]),/안전하지/);});
test('voice dataset packages actual files and rejects missing assets',async()=>{const v={name:'내 목소리',rights:'self',style:'Natural',assetId:'x',fileName:'hello.wav',capturePromptId:'low-a',analysis:good,assets:[]};const get=async id=>new File([new Uint8Array([0,1,2,3])],'test.wav',{type:'audio/wav'});const pkg=await packageVoiceDataset(v,get);assert.ok(pkg.bytes.length>100);assert.equal(pkg.manifest.samples[0].path,'audio/sample-001.wav');assert.equal(pkg.manifest.samples[0].bytes,4);await assert.rejects(()=>packageVoiceDataset(v,async()=>null),/원본/);});
test('reference-only rights cannot export voice training collection',async()=>{await assert.rejects(()=>packageVoiceDataset({rights:'reference'}),/권한/);});

test('voice ZIP includes a local SHA-256 fingerprint for each original sample',async()=>{
 const raw=Uint8Array.of(1,2,3,255,254);
 const v={id:'v1',name:'Self',rights:'self',assets:[{id:'take1',fileName:'mytake.wav'}]};
 const output=await packageVoiceDataset(v,async()=>new File([raw],'mytake.wav',{type:'audio/wav'}));
 assert.equal(output.manifest.samples[0].sha256,createHash('sha256').update(raw).digest('hex'));
});
test('voice ZIP refuses duplicate original IDs rather than silently making two different entries',async()=>{
 const v={rights:'self',assetId:'same',assets:[{id:'same',fileName:'duplicate.wav'}]};
 await assert.rejects(packageVoiceDataset(v,async()=>new File(['audio'],'x.wav')),/중복/);
});
