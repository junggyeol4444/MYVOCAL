// STEP83 — offline glTF 2.0 / GLB / VRM model reader and local rig controls.
// No remote dependencies. File input is always an IndexedDB Blob owned by the user.
export const MODEL_EXTENSIONS=['vrm','glb','gltf'];
export const MOTIONS=['idle','nod','wave'];
export const EXPRESSIONS=['neutral','happy','angry','sad','relaxed','surprised','aa','ih','ou','ee','oh'];
const MAX_VERTICES=1000000, MAX_NODES=2048, MAX_PRIMITIVES=500, MAX_KEYS=100000;
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const arr=(v)=>Array.isArray(v)?v:[];
const raise=s=>{throw Error(s);};
const dataBytes=(uri)=>{
 if(typeof uri!=='string'||!uri.startsWith('data:'))throw Error('외부 .bin/.png/텍스처 URL은 지원하지 않습니다. GLB/VRM 또는 데이터가 포함된 glTF만 불러오세요.');
 const i=uri.indexOf(',');if(i<0||!/;base64$/i.test(uri.slice(0,i)))throw Error('base64 데이터 URI만 지원합니다.');
 const binary=atob(uri.slice(i+1));const u=new Uint8Array(binary.length);for(let j=0;j<u.length;j++)u[j]=binary.charCodeAt(j);return u;
};
const uint32=(view,i)=>view.getUint32(i,true);
function loadContainer(bytes,filename){
 const extension=String(filename||'').split('.').pop().toLowerCase();if(!MODEL_EXTENSIONS.includes(extension))throw Error('지원 형식: .vrm, .glb, 포함형 .gltf');
 if(bytes.byteLength<20&&extension!=='gltf')throw Error('GLB/VRM 파일이 너무 짧습니다.');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let json,bins=[];
 if(extension==='gltf'){
  json=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 }else{
  if(uint32(view,0)!==0x46546c67||uint32(view,4)!==2||uint32(view,8)!==bytes.byteLength)throw Error('glTF 2.0 GLB 헤더가 아닙니다.');
  let offset=12;while(offset<bytes.length){if(offset+8>bytes.length)throw Error('GLB 청크 헤더가 잘렸습니다.');const len=uint32(view,offset),type=uint32(view,offset+4);offset+=8;
   if(len%4||offset+len>bytes.length)throw Error('GLB 청크 크기가 잘못되었습니다.');
   const chunk=bytes.subarray(offset,offset+len);if(type===0x4e4f534a){if(json)throw Error('중복 GLB JSON 청크');json=JSON.parse(new TextDecoder().decode(chunk));}
   else if(type===0x004e4942)bins.push(chunk);offset+=len;
  }
 }
 if(!isObject(json)||json.asset?.version!=='2.0')throw Error('glTF 2.0 문서가 아닙니다.');
 if(json.extensionsRequired?.some(x=>x==='KHR_draco_mesh_compression'||x==='EXT_meshopt_compression'||x==='KHR_mesh_quantization'))throw Error('압축 메시/양자화 확장은 현재 지원하지 않습니다.');
 const buffers=arr(json.buffers).map((b,i)=>{const bytes=b.uri?dataBytes(b.uri):bins.shift();if(!bytes||bytes.byteLength<(b.byteLength||0))throw Error(`버퍼 ${i} 크기/내용 오류`);return bytes;});
 return {json,buffers,extension};
}
const COMPONENTS={5120:{bytes:1,read:(v,o)=>v.getInt8(o)},5121:{bytes:1,read:(v,o)=>v.getUint8(o)},5122:{bytes:2,read:(v,o)=>v.getInt16(o,true)},5123:{bytes:2,read:(v,o)=>v.getUint16(o,true)},5125:{bytes:4,read:(v,o)=>v.getUint32(o,true)},5126:{bytes:4,read:(v,o)=>v.getFloat32(o,true)}};
const ELEMENTS={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
// glTF 2.0 sparse accessor: 기존 dense 버퍼를 읽고 일부 인덱스만 별도 값으로 치환.
// 원본 VRM/GLB bytes는 항상 읽기 전용이며 별도의 Float32Array만 만든다.
function accessorLoader(json,buffers){
 const viewOf=(index,label)=>{
  const v=json.bufferViews?.[index],bytes=v&&buffers[v.buffer];
  if(!v||!bytes||!Number.isSafeInteger(v.byteOffset??0)||
    !Number.isSafeInteger(v.byteLength)||v.byteLength<0||v.byteOffset<0||
    v.byteOffset+v.byteLength>bytes.byteLength)throw Error(label+'의 glTF bufferView 범위가 올바르지 않습니다.');
  return {v,bytes,dv:new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)};
 };
 const normalized=(raw,type)=>{
  if(type===5126)return raw;
  const signed=type===5120||type===5122;
  const max=type===5120?127:type===5121?255:type===5122?32767:type===5123?65535:4294967295;
  return signed?Math.max(-1,raw/max):raw/max;
 };
 return id=>{
  const a=json.accessors?.[id];
  if(!a||!Number.isInteger(a.count)||a.count<0||a.count>MAX_VERTICES*4||
    !ELEMENTS[a.type]||!COMPONENTS[a.componentType])throw Error('지원되지 않는 glTF accessor: '+id);
  const n=ELEMENTS[a.type],type=a.componentType,info=COMPONENTS[type],elementSize=n*info.bytes;
  const out=new Float32Array(a.count*n);
  if(a.bufferView!==undefined){
   const {v,bytes,dv}=viewOf(a.bufferView,'기본 Accessor');
   const stride=v.byteStride??elementSize,base=(v.byteOffset??0)+(a.byteOffset??0);
   if(!Number.isSafeInteger(stride)||stride<elementSize||stride>252||
      !Number.isSafeInteger(a.byteOffset??0)||a.byteOffset<0||
      (a.count>0&&(base+(a.count-1)*stride+elementSize>v.byteOffset+v.byteLength||
       base+(a.count-1)*stride+elementSize>bytes.byteLength)))
    throw Error('glTF 기본 Accessor가 지정한 버퍼 범위를 벗어납니다.');
   for(let i=0;i<a.count;i++)for(let j=0;j<n;j++){
    const value=info.read(dv,base+i*stride+j*info.bytes);
    const decoded=a.normalized?normalized(value,type):value;
    if(!Number.isFinite(decoded))throw Error('glTF 기본 Accessor의 숫자가 유효하지 않습니다.');
    out[i*n+j]=decoded;
   }
  }
  const sparse=a.sparse;
  if(sparse!==undefined){
   if(!sparse||!Number.isInteger(sparse.count)||sparse.count<1||sparse.count>a.count||
      !sparse.indices||!sparse.values||
      ![5121,5123,5125].includes(sparse.indices.componentType))
    throw Error('glTF Sparse Accessor의 개수 또는 인덱스 형식이 잘못되었습니다.');
   const indices=viewOf(sparse.indices.bufferView,'Sparse 인덱스');
   const values=viewOf(sparse.values.bufferView,'Sparse 값');
   const indexInfo=COMPONENTS[sparse.indices.componentType];
   const indexOffset=(indices.v.byteOffset??0)+(sparse.indices.byteOffset??0);
   const valueOffset=(values.v.byteOffset??0)+(sparse.values.byteOffset??0);
   if(!Number.isSafeInteger(sparse.indices.byteOffset??0)||
      !Number.isSafeInteger(sparse.values.byteOffset??0)||
      sparse.indices.byteOffset<0||sparse.values.byteOffset<0||
      indexOffset+sparse.count*indexInfo.bytes>indices.v.byteOffset+indices.v.byteLength||
      valueOffset+sparse.count*elementSize>values.v.byteOffset+values.v.byteLength||
      indexOffset+sparse.count*indexInfo.bytes>indices.bytes.byteLength||
      valueOffset+sparse.count*elementSize>values.bytes.byteLength)
    throw Error('glTF Sparse 인덱스/값이 모델 버퍼 범위를 벗어납니다.');
   let previous=-1;
   for(let k=0;k<sparse.count;k++){
    const target=indexInfo.read(indices.dv,indexOffset+k*indexInfo.bytes);
    if(!Number.isInteger(target)||target<=previous||target>=a.count)
     throw Error('glTF Sparse 인덱스가 중복되거나 범위를 벗어났습니다.');
    previous=target;
    for(let j=0;j<n;j++){
     const raw=info.read(values.dv,valueOffset+k*elementSize+j*info.bytes);
     const decoded=a.normalized?normalized(raw,type):raw;
     if(!Number.isFinite(decoded))throw Error('glTF Sparse 모프/정점 값이 유효하지 않습니다.');
     out[target*n+j]=decoded;
    }
   }
  }
  return {array:out,components:n,count:a.count};
 };
}
// glTF/VRM 매트릭스 노드를 실제 본 회전에도 사용할 수 있도록 TRS로 분해한다.
// 미변경 노드에는 아래 추출된 원본 matrix 자체를 그대로 사용한다.
function decomposeGLTFMatrix(matrix){
 if(!Array.isArray(matrix)||matrix.length!==16||!matrix.every(Number.isFinite)||
    Math.abs(matrix[3])>1e-6||Math.abs(matrix[7])>1e-6||
    Math.abs(matrix[11])>1e-6||Math.abs(matrix[15]-1)>1e-6)
  throw Error('VRM/glTF 노드에 지원되지 않는 4×4 변환 행렬이 있습니다.');
 const translation=matrix.slice(12,15);
 const axis=[0,1,2].map(k=>matrix.slice(k*4,k*4+3));
 const scale=axis.map(v=>Math.hypot(...v));
 if(scale.some(x=>x<1e-8||!Number.isFinite(x)))throw Error('VRM/glTF 본의 크기가 0입니다.');
 // 음수 스케일이 포함된 미러링 좌표계는 한 축의 부호를 보존한다.
 const cross=[axis[0][1]*axis[1][2]-axis[0][2]*axis[1][1],
  axis[0][2]*axis[1][0]-axis[0][0]*axis[1][2],
  axis[0][0]*axis[1][1]-axis[0][1]*axis[1][0]];
 const determinant=cross.reduce((sum,v,i)=>sum+v*axis[2][i],0);
 if(Math.abs(determinant)<1e-10)throw Error('VRM/glTF 본의 축이 겹쳐 회전할 수 없습니다.');
 if(determinant<0)scale[0]*=-1;
 const col=axis.map((v,i)=>v.map(x=>x/scale[i]));
 const dot=(x,y)=>col[x].reduce((sum,v,k)=>sum+v*col[y][k],0);
 if([dot(0,1),dot(0,2),dot(1,2)].some(x=>Math.abs(x)>1e-4))
  throw Error('VRM/glTF 본의 기울어진 행렬은 안전하게 회전할 수 없습니다.');
 const m00=col[0][0],m01=col[1][0],m02=col[2][0];
 const m10=col[0][1],m11=col[1][1],m12=col[2][1];
 const m20=col[0][2],m21=col[1][2],m22=col[2][2];
 let quaternion;
 const trace=m00+m11+m22;
 if(trace>0){
  const n=Math.sqrt(trace+1)*2;
  quaternion=[(m21-m12)/n,(m02-m20)/n,(m10-m01)/n,n/4];
 }else if(m00>m11&&m00>m22){
  const n=Math.sqrt(1+m00-m11-m22)*2;
  quaternion=[n/4,(m01+m10)/n,(m02+m20)/n,(m21-m12)/n];
 }else if(m11>m22){
  const n=Math.sqrt(1+m11-m00-m22)*2;
  quaternion=[(m01+m10)/n,n/4,(m12+m21)/n,(m02-m20)/n];
 }else{
  const n=Math.sqrt(1+m22-m00-m11)*2;
  quaternion=[(m02+m20)/n,(m12+m21)/n,n/4,(m10-m01)/n];
 }
 const qnorm=Math.hypot(...quaternion);
 if(!Number.isFinite(qnorm)||qnorm<1e-8)throw Error('VRM/glTF 본의 회전 쿼터니언이 올바르지 않습니다.');
 return {translation,rotation:quaternion.map(x=>x/qnorm),scale};
}
function vrmInfo(json){
 const vrm1=json.extensions?.VRMC_vrm,vrm0=json.extensions?.VRM;
 const map={};
 if(vrm1?.humanoid?.humanBones)for(const [name,v] of Object.entries(vrm1.humanoid.humanBones))if(Number.isInteger(v.node))map[name]=v.node;
 if(vrm0?.humanoid?.humanBones)for(const v of vrm0.humanoid.humanBones)if(v.bone&&Number.isInteger(v.node))map[v.bone]=v.node;
 const expressions={};
 if(vrm1?.expressions)for(const [name,entry] of Object.entries({...vrm1.expressions.preset,...vrm1.expressions.custom})){
  const binds=arr(entry?.morphTargetBinds).map(b=>({node:b.node,index:b.index,weight:b.weight??1}));expressions[name.toLowerCase()]=binds;
 }
 if(vrm0?.blendShapeMaster?.blendShapeGroups)for(const group of vrm0.blendShapeMaster.blendShapeGroups){
  const binds=arr(group.binds).map(b=>({mesh:b.mesh,index:b.index,weight:clamp((b.weight??100)/100,0,1)}));expressions[String(group.presetName==='unknown'?group.name:group.presetName).toLowerCase()]=binds;
 }
 return {version:vrm1?'1.0':vrm0?'0.x':null,bones:map,expressions};
}
export function parseCharacter3d(arrayBuffer,filename){
 const bytes=arrayBuffer instanceof Uint8Array?arrayBuffer:new Uint8Array(arrayBuffer);
 if(bytes.length>40*1024*1024)throw Error('모델은 40MB 이하여야 합니다.');
 const {json,buffers,extension}=loadContainer(bytes,filename),read=accessorLoader(json,buffers);
 if(arr(json.nodes).length>MAX_NODES)throw Error('노드가 너무 많습니다.');
 const vrm=vrmInfo(json), nodes=arr(json.nodes).map((node,i)=>{
  const decomposed=node.matrix?decomposeGLTFMatrix(node.matrix):null;
  const translation=decomposed?.translation||(arr(node.translation).length===3?node.translation:[0,0,0]);
  const rotation=decomposed?.rotation||(arr(node.rotation).length===4?node.rotation:[0,0,0,1]);
  const scale=decomposed?.scale||(arr(node.scale).length===3?node.scale:[1,1,1]);
  return {index:i,name:String(node.name||`Node ${i}`).slice(0,100),children:arr(node.children),mesh:node.mesh,skin:node.skin,translation,rotation,scale,matrix:node.matrix,weights:arr(node.weights)};
 });
 const skins=arr(json.skins).map(s=>({joints:arr(s.joints),inverseBind:s.inverseBindMatrices===undefined?null:read(s.inverseBindMatrices).array,skeleton:s.skeleton}));
 const primitives=[];let vertexCount=0;
 nodes.forEach(node=>{if(node.mesh===undefined)return;const mesh=json.meshes?.[node.mesh];if(!mesh)throw Error('메시 참조가 없습니다.');
  arr(mesh.primitives).forEach(p=>{
   if(p.extensions?.KHR_draco_mesh_compression||p.extensions?.EXT_meshopt_compression)throw Error('압축 모델은 지원하지 않습니다.');
   if(!p.attributes||p.attributes.POSITION===undefined)throw Error('POSITION이 없는 메시');
   const position=read(p.attributes.POSITION);if(position.components!==3)throw Error('POSITION은 VEC3여야 합니다.');
   vertexCount+=position.count;if(vertexCount>MAX_VERTICES||primitives.length>=MAX_PRIMITIVES)throw Error('메시가 허용 크기를 초과합니다.');
   const indices=p.indices!==undefined?read(p.indices).array:null;
   if(indices&&indices.some(n=>n<0||n>=position.count||!Number.isInteger(n)))throw Error('메시 인덱스 범위 오류');
   const extract=(name,n)=>{const id=p.attributes[name];if(id===undefined)return null;const a=read(id);if(a.count!==position.count||a.components!==n)throw Error(name+' 데이터 개수 오류');return a.array;};
   const targets=arr(p.targets).map(t=>{const a=t.POSITION===undefined?null:read(t.POSITION);if(a&&(a.count!==position.count||a.components!==3))throw Error('Morph 데이터 개수 오류');return a?.array||null;});
   const mat=json.materials?.[p.material]||{}, pbr=mat.pbrMetallicRoughness||{};
   const source={node:node.index,mesh:node.mesh,position:position.array,indices:indices||Float32Array.from({length:position.count},(_,i)=>i),uv:extract('TEXCOORD_0',2),joints:extract('JOINTS_0',4),jointWeights:extract('WEIGHTS_0',4),targets,weights:node.weights.length?node.weights:arr(mesh.weights),material:{color:pbr.baseColorFactor||[.8,.8,.85,1],texture:pbr.baseColorTexture?.index,alphaMode:['OPAQUE','MASK','BLEND'].includes(mat.alphaMode)?mat.alphaMode:'OPAQUE',alphaCutoff:Number.isFinite(mat.alphaCutoff)?clamp(mat.alphaCutoff,0,1):.5,doubleSided:!!mat.doubleSided},mode:p.mode??4};
   if(![4,5,6].includes(source.mode))throw Error('이 모델의 기하 형태(선/점)는 아직 지원하지 않습니다.');primitives.push(source);
  });
 });
 if(!primitives.length)throw Error('렌더링할 3D 메시가 없습니다.');
 const images=arr(json.images).map(img=>{
  if(img.uri)return dataBytes(img.uri);
  const v=json.bufferViews?.[img.bufferView];if(!v||!buffers[v.buffer])throw Error('이미지 버퍼가 없습니다.');
  return buffers[v.buffer].slice(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);
 });
 const textures=arr(json.textures).map(x=>x.source??null);
 const animations=arr(json.animations).map((a,i)=>{
  const samplers=arr(a.samplers).map(s=>{
   const times=read(s.input),values=read(s.output);if(times.components!==1||times.count>MAX_KEYS)throw Error('애니메이션 키프레임 오류');
   for(let t=1;t<times.count;t++)if(times.array[t]<times.array[t-1])throw Error('시간 역전 키프레임');
   return {times:times.array,values:values.array,components:values.components,interpolation:s.interpolation||'LINEAR'};
  });
  const channels=arr(a.channels).map(c=>({node:c.target?.node,path:c.target?.path,sampler:samplers[c.sampler]})).filter(c=>nodes[c.node]&&['rotation','translation','scale','weights'].includes(c.path)&&c.sampler);
  return {name:String(a.name||`Motion ${i+1}`).slice(0,100),channels,duration:Math.max(0,...samplers.map(s=>s.times[s.times.length-1]||0))};
 });
 const parents=new Array(nodes.length).fill(-1);nodes.forEach(n=>n.children.forEach(c=>{if(!nodes[c]||parents[c]!==-1)throw Error('중복/잘못된 노드 계층');parents[c]=n.index;}));
 const visiting=new Set(),done=new Set();function visit(i){if(visiting.has(i))throw Error('노드 계층 순환 참조');if(done.has(i))return;visiting.add(i);if(parents[i]>=0)visit(parents[i]);visiting.delete(i);done.add(i);}nodes.forEach(n=>visit(n.index));
 return {format:extension,vrm,nodes,parents,skins,primitives,images,textures,animations,vertexCount,meshCount:primitives.length};
}
export function modelAssets(character){return arr(character?.assets).filter(a=>a.role==='model'&&/\.(vrm|glb|gltf)$/i.test(a.name||''));}
export function validateRigSettings(character,settings){
 if(!['owned','self','licensed'].includes(character?.rights)||(character.rights==='licensed'&&!character.rightsNote?.trim()))throw Error('본인 제작 자료 또는 사용 허가 기록이 있는 3D 모델만 저장할 수 있습니다.');
 if(!isObject(settings)||!modelAssets(character).some(a=>a.id===settings.assetId))throw Error('현재 캐릭터의 3D 원본과 연결되지 않은 설정입니다.');
 if(!MOTIONS.includes(settings.motion)||!EXPRESSIONS.includes(settings.expression))throw Error('동작·표정 설정이 잘못되었습니다.');
 for(const k of ['expressionWeight','speed','yaw','pitch','boneDegrees'])if(!Number.isFinite(settings[k]))throw Error(k+' 값이 올바르지 않습니다.');
 if(settings.expressionWeight<0||settings.expressionWeight>1||settings.speed<.1||settings.speed>3||Math.abs(settings.yaw)>180||Math.abs(settings.pitch)>60||Math.abs(settings.boneDegrees)>90)throw Error('3D 동작 설정 범위 오류');
 if(typeof settings.boneName!=='string'||settings.boneName.length>100)throw Error('본 이름 오류');
 if(typeof settings.animation!=='string'||settings.animation.length>100)throw Error('모션 이름 오류');
 return settings;
}
export function createRigSettings(character,assetId){const a=modelAssets(character).find(a=>a.id===assetId)||modelAssets(character)[0];if(!a)throw Error('캐릭터에 VRM/GLB 모델이 없습니다.');return {assetId:a.id,motion:'idle',expression:'neutral',expressionWeight:1,speed:1,yaw:0,pitch:0,boneName:'',boneDegrees:0,animation:''};}
export function saveRigSettings(character,settings){validateRigSettings(character,settings);return {...character,rig3d:{...settings},updatedAt:new Date().toISOString()};}
export function rigStatus(character){const assets=modelAssets(character);if(!assets.length)return '등록된 3D 모델 없음';try{if(!character.rig3d)return `모델 ${assets.length}개 · 설정 전`;validateRigSettings(character,character.rig3d);return '3D 설정 저장됨';}catch{return '기존 3D 설정 재검토 필요';}}
export function expressionBindings(model,name){return model.vrm.expressions[String(name||'neutral').toLowerCase()]||[];}
