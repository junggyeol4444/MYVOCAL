import React,{useRef,useState} from 'react';
import {Button,Notice,Panel} from './UI';
import {parseDawStemArchive,prepareImportedStemTracks} from '../lib/dawStemArchive.js';
import {putFilesAtomic,deleteFilesAtomic} from '../lib/assetDb.js';
import {genId} from '../lib/schema.js';

export default function StemArchiveImportPanel({project,onChange,notify}){
 const input=useRef(null),latest=useRef(project),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 latest.current=project;
 const importZip=async file=>{
  if(!file||busy)return;
  const originalId=latest.current.id;let saved=false,assets=[];
  setBusy(true);setMessage('트랙 ZIP 검사 중…');
  try{
   if(file.size>256*1024*1024)throw Error('트랙 ZIP은 256MiB까지만 가져올 수 있습니다.');
   const parsed=parseDawStemArchive(new Uint8Array(await file.arrayBuffer()));
   if(latest.current.id!==originalId)throw Error('프로젝트가 변경돼 가져오기를 중단했습니다.');
   if((latest.current.tracks?.length||0)+parsed.tracks.length>64)throw Error('프로젝트 최대 64트랙을 초과합니다.');
   const prepared=prepareImportedStemTracks(parsed,genId);
   assets=prepared.assets;
   setMessage('원본을 보존하며 신규 WAV 저장 중…');
   await putFilesAtomic(assets);
   saved=true;
   if(latest.current.id!==originalId)throw Error('자산 저장 중 프로젝트가 변경됐습니다.');
   await Promise.resolve(onChange({...latest.current,tracks:[...latest.current.tracks,...prepared.tracks]}));
   saved=false;
   setMessage(`${prepared.tracks.length}개 트랙을 별도 WAV로 복원했습니다.`);
   notify(`${prepared.tracks.length}개 WAV 트랙을 새 자산으로 추가했습니다. 원본 프로젝트와 ZIP은 유지됩니다.`);
  }catch(error){
   if(saved){try{await deleteFilesAtomic(assets.map(([id])=>id));}catch(e){setMessage('신규 파일 정리 실패: '+e.message+' / 자산을 직접 확인하세요.');notify('트랙 복원 실패 및 신규 자산 정리 실패: '+e.message);setBusy(false);return;}}
   setMessage('복원 실패: '+error.message);notify('트랙 복원 실패: '+error.message);
  }finally{setBusy(false);}
 };
 return <Panel title="트랙별 WAV ZIP 다시 편집하기" description="기존 프로젝트의 트랙별 WAV Stems ZIP을 새 편집 트랙으로 가져옵니다.">
  <Notice>ZIP의 WAV 길이·형식·CRC 및 트랙 정보를 검사합니다. 원본 녹음·기존 트랙·백업은 교체하지 않으며 새 IndexedDB 자산에 저장합니다. AI 악기 재분리가 아니라 저장했던 PCM 트랙 복원입니다.</Notice>
  <input ref={input} aria-label="트랙별 WAV ZIP 파일 선택" type="file" accept=".zip,application/zip" hidden onChange={async e=>{const file=e.target.files?.[0];e.target.value='';await importZip(file);}}/>
  <Button disabled={busy} onClick={()=>input.current?.click()}>{busy?'WAV ZIP 검사·복원 중':'트랙별 WAV ZIP 불러오기'}</Button>
  {message&&<p role="status">{message}</p>}
 </Panel>;
}
