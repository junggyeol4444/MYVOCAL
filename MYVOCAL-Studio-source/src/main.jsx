import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './style.css';
// Keep the native Windows screen usable even if a project UI component throws.
class DesktopBootBoundary extends React.Component {
 constructor(props){super(props);this.state={failed:false,message:''};}
 static getDerivedStateFromError(err){return {failed:true,message:String(err?.message||'예상치 못한 렌더링 오류').slice(0,500)};}
 componentDidCatch(err){console.error('MYVOCAL 렌더링 오류',err);}
 render(){return this.state.failed
  ? <div role="alert" style={{minHeight:'100vh',padding:40,background:'#0a0d18',color:'#fff',fontFamily:'system-ui,sans-serif'}}>
      <h1>MYVOCAL Studio 화면을 표시할 수 없습니다</h1>
      <p>로컬 프로젝트 데이터는 변경되지 않았습니다. 오류 내용을 기록하고 프로그램을 다시 시작해 주세요.</p>
      <pre style={{whiteSpace:'pre-wrap',color:'#ffb8b8'}}>{this.state.message}</pre>
     </div>
  :this.props.children;}
}
createRoot(document.getElementById('root')).render(<DesktopBootBoundary><App/></DesktopBootBoundary>);
