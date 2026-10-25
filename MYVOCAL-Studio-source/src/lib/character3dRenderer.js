import {visemeAt} from './characterLipSync.js';
import {expressionAt} from './characterExpressionDirector.js';
import {dancePose} from './characterDanceDirector.js';
import {performancePose} from './characterPerformance89.js';
// STEP83 — minimal embedded glTF WebGL1 preview. No remote requests or AI calls.
// Supports uncompressed GLB/VRM geometries, glTF skins, morph targets and linear animations.
import {expressionBindings} from './character3d.js';
import {stageFrame} from './characterStage3d.js';
const I=()=>[1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
const multiply=(a,b)=>{const o=new Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;};
const transform=(m,v,w=1)=>[m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12]*w,m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13]*w,m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]*w];
const qnormalize=q=>{const n=Math.hypot(...q)||1;return q.map(x=>x/n);};
const qmul=(a,b)=>qnormalize([a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[0]]);
const axisQ=(axis,rad)=>{const s=Math.sin(rad/2);return [axis[0]*s,axis[1]*s,axis[2]*s,Math.cos(rad/2)];};
function compose(t,q,s){const [x,y,z,w]=qnormalize(q),[sx,sy,sz]=s;return [(1-2*y*y-2*z*z)*sx,(2*x*y+2*w*z)*sx,(2*x*z-2*w*y)*sx,0,(2*x*y-2*w*z)*sy,(1-2*x*x-2*z*z)*sy,(2*y*z+2*w*x)*sy,0,(2*x*z+2*w*y)*sz,(2*y*z-2*w*x)*sz,(1-2*x*x-2*y*y)*sz,0,t[0],t[1],t[2],1];}
function inv(m){const a=m.slice(),b=I(); // Gauss-Jordan in row-oriented scratch
 const r=Array.from({length:4},(_,i)=>Array.from({length:8},(_,j)=>j<4?a[j*4+i]:(i===j-4?1:0)));
 for(let c=0;c<4;c++){let p=c;for(let i=c+1;i<4;i++)if(Math.abs(r[i][c])>Math.abs(r[p][c]))p=i;if(Math.abs(r[p][c])<1e-10)return I();[r[c],r[p]]=[r[p],r[c]];let d=r[c][c];for(let j=0;j<8;j++)r[c][j]/=d;for(let i=0;i<4;i++)if(i!==c){d=r[i][c];for(let j=0;j<8;j++)r[i][j]-=d*r[c][j];}}
 for(let c=0;c<4;c++)for(let rr=0;rr<4;rr++)b[c*4+rr]=r[rr][4+c];return b;
}
const lerp=(a,b,t)=>a+(b-a)*t;
// glTF 2.0 LINEAR rotation uses shortest-arc quaternion SLERP, not component-wise lerp.
function slerpQuaternion(a,b,t){
 const from=qnormalize(a),to=qnormalize(b);
 let dot=from.reduce((sum,value,i)=>sum+value*to[i],0);
 const sign=dot<0?-1:1;dot=Math.min(1,Math.max(-1,dot*sign));
 if(dot>.9995)return qnormalize(from.map((value,i)=>value+(sign*to[i]-value)*t));
 const angle=Math.acos(dot),denom=Math.sin(angle);
 const wa=Math.sin((1-t)*angle)/denom,wb=Math.sin(t*angle)/denom;
 return qnormalize(from.map((value,i)=>wa*value+wb*sign*to[i]));
}
// VRM blink morphs are driven on the real WebGL mesh and do not edit model files.
function vrmBlinkWeight(seconds){
 if(!Number.isFinite(seconds)||seconds<0)return 0;
 const phase=seconds%5.4;
 const pulse=(center,half)=>Math.max(0,1-Math.abs(phase-center)/half);
 return Math.max(pulse(1.72,.13),pulse(1.96,.11),pulse(4.58,.14));
}
function sample(s,t,path,weightCount=0){const n=s.times.length;if(!n)return null;let k=0;while(k<n-2&&s.times[k+1]<t)k++;const last=s.interpolation==='STEP'||k>=n-1||t<=s.times[k]?0:Math.max(0,Math.min(1,(t-s.times[k])/(s.times[k+1]-s.times[k]||1)));
 const width=path==='weights'?weightCount:s.components;
 if(s.interpolation==='CUBICSPLINE'){
  // glTF/VRM 원본 모션의 실제 Hermite 접선 보간. 키마다 입력접선·값·출력접선 순서다.
  if(!Number.isInteger(width)||width<1||s.values.length!==n*width*3)
   throw Error('VRM CUBICSPLINE 애니메이션의 키프레임·모프 개수가 일치하지 않습니다.');
  const key=(index,part)=>Array.from({length:width},(_,i)=>s.values[(index*3+part)*width+i]);
  const edge=t<=s.times[0]?0:t>=s.times[n-1]?n-1:-1;
  if(edge>=0||n===1){const value=key(Math.max(0,edge),1);return path==='rotation'?qnormalize(value):value;}
  const delta=s.times[k+1]-s.times[k];
  if(!Number.isFinite(delta)||delta<=0)throw Error('VRM CUBICSPLINE 애니메이션의 시간이 올바르지 않습니다.');
  const u=Math.max(0,Math.min(1,(t-s.times[k])/delta)),u2=u*u,u3=u2*u;
  const h00=2*u3-3*u2+1,h10=u3-2*u2+u,h01=-2*u3+3*u2,h11=u3-u2;
  const first=key(k,1),last=key(k+1,1),out=key(k,2),incoming=key(k+1,0);
  // 같은 회전을 나타내는 반대 부호 쿼터니언에서 불필요한 뒤집힘을 방지한다.
  const sign=path==='rotation'&&first.reduce((sum,v,i)=>sum+v*last[i],0)<0?-1:1;
  const values=first.map((v,i)=>h00*v+h10*delta*out[i]+h01*sign*last[i]+h11*delta*sign*incoming[i]);
  if(values.some(v=>!Number.isFinite(v)))throw Error('VRM 모션 보간 결과가 올바르지 않습니다.');
  return path==='rotation'?qnormalize(values):values;
 }const start=k*width,next=Math.min(k+1,n-1)*width;
 if(path==='rotation'&&s.interpolation==='LINEAR'&&k<n-1){
  const from=Array.from({length:width},(_,i)=>s.values[start+i]);
  const to=Array.from({length:width},(_,i)=>s.values[next+i]);
  return slerpQuaternion(from,to,last);
 }
 const values=Array.from({length:width},(_,i)=>lerp(s.values[start+i],s.values[next+i],last));
 return path==='rotation'?qnormalize(values):values;
}
export function calculateRigPose(model,settings,time,dancePlan){return calculateRigPoseWithPerformance(model,settings,time,dancePlan,null);}
export function calculateRigPoseWithPerformance(model,settings,time,dancePlan=null,performancePlan=null){
 const t=time*(settings.speed||1),locals=model.nodes.map(n=>({translation:[...n.translation],rotation:[...n.rotation],scale:[...n.scale],weights:[...n.weights]}));
 const chosen=model.animations.find(x=>settings.animation&&x.name===settings.animation);
 if(chosen&&chosen.duration>0){const sec=t%chosen.duration;for(const ch of chosen.channels){const dst=locals[ch.node];const width=ch.path==='weights'?(model.primitives.find(p=>p.node===ch.node)?.targets.length||0):0;const value=sample(ch.sampler,sec,ch.path,width);if(value&&value.length)dst[ch.path]=value;}}
 const vrm=model.vrm.bones;
 const drive=(name,axis,degrees)=>{const id=vrm[name];if(Number.isInteger(id)&&locals[id])locals[id].rotation=qmul(locals[id].rotation,axisQ(axis,degrees*Math.PI/180));};
 if(!chosen){
  if(settings.motion==='nod')drive('head',[1,0,0],Math.sin(t*3)*12);
  if(settings.motion==='wave'){drive('rightUpperArm',[0,0,1],-34+Math.sin(t*3)*12);drive('rightLowerArm',[1,0,0],Math.sin(t*3)*28);}
  if(settings.motion==='idle'){drive('head',[0,0,1],Math.sin(t*1.3)*2);drive('spine',[0,0,1],Math.sin(t*.8)*1.8);}
 }
 // Additive local dance pose. Does not overwrite imported glTF motions or manual rig controls.
 const dance=dancePlan?dancePose(dancePlan,time):null;
 if(dance){
  const twist=(name,axis,degrees)=>{const id=vrm[name];if(Number.isInteger(id)&&locals[id])locals[id].rotation=qmul(locals[id].rotation,axisQ(axis,degrees*Math.PI/180));};
  for(const name of ['hips','spine','head','leftUpperArm','rightUpperArm','leftLowerArm','rightLowerArm','leftUpperLeg','rightUpperLeg'])twist(name,[0,0,1],dance.angles[name]||0);
  const hip=vrm.hips;if(Number.isInteger(hip)&&locals[hip]){
   locals[hip].translation[1]+=dance.lift;
   locals[hip].translation[0]+=dance.offset;
  }
 }
 // STEP89: opt-in additive video motion-energy and MIDI gesture approximation.
 const acting=performancePlan?performancePose(performancePlan,time):null;
 if(acting){
  for(const [name,degrees] of Object.entries(acting.angles))drive(name,[0,0,1],degrees);
  const hip=vrm.hips;if(Number.isInteger(hip)&&locals[hip]){locals[hip].translation[1]+=acting.lift;locals[hip].translation[0]+=acting.offset;}
 }
 if(settings.boneName){const idx=Number(settings.boneName);if(Number.isInteger(idx)&&locals[idx])locals[idx].rotation=qmul(locals[idx].rotation,axisQ([0,0,1],settings.boneDegrees*Math.PI/180));}
 const worlds=new Array(model.nodes.length),stack=new Set();function world(i){if(worlds[i])return worlds[i];if(stack.has(i))throw Error('순환 본 계층');stack.add(i);const n=model.nodes[i],state=locals[i];const changed=!!settings.boneName&&Number(settings.boneName)===i||!!chosen?.channels.some(c=>c.node===i)||Object.values(vrm).includes(i);
  const local=n.matrix&&!changed?n.matrix:compose(state.translation,state.rotation,state.scale);
  const parent=model.parents[i];worlds[i]=parent<0?local:multiply(world(parent),local);stack.delete(i);return worlds[i];}
 for(let i=0;i<model.nodes.length;i++)world(i);
 return {locals,worlds,t};
}
function primitivesBounds(model,pose){let low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
 for(const p of model.primitives){const v=p.position,m=pose.worlds[p.node];for(let i=0;i<v.length;i+=3){const pos=transform(m,[v[i],v[i+1],v[i+2]]);for(let k=0;k<3;k++){low[k]=Math.min(low[k],pos[k]);high[k]=Math.max(high[k],pos[k]);}}}
 return {low,high,center:low.map((x,k)=>(x+high[k])/2),radius:Math.max(.05,Math.hypot(...high.map((x,k)=>x-low[k]))*.65)};
}
function projection(aspect){const f=1/Math.tan(Math.PI/6),near=.01,far=1000;return [f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0];}
function lookAt(eye,at){let z=eye.map((x,i)=>x-at[i]);const norm=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l);};z=norm(z);let x=norm([z[2],0,-z[0]]),y=[z[1]*x[2]-z[2]*x[1],z[2]*x[0]-z[0]*x[2],z[0]*x[1]-z[1]*x[0]];return [x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-x.reduce((s,v,i)=>s+v*eye[i],0),-y.reduce((s,v,i)=>s+v*eye[i],0),-z.reduce((s,v,i)=>s+v*eye[i],0),1];}
const VERT=`attribute vec3 pos; attribute vec2 uv; attribute float shade;uniform mat4 viewProj;varying vec2 vUV;varying float vShade;void main(){gl_Position=viewProj*vec4(pos,1.);vUV=uv;vShade=shade;}`;
const FRAG=`precision mediump float;uniform vec4 tint;uniform vec3 lightTint;uniform sampler2D tex;uniform float hasTex;uniform float alphaCutoff;uniform float forceOpaque;varying vec2 vUV;varying float vShade;void main(){vec4 c=tint*(hasTex>0.5?texture2D(tex,vUV):vec4(1.));if(forceOpaque>0.5)c.a=1.;if(c.a<alphaCutoff)discard;gl_FragColor=vec4(c.rgb*vShade*lightTint,c.a);}`;
function shader(gl,type,src){const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error('WebGL 셰이더 오류: '+gl.getShaderInfoLog(sh));return sh;}
function program(gl){const p=gl.createProgram();gl.attachShader(p,shader(gl,gl.VERTEX_SHADER,VERT));gl.attachShader(p,shader(gl,gl.FRAGMENT_SHADER,FRAG));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error('WebGL 프로그램 연결 실패');return p;}
function generateVertices(model,p,pose,settings,stageLighting=null,lipSync=null,time=0,directed=null){const n=p.position.length/3,values=new Float32Array(n*6),meshWorld=pose.worlds[p.node],skinIndex=model.nodes[p.node].skin,skin=model.skins[skinIndex];
 const matrices=skin?.joints.map((index,j)=>{const ib=skin.inverseBind?Array.from(skin.inverseBind.slice(j*16,j*16+16)):I();return multiply(pose.worlds[index]||I(),ib);});
 const weights=[...p.weights];const anim=pose.locals[p.node].weights;if(anim.length)for(let i=0;i<Math.min(weights.length,anim.length);i++)weights[i]=anim[i];
 const faceName=directed?.expression||settings.expression,faceWeight=directed?directed.weight:settings.expressionWeight;
 for(const binding of expressionBindings(model,faceName))if((binding.node===p.node)||(binding.mesh===p.mesh)){weights[binding.index]=(weights[binding.index]||0)+binding.weight*faceWeight;}
 if(settings.autoBlink!==false&&String(faceName||'').toLowerCase()!=='blink'){
  const blink=vrmBlinkWeight(time);
  if(blink>0){
   const common=expressionBindings(model,'blink');
   const eyelids=common.length?common:[...expressionBindings(model,'blinkleft'),...expressionBindings(model,'blinkright')];
   for(const b of eyelids)if(b.node===p.node||b.mesh===p.mesh)
    weights[b.index]=Math.max(weights[b.index]||0,Math.min(1,blink*b.weight));
  }
 }
 if(lipSync){const {viseme,weight}=visemeAt(lipSync,time);const aliases={A:['aa','a','ah'],I:['ih','i'],U:['ou','u'],E:['ee','e'],O:['oh','o'],M:['closed','m'],F:['ff','f']};
  for(const name of aliases[viseme]||[]){const bindings=expressionBindings(model,name);if(bindings.length){for(const b of bindings)if(b.node===p.node||b.mesh===p.mesh)weights[b.index]=Math.max(weights[b.index]||0,weight*b.weight);break;}}
 }
 for(let i=0;i<n;i++){
  let v=Array.from(p.position.slice(i*3,i*3+3));for(let j=0;j<p.targets.length;j++)if(p.targets[j]&&weights[j])for(let k=0;k<3;k++)v[k]+=p.targets[j][i*3+k]*Math.max(0,Math.min(1,weights[j]));
  let pos;
  if(matrices&&p.joints&&p.jointWeights){pos=[0,0,0];let sum=0;for(let j=0;j<4;j++){const weight=p.jointWeights[i*4+j],jid=Math.round(p.joints[i*4+j]);if(weight<=0||!matrices[jid])continue;const q=transform(matrices[jid],v);for(let k=0;k<3;k++)pos[k]+=q[k]*weight;sum+=weight;}if(sum<1e-8)pos=transform(meshWorld,v);else if(sum!==1)pos=pos.map(x=>x/sum);}
  else pos=transform(meshWorld,v);
  values.set(pos,i*6);values[i*6+3]=p.uv?p.uv[i*2]:0;values[i*6+4]=p.uv?p.uv[i*2+1]:0;
  // modest studio-style depth tint; non-PBR by design.
  values[i*6+5]=stageLighting?Math.max(.18,Math.min(1.65, stageLighting.brightness*(.56+.18*Math.sin(pos[0]*1.2+stageLighting.sweep)+.12*Math.cos(pos[2]*.8)+.16*Math.max(0,(pos[1]+1)/3)))):.78;
 }
 return values;
}
export class Character3dRenderer{
 constructor(canvas,model){this.canvas=canvas;this.model=model;this.gl=canvas.getContext('webgl',{alpha:false,antialias:true,preserveDrawingBuffer:true});const gl=this.gl;if(!gl)throw Error('이 환경에서는 WebGL을 사용할 수 없습니다.');
  this.shader=program(gl);this.attrib={pos:gl.getAttribLocation(this.shader,'pos'),uv:gl.getAttribLocation(this.shader,'uv'),shade:gl.getAttribLocation(this.shader,'shade')};this.uniform={viewProj:gl.getUniformLocation(this.shader,'viewProj'),tint:gl.getUniformLocation(this.shader,'tint'),tex:gl.getUniformLocation(this.shader,'tex'),hasTex:gl.getUniformLocation(this.shader,'hasTex'),alphaCutoff:gl.getUniformLocation(this.shader,'alphaCutoff'),forceOpaque:gl.getUniformLocation(this.shader,'forceOpaque'),lightTint:gl.getUniformLocation(this.shader,'lightTint')};
  this.resources=model.primitives.map(p=>{const vertices=gl.createBuffer(),indices=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vertices);gl.bufferData(gl.ARRAY_BUFFER,p.position.length/3*24,gl.DYNAMIC_DRAW);
   const use32=p.indices.some(i=>i>65535);if(use32&&!gl.getExtension('OES_element_index_uint'))throw Error('이 그래픽 장치는 65,535개 이상 정점 인덱스를 지원하지 않습니다.');
   const idx=use32?new Uint32Array(p.indices):new Uint16Array(p.indices);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indices);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,idx,gl.STATIC_DRAW);
   return {vertices,indices,count:idx.length,indexType:use32?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT};});
  this.stageVertexBuffer=gl.createBuffer();this.stageIndexBuffer=gl.createBuffer();this.textureSlots=model.images.map(()=>null);this.textureUrls=[];this.disposed=false;this.loadTextures();
 }
 async loadTextures(){const gl=this.gl;for(let i=0;i<this.model.images.length;i++){
  const raw=this.model.images[i],url=URL.createObjectURL(new Blob([raw]));this.textureUrls.push(url);
  const img=new Image();try{await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('텍스처 디코딩 실패'));img.src=url;});if(this.disposed)break;
   const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);this.textureSlots[i]=t;
  }catch{/* if invalid texture, show solid material */}finally{URL.revokeObjectURL(url);}
 }}
 render(settings,time,stage=null,lipSync=null,expressionPlan=null,character=null,dancePlan=null,performancePlan=null,continuousStage=false){if(this.disposed)return;const gl=this.gl,model=this.model,pose=calculateRigPoseWithPerformance(model,settings,time,dancePlan,performancePlan),bounds=primitivesBounds(model,pose),frame=stage?stageFrame(stage,time,{continuous:continuousStage}):null;
  gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(...(frame?frame.palette.background:[.055,.072,.115]),1);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.shader);
  const yaw=(frame?.camera.yaw??settings.yaw)*Math.PI/180,pitch=(frame?.camera.pitch??settings.pitch)*Math.PI/180,dist=bounds.radius*3.3/(frame?.camera.zoom||1);const {center}=bounds;
  const eye=[center[0]+Math.sin(yaw)*Math.cos(pitch)*dist,center[1]+Math.sin(pitch)*dist,center[2]+Math.cos(yaw)*Math.cos(pitch)*dist];
  const target=frame?center.map((c,i)=>c+(i===0?frame.camera.track*bounds.radius:0)):center;
  const matrix=multiply(projection(this.canvas.width/this.canvas.height),lookAt(eye,target));gl.uniformMatrix4fv(this.uniform.viewProj,false,new Float32Array(matrix));gl.uniform1i(this.uniform.tex,0);
  if(frame)this.drawStage(frame,bounds,matrix);
  gl.uniform3fv(this.uniform.lightTint,frame?frame.light.theme:[1,1,1]);
  const directed=expressionPlan&&character?expressionAt(character,expressionPlan,time):null;
  const drawOrder=model.primitives.map((p,i)=>({p,i})).sort((a,b)=>
   Number(a.p.material.alphaMode==='BLEND')-Number(b.p.material.alphaMode==='BLEND'));
  for(const {p,i} of drawOrder){const item=this.resources[i],v=generateVertices(model,p,pose,settings,frame?.light,lipSync,time,directed);gl.bindBuffer(gl.ARRAY_BUFFER,item.vertices);gl.bufferSubData(gl.ARRAY_BUFFER,0,v);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,item.indices);
   for(const [name,size,offset] of [['pos',3,0],['uv',2,12],['shade',1,20]]){const loc=this.attrib[name];if(loc<0)continue;gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,24,offset);}
   const material=p.material,alpha=material.alphaMode;
   if(alpha==='BLEND'){gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);}
   else{gl.disable(gl.BLEND);gl.depthMask(true);}
   gl.uniform1f(this.uniform.alphaCutoff,alpha==='MASK'?material.alphaCutoff:alpha==='BLEND'?.005:0);
   gl.uniform1f(this.uniform.forceOpaque,alpha==='OPAQUE'?1:0);
   gl.uniform4fv(this.uniform.tint,material.color);const imageIndex=model.textures[material.texture];const texture=this.textureSlots[imageIndex];gl.uniform1f(this.uniform.hasTex,texture?1:0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture||null);
   if(material.doubleSided)gl.disable(gl.CULL_FACE);else{gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);}
   gl.drawElements(p.mode===5?gl.TRIANGLE_STRIP:p.mode===6?gl.TRIANGLE_FAN:gl.TRIANGLES,item.count,item.indexType,0);
  }
  gl.depthMask(true);gl.disable(gl.BLEND);
 }
 // A locally generated stage: raised floor, upstage LED wall and three light bars.
 // It uses real WebGL triangles, the same depth buffer and camera as the avatar.
 drawStage(frame,bounds,matrix){const gl=this.gl,{center,radius,low}=bounds;
  const r=Math.max(radius,.25),y=low[1]-.04*r,x=center[0],z=center[2],back=z-3.7*r;
  const item=(coords,indices,color,shade=1)=>{
   const verts=new Float32Array(coords.flatMap(p=>[p[0],p[1],p[2],0,0,shade]));
   gl.bindBuffer(gl.ARRAY_BUFFER,this.stageVertexBuffer);gl.bufferData(gl.ARRAY_BUFFER,verts,gl.DYNAMIC_DRAW);
   gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.stageIndexBuffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.DYNAMIC_DRAW);
   for(const [name,size,offset] of [['pos',3,0],['uv',2,12],['shade',1,20]]){const loc=this.attrib[name];if(loc<0)continue;gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,24,offset);}
   gl.uniform4fv(this.uniform.tint,[...color,1]);gl.uniform3fv(this.uniform.lightTint,[1,1,1]);gl.uniform1f(this.uniform.hasTex,0);gl.disable(gl.CULL_FACE);
   gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);
  };
  const quad=(a,b,c,d,col,shade)=>item([a,b,c,d],[0,1,2,0,2,3],col,shade);
  const w=2.8*r,d=2.7*r;
  quad([x-w,y,z-d],[x+w,y,z-d],[x+w,y,z+d],[x-w,y,z+d],frame.palette.floor,.9);
  // Side face makes the platform look elevated even when viewed obliquely.
  quad([x-w,y,z+d],[x+w,y,z+d],[x+w,y-.22*r,z+d],[x-w,y-.22*r,z+d],frame.palette.rear,.95);
  quad([x-2.6*r,y,back],[x+2.6*r,y,back],[x+2.6*r,y+5.4*r,back],[x-2.6*r,y+5.4*r,back],frame.palette.rear,.85);
  const b=frame.palette.accent,glow=Math.min(1.5,frame.light.brightness);
  // stage/LED accents are geometry, not external assets.
  for(const sign of [-1,1]){const sx=x+sign*2.15*r;
   quad([sx-.05*r,y+.2*r,back+.015*r],[sx+.05*r,y+.2*r,back+.015*r],[sx+.05*r,y+4.7*r,back+.015*r],[sx-.05*r,y+4.7*r,back+.015*r],b,glow);
  }
  quad([x-2.2*r,y+4.5*r,back+.02*r],[x+2.2*r,y+4.5*r,back+.02*r],[x+2.2*r,y+4.58*r,back+.02*r],[x-2.2*r,y+4.58*r,back+.02*r],b,glow);
  // Front edge helps grounding and provides a time-varying illumination cue.
  quad([x-w,y+.01*r,z+d],[x+w,y+.01*r,z+d],[x+w,y+.07*r,z+d],[x-w,y+.07*r,z+d],b,glow);
  gl.uniformMatrix4fv(this.uniform.viewProj,false,new Float32Array(matrix));
 }
 dispose(){this.disposed=true;const gl=this.gl;gl.deleteBuffer(this.stageVertexBuffer);gl.deleteBuffer(this.stageIndexBuffer);for(const r of this.resources){gl.deleteBuffer(r.vertices);gl.deleteBuffer(r.indices);}for(const t of this.textureSlots)if(t)gl.deleteTexture(t);gl.deleteProgram(this.shader);for(const url of this.textureUrls)URL.revokeObjectURL(url);}
}
