import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseCharacter3d,createRigSettings,saveRigSettings,validateRigSettings,modelAssets,rigStatus,expressionBindings} from '../src/lib/character3d.js';
import {calculateRigPose} from '../src/lib/character3dRenderer.js';
function makeGlb(changes=()=>{},opts={}){
 const pos=new Float32Array([0,0,0,1,0,0,0,1,0]);
 const target=new Float32Array([0,0,0,0,0,0,0,.3,0]);
 const data=new Uint8Array(72),dv=new DataView(data.buffer);
 pos.forEach((v,i)=>dv.setFloat32(i*4,v,true));target.forEach((v,i)=>dv.setFloat32(36+i*4,v,true));
 const j={asset:{version:'2.0'},buffers:[{byteLength:data.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:36}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3'},{bufferView:1,componentType:5126,count:3,type:'VEC3'}],meshes:[{weights:[0],primitives:[{attributes:{POSITION:0},targets:[{POSITION:1}]}]}],nodes:[{name:'Body',mesh:0,children:[1]},{name:'head',translation:[0,1,0]}],scenes:[{nodes:[0]}],scene:0,extensions:{VRMC_vrm:{humanoid:{humanBones:{head:{node:1}}},expressions:{preset:{happy:{morphTargetBinds:[{node:0,index:0,weight:1}]}}}}}};
 changes(j);
 const str=Buffer.from(JSON.stringify(j)),jsonlen=Math.ceil(str.length/4)*4,len=12+8+jsonlen+8+data.length;
 const buffer=Buffer.alloc(len);buffer.write('glTF',0);buffer.writeUInt32LE(2,4);buffer.writeUInt32LE(len,8);buffer.writeUInt32LE(jsonlen,12);buffer.writeUInt32LE(0x4e4f534a,16);str.copy(buffer,20);buffer.fill(0x20,20+str.length,20+jsonlen);
 const offset=20+jsonlen;buffer.writeUInt32LE(data.length,offset);buffer.writeUInt32LE(0x004e4942,offset+4);Buffer.from(data).copy(buffer,offset+8);
 return buffer;
}
const c={id:'char1',name:'Demo',rights:'owned',assets:[{id:'asset1',role:'model',name:'demo.vrm',size:1024},{id:'image1',role:'portrait',name:'a.png'}]};
test('83 glTF2 / VRM1 packed binary parsed into real mesh and nodes',()=>{const model=parseCharacter3d(makeGlb(),'avatar.vrm');assert.equal(model.vrm.version,'1.0');assert.equal(model.vertexCount,3);assert.equal(model.meshCount,1);assert.equal(model.primitives[0].targets.length,1);assert.equal(model.nodes[1].name,'head');});
test('83 native GLB same primitive reader',()=>{const model=parseCharacter3d(makeGlb(),'x.glb');assert.equal(model.primitives[0].position[3],1);});
test('83 VRM1 expression bind decoded',()=>{const model=parseCharacter3d(makeGlb(),'x.vrm');assert.deepEqual(expressionBindings(model,'happy'),[{node:0,index:0,weight:1}]);});
test('83 VRM0 humanoid and blend shapes supported',()=>{const buf=makeGlb(j=>{delete j.extensions.VRMC_vrm;j.extensions.VRM={humanoid:{humanBones:[{bone:'head',node:1}]},blendShapeMaster:{blendShapeGroups:[{presetName:'happy',binds:[{mesh:0,index:0,weight:80}]}]}};});const model=parseCharacter3d(buf,'x.vrm');assert.equal(model.vrm.version,'0.x');assert.equal(expressionBindings(model,'happy')[0].weight,.8);});
test('83 node pose changes with nod motion and manual bone',()=>{const m=parseCharacter3d(makeGlb(),'x.vrm');const s={...createRigSettings(c),motion:'nod'};const p1=calculateRigPose(m,s,0).worlds[1],p2=calculateRigPose(m,s,.5).worlds[1];assert.notDeepEqual(p1,p2);const p3=calculateRigPose(m,{...s,motion:'idle',boneName:'1',boneDegrees:45},0).worlds[1];assert.notDeepEqual(p3,p1);});
test('83 invalid GLB header and length are rejected',()=>{const raw=makeGlb();const truncated=raw.subarray(0,raw.length-4);assert.throws(()=>parseCharacter3d(truncated,'x.glb'),/헤더/);assert.throws(()=>parseCharacter3d(new Uint8Array(3),'x.vrm'),/짧/);});
test('83 external GLTF buffers rejected offline',()=>{const doc={asset:{version:'2.0'},buffers:[{uri:'http://bad.example/asset.bin',byteLength:12}]};assert.throws(()=>parseCharacter3d(new TextEncoder().encode(JSON.stringify(doc)),'x.gltf'),/외부/);});
test('83 scene/node hierarchy cycle rejected',()=>{const buf=makeGlb(j=>j.nodes[1].children=[0]);assert.throws(()=>parseCharacter3d(buf,'x.glb'),/순환/);});
test('83 buffer bounds validation',()=>{const buf=makeGlb(j=>j.accessors[0].count=100);assert.throws(()=>parseCharacter3d(buf,'x.glb'),/범위/);});
test('83 unsupported draco compression signals error',()=>{const buf=makeGlb(j=>j.meshes[0].primitives[0].extensions={KHR_draco_mesh_compression:{bufferView:0,attributes:{}}});assert.throws(()=>parseCharacter3d(buf,'x.glb'),/압축/);});
test('83 allowed model assets and model selection',()=>{assert.equal(modelAssets(c).length,1);assert.equal(createRigSettings(c).assetId,'asset1');assert.equal(rigStatus(c),'모델 1개 · 설정 전');});
test('83 settings save does not mutate original profile',()=>{const rig=createRigSettings(c);const saved=saveRigSettings(c,rig);assert.equal(saved.rig3d.assetId,'asset1');assert.equal(c.rig3d,undefined);assert.equal(rigStatus(saved),'3D 설정 저장됨');});
test('83 invalid model link, expression, bone name, and out-of-range values reject',()=>{const s=createRigSettings(c);for(const patch of [{assetId:'wrong'},{expression:'arbitrary'},{yaw:500},{boneName:'x'.repeat(110)},{expressionWeight:-1},{speed:NaN}])assert.throws(()=>validateRigSettings(c,{...s,...patch}));});
test('83 GLTF embedded data URI reads actual model geometry',()=>{const original=makeGlb();const model=parseCharacter3d(original,'x.glb');const bin=new Uint8Array(72);const dv=new DataView(bin.buffer);model.primitives[0].position.forEach((v,i)=>dv.setFloat32(i*4,v,true));model.primitives[0].targets[0].forEach((v,i)=>dv.setFloat32(36+i*4,v,true));const doc={asset:{version:'2.0'},buffers:[{uri:'data:application/octet-stream;base64,'+Buffer.from(bin).toString('base64'),byteLength:72}],bufferViews:[{buffer:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:36}],accessors:[{bufferView:0,count:3,componentType:5126,type:'VEC3'},{bufferView:1,count:3,componentType:5126,type:'VEC3'}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0},targets:[{POSITION:1}]}]}]};const out=parseCharacter3d(new TextEncoder().encode(JSON.stringify(doc)),'x.gltf');assert.equal(out.vertexCount,3);});

test('83 rights are mandatory for persisting 3D rig',()=>{const s=createRigSettings(c);assert.throws(()=>saveRigSettings({...c,rights:'reference'},s),/허가/);assert.throws(()=>saveRigSettings({...c,rights:'licensed',rightsNote:''},s),/허가/);assert.doesNotThrow(()=>saveRigSettings({...c,rights:'licensed',rightsNote:'licensed by artist'},s));});
test('83 restored project re-links stored 3D model to copied local asset',async()=>{
 const {importProjectBundle}=await import('../src/lib/projectBundle.js');const {newProject}=await import('../src/lib/schema.js');
 const profile=saveRigSettings(c,createRigSettings(c)),project=newProject();project.characterId=profile.id;
 const payload={format:'MYVOCAL_PROJECT_BACKUP',formatVersion:2,project,profiles:{voices:[],characters:[profile]},assets:{asset1:{name:'demo.vrm',type:'model/gltf-binary',dataUrl:'data:model/gltf-binary;base64,'+Buffer.from('validbinary').toString('base64')}}};
 const old=globalThis.indexedDB;globalThis.indexedDB={open:()=>{const req={};queueMicrotask(()=>{req.result={close(){},transaction(){const tx={objectStore(){return {add(){queueMicrotask(()=>tx.oncomplete?.());}}}};return tx;}};req.onsuccess?.();});return req;}};
 try{const result=await importProjectBundle(new File([JSON.stringify(payload)],'sample.json',{type:'application/json'}));const out=result.characters[0];assert.notEqual(out.rig3d.assetId,'asset1');assert.equal(out.rig3d.assetId,out.assets[0].id);assert.equal(rigStatus(out),'3D 설정 저장됨');assert.equal(result.project.characterId,out.id);}finally{globalThis.indexedDB=old;}
});
test('83 UI imports local WebGL viewer, modal and profile persistence without network',async()=>{const fs=await import('node:fs');const ui=fs.readFileSync(new URL('../src/components/Character3dEditor.jsx',import.meta.url),'utf8');const chars=fs.readFileSync(new URL('../src/pages/Characters.jsx',import.meta.url),'utf8');for(const token of ['getFile(assetId)','new Character3dRenderer','requestAnimationFrame','saveRigSettings','VRM','GLB'])assert.ok(ui.includes(token),token);for(const token of ['Character3dEditor','setModelFor(c)','STEP83 · 3D 캐릭터 시스템'])assert.ok(chars.includes(token),token);});
