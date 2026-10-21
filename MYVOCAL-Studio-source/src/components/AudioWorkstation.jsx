import React,{useEffect,useRef,useState} from 'react';
import {Button,Icon,Notice} from './UI';
import {genId} from '../lib/schema';
import {putFilesAtomic,deleteFilesAtomic} from '../lib/assetDb';
import {AudioEngine,audioBufferFor,audioEnd,formatClock,forgetAudio,mixdownWavDetailed,readAudioInfo,secondsPerBar} from '../lib/audioEngine';
import {downloadText} from '../lib/store';
import {clipWindow,editClipTiming,editClipFadeCurve,clipFadeCurve,editClipLevel,editClipPan,resetClipTiming} from '../lib/clipTiming';
import {duplicateClipInTracks,splitClipInTracks} from '../lib/clipArrangement';
import {createClipHistory,recordClipChange,applyClipHistory} from '../lib/clipHistory';
const palette=['#a48dff','#62c5fe','#f58fbb','#7dddb5','#f1b97b','#9d9efb','#8dd6db','#e3aeef'];
const BAR=38,HEADER=230;
const safe=(s)=>String(s||'Project').replace(/[\\/:*?"<>|]/g,'_');
function Waveform({assetId,width,color,sourceOffsetSec=0,visibleDurationSec}){
 const seen=useRef('');const [error,setError]=useState('');
 // Callback-ref ensures painting also happens when a custom offline UI runtime
 // batches extra renders before running its normal effect queue.
 const paint=(el)=>{if(!el||!assetId)return;const key=assetId+':'+width+':'+color+':'+sourceOffsetSec+':'+visibleDurationSec;if(seen.current===key)return;seen.current=key;
  audioBufferFor(assetId).then(buf=>{
   if(!el.isConnected)return;
   const w=Math.max(50,Math.round(width)),h=46;el.width=w;el.height=h;
   const context=el.getContext('2d');if(!context)return;
   const channel=buf.getChannelData(0);
   const from=Math.min(channel.length,Math.max(0,Math.floor(sourceOffsetSec*buf.sampleRate)));
   const to=Math.min(channel.length,Math.ceil((sourceOffsetSec+(visibleDurationSec||buf.duration))*buf.sampleRate));
   const samples=Math.max(0,to-from);
   context.clearRect(0,0,w,h);context.strokeStyle=color;context.lineWidth=1;context.beginPath();
   for(let x=0;x<w;x++){
    const begin=from+Math.floor(x/w*samples),end=from+Math.min(samples,Math.ceil((x+1)/w*samples)),increment=Math.max(1,Math.floor((end-begin)/32));
    let peak=0;for(let i=begin;i<end;i+=increment)peak=Math.max(peak,Math.abs(channel[i]));
    peak=Math.max(.012,peak);context.moveTo(x,h/2-peak*(h/2-3));context.lineTo(x,h/2+peak*(h/2-3));
   }context.stroke();
  }).catch(()=>setError('파일 없음'));
 };
 return error?<span className="mv2-wave-error">{error}</span>:<canvas className="mv2-wave" ref={paint} style={{width:'100%',height:46}} aria-label="오디오 파형"/>;
}
export default function AudioWorkstation({project:p,onChange,notify}){
 const [newTrack,setNewTrack]=useState(''),[position,setPosition]=useState(0),[playing,setPlaying]=useState(false),[busy,setBusy]=useState(''),[protectPeak,setProtectPeak]=useState(true),[wavBitDepth,setWavBitDepth]=useState(16),[wavSampleRate,setWavSampleRate]=useState(44100),[wavChannels,setWavChannels]=useState(2),[trimSilence,setTrimSilence]=useState(false),[edgeFade,setEdgeFade]=useState(false),[normalizePeak,setNormalizePeak]=useState(false),[dither16,setDither16]=useState(false),[exportRange,setExportRange]=useState(false),[exportStartSec,setExportStartSec]=useState('0'),[exportEndSec,setExportEndSec]=useState('');
 const engine=useRef(null),fileInputs=useRef({}),positionRef=useRef(0),playState=useRef(false),projectRef=useRef(p),clipHistory=useRef(createClipHistory(p.id));
 if(clipHistory.current.projectId!==p.id)clipHistory.current=createClipHistory(p.id);
 if(!engine.current)engine.current=new AudioEngine();
 projectRef.current=p;
 const change=patch=>onChange({...projectRef.current,...patch});
 const commitClips=(trackId,tracks,label)=>{
  const current=projectRef.current;
  const history=recordClipChange(clipHistory.current,current.id,current.tracks,tracks,trackId,label);
  if(history===clipHistory.current)return;
  clipHistory.current=history;change({tracks});
 };
 const historyAction=direction=>{
  try{const current=projectRef.current;const result=applyClipHistory(clipHistory.current,current.id,current.tracks,direction);
   clipHistory.current=result.history;change({tracks:result.tracks});
   notify((direction==='undo'?'실행 취소: ':'다시 실행: ')+result.label);
  }catch(e){notify('클립 기록: '+e.message);}
 };
 const changeTrack=(trackId,patch)=>change({tracks:projectRef.current.tracks.map(t=>t.id===trackId?{...t,...patch}:t)});
 const updateClip=(trackId,clipId,transform)=>{
  try{commitClips(trackId,projectRef.current.tracks.map(t=>t.id!==trackId?t:{...t,clips:(t.clips||[]).map(c=>c.id===clipId?transform(c):c)}),'클립 속성 편집');}
  catch(e){notify('클립 편집 실패: '+e.message);}
 };
 const editClip=(trackId,clipId,field,value)=>updateClip(trackId,clipId,c=>editClipTiming(c,field,value));
 const editCurve=(trackId,clipId,direction,value)=>updateClip(trackId,clipId,c=>editClipFadeCurve(c,direction,value));
 const editLevel=(trackId,clipId,field,value)=>updateClip(trackId,clipId,c=>editClipLevel(c,field,value));
 const editPan=(trackId,clipId,value)=>updateClip(trackId,clipId,c=>editClipPan(c,value));
 const duplicate=(trackId,clipId,mode)=>{
  try {
   const tracks=duplicateClipInTracks(projectRef.current.tracks,trackId,clipId,genId('clip'),projectRef.current.bpm,mode,positionRef.current);
   commitClips(trackId,tracks,'클립 복제');notify(mode==='cursor'?'재생 커서 위치에 클립을 복제했습니다.':'원본 클립 바로 뒤에 복제했습니다.');
  }catch(e){notify('클립 복제 실패: '+e.message);}
 };
 const split=(trackId,clipId)=>{
  try {
   const tracks=splitClipInTracks(projectRef.current.tracks,trackId,clipId,genId('clip'),projectRef.current.bpm,positionRef.current);
   commitClips(trackId,tracks,'클립 분할');notify('재생 커서 위치에서 클립을 두 조각으로 분할했습니다. 원본 오디오와 기존 페이드 곡선은 보존됩니다.');
  }catch(e){notify('클립 분할 실패: '+e.message);}
 };
 const removeClip=(trackId,clipId)=>{
  try{const current=projectRef.current;const track=current.tracks.find(t=>t.id===trackId);
   if(!track || !(track.clips||[]).some(c=>c.id===clipId))throw Error('삭제할 클립을 찾을 수 없습니다.');
   commitClips(trackId,current.tracks.map(t=>t.id===trackId?{...t,clips:t.clips.filter(c=>c.id!==clipId)}:t),'클립 제거');
  }catch(e){notify('클립 제거 실패: '+e.message);}
 };
 const duration=audioEnd(p),secBar=secondsPerBar(p.bpm),maxBars=Math.max(24,p.sections.reduce((v,s)=>v+(Number(s.bars)||0),0),Math.ceil(duration/secBar)+2),laneWidth=Math.round(maxBars*BAR);
 const activeClips=p.tracks.reduce((x,t)=>x+(t.clips||[]).length,0);
 const activeNotes=p.tracks.reduce((x,t)=>x+(t.midiNotes||[]).length,0);
 const updatePosition=x=>{positionRef.current=x;setPosition(x);};
 const stop=(reset=false)=>{engine.current.stop(reset?0:undefined);playState.current=false;setPlaying(false);updatePosition(reset?0:Math.min(engine.current.position(),duration));};
 const start=async(at)=>{
  if(busy)return;
  setBusy('오디오 불러오는 중');
  try {const ok=await engine.current.play(projectRef.current,at);if(ok){playState.current=true;setPlaying(true);updatePosition(at);}}
  catch(e){playState.current=false;setPlaying(false);notify('재생 실패: '+e.message);}
  finally{setBusy('');}
 };
 const toggle=()=>{if(playState.current)stop();else start(positionRef.current>=duration-.01?0:positionRef.current);};
 const seek=sec=>{const at=Math.max(0,Math.min(duration,sec));updatePosition(at);if(playState.current)start(at);else engine.current.stop(at);};
 useEffect(()=>{return()=>{engine.current?.stop(0);playState.current=false;};},[]);
 useEffect(()=>{engine.current.updateGains(p.tracks);},[p.tracks.map(t=>t.id+':'+t.volume+':'+t.mute+':'+t.solo).join('|')]);
 useEffect(()=>{if(!playing)return;const timer=setInterval(()=>{
   const t=engine.current.position(),max=audioEnd(projectRef.current);
   if(t>=max){engine.current.stop(0);playState.current=false;setPlaying(false);updatePosition(0);}
   else updatePosition(t);
  },90);return()=>clearInterval(timer);
 },[playing]);
 useEffect(()=>{if(!playing)return;const pos=engine.current.position();engine.current.stop(pos);playState.current=false;setPlaying(false);updatePosition(pos);notify('BPM 또는 클립 재생 설정이 변경되어 재생을 멈췄습니다.');},[p.bpm,p.tracks.map(t=>(t.clips||[]).map(c=>[c.id,c.startBar,c.sourceOffsetSec,c.playDurationSec,c.fadeInSec,c.fadeOutSec,c.fadeInCurve,c.fadeOutCurve,c.gainPercent,c.clipMuted,c.panPercent,c.assetId].join(':')).join('|')).join('~')]);
 const importAudio=async(track,files)=>{
  if(!files?.length||busy)return;
  const sourceProjectId=projectRef.current.id,added=[],assets=[];
  let saved=false;setBusy('오디오 가져오는 중');
  try{
   if(files.length>16)throw Error('한 번에 최대 16개 오디오 클립을 가져올 수 있습니다.');
   let total=0,last=Math.max(1,...(track.clips||[]).map(c=>Math.ceil((Number(c.startBar)||1)+(Number(c.durationSec)||0)/secBar)));
   for(const f of files){
    if(f.size>90*1024*1024)throw Error(f.name+'은 90MB를 초과합니다.');
    total+=f.size;if(total>150*1024*1024)throw Error('한 번에 가져오는 오디오 합계는 150MB 이하이어야 합니다.');
    const decoded=await readAudioInfo(f);if(decoded.duration>8*60)throw Error(f.name+'은 8분을 초과합니다.');
    if(projectRef.current.id!==sourceProjectId)throw Error('가져오는 동안 프로젝트가 변경되었습니다.');
    const assetId=genId('audio');assets.push([assetId,f]);
    added.push({id:genId('clip'),assetId,fileName:f.name,durationSec:decoded.duration,startBar:last,size:f.size});
    last=Math.ceil(last+decoded.duration/secBar);
   }
   const before=projectRef.current;
   if(before.id!==sourceProjectId||!(before.tracks||[]).some(t=>t.id===track.id))throw Error('가져오는 동안 프로젝트 또는 트랙이 변경됐습니다.');
   await putFilesAtomic(assets);saved=true;
   if(projectRef.current.id!==sourceProjectId)throw Error('자산 저장 중 프로젝트가 변경됐습니다.');
   commitClips(track.id,projectRef.current.tracks.map(t=>t.id!==track.id?t:{...t,clips:[...(t.clips||[]),...added]}),'오디오 가져오기');
   saved=false;
   notify(added.length+'개 오디오 클립을 '+track.name+' 트랙에 추가했습니다.');
  }catch(e){
   if(saved){try{await deleteFilesAtomic(assets.map(([id])=>id));}catch(cleanup){notify('신규 자산 정리 실패: '+cleanup.message);}}
   notify('오디오 가져오기 실패: '+e.message);
  }finally{setBusy('');}
 };
 const addTrack=()=>{const current=projectRef.current;change({tracks:[...current.tracks,{id:genId('trk'),name:newTrack.trim()||`Audio Track ${current.tracks.length+1}`,type:'instrument',mute:false,solo:false,volume:80,clips:[]}]});setNewTrack('');};
 const exportMix=async()=>{setBusy('WAV 믹싱 중');try{
  if(exportRange&&(!exportStartSec.trim()||!exportEndSec.trim()))throw Error('구간 시작과 끝 초를 입력해 주세요.');
  const {blob,peakReport,trimReport,normalizationReport,selectionReport,outputReport}=await mixdownWavDetailed(p,{peakProtection:protectPeak,bitDepth:wavBitDepth,sampleRate:wavSampleRate,channels:wavChannels,trimSilence,edgeFade,normalizePeak,dither16:dither16&&wavBitDepth===16,...(exportRange?{startSec:Number(exportStartSec),endSec:Number(exportEndSec)}:{})});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=safe(p.title)+(selectionReport?'-range':'-mix')+'.wav';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
  const detail=normalizationReport ? (normalizationReport.silent?'피크 정규화: 무음 유지':`피크 정규화: ${normalizationReport.gainDb>=0?'+':''}${normalizationReport.gainDb.toFixed(2)} dB${normalizationReport.limited?' (최대 +12 dB 제한)':''}`) : (peakReport ? (peakReport.attenuated?`피크 보호: ${(-peakReport.gainDb).toFixed(2)} dB 감쇠`:'피크 보호: 감쇠 불필요') : '피크 보호 미사용');
  const trimDetail=trimReport ? (trimReport.silent?' · 무음 감지: 길이 유지':trimReport.trimmed?` · 앞 ${(trimReport.removedStartFrames/wavSampleRate).toFixed(3)}초 / 뒤 ${(trimReport.removedEndFrames/wavSampleRate).toFixed(3)}초 제거`:' · 제거할 앞뒤 무음 없음') : '';
  const meterDetail=` · 출력 피크 ${Number.isFinite(outputReport.samplePeakDbfs)?outputReport.samplePeakDbfs.toFixed(2)+' dBFS':'무음'} · RMS ${Number.isFinite(outputReport.rmsDbfs)?outputReport.rmsDbfs.toFixed(2)+' dBFS':'무음'}`;
  const overRangeWarning=outputReport.overRangeSamples?` ⚠ ${outputReport.overRangeSamples}개 샘플이 0 dBFS 초과 (${wavBitDepth===32?'float 값은 보존되지만 재생 시 클리핑 가능':'정수 PCM에서 클리핑됨'})`:'';
  const invalidWarning=outputReport.nonFiniteSamples?` ⚠ 비정상 샘플 ${outputReport.nonFiniteSamples}개 감지`:'';
  notify(`WAV 믹스를 내보냈습니다. (${wavBitDepth}비트${wavBitDepth===32?' float':' PCM'} / ${wavSampleRate===48000?'48':'44.1'}kHz ${wavChannels===1?'모노':'스테레오'} · ${detail}${trimDetail}${selectionReport?` · 선택 구간 ${selectionReport.startSec.toFixed(3)}~${selectionReport.endSec.toFixed(3)}초`:''}${edgeFade?' · 경계 5ms 페이드':''}${dither16&&wavBitDepth===16?' · 16비트 TPDF 디더':''}${meterDetail})${overRangeWarning}${invalidWarning}`);
 }catch(e){notify('WAV 내보내기 실패: '+e.message);}finally{setBusy('');}};
 return <>
  <div className="panel mv2-editor">
   <div className="panel-top"><div><h3>오디오 · MIDI 멀티트랙 편집기</h3><p>오디오 파일과 MIDI 합성음을 동시에 재생하고 WAV로 믹싱합니다. MIDI 입력은 위 피아노 롤 탭에서 편집하세요.</p></div><span className="hint-pill">{p.tracks.length} TRACKS · {activeClips} AUDIO · {activeNotes} MIDI</span></div>
   <div className="mv2-transport" role="group" aria-label="오디오 재생 제어">
    <button className="mv2-play" onClick={toggle} disabled={!!busy||!duration} title={playing?'일시정지':'재생'}>{playing?'Ⅱ':'▶'}</button>
    <button className="mv2-stop" onClick={()=>stop(true)} disabled={!!busy} title="처음으로"><span>■</span></button>
    <div className="mv2-time"><strong>{formatClock(position)}</strong><span> / {formatClock(duration)}</span></div>
    <input className="mv2-seek" aria-label="재생 위치" type="range" min="0" max={Math.max(.01,duration)} step="0.01" value={Math.min(position,Math.max(.01,duration))} onChange={e=>seek(Number(e.target.value))} disabled={!duration||!!busy}/>
    <span className="mv2-bpm">{p.bpm} BPM</span>
    <button className="mv2-reset" type="button" aria-label="클립 편집 실행 취소" disabled={!clipHistory.current.past.length||!!busy} onClick={()=>historyAction('undo')}>↶ 클립 취소</button>
    <button className="mv2-reset" type="button" aria-label="클립 편집 다시 실행" disabled={!clipHistory.current.future.length||!!busy} onClick={()=>historyAction('redo')}>↷ 다시 실행</button>
    <label className="mv2-peakprotect" title="내보내기에서만 적용: 모든 채널의 샘플 피크가 -1 dBFS 이하가 되도록 전체 믹스를 동일한 비율로 줄입니다. 볼륨 증폭이나 마스터링은 하지 않습니다.">
     <input type="checkbox" aria-label="WAV 내보내기 피크 보호" checked={protectPeak} disabled={!!busy} onChange={e=>setProtectPeak(e.target.checked)}/> 피크 보호 (-1 dBFS)
    </label>
    <label className="mv2-wav-depth" title="WAV 16/24비트 정수 PCM 또는 32비트 IEEE float 출력 형식입니다. float는 피크 보호를 끄면 0 dBFS 초과 값도 저장할 수 있습니다. 원본 및 프로젝트는 그대로 유지됩니다.">WAV 형식
     <select aria-label="WAV 출력 비트 깊이" value={wavBitDepth} disabled={!!busy} onChange={e=>setWavBitDepth(Number(e.target.value))}>
      <option value={16}>16비트 PCM</option><option value={24}>24비트 PCM</option><option value={32}>32비트 float</option>
     </select>
    </label>
    <label className="mv2-wav-rate" title="WAV 내보내기에서만 적용됩니다. 원본 클립은 오프라인 믹싱 중 브라우저의 Web Audio 엔진에서 리샘플링되며 원본 파일이나 프로젝트에는 영향이 없습니다.">WAV Hz
     <select aria-label="WAV 내보내기 샘플레이트" value={wavSampleRate} disabled={!!busy} onChange={e=>setWavSampleRate(Number(e.target.value))}>
      <option value={44100}>44.1 kHz</option><option value={48000}>48 kHz</option>
     </select>
    </label>
    <label className="mv2-wav-channels" title="WAV 출력 채널 수만 바꿉니다. 모노는 스테레오 좌·우를 (L+R)/2로 합치며 좌우 위상 반대인 소리는 상쇄될 수 있습니다. 원본·실시간 재생·프로젝트에는 영향을 주지 않습니다.">WAV 채널
     <select aria-label="WAV 출력 채널 수" value={wavChannels} disabled={!!busy} onChange={e=>setWavChannels(Number(e.target.value))}>
      <option value={2}>스테레오</option><option value={1}>모노</option>
     </select>
    </label>
    <label className="mv2-wav-trim" title="WAV 내보내기에서만 -60 dBFS 이상인 첫/마지막 샘플을 기준으로 앞뒤 무음을 제거합니다. 중간 무음은 유지됩니다. 아주 작은 소리나 의도된 앞뒤 여백이 잘릴 수 있습니다. 원본과 프로젝트는 그대로 유지됩니다.">
     <input type="checkbox" aria-label="WAV 앞뒤 무음 제거" checked={trimSilence} disabled={!!busy} onChange={e=>setTrimSilence(e.target.checked)}/> 앞뒤 무음 제거 (-60 dBFS)
    </label>
    <label className="mv2-wav-edge" title="WAV 파일에만 적용: 내보내는 구간의 시작·끝 5ms를 선형 페이드 처리하여 급격한 절단에서 발생할 수 있는 클릭을 줄입니다. 무음 제거 이후 경계에 적용됩니다. 짧은 출력은 페이드가 서로 겹치지 않도록 자동 단축됩니다. 원본 및 프로젝트는 변경하지 않습니다.">
     <input type="checkbox" aria-label="WAV 경계 5ms 페이드" checked={edgeFade} disabled={!!busy} onChange={e=>setEdgeFade(e.target.checked)}/> 경계 페이드 (5ms)
    </label>
    <label className="mv2-wav-normalize" title="WAV 출력의 실제 채널과 선택한 무음 제거·경계 페이드를 기준으로 샘플 피크를 -1 dBFS까지 맞춥니다. 작은 소리는 최대 +12 dB까지만 증폭합니다. 켜면 기존 감쇠 전용 피크 보호 대신 적용됩니다. 무음은 증폭하지 않으며 원본·프로젝트는 변경하지 않습니다. 트루 피크·LUFS 정규화는 아닙니다.">
     <input type="checkbox" aria-label="WAV 피크 정규화" checked={normalizePeak} disabled={!!busy} onChange={e=>setNormalizePeak(e.target.checked)}/> 피크 정규화 (-1 dBFS, 최대 +12 dB)
    </label>
    <label className="mv2-wav-dither" title="16비트 PCM 내보내기에만 적용합니다. 양자화 전에 결정론적 TPDF 잡음(±1 LSB)을 더해 작은 신호의 양자화 왜곡을 줄입니다. 미세한 노이즈가 생기며, 24비트 PCM 및 32비트 float에는 적용되지 않습니다. 원본·프로젝트는 변경하지 않습니다.">
     <input type="checkbox" aria-label="WAV 16비트 TPDF 디더" checked={dither16&&wavBitDepth===16} disabled={!!busy||wavBitDepth!==16} onChange={e=>setDither16(e.target.checked)}/> 16비트 TPDF 디더
    </label>
    <label className="mv2-wav-range" title="선택한 프로젝트 시간 범위만 WAV로 저장합니다. 원본 트랙과 프로젝트는 그대로 두고 전체 믹스 렌더링 후 출력 범위만 자릅니다. 앞뒤 무음 제거·경계 페이드·피크 분석은 선택 구간에만 적용됩니다.">
     <input type="checkbox" aria-label="WAV 선택 구간만 내보내기" checked={exportRange} disabled={!!busy} onChange={e=>{setExportRange(e.target.checked);if(e.target.checked&&!exportEndSec)setExportEndSec(String(duration));}}/> 선택 구간만 저장
    </label>
    {exportRange&&<>
     <label className="mv2-wav-range-start">시작(초) <input type="number" min="0" max={duration} step="0.01" aria-label="WAV 선택 구간 시작 초" value={exportStartSec} disabled={!!busy} onChange={e=>setExportStartSec(e.target.value)}/></label>
     <button type="button" className="mv2-reset" disabled={!!busy} onClick={()=>setExportStartSec(String(positionRef.current))} title="현재 재생 커서를 내보내기 구간의 시작으로 지정">커서→시작</button>
     <label className="mv2-wav-range-end">끝(초) <input type="number" min="0" max={duration} step="0.01" aria-label="WAV 선택 구간 끝 초" value={exportEndSec} disabled={!!busy} onChange={e=>setExportEndSec(e.target.value)}/></label>
     <button type="button" className="mv2-reset" disabled={!!busy} onClick={()=>setExportEndSec(String(positionRef.current))} title="현재 재생 커서를 내보내기 구간의 끝으로 지정">커서→끝</button>
    </>}
    <Button onClick={exportMix} icon="download" disabled={!duration||!!busy}>WAV 믹스 저장</Button>
   </div>
   {busy&&<div className="mv2-busy" role="status">{busy}...</div>}
   <div className="mv2-scroll" aria-label="오디오 편집 타임라인">
    <div className="mv2-lines" style={{width:HEADER+laneWidth}}>
     <div className="mv2-ruler"><div className="mv2-trackhead mv2-rulerhead">TRACK / BAR</div><div className="mv2-barlabels" style={{width:laneWidth}} onClick={e=>{const rect=e.currentTarget.getBoundingClientRect();seek((e.clientX-rect.left)/BAR*secBar)}}>{Array.from({length:maxBars},(_,i)=><span key={i} style={{width:BAR}}>{i%2===0?i+1:''}</span>)}</div></div>
     {p.tracks.map((track,index)=>{
      const color=palette[index%palette.length];return <div className="mv2-row" key={track.id}>
       <div className="mv2-trackhead"><div className="mv2-trackname"><i style={{background:color}}/><input value={track.name} aria-label="트랙 이름" onChange={e=>changeTrack(track.id,{name:e.target.value})}/></div>
       <div className="mv2-tracktools"><button className={track.mute?'on':''} title="음소거" onClick={()=>changeTrack(track.id,{mute:!track.mute})}>M</button><button className={track.solo?'on':''} title="솔로" onClick={()=>changeTrack(track.id,{solo:!track.solo})}>S</button><button title="오디오 파일 추가" onClick={()=>fileInputs.current[track.id]?.click()}>＋ Audio</button><input ref={node=>fileInputs.current[track.id]=node} type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac" multiple hidden onChange={e=>{importAudio(track,[...e.target.files]);e.target.value='';}}/></div></div>
       <div className="mv2-lane" style={{width:laneWidth,backgroundSize:`${BAR}px 100%`}}>
        {(track.midiNotes||[]).map(n=><div className="mv3-audio-midi" key={n.id} style={{left:Math.max(0,Number(n.startBeat)||0)/4*BAR,width:Math.max(3,Math.max(.1,Number(n.length)||1)/4*BAR-2),background:color}} title={`MIDI ${n.pitch} · ${n.startBeat+1}박`} />)}
        {(track.clips||[]).map(clip=>{const timing=clipWindow(clip,p.bpm);const clipWidth=Math.max(22,timing.durationSec/secBar*BAR);const left=timing.startSec/secBar*BAR;return <div className="mv2-clip" key={clip.id} style={{left,width:clipWidth,borderColor:color,backgroundColor:color+'20'}} title={`${clip.fileName} · 시작 ${timing.startSec.toFixed(2)}초 · 재생 ${timing.durationSec.toFixed(2)}초`}>
         <div className="mv2-cliptitle" style={{color}} title={clip.fileName}>{clip.fileName}</div><Waveform assetId={clip.assetId} width={clipWidth-12} color={color} sourceOffsetSec={timing.sourceOffsetSec} visibleDurationSec={timing.durationSec}/></div>;})}
       </div>
      </div>;
     })}
     <div className="mv2-row mv2-last"><div className="mv2-trackhead mv2-new-track"><input value={newTrack} placeholder="새 트랙 이름" aria-label="새 트랙 이름" onChange={e=>setNewTrack(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addTrack()}/><button onClick={addTrack} title="트랙 추가"><Icon name="plus" size={15}/></button></div><div className="mv2-lastlane"/></div>
     <div className="mv2-cursor" aria-hidden="true" style={{left:HEADER+position/secBar*BAR}}><span/></div>
    </div>
   </div>
   <div className="mv2-list">
    <h4>오디오 클립 위치 · 비파괴 자르기 · 복제 · 분할 · 실행 취소 · 페이드 · 음량 · 좌우 배치</h4><p className="mv2-cliphelp">원본 WAV는 수정하지 않습니다. 클립별 음량(0~200%)과 음소거, 페이드 시간과 곡선은 재생과 WAV 믹스 모두에 적용됩니다. 좌우 위치(-100 왼쪽, 0 가운데, +100 오른쪽)도 적용됩니다. 이전 프로젝트는 음량 100%·음소거 해제·가운데 배치로 유지됩니다. 복제는 원본 미디어를 공유하며, 바로 뒤 또는 재생 커서 위치에 배치합니다. 분할은 커서가 클립 내부에 있을 때만 가능하며 양쪽 조각은 같은 원본 미디어와 분할 전 페이드 곡선을 공유합니다. 분할 후 페이드/자르기를 직접 수정하면 해당 조각의 페이드가 새로 적용됩니다. 클립 편집 실행 취소·다시 실행은 현재 화면의 최근 40개 변경에만 적용되며, 다른 프로젝트로 이동하거나 새로고침하면 기록이 초기화됩니다. MIDI와 트랙 믹서 변경은 되돌리지 않습니다.</p>
    {p.tracks.flatMap((t,idx)=>(t.clips||[]).map(c=>{const timing=clipWindow(c,p.bpm);return <div className="mv2-cliprow" key={c.id}>
     <span className="mv2-clip-color" style={{background:palette[idx%palette.length]}}/>
     <span className="mv2-clipfile" title={c.fileName}>{t.name} / {c.fileName}</span>
     <label>시작 마디 <input type="number" min="1" max="999" step="any" aria-label={`${c.fileName} 시작 마디`} value={c.startBar??1} onChange={e=>editClip(t.id,c.id,'startBar',e.target.value)}/></label>
     <label>원본 앞부분 건너뛰기(초) <input type="number" min="0" max={Math.max(0,c.durationSec-.01)} step="0.01" aria-label={`${c.fileName} 원본 시작 초`} value={c.sourceOffsetSec??0} onChange={e=>editClip(t.id,c.id,'sourceOffsetSec',e.target.value)}/></label>
     <label>재생 길이(초) <input type="number" min="0.01" max={Math.max(.01,c.durationSec-(c.sourceOffsetSec||0))} step="0.01" aria-label={`${c.fileName} 재생 길이 초`} value={Math.round(timing.durationSec*1000)/1000} onChange={e=>editClip(t.id,c.id,'playDurationSec',e.target.value)}/></label>
     <label>페이드 인(초) <input type="number" min="0" max={timing.durationSec} step="0.01" aria-label={`${c.fileName} 페이드 인 초`} value={c.fadeInSec??0} onChange={e=>editClip(t.id,c.id,'fadeInSec',e.target.value)}/></label>
     <label>페이드 아웃(초) <input type="number" min="0" max={timing.durationSec} step="0.01" aria-label={`${c.fileName} 페이드 아웃 초`} value={c.fadeOutSec??0} onChange={e=>editClip(t.id,c.id,'fadeOutSec',e.target.value)}/></label>
     <label>페이드 인 곡선 <select aria-label={`${c.fileName} 페이드 인 곡선`} value={clipFadeCurve(c,'in')} onChange={e=>editCurve(t.id,c.id,'in',e.target.value)}><option value="linear">직선</option><option value="smooth">부드럽게</option><option value="equalPower">등전력</option></select></label>
     <label>페이드 아웃 곡선 <select aria-label={`${c.fileName} 페이드 아웃 곡선`} value={clipFadeCurve(c,'out')} onChange={e=>editCurve(t.id,c.id,'out',e.target.value)}><option value="linear">직선</option><option value="smooth">부드럽게</option><option value="equalPower">등전력</option></select></label>
     <label>클립 음량(%) <input type="number" min="0" max="200" step="1" aria-label={`${c.fileName} 클립 음량 퍼센트`} value={c.gainPercent??100} onChange={e=>editLevel(t.id,c.id,'gainPercent',e.target.value)}/></label>
     <label>클립 좌우 위치(-100~100) <input type="number" min="-100" max="100" step="1" aria-label={`${c.fileName} 클립 좌우 위치`} value={c.panPercent??0} onChange={e=>editPan(t.id,c.id,e.target.value)}/></label>
     <label className="mv2-clipmute">음소거 <input type="checkbox" aria-label={`${c.fileName} 클립 음소거`} checked={c.clipMuted===true} onChange={e=>editLevel(t.id,c.id,'clipMuted',e.target.checked)}/></label>
     <button className="mv2-reset" title="원본 WAV는 그대로 보존됩니다" aria-label={`${c.fileName} 자르기 초기화`} onClick={()=>updateClip(t.id,c.id,resetClipTiming)}>자르기 초기화</button>
     <button className="mv2-reset" title="기존 클립의 끝에 새 클립을 배치합니다. 미디어 원본은 공유합니다." aria-label={`${c.fileName} 뒤에 복제`} onClick={()=>duplicate(t.id,c.id,'after')}>뒤에 복제</button>
     <button className="mv2-reset" title="현재 재생 커서 위치에 새 클립을 배치합니다. 미디어 원본은 공유합니다." aria-label={`${c.fileName} 커서에 복제`} onClick={()=>duplicate(t.id,c.id,'cursor')}>커서에 복제</button>
     <button className="mv2-reset" title="현재 재생 커서에서 오디오 클립을 두 조각으로 나눕니다. 원본 파일은 보존합니다." aria-label={`${c.fileName} 커서에서 분할`} onClick={()=>split(t.id,c.id)}>커서에서 분할</button>
     {c.fadeReference&&<span className="mv2-clipdur" title="분할 전 원본 클립의 페이드 곡선을 그대로 따릅니다. 페이드/자르기 설정을 변경하면 해당 조각에 새로 적용됩니다.">원본 페이드 유지</span>}
     <span className="mv2-clipdur">{formatClock(timing.durationSec)}</span>
     <button className="mv2-trash" aria-label={`${c.fileName} 삭제`} onClick={()=>{if(confirm(`'${c.fileName}' 클립을 제거하시겠습니까?`))removeClip(t.id,c.id);}}><Icon name="trash" size={16}/></button>
    </div>}))}
    {!activeClips&&<div className="mv2-empty">각 트랙에서 <strong>＋ Audio</strong>를 눌러 오디오 파일을 불러와 주세요.</div>}
   </div>
  </div>
  <div className="panel"><div className="panel-top"><div><h3>실시간 믹서</h3><p>재생 및 WAV 믹스에 트랙별 볼륨·음소거·솔로가 적용됩니다.</p></div></div>
   <div className="mixer-list">{p.tracks.map((t,i)=><div className="mixer-row" key={t.id}><span className="track-color" style={{background:palette[i%palette.length]}}/><span>{t.name}</span><input aria-label={`${t.name} 음량`} type="range" min="0" max="100" value={t.volume} onChange={e=>changeTrack(t.id,{volume:Number(e.target.value)})}/><strong>{t.volume}%</strong></div>)}</div>
  </div>
  <Notice>Step49 출력 미터는 WAV 내보내기 완료 메시지에 실제 출력 채널의 샘플 피크(dBFS)와 RMS(dBFS)를 표시합니다. 무음 제거·선택 구간·모노 합산·음량 조정·경계 페이드를 반영하지만, 16비트 디더 및 최종 양자화 이전의 샘플을 분석합니다. 0 dBFS 초과 샘플이 있으면 16/24비트 PCM의 클리핑 위험 또는 32비트 float 재생기의 클리핑 가능성을 경고합니다. 이는 LUFS/트루 피크/청감 품질 분석이 아닙니다. WAV 선택 구간 저장은 현재 프로젝트 타임라인의 시작·끝(초)을 지정하여 해당 구간만 출력합니다. 커서→시작/끝 버튼을 사용할 수 있습니다. 선택 구간은 1샘플 이상이어야 하고 프로젝트 전체 길이를 벗어나면 오류로 중단합니다. 선택 구간의 무음 제거·경계 페이드·피크 분석은 출력 범위에만 적용되며 전체 믹스는 오프라인에서 렌더링됩니다. 원본과 프로젝트는 변경하지 않습니다. WAV 16비트 TPDF 디더는 기본적으로 꺼져 있습니다. 켜면 WAV 출력의 최종 16비트 정수 양자화 직전에 작은 삼각분포 잡음을 더해 양자화 왜곡을 줄입니다. 아주 조용한 구간에도 미세한 잡음이 들어가며, 24비트 PCM 및 32비트 float에서는 선택할 수 없습니다. 원본 오디오와 프로젝트는 변경하지 않습니다. WAV 피크 정규화는 기본적으로 꺼져 있으며, WAV 출력에만 적용됩니다. 켜면 선택한 채널과 무음 제거·경계 페이드 이후의 샘플 피크를 기준으로 -1 dBFS를 목표로 증폭 또는 감쇠합니다. 매우 작은 소리의 과도한 증폭을 막기 위해 최대 +12 dB로 제한하며 무음은 그대로 둡니다. 피크 보호와 동시에 켜면 정규화가 우선합니다. LUFS/트루 피크 정규화나 전문 마스터링이 아닙니다. WAV 경계 5ms 페이드는 선택 사항이며 기본적으로 꺼져 있습니다. 켜면 무음 제거 후 출력 WAV의 양 끝에 짧은 선형 페이드를 적용하여 절단 클릭을 줄일 수 있지만, 의도된 시작·끝 소리도 작아집니다. 아주 짧은 WAV는 경계가 크게 감쇠될 수 있습니다. 피크 보호는 페이드 전의 출력 범위를 검사하므로 감쇠량이 보수적일 수 있습니다. WAV 앞뒤 무음 제거는 선택 사항이며 -60 dBFS 미만인 양 끝부분만 제거하고 중간 무음은 보존합니다. 의도된 여백이나 매우 작은 소리도 제거될 수 있으니 필요한 경우 옵션을 끄세요. 전체 무음이면 길이를 유지합니다. WAV는 16비트 PCM(기본), 24비트 PCM 또는 32비트 IEEE float로, 샘플레이트는 44.1kHz(기본) 또는 48kHz로, 채널은 스테레오(기본) 또는 모노로 내보낼 수 있습니다. 모노 출력은 좌·우 채널의 평균으로 생성되어 서로 위상이 반대인 소리는 상쇄될 수 있습니다. 피크 보호는 선택한 출력 채널 기준으로 적용됩니다. 샘플레이트 변경은 오프라인 믹싱 엔진에서 리샘플링하며 원본의 음질을 높이지 않습니다. 24비트 PCM은 16비트보다 약 1.5배, 32비트 float는 약 2배 큽니다. float는 피크 보호를 끄면 0 dBFS 초과 샘플도 보존하지만 WAV를 재생하는 프로그램에 따라 클리핑될 수 있습니다. float 저장이 원본 음질을 높이는 것은 아닙니다. WAV 피크 보호는 내보내기 시 전체 믹스에 동일한 감쇠만 적용하는 샘플 피크 검사입니다. 실시간 재생이나 원본 오디오에는 영향을 주지 않으며, 트루 피크 제한·라우드니스 정규화·마스터링 기능은 아닙니다. 오디오는 PC 내부에서 처리하며 외부로 전송하지 않습니다. 클립의 실제 오디오 파일은 로컬 IndexedDB에 저장됩니다. 일반 프로젝트 JSON에는 오디오 원본이 포함되지 않으므로 별도의 전체 백업 기능을 사용하세요. MIDI 피아노 롤과 로컬 신스 재생은 지원합니다. AI 작곡과 AI 보컬 합성은 아직 미구현입니다.</Notice>
 </>;
}
