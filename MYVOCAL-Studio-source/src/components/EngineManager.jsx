import React,{useState} from 'react';
import {Button,Field,Notice,Panel,Status} from './UI';

// Runs a program explicitly selected by the user. The EXE never silently
// installs a model or trains a singer; the selected command must already exist.
export default function EngineManager({port,onPort,requestBridge,notify}){
 const [executable,setExecutable]=useState('');
 const [argsText,setArgsText]=useState('[]');
 const [state,setState]=useState(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [showAdvanced,setShowAdvanced]=useState(false);
 const wrap=async task=>{if(busy)return;setBusy(true);setMessage('');try{await task()}catch(e){setMessage('오류: '+e.message)}finally{setBusy(false)}};
 const refresh=()=>wrap(async()=>{const r=await requestBridge('/api/singing/engine/status');setState(await r.json())});
 const start=()=>wrap(async()=>{
  if(!executable.trim())throw Error('먼저 설치된 엔진 실행 파일의 절대 경로를 입력해 주세요.');
  let args;try{args=JSON.parse(argsText)}catch{throw Error('인수는 JSON 배열이어야 합니다. 예: ["--port","{port}"]')}
  if(!Array.isArray(args)||args.some(s=>typeof s!=='string'))throw Error('문자열로 된 JSON 배열을 입력해 주세요.');
  const p=Number(port);if(!Number.isInteger(p)||p<1024||p>65535||p===58319)throw Error('엔진 포트를 확인하세요.');
  const r=await requestBridge('/api/singing/engine/start',{executable:executable.trim(),args,port:p});setState(await r.json());notify('지정한 엔진 프로세스를 실행했어. 모델 조회 버튼으로 준비 상태를 확인해 주세요.');
 });
 const stop=()=>wrap(async()=>{await requestBridge('/api/singing/engine/stop',{});const r=await requestBridge('/api/singing/engine/status');setState(await r.json());notify('엔진 중지를 요청했습니다.');});
 return <div className="mv12-manager">
  <div className="mv12-manager-heading"><div><strong>엔진 실행 관리자 · v1.3</strong><p>설치된 가창 엔진을 이 프로그램에서 직접 시작하거나 중지합니다. 엔진·AI 모델 설치는 별도입니다.</p></div><Status>{state?.running?'프로세스 실행 중':'실행 상태 미확인/중지됨'}</Status></div>
  <div className="mv12-manager-grid">
   <Field label="설치된 엔진 실행 파일 (.exe) 절대 경로"><input value={executable} onChange={e=>setExecutable(e.target.value)} placeholder="C:\\Python311\\python.exe 또는 엔진.exe"/></Field>
   <Field label="명령줄 인수 · JSON 배열"><textarea rows="2" value={argsText} onChange={e=>setArgsText(e.target.value)} placeholder={'["C:\\\\MYVOCAL\\\\cli_singing_adapter.py","--port","{port}"]'}/></Field>
  </div>
  <div className="mv7-actions"><Button disabled={busy||state?.running} variant="primary" onClick={start}>선택한 엔진 실행</Button><Button disabled={busy||!state?.running} onClick={stop}>엔진 중지</Button><Button disabled={busy} onClick={refresh}>상태·로그 새로고침</Button><Button variant="secondary" onClick={()=>setShowAdvanced(v=>!v)}>{showAdvanced?'설명 닫기':'어댑터 설정 예시'}</Button></div>
  {showAdvanced&&<Notice>ZIP의 <code>tools/cli_singing_adapter.py</code>가 기존 CLI 프로그램과 연결해 줍니다. 실행 파일에 <code>python.exe</code> 절대 경로를 입력하고, 인수에 <code>["C:\\...\\cli_singing_adapter.py", "--port", "{'{port}'}", "--config", "C:\\...\\config.json"]</code>을 입력하세요. 실제 AI 엔진은 가사·음표 JSON을 입력받아 WAV를 생성하도록 별도 연동 작업이 필요합니다.</Notice>}
  {state&&<div className="mv12-meta"><span>실행 파일: {state.executable||'없음'}</span><span>포트: {state.port||'—'}</span><span>시작: {state.startedAt||'—'}</span>{state.lastExit&&<span>마지막 종료: {state.lastExit}</span>}</div>}
  {!!state?.log&&<pre className="mv12-log" aria-label="엔진 출력 로그">{state.log.slice(-4500)}</pre>}
  {message&&<Notice>{message}</Notice>}
  <p className="mv12-caution">보안: 신뢰하는 실행 파일만 지정하세요. 입력한 프로그램은 사용자 PC의 권한으로 실행됩니다. AI 모델이 설치돼 있지 않으면 실제 AI Singing은 작동하지 않습니다.</p>
 </div>;
}
