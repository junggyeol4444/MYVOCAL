import React,{useEffect,useRef,useState} from 'react';
import {Button,Notice,Panel} from './UI';
import {getFile} from '../lib/assetDb.js';
import {downloadProjectBundle} from '../lib/projectBundle.js';
import {exportCapabilities98,lyricsSrt98,sceneGuideSrt98,midi98,wav98,stemsZip98,captureMp498} from '../lib/finalExport98.js';
import {renderPv95Canvas,pv95Frame,pv95Duration} from '../lib/vocalSynthPv95.js';
import {auditIntegration99} from '../lib/integrationAudit99.js';
import {acceptance100} from '../lib/acceptance100.js';
import {downloadText} from '../lib/store.js';
const defaults={version:1,style:'Anime',effect:'pulse',lyricPosition:'lower',fps:24,intensity:.6};
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),4000);}
export default function FinalDelivery98({project,data,notify}){
 const canvas=useRef(null),cancelRef=useRef(null),[busy,setBusy]=useState(''),[message,setMessage]=useState(''),[audit,setAudit]=useState(null);
 const caps=exportCapabilities98(project);
 useEffect(()=>()=>cancelRef.current?.abort(),[]);
 const stem=String(project.title||'MYVOCAL').replace(/[\\/:*?"<>|]/g,'_').slice(0,80);
 async function task(name,fn){if(busy)return;setBusy(name);setMessage(`${name} 처리 중…`);try{await fn();setMessage(`${name}: 파일 생성 또는 다운로드 요청 완료`);}catch(e){setMessage(`${name} 실패: ${e.message}`);}finally{setBusy('');}}
 const mp4=()=>task('MP4',async()=>{
  const controller=new AbortController();cancelRef.current=controller;
  const settings=project.pv95?.version===1?project.pv95:defaults;
  const maps=new Map(),urls=[];try{
   for(const scene of project.scenes||[]){if(!scene.imageAssetId)continue;
    const file=await getFile(scene.imageAssetId);if(!file)throw Error(`장면 ${scene.title||scene.id} 이미지 원본 누락`);
    const url=URL.createObjectURL(file);urls.push(url);
    const image=new Image();image.src=url;await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('장면 이미지를 읽을 수 없습니다.'));});
    maps.set(scene.id,image);
   }
   const result=await captureMp498({project,canvas:canvas.current,signal:controller.signal,
    draw:t=>{const scene=pv95Frame(project,t).scene;renderPv95Canvas(canvas.current.getContext('2d'),project,settings,t,maps.get(scene?.id)||null);}});
   if(controller.signal.aborted)throw Error('취소됨');downloadBlob(result,`${stem}.mp4`);
  }finally{urls.forEach(URL.revokeObjectURL);cancelRef.current=null;}
 });
 const runAudit=()=>{const a=auditIntegration99(data,project);setAudit(a);setMessage(`진단: 자동/수동 항목 통과 ${a.passed}개, 미완료·미검증 ${a.blocked}개`);};
 const acceptance=acceptance100(data,project);
 return <><Panel title="STEP98 · 최종 파일 내보내기" description="기존 DAW·MIDI·가사 싱크·PV 모듈을 하나의 출력 화면에 연결합니다.">
  <canvas ref={canvas} width={768} height={432} style={{display:'none'}} aria-hidden="true"/>
  <div className="hstack" style={{flexWrap:'wrap',gap:8}}>
   <Button disabled={!caps.wav||!!busy} onClick={()=>task('WAV',async()=>downloadBlob(await wav98(project),`${stem}.wav`))}>WAV 믹스</Button>
   <Button disabled={!caps.wav||!!busy} onClick={()=>task('트랙별 WAV Stems',async()=>downloadBlob(await stemsZip98(project),`${stem}-tracks-stems.zip`))}>트랙별 WAV Stems ZIP</Button>
   <Button disabled={!caps.midi||!!busy} onClick={()=>task('MIDI',async()=>downloadBlob(midi98(project),`${stem}.mid`))}>MIDI</Button>
   <Button disabled={!caps.srt||!!busy} onClick={()=>task('가사 SRT',async()=>downloadText(lyricsSrt98(project),`${stem}-lyrics.srt`))}>가사 SRT</Button>
   <Button disabled={!caps.storyboardSrt||!!busy} onClick={()=>task('장면 SRT',async()=>downloadText(sceneGuideSrt98(project,data.characters),`${stem}-scenes.srt`))}>장면 가이드 SRT</Button>
   <Button disabled={!caps.mp4||!!busy} onClick={mp4}>오디오 포함 MP4 (지원 브라우저·30초 이하)</Button>
   <Button disabled={!!busy} onClick={()=>task('전체 프로젝트 백업',async()=>{await downloadProjectBundle(project,data);})}>전체 프로젝트 백업</Button>
   {busy==='MP4'&&<Button onClick={()=>cancelRef.current?.abort()}>MP4 출력 취소</Button>}
  </div><p role="status">{message||caps.notes}</p>
  <Notice>MP4는 브라우저에서 MP4(MediaRecorder) 인코더를 실제 지원하고, 유효한 오디오가 있고, PV가 30초 이하일 때만 출력합니다. 미지원 환경에서는 버튼을 비활성화합니다. WebM을 MP4로 이름만 바꾸지 않습니다. WAV·MIDI·자막은 해당 원본과 정렬 데이터가 있어야 활성화됩니다. 트랙별 WAV는 기존 오프라인 믹서로 개별 렌더링하며 AI 악기 분리 모델 실행과 구분됩니다.</Notice>
 </Panel>
 <Panel title="STEP99 · 통합 안정화 진단" description="실제 자료 연결·출력 준비와 실기기 미검증을 별도 판정합니다."><div className="hstack"><Button onClick={runAudit}>현재 프로젝트 검사</Button><Button onClick={()=>downloadText(JSON.stringify(auditIntegration99(data,project),null,2),`${stem}-audit99.json`,'application/json')}>검사 JSON 저장</Button></div>
 {audit&&<div>{audit.items.map(i=><p key={i.id}>{i.status==='pass'?'✓':'○'} {i.label}: {i.status==='pass'?'자동 확인':'미완료/미검증'} · {i.detail}</p>)}</div>}
 </Panel>
 <Panel title="STEP100 · 최종 완성 검증 게이트" description="실제 Windows·GPU·AI 생성 품질을 확인하지 않았다면 완성으로 표시하지 않습니다.">
  <strong>{acceptance.ready?'모든 조건 검증 기록 확인 필요':'완성 검증 미통과'}</strong>
  <p>현재 미충족/미검증 조건: {acceptance.blocking.map(b=>b.id).join(', ')||'없음'}</p>
  <Button onClick={()=>downloadText(JSON.stringify(acceptance,null,2),`${stem}-acceptance100.json`,'application/json')}>최종 검증 상태 JSON 저장</Button>
  <Notice>Windows 10/11 실제 실행, 실 GPU/미디어 재생, 학습된 AI 모델 종단간 출력 품질은 이 실행 환경에서 자동 인증할 수 없습니다. 이 화면은 이를 완료했다고 주장하지 않습니다.</Notice>
 </Panel></>;
}
