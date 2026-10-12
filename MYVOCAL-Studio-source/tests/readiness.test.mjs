import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CAPABILITY_AUDIT,capabilityCounts,summarizeReadiness,systemCheckLabels} from '../src/lib/readiness.js';
test('feature audit never claims real neural singing or video generation',()=>{
 const counts=capabilityCounts();
 assert.equal(counts.basic+counts.partial+counts.blocked,CAPABILITY_AUDIT.length);
 assert.equal(CAPABILITY_AUDIT.find(x=>x.key==='singing').state,'blocked');
 assert.equal(CAPABILITY_AUDIT.find(x=>x.key==='video').state,'blocked');
});
test('summarized system checks distinguish backend from asset storage',()=>{
 const report={checks:[{available:true},{available:false},{available:true}],managedEngineRunning:true,bundledNeuralSinging:false,bundledVideoGenerator:false};
 assert.deepEqual(summarizeReadiness(report,false),{ready:2,checks:3,storage:false,engine:true,neural:false,video:false});
});
test('status labels are available',()=>assert.equal(systemCheckLabels().data_folder,'앱 데이터 저장 폴더'));
