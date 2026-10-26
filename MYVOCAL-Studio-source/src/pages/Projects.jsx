import React from 'react';
import {Button,Empty,Icon,SectionHead} from '../components/UI';
import {newProject,genId,now,readableDate} from '../lib/schema';
import {exportJson,downloadText} from '../lib/store';
import {downloadProjectBundle,importProjectBundle} from '../lib/projectBundle';
export default function Projects({data,navigate,createProject,remove,add,notify}){
 const [busy,setBusy]=React.useState('');
 const importProject=async e=>{const input=e.currentTarget;const f=input.files?.[0];if(!f)return;setBusy('프로젝트 복원 중');
  try{const imported=await importProjectBundle(f);for(const v of imported.voices)add('voices',v);for(const c of imported.characters)add('characters',c);for(const m of imported.voiceModels||[])add('voiceModels',m);for(const job of imported.trainingPlans||[])add('trainingPlans',job);for(const singer of imported.virtualSingers||[])add('virtualSingers',singer);add('projects',imported.project);
   notify(imported.portable?'프로젝트와 첨부 파일을 복원했습니다.':'JSON 메타데이터를 복원했습니다. 오디오 원본은 포함되지 않은 형식입니다.');
  }catch(err){notify('가져오기 실패: '+err.message)}finally{setBusy('');input.value='';}};
 const exportFull=async p=>{setBusy('백업 생성 중');try{const count=await downloadProjectBundle(p,data);notify(`프로젝트 백업 완료 · 포함된 원본 파일 ${count}개`)}catch(e){notify('백업 실패: '+e.message)}finally{setBusy('')}};
 return <><SectionHead eyebrow="YOUR WORK" title="내 프로젝트" description="음악, 목소리, 캐릭터, 뮤직비디오를 하나의 프로젝트로 관리합니다." action={<div className="hstack"><span style={{position:'relative',display:'inline-flex'}}><Button icon="upload" tabIndex={-1} disabled={!!busy}>프로젝트 복원</Button><input type="file" accept=".json,.myvocal.json,application/json" aria-label="프로젝트 복원 파일 선택" disabled={!!busy} onChange={importProject} style={{position:'absolute',inset:0,width:'100%',height:'100%',opacity:0,cursor:'pointer'}}/></span><Button variant="primary" icon="plus" onClick={()=>navigate('create')}>새 프로젝트</Button></div>}/>
 {busy&&<p className="field-hint" role="status">{busy}...</p>}<div className="projects-list">{data.projects.map(p=><article className="project-item" key={p.id}><div className="project-thumbnail"><Icon name={p.withVideo?'video':'music'} size={27}/></div><div className="project-detail"><strong>{p.title}</strong><p>{p.prompt||'아직 설명이 없습니다.'}</p><span>{p.status} <i>·</i> {p.bpm} BPM <i>·</i> {p.key} <i>·</i> {readableDate(p.updatedAt)} 수정</span></div><div className="project-actions"><Button icon="download" disabled={!!busy} onClick={()=>exportFull(p)}>전체 백업</Button><Button icon="copy" onClick={()=>{add('projects',{...p,id:genId('prj'),title:p.title+' (복사본)',createdAt:now(),updatedAt:now()});notify('프로젝트를 복제했습니다.');}}>복제</Button><Button icon="arrow" variant="primary" onClick={()=>navigate('workspace',p.id)}>편집</Button><button aria-label="삭제" title="프로젝트 삭제" className="icon-btn danger" onClick={()=>{if(confirm(`'${p.title}' 프로젝트를 삭제하시겠습니까?`))remove('projects',p.id);}}><Icon name="trash" size={17}/></button></div></article>)}</div>
 {!data.projects.length&&<Empty icon="folder" title="저장된 프로젝트가 없습니다" description="새 프로젝트를 생성하면 음악과 영상 타임라인을 편집할 수 있습니다." action={<Button variant="primary" icon="plus" onClick={()=>navigate('create')}>프로젝트 만들기</Button>}/>}
 </>;
}
