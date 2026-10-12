import React,{useState} from 'react';
import {Button,Notice,Panel,Status} from './UI';
import {CAPABILITY_AUDIT,STATUS_NAMES,capabilityCounts,systemCheckLabels,checkAssetPersistence} from '../lib/readiness';
import {downloadText} from '../lib/store';
const now=()=>new Date().toISOString();
export default function ReadinessPanel(){
 const [busy,setBusy]=useState(false);
 const [report,setReport]=useState(null);
 const [mic,setMic]=useState('확인 전');
 const [error,setError]=useState('');
 const counts=capabilityCounts();
 const check=async()=>{
  setBusy(true);setError('');
  const result={date:now(),assetStorage:{available:false,note:'확인하지 못함'},desktop:null,webAudio:!!(window.AudioContext||window.webkitAudioContext),microphone:mic};
  try{await checkAssetPersistence();result.assetStorage={available:true,note:'실제 파일 쓰기·읽기·삭제 성공'}}catch(e){result.assetStorage={available:false,note:String(e.message||e)}}
  if(window.__MYVOCAL_SESSION_KEY){
    try{
      const response=await fetch('/api/system/readiness',{headers:{'X-MYVOCAL-Session':window.__MYVOCAL_SESSION_KEY},cache:'no-store'});
      if(!response.ok)throw new Error('HTTP '+response.status);
      result.desktop=await response.json();
    }catch(e){setError('Windows 런처 진단 오류: '+e.message)}
  }else setError('EXE 전용 시스템 진단은 Windows 실행 파일에서만 가능해. 웹 미리보기에서는 저장소 검사만 실행했어.');
  setReport(result);setBusy(false);
 };
 const checkMicrophone=async()=>{
  if(!navigator.mediaDevices?.getUserMedia){setMic('사용 불가능 · 마이크 API 없음');return}
  let stream;
  try{
   stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
   setMic('접근 허용 · 장치 연결 확인 (녹음·저장 안 함)');
  }catch(e){setMic('접근 불가 · '+(e.name||'장치 또는 권한 문제'))}
  finally{stream?.getTracks().forEach(track=>track.stop())}
 };
 const saveReport=()=>{
  if(!report)return;
  downloadText(JSON.stringify({report,featureAudit:CAPABILITY_AUDIT},null,2),'MYVOCAL-v1.8-diagnostics.json','application/json');
 };
 return <>
  <Panel title="v1.8 · 앱 실행 환경 진단" description="실제 파일 저장, 오디오 API, 앱 서버·브라우저·데이터 폴더를 검사해요. 학습 AI나 영상 생성의 품질을 검사하는 기능은 아니에요.">
   <div className="mv18-actions"><Button variant="primary" icon="check" disabled={busy} onClick={check}>{busy?'확인 중...':'내 PC · 저장소 진단'}</Button><Button icon="mic" onClick={checkMicrophone}>마이크 권한 확인</Button><Button icon="download" disabled={!report} onClick={saveReport}>진단 JSON 저장</Button></div>
   <p className="mv18-mic">마이크: {mic} · 누르면 권한을 요청하고 즉시 연결을 해제해요. 음성을 녹음하거나 저장하지 않아요.</p>
   {error&&<Notice>{error}</Notice>}
   {report&&<div className="mv18-check-list">
    <div><span>음성·이미지 파일 저장소 (IndexedDB)</span><Status ready={report.assetStorage.available}>{report.assetStorage.available?'읽기/쓰기 통과':'오류'}</Status><small>{report.assetStorage.note}</small></div>
    <div><span>Web Audio 재생 API</span><Status ready={report.webAudio}>{report.webAudio?'사용 가능':'미지원'}</Status></div>
    {report.desktop?.checks?.map(x=><div key={x.id}><span>{systemCheckLabels()[x.id]||x.id}</span><Status ready={x.available}>{x.available?'통과':'확인 필요'}</Status><small>{x.detail}</small></div>)}
    <div><span>프로그램이 관리하는 외부 가창 엔진</span><Status ready={!!report.desktop?.managedEngineRunning}>{report.desktop?.managedEngineRunning?'프로세스 실행 중':'실행 안 됨 / 미확인'}</Status></div>
    <div><span>내장 신경망 Singing AI</span><Status>미포함</Status></div>
    <div><span>내장 AI 뮤직비디오 생성기</span><Status>미포함</Status></div>
   </div>}
  </Panel>
  <Panel title="원본 기획 대비 현재 진행 상태" description="버전 번호나 UI 존재 여부가 아니라, 실제 처리 엔진을 기준으로 구분했어. 전체 완성률(%)은 검증 근거가 부족해 표시하지 않아.">
    <div className="mv18-summary"><span>기본 구현: <strong>{counts.basic}</strong></span><span>부분 구현: <strong>{counts.partial}</strong></span><span>핵심 미구현: <strong>{counts.blocked}</strong></span></div>
    <div className="mv18-feature-list">{CAPABILITY_AUDIT.map(x=><div key={x.key}><span className="mv18-feature-name">{x.name}</span><span className={'mv18-state mv18-'+x.state}>{STATUS_NAMES[x.state]}</span><p>{x.detail}</p></div>)}</div>
    <Notice>남은 핵심 개발: ① 실제 음성 모델 학습·한국어 AI 가창 검증 ② 캐릭터 고정·립싱크·모션 합성 ③ 실제 MV 렌더링·내보내기 ④ Windows PC에서 통합 테스트. 현재는 전체 제품이 아닌 데스크톱 프로토타입이야.</Notice>
  </Panel>
 </>;
}
