import React,{useEffect,useRef,useState} from 'react';
import {Button,Field,Notice} from './UI';
import {getFile,putFile,removeFile} from '../lib/assetDb.js';
import {genId} from '../lib/schema.js';
import {createPersonLipSettings,personAudioAssets,personVideoAssets,renderPersonLipFrame,savePersonLipSettings,validatePersonLipAudio,validatePersonLipSettings} from '../lib/personLipSync.js';
import {recordPersonLipWebM,supportedPersonLipRecording} from '../lib/personLipRecording.js';

const maxDuration=(video,audio,limit)=>Math.min(limit,Number.isFinite(video?.duration)?video.duration:limit,Number.isFinite(audio?.duration)?audio.duration:limit);
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export default function PersonLipSyncEditor({character,onSave,notify}){
 const [settings,setSettings]=useState(()=>character.personLipSync||createPersonLipSettings(character));
 const [audioFile,setAudioFile]=useState(null),[videoUrl,setVideoUrl]=useState(''),[audioUrl,setAudioUrl]=useState('');
 const [readyVersion,setReadyVersion]=useState(0);
 const [status,setStatus]=useState('등록된 로컬 원본을 확인하는 중…'),[time,setTime]=useState(0),[playing,setPlaying]=useState(false),[exporting,setExporting]=useState(false),[progress,setProgress]=useState(0),[guide,setGuide]=useState(true),[audioConsent,setAudioConsent]=useState(false);
 const canvasRef=useRef(null),videoRef=useRef(null),audioRef=useRef(null),raf=useRef(0),controller=useRef(null),mounted=useRef(true);
 const videos=personVideoAssets(character),audios=personAudioAssets(character);
 const patch=(key,value)=>setSettings(v=>({...v,[key]:value}));
 const setMouth=(key,value)=>setSettings(v=>({...v,mouth:{...v.mouth,[key]:value}}));
 useEffect(()=>()=>{mounted.current=false;cancelAnimationFrame(raf.current);controller.current?.abort();videoRef.current?.pause();audioRef.current?.pause();},[]);
 useEffect(()=>{let dead=false,blobUrl='';setStatus('실제 사람 영상 불러오는 중…');setVideoUrl('');
  (async()=>{try{const f=await getFile(settings.videoAssetId);if(!f)throw Error('등록된 실제 사람 영상 원본이 없습니다.');if(!f.type?.startsWith('video/'))throw Error('영상 파일 형식이 아닙니다.');blobUrl=URL.createObjectURL(f);if(!dead){setVideoUrl(blobUrl);setStatus('영상 준비됨 · 가창 오디오와 타이밍을 확인하세요.');}}catch(e){if(!dead)setStatus('영상 읽기 실패: '+e.message);}})();
  return()=>{dead=true;if(blobUrl)URL.revokeObjectURL(blobUrl);};
 },[settings.videoAssetId]);
 useEffect(()=>{let dead=false,blobUrl='';setAudioUrl('');
  (async()=>{try{const f=audioFile||await getFile(settings.audioAssetId);if(!f)return;blobUrl=URL.createObjectURL(f);if(!dead)setAudioUrl(blobUrl);}catch(e){if(!dead)setStatus('오디오 읽기 실패: '+e.message);}})();
  return()=>{dead=true;if(blobUrl)URL.revokeObjectURL(blobUrl);};
 },[settings.audioAssetId,audioFile]);
 const video=videoRef.current,audio=audioRef.current;
 const maximum=maxDuration(video,audio,settings.duration);void readyVersion;
 const isReady=!!videoUrl&&!!audioUrl&&!!video?.readyState&&!!audio?.readyState&&!!character.lipSync?.cues?.length;
 const canSave=!!settings.videoAssetId&&(!!settings.audioAssetId||!!audioFile)&&audioConsent&&!!character.lipSync?.cues?.length;
 const draw=(t,showGuide=guide)=>{const cv=canvasRef.current,v=videoRef.current;if(!cv||!v||v.readyState<2)return;
  // A temporary audio file has no saved asset ID yet. For display only, point at a
  // same-profile audio ID; the persisted profile is always validated on Save.
  const renderSettings={...settings,audioAssetId:settings.audioAssetId||'step86_preview'};
  const renderCharacter=audioFile&&!settings.audioAssetId?{...character,assets:[...(character.assets||[]),{id:'step86_preview',name:audioFile.name,type:audioFile.type}]}:character;
  renderPersonLipFrame(cv.getContext('2d'),v,renderCharacter,renderSettings,t,cv.width,cv.height,{guide:showGuide});
 };
 const pause=()=>{cancelAnimationFrame(raf.current);setPlaying(false);videoRef.current?.pause();audioRef.current?.pause();};
 const tick=()=>{const a=audioRef.current,v=videoRef.current;if(!a||!v)return;const t=a.currentTime;
  if(Math.abs(v.currentTime-t)>.25&&v.readyState>=2)v.currentTime=t;
  draw(t);setTime(t);
  if(a.ended||t>=maximum){pause();return;}raf.current=requestAnimationFrame(tick);
 };
 const play=async()=>{if(playing){pause();return;}if(!isReady){notify('영상과 가창 오디오가 준비되어야 재생할 수 있습니다.');return;}
  try{if(audioRef.current.currentTime>=maximum-.02){audioRef.current.currentTime=0;videoRef.current.currentTime=0;}
   videoRef.current.muted=true;await Promise.all([videoRef.current.play(),audioRef.current.play()]);setPlaying(true);raf.current=requestAnimationFrame(tick);
  }catch(e){pause();notify('영상/오디오 재생 실패: '+e.message);}
 };
 const seek=(position)=>{pause();const t=Math.max(0,Math.min(maximum,Number(position)||0));if(videoRef.current)videoRef.current.currentTime=t;if(audioRef.current)audioRef.current.currentTime=t;setTime(t);};
 const save=async()=>{if(!canSave)return;let newId='';try{
  let profile=character,next={...settings,mouth:{...settings.mouth}};
  if(audioFile){validatePersonLipAudio(audioFile);newId=genId('asset');next.audioAssetId=newId;profile={...character,assets:[...(character.assets||[]),{id:newId,name:audioFile.name,type:audioFile.type,size:audioFile.size,role:'other'}]};}
  const updated=savePersonLipSettings(profile,next);
  if(newId)await putFile(newId,audioFile);
  try{onSave(updated);}catch(e){if(newId)await removeFile(newId);throw e;}
  notify('STEP86 실제 사람 Lip Sync 저장 완료 · 원본 영상 및 기존 음소 시간표 유지');
 }catch(e){if(newId)try{await removeFile(newId);}catch{}notify('STEP86 저장 실패: '+e.message);}
 };
 const exportVideo=async()=>{if(!isReady||exporting||!audioConsent){notify('등록한 영상과 사용 허가된 가창 오디오가 필요합니다.');return;}
  let draft={...settings,audioAssetId:settings.audioAssetId||'step86_preview'},profile=character;
  if(audioFile&&!settings.audioAssetId)profile={...character,assets:[...character.assets,{id:'step86_preview',name:audioFile.name,type:audioFile.type}]};
  try{validatePersonLipSettings(profile,draft);if(maximum<2)throw Error('영상과 오디오의 공통 길이가 2초 미만입니다.');
   pause();seek(0);setExporting(true);setProgress(0);const abort=new AbortController();controller.current=abort;
   const blob=await recordPersonLipWebM({canvas:canvasRef.current,video:videoRef.current,audioUrl,duration:maximum,fps:30,signal:abort.signal,
    draw:t=>draw(t,false),onProgress:p=>{if(mounted.current)setProgress(p);}});
   downloadBlob(blob,`MYVOCAL-Step86-${character.id.replace(/[^a-zA-Z0-9_-]/g,'_')}-person-lip.webm`);
   notify('STEP86 로컬 WebM 출력 완료 · 가창 오디오 포함 (MP4는 98단계)');
  }catch(e){notify('STEP86 출력 실패: '+e.message);}finally{controller.current=null;if(mounted.current){setExporting(false);setPlaying(false);setTime(0);}}
 };
 const num=(name,label,min,max,step)=> <Field label={`${label}: ${settings.mouth[name].toFixed(3)}`}><input type="range" min={min} max={max} step={step} value={settings.mouth[name]} disabled={exporting} onChange={e=>setMouth(name,Number(e.target.value))}/></Field>;
 return <div className="modal-form" style={{maxHeight:'76vh',overflowY:'auto'}}>
  <Notice>STEP86 · 허가받은 실제 사람 영상 + 가창 오디오의 Lip Sync. STEP85에서 직접 검토한 음소/발음 시간을 기준으로 원본 영상의 입 영역을 기하학적으로 변형합니다. 얼굴 자동 추적·신경망 얼굴 재합성은 제공하지 않으며, 머리 위치가 바뀌는 장면은 적합하지 않습니다. 원본은 변경하지 않습니다.</Notice>
  <Field label="등록한 사람 영상"><select value={settings.videoAssetId} disabled={exporting} onChange={e=>{pause();patch('videoAssetId',e.target.value);}}>{videos.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
  <Field label="등록한 가창 오디오"><select disabled={exporting||!!audioFile} value={settings.audioAssetId} onChange={e=>{pause();patch('audioAssetId',e.target.value);}}><option value="">오디오를 선택하세요</option>{audios.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
  <Field label="새 가창 오디오를 로컬 등록 (최대 40MB)"><input type="file" accept="audio/wav,audio/mpeg,audio/mp4,audio/ogg,audio/webm,audio/flac,.wav,.mp3,.m4a,.ogg,.oga,.webm,.flac" disabled={exporting} onChange={e=>{pause();const f=e.target.files?.[0];if(!f){setAudioFile(null);return;}try{validatePersonLipAudio(f);setAudioFile(f);}catch(err){e.target.value='';notify(err.message);}}}/></Field>
  {audioFile&&<Button disabled={exporting} onClick={()=>setAudioFile(null)}>신규 오디오 선택 취소</Button>}
  <label><input type="checkbox" checked={audioConsent} disabled={exporting} onChange={e=>setAudioConsent(e.target.checked)}/> 등록한 사람과 가창 오디오 사용 권한을 확인했습니다.</label>
  <p role="status">{status}</p>
  <video ref={videoRef} src={videoUrl||undefined} preload="auto" playsInline muted style={{display:'none'}} onLoadedData={()=>{setReadyVersion(v=>v+1);draw(audioRef.current?.currentTime||0);}} onSeeked={()=>draw(audioRef.current?.currentTime||0)} onError={()=>setStatus('비디오 디코딩을 지원하지 않습니다. 영상 코덱을 확인하세요.')}/>
  <audio ref={audioRef} src={audioUrl||undefined} preload="auto" onLoadedData={()=>{setReadyVersion(v=>v+1);draw(0);}} onError={()=>setStatus('오디오 디코딩을 지원하지 않습니다. 가창 파일 코덱을 확인하세요.')}/>
  <canvas ref={canvasRef} width="640" height="360" aria-label="실제 사람 입 모양 동기화 미리보기" style={{width:'100%',maxWidth:640,aspectRatio:'16/9',background:'#070b14',borderRadius:8}}/>
  <div className="look-actions"><Button disabled={!isReady||exporting} onClick={play}>{playing?'일시정지':'영상+가창 재생'}</Button><Button disabled={!isReady||exporting} onClick={()=>seek(0)}>처음부터</Button><label><input type="checkbox" checked={guide} onChange={e=>{setGuide(e.target.checked);draw(audioRef.current?.currentTime||0,e.target.checked);}}/> 입 영역 표시 (출력에서 제외)</label></div>
  <input type="range" min="0" max={Math.max(.01,maximum)} step=".01" value={Math.min(time,maximum)} disabled={!isReady||exporting} aria-label="실제 사람 Lip Sync 시간 탐색" onChange={e=>seek(e.target.value)}/>
  <small>{time.toFixed(2)}초 / {maximum.toFixed(2)}초 · STEP85 음소 {character.lipSync?.cues?.length||0}개</small>
  <div className="form-two">{num('x','입 영역 왼쪽',0,.98,.005)}{num('y','입 영역 위쪽',0,.98,.005)}{num('width','입 영역 너비',.02,.6,.005)}{num('height','입 영역 높이',.02,.6,.005)}</div>
  <Field label={`입 움직임 강도: ${settings.strength.toFixed(2)}`}><input type="range" min="0" max="1" step=".05" disabled={exporting} value={settings.strength} onChange={e=>patch('strength',Number(e.target.value))}/></Field>
  <Field label="가창 음소 시간 보정 (밀리초, -10000~+10000)"><input type="number" min="-10000" max="10000" step="10" disabled={exporting} value={settings.offsetMs} onChange={e=>patch('offsetMs',Number(e.target.value))}/></Field>
  <Field label="최대 출력 길이 (2~30초)"><input type="number" min="2" max="30" step="1" disabled={exporting} value={settings.duration} onChange={e=>patch('duration',Number(e.target.value))}/></Field>
  <div className="look-actions"><Button disabled={!canSave||exporting} variant="primary" onClick={save}>Lip Sync 설정·오디오 저장</Button><Button disabled={!isReady||!audioConsent||exporting||!supportedPersonLipRecording()} onClick={exportVideo}>{exporting?`출력 중 ${Math.round(progress*100)}%`:'가창 포함 WebM 출력'}</Button>{exporting&&<Button onClick={()=>controller.current?.abort()}>출력 취소</Button>}</div>
  <Notice>원본은 그대로 보존되며 새 오디오는 캐릭터 자산으로 로컬 저장되어 프로젝트 백업에 포함됩니다. 시간표나 입 위치가 부정확하면 출력도 부정확합니다. 실제 Windows 실행·GPU 품질·인물 얼굴의 사실적인 변형은 별도 검증이 필요합니다.</Notice>
 </div>;
}
