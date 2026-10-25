import React,{useEffect,useState} from 'react';
import Sidebar from './components/Sidebar';
import {Icon,Status} from './components/UI';
import {readDataState,saveData,resetCorruptData,downloadText,updateEntity,deleteEntity,projectUpdate,STORAGE_KEY} from './lib/store';
import {backupCharacterRemovalWithManifest,listRestorableDeletedCharacters,restoreDeletedCharacterFromManifest} from './lib/characterDeletionManifest.js';
import {commitCharacterProfileRemoval} from './lib/characterDeletionPersistence.js';
import {genId,newProject,now} from './lib/schema';
import Dashboard from './pages/Dashboard';
import AutoCreate from './pages/AutoCreate';
import Workspace from './pages/Workspace';
import Projects from './pages/Projects';
import Voices from './pages/Voices';
import Training from './pages/Training';
import {planCreateSongVideo97,applyCreateSongVideo97} from './lib/createSongVideo97.js';
import Characters from './pages/Characters';
import Video from './pages/Video';
import Learning from './pages/Learning';
import Library from './pages/Library';
import Settings from './pages/Settings';

const labels={home:'대시보드',create:'AI로 노래 만들기',projects:'프로젝트',music:'Music Studio',voices:'Voice Studio',training:'Voice Training',characters:'Character Studio',video:'Music Video Studio',pv:'Vocal Synth PV',learning:'Learning Studio',library:'라이브러리',settings:'설정',workspace:'프로젝트 편집기'};
function fromHash(){const [,route,projectId]=location.hash.split('/');return {page:labels[route]?route:'home',projectId:projectId||''};}
export default function App(){
 const [storageState,setStorageState]=useState(readDataState);
 const [data,setData]=useState(()=>storageState.data);
 const [saveFailed,setSaveFailed]=useState(false);
 const [recoveryError,setRecoveryError]=useState('');
 const [route,setRoute]=useState(fromHash);
 const [mobileMenu,setMobileMenu]=useState(false);
 const [toast,setToast]=useState('');
 useEffect(()=>{const fn=()=>setRoute(fromHash());window.addEventListener('hashchange',fn);return()=>window.removeEventListener('hashchange',fn);},[]);
 useEffect(()=>{
  if(storageState.status==='corrupt'||storageState.status==='unavailable')return;
  if(saveData(data))setSaveFailed(false);
  else setSaveFailed(true);
 },[data,storageState.status]);
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),4000);return()=>clearTimeout(timer);},[toast]);
 const navigate=(page,id='')=>{location.hash=`/${page}${id?'/'+id:''}`;setRoute({page,projectId:id});setMobileMenu(false);window.scrollTo(0,0);};
 const notify=(message)=>setToast(message);
 const add=(type,item)=>setData(d=>updateEntity(d,type,item));
 const remove=(type,id)=>setData(d=>deleteEntity(d,type,id));
 const listRestorableCharacters=()=>listRestorableDeletedCharacters(localStorage,STORAGE_KEY);
 const restoreCharacterPersisted=manifestKey=>{
  const current=readDataState();
  if(current.status!=='ok'||JSON.stringify(current.data)!==JSON.stringify(data))throw Error('화면의 저장되지 않은 변경 사항이 있습니다. 먼저 저장 상태를 확인하세요.');
  const result=restoreDeletedCharacterFromManifest(localStorage,STORAGE_KEY,manifestKey,localStorage.getItem(STORAGE_KEY));
  setData(result.data);
  return result;
 };
 const removeCharacterPersisted=id=>{
  const result=commitCharacterProfileRemoval(data,id,saveData,readDataState,
   ()=>backupCharacterRemovalWithManifest(localStorage,STORAGE_KEY,id));
  setData(result.data);
  return result;
 };
 const editProject=project=>setData(d=>projectUpdate(d,project));
 const createProject=(options)=>{let project=newProject(options);if(options.pipeline97){const plan=planCreateSongVideo97(project,options.options);project=applyCreateSongVideo97(project,plan);}
  // 사용자가 곡+MV 동시 제작 시작을 명시한 경우에만 기존 영상 제작 GUI로 이동.
  // 로컬 모델 인증·출연 허가는 생성 버튼에서 다시 확인하며 원본은 변경하지 않는다.
  const quickMv=options.openMv===true&&options.withVideo===true&&options.options?.musicVideo===true;
  if(quickMv)project={...project,productionLaunch55:{version:1,requested:{...project.options},from:'user-create-song-video'}};
  setData(d=>updateEntity(d,'projects',project));navigate(quickMv?'video':'workspace',project.id);
  notify(quickMv?'가사·MIDI·장면 초안을 보존하고 기존 로컬 신경망 음악·MV 제작 화면을 열었습니다. 설치 모델과 권한을 확인한 뒤 실제 생성을 실행하세요.':
   options.pipeline97?'가사·MIDI·영상 장면 초안을 만들었습니다. 기존 제작 화면에서 설치한 로컬 가창·MV 모델로 실제 영상을 제작할 수 있습니다.':'빈 프로젝트를 만들었습니다.');
  return project;};
 const current=data.projects.find(p=>p.id===route.projectId);
 const recover=()=>{
  if(!confirm('손상된 데이터를 별도 복구 키에 보존한 다음 새 작업 공간으로 초기화합니다. 계속할까요?'))return;
  try {const recovered=resetCorruptData();setData(recovered.data);setStorageState({status:'ok',data:recovered.data});setRecoveryError('');notify('원본을 로컬 복구 키에 보관했습니다: '+recovered.backupKey);}
  catch(err){setRecoveryError('초기화하지 않았습니다: '+String(err));}
 };
 if(storageState.status==='corrupt'||storageState.status==='unavailable'){
  return <div className="recovery-screen"><div className="recovery-panel">
   <h1>MYVOCAL Studio · 데이터 보호</h1>
   <p>{storageState.status==='corrupt'?'저장된 프로젝트 정보를 정상적으로 읽지 못했습니다. 자동 저장을 중지했으며 손상된 원본 데이터를 덮어쓰지 않았습니다.':'저장소에 접근할 수 없습니다. 작업을 시작하기 전에 브라우저 프로필이나 권한을 확인하세요.'}</p>
   <p className="recovery-detail">{storageState.error||''}</p>
   {storageState.status==='corrupt'?<div className="recovery-actions">
    <button onClick={()=>downloadText(storageState.raw,'MYVOCAL-corrupt-original.txt')}>손상된 원본 내려받기</button>
    <button onClick={()=>{const fresh=readDataState();setStorageState(fresh);if(fresh.status==='ok'||fresh.status==='empty')setData(fresh.data);}}>다시 읽기</button>
    <button onClick={recover}>원본 보존 후 초기화</button>
   </div>:<button onClick={()=>location.reload()}>접근 권한 확인 후 다시 시작</button>}
   {recoveryError&&<p className="recovery-error">{recoveryError}</p>}
   <p>초기화 전에 원본 파일을 별도로 저장하는 것을 권장합니다. 복구 키도 만들 수 없으면 자동 초기화하지 않습니다.</p>
  </div></div>;
 }
 const workspaceProps={data,project:current,onChange:editProject,navigate,notify,add,remove};
 let content;
 switch(route.page){
  case 'home': content=<Dashboard data={data} navigate={navigate} createProject={createProject}/>;break;
  case 'create': content=<AutoCreate data={data} createProject={createProject}/>;break;
  case 'projects': content=<Projects data={data} navigate={navigate} createProject={createProject} remove={remove} add={add} notify={notify}/>;break;
  case 'workspace': content=current?<Workspace {...workspaceProps}/>:<Projects data={data} navigate={navigate} createProject={createProject} remove={remove} add={add} notify={notify}/>;break;
  case 'music': content=<Workspace {...workspaceProps} studio="music"/>;break;
  case 'voices': content=<Voices data={data} add={add} remove={remove} notify={notify}/>;break;
  case 'training': content=<Training data={data} add={add} remove={remove} notify={notify} navigate={navigate}/>;break;
  case 'characters': content=<Characters data={data} add={add} remove={remove} notify={notify} removeCharacterPersisted={removeCharacterPersisted} listRestorableCharacters={listRestorableCharacters} restoreCharacterPersisted={restoreCharacterPersisted}/>;break;
  case 'video': content=<Video {...workspaceProps} mode="video"/>;break;
  case 'pv': content=<Video {...workspaceProps} mode="pv"/>;break;
  case 'learning': content=<Learning data={data} add={add} remove={remove} notify={notify}/>;break;
  case 'library': content=<Library data={data} add={add} remove={remove} notify={notify} navigate={navigate}/>;break;
  case 'settings': content=<Settings data={data} setData={setData} notify={notify}/>;break;
  default: content=<Dashboard data={data} navigate={navigate} createProject={createProject}/>;
 }
 return <div className="app-shell">
  <Sidebar page={route.page} navigate={navigate} isOpen={mobileMenu} close={()=>setMobileMenu(false)}/>
  <div className="app-main">
   <header className="topbar"><div className="topbar-left"><button className="icon-btn mobile-toggle" aria-label="메뉴" onClick={()=>setMobileMenu(true)}><Icon name="menu"/></button><div className="breadcrumb"><span>MYVOCAL</span><Icon name="chevron" size={14}/><strong>{labels[route.page]||'Studio'}</strong></div></div><div className="topbar-right"><span className="online-dot"/><span className="topbar-state">오프라인 로컬 작업 공간</span><span className="topbar-sep"/><Status>샘플 보컬 미리보기 · AI 학습 미연결</Status><div className="avatar">M</div></div></header>
   <main className="content">{content}</main>
   <footer className="footer"><span>© MYVOCAL STUDIO · PROTOTYPE 1.8</span><span>오디오·MIDI·가사 싱크·모델 호환성 조회 · 실제 AI 목소리 학습·영상 생성 미구현</span></footer>
  </div>
  {saveFailed&&<div className="storage-error-banner" role="alert">저장이 실패했습니다. 저장 공간을 확인하고 프로젝트를 별도로 백업하세요. 이 경고는 저장에 성공할 때까지 유지됩니다.</div>}
  {toast&&<div className="toast"><Icon name="info" size={17}/>{toast}<button onClick={()=>setToast('')} aria-label="닫기"><Icon name="close" size={14}/></button></div>}
 </div>;
}
