// STEP98: local export orchestration. No silent MP4->WebM renaming.
import {createMidiFile} from './midiFile.js';
import {makeZip} from './zipStore.js';
import {inspectSingingWav} from './singingOutputValidation.js';
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
// Isolated PCM track stems aligned to the original project timeline, not AI-separated stems.
export async function stemsZip98(project,{mix=null}={}){
 const tracks=project?.tracks;
 if(!Array.isArray(tracks))throw Error('프로젝트 트랙 정보가 없습니다.');
 const available=tracks.filter(t=>t&&((t.midiNotes||[]).length||(t.clips||[]).some(c=>c.assetId)));
 if(!available.length||available.length>16)throw Error('트랙별 WAV 출력은 소리가 있는 트랙 1~16개만 지원합니다.');
 if(new Set(available.map(t=>t.id)).size!==available.length||available.some(t=>!t.id))throw Error('트랙 ID가 중복되거나 누락됐습니다.');
 const render=mix||(await import('./audioEngine.js')).mixdownWav;
 const entries=[],manifest={format:'MYVOCAL_WAV_STEMS',version:2,projectId:String(project.id||''),title:String(project.title||''),sampleRate:44100,bitDepth:16,channels:2,tracks:[]};
 let total=0,expectedFrames=null;
 for(let i=0;i<available.length;i++){
  const track=available[i],isolated={...project,tracks:tracks.map(t=>({...t,mute:t.id!==track.id,solo:false}))};
  const blob=await render(isolated,{sampleRate:44100,bitDepth:16,channels:2,normalizePeak:false,peakProtection:false,trimSilence:false});
  if(!(blob instanceof Blob)||blob.size<44)throw Error('트랙 '+(i+1)+'의 실제 WAV 생성에 실패했습니다.');
  if(blob.size>256*1024*1024-total)throw Error('WAV ZIP 용량 256MiB 초과');
  const data=new Uint8Array(await blob.arrayBuffer()),report=inspectSingingWav(data);
  if(!report.valid||report.sampleRate!==44100||report.channels!==2||report.bits!==16||report.encoding!==1)throw Error('트랙 '+(i+1)+'의 PCM WAV 형식이 올바르지 않습니다.');
  if(expectedFrames!==null&&report.frames!==expectedFrames)throw Error('트랙별 WAV 길이가 서로 달라 시간축이 어긋납니다.');
  expectedFrames=report.frames;total+=data.byteLength;
  if(total>256*1024*1024)throw Error('WAV ZIP 용량 256MiB 초과');
  const safe=String(track.name||'Track').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/\.\.+/g,'_').slice(0,60);
  const name='stems/'+String(i+1).padStart(2,'0')+'_'+safe+'.wav';
  entries.push({name,data});
  manifest.tracks.push({id:track.id,name:track.name||'Track',file:name,frames:report.frames,durationSec:report.durationSec,peak:report.peak,volume:track.volume??75,originalMute:!!track.mute,originalSolo:!!track.solo});
 }
 entries.unshift({name:'stems/manifest.json',data:new TextEncoder().encode(JSON.stringify(manifest,null,2))});
 return new Blob([makeZip(entries)],{type:'application/zip'});
}

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
