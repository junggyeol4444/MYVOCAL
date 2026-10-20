// Optional local-language-model adapter for the existing Windows EXE host.
// All browser requests are same-origin; the desktop host proxies to 127.0.0.1:11434.
// This does not install a model, train a singer, render WAV, or access a cloud API.
import {normalizeRemoteProposal} from './composer.js';
const safeModel=name=>typeof name==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,119}$/.test(name);
const safeText=(s,max)=>typeof s==='string'&&s.length<=max&&s.trim().length>0;
function sessionKey(){
 const key=globalThis.__MYVOCAL_SESSION_KEY;
 if(typeof key!=='string'||!key)throw Error('로컬 AI 연결은 Windows EXE에서만 지원됩니다.');
 return key;
}
async function jsonResponse(res){
 const value=await res.json().catch(()=>null);
 if(!res.ok)throw Error(value?.error||`로컬 AI 오류: HTTP ${res.status}`);
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('로컬 AI 응답 형식이 잘못되었습니다.');
 return value;
}
export async function getInstalledLocalModels({fetchImpl=fetch,key=sessionKey()}={}){
 const res=await fetchImpl('/api/local-ai/models',{headers:{'X-MYVOCAL-Session':key},cache:'no-store'});
 const body=await jsonResponse(res);
 if(!Array.isArray(body.models))throw Error('로컬 모델 목록을 읽지 못했습니다.');
 return [...new Set(body.models.filter(safeModel))].slice(0,100);
}
export async function composeWithLocalAI(options,{model,fetchImpl=fetch,key=sessionKey()}={}){
 if(!safeModel(model))throw Error('설치된 로컬 모델을 먼저 선택해 주세요.');
 if(!safeText(options?.prompt,2000))throw Error('3자 이상 곡 설명이 필요합니다.');
 const request={model,prompt:options.prompt,genre:String(options.genre||'Pop').slice(0,100),mood:String(options.mood||'희망적').slice(0,100),key:String(options.key||'C Major').slice(0,50)};
 const res=await fetchImpl('/api/local-ai/compose',{method:'POST',headers:{'X-MYVOCAL-Session':key,'Content-Type':'application/json'},body:JSON.stringify(request),cache:'no-store'});
 const response=await jsonResponse(res);
 if(response.provider!=='local-ollama'||response.model!==model||response.neuralTextGenerated!==true||response.audioGenerated!==false||response.trainingPerformed!==false||!response.proposal)throw Error('로컬 모델 결과의 출처를 확인할 수 없습니다.');
 const draft=normalizeRemoteProposal(response.proposal,options);
 // The local model proposes lyrics/harmony; MIDI is the existing editor's
 // rule-based arrangement, not a neural music waveform or voice clone.
 return {...draft,source:'ollama-local',aiModel:model,aiNotes:'로컬 언어모델 작사/화성 제안 + 기존 MIDI 생성. 신경망 가창·영상 생성 아님'};
}