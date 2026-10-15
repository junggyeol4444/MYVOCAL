// STEP98: local export orchestration. No silent MP4->WebM renaming.
import {createMidiFile} from './midiFile.js';
import {pv95Cues,pv95Duration} from './vocalSynthPv95.js';
import {cuesToSrt,isAlignmentStale} from './lyricAlignment.js';
import {exportMvAnimaticSrt} from './mvAnimatic.js';
export function exportCapabilities98(project,mediaRecorder=globalThis.MediaRecorder){
 const notes=(project?.tracks||[]).reduce((n,t)=>n+(t.midiNotes||[]).length,0);
 const canMp4=!!(mediaRecorder&&typeof mediaRecorder.isTypeSupported==='function'&&['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4'].some(m=>mediaRecorder.isTypeSupported(m)));
 let duration=0;try{duration=pv95Duration(project);}catch{}
 const audio=(project?.tracks||[]).some(t=>(t.midiNotes||[]).length||(t.clips||[]).some(c=>c.assetId));
 const aligned=project?.vocalAlignment&&!isAlignmentStale(project,project.vocalAlignment);
 return {wav:!!audio,midi:notes>0,srt:!!aligned,storyboardSrt:(project?.scenes||[]).length>0,mp4:canMp4&&!!audio&&duration<=30&&duration>0,backup:true,notes:canMp4?'MP4 브라우저 인코더 지원':'MP4 MediaRecorder 미지원 — 지원 환경에서만 출력'};
}
export function lyricsSrt98(project){
 if(project?.vocalAlignment&&!isAlignmentStale(project,project.vocalAlignment))return cuesToSrt(project.vocalAlignment.cues);
 throw Error('유효한 가사·MIDI 시간 정렬이 없습니다. 가사를 자동으로 추측하지 않습니다.');
}
export function sceneGuideSrt98(project,characters=[]){return exportMvAnimaticSrt(project,characters);}
export function midi98(project){return createMidiFile(project);}
export async function wav98(project){const {mixdownWav}=await import('./audioEngine.js');return mixdownWav(project,{sampleRate:44100,bitDepth:16,peakProtection:true});}
export function mp4Mime98(MediaRecorderImpl=globalThis.MediaRecorder){
 if(!MediaRecorderImpl?.isTypeSupported)throw Error('MP4 녹화를 지원하는 MediaRecorder가 없습니다.');
 for(const mime of ['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4'])if(MediaRecorderImpl.isTypeSupported(mime))return mime;
 throw Error('이 브라우저는 MP4 인코딩을 제공하지 않습니다. WebM을 MP4로 잘못 표기하지 않습니다.');
}
export async function captureMp498({project,canvas,draw,images,signal,MediaRecorderImpl=globalThis.MediaRecorder,AudioContextImpl=globalThis.AudioContext}={}){
 const mime=mp4Mime98(MediaRecorderImpl);const duration=pv95Duration(project);
 if(duration>30)throw Error('현재 브라우저 MP4 렌더러는 30초 이하 PV만 지원합니다. 장면 구간을 줄여 주세요.');
 if(typeof canvas?.captureStream!=='function'||typeof draw!=='function'||!AudioContextImpl)throw Error('로컬 Canvas 또는 오디오 인코더 기능이 없습니다.');
 if(signal?.aborted)throw Error('사용자가 출력을 취소했습니다.');
 const blob=await wav98(project),ctx=new AudioContextImpl();let stream,rec,src,done=false;
 try{
  const audioBuffer=await ctx.decodeAudioData(await blob.arrayBuffer());
  const destination=ctx.createMediaStreamDestination();src=ctx.createBufferSource();src.buffer=audioBuffer;src.connect(destination);
  stream=canvas.captureStream(30);
  for(const t of destination.stream.getAudioTracks())stream.addTrack(t);
  const chunks=[];
  const recorded=new Promise((resolve,reject)=>{
   rec=new MediaRecorderImpl(stream,{mimeType:mime});
   rec.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
   rec.onerror=e=>reject(e.error||Error('녹화 중 오류'));
   rec.onstop=()=>signal?.aborted?reject(Error('출력 취소됨')):chunks.length?resolve(new Blob(chunks,{type:'video/mp4'})):reject(Error('빈 MP4 결과'));
  });
  // Consume asynchronous recorder failures even when drawing/abort exits early.
  recorded.catch(()=>{});
  await ctx.resume();rec.start(250);src.start();
  const start=performance.now();let failure=null;
  while(!signal?.aborted){
   const at=(performance.now()-start)/1000;
   try{draw(Math.min(at,duration-.001),images);}catch(err){failure=err;break;}
   if(at>=duration)break;
   await new Promise(resolve=>setTimeout(resolve,33));
  }
  if(failure)throw failure;
  if(signal?.aborted)throw Error('사용자가 출력을 취소했습니다.');
  rec.stop();const output=await recorded;done=true;return output;
 }finally{
  if(!done&&rec?.state==='recording'){try{rec.stop();}catch{}}
  try{src?.stop();}catch{}
  for(const track of stream?.getTracks?.()||[])track.stop();
  try{await ctx.close();}catch{}
 }
}
