import React,{useState} from 'react';

// 캐릭터 프로필만 복구합니다. 음원·이미지·모델 원본 파일은 건드리지 않습니다.
// 실제 Windows EXE GUI 버튼 클릭 검증 전까지 미검증 연결 후보입니다.
export default function CharacterRestorePanel({listBackups,onRestore,notify}){
 const [items,setItems]=useState([]);
 const [busy,setBusy]=useState(false);
 const [loaded,setLoaded]=useState(false);
 const refresh=()=>{
  if(busy)return;
  try{
   const entries=listBackups();
   if(!Array.isArray(entries))throw Error('복구 목록 결과가 올바르지 않습니다.');
   setItems(entries);setLoaded(true);
  }catch(error){notify('복구 목록을 읽지 못했습니다: '+error.message);}
 };
 const restore=entry=>{
  if(busy)return;
  if(!confirm(`'${entry.characterName}' 캐릭터 프로필을 복구할까요? 현재 프로젝트와 다른 캐릭터, 원본 파일은 변경하지 않습니다.`))return;
  setBusy(true);
  try{
   const result=onRestore(entry.manifestKey);
   notify(`캐릭터 프로필 복구 완료: ${entry.characterName}. 복원 직전 원문 보존 키: ${result.beforeRestoreKey}`);
   setItems(old=>old.filter(item=>item.manifestKey!==entry.manifestKey));
  }catch(error){notify('캐릭터 복구 실패(원본 보존): '+error.message);}
  finally{setBusy(false);}
 };
 return <section className="cast-board" aria-label="삭제한 캐릭터 프로필 복구">
  <div className="cast-board-head"><div><strong>삭제 캐릭터 프로필 복구</strong><p>삭제 전에 보존한 메타데이터에서 선택한 캐릭터 프로필만 복구합니다. 음원·사진·모델 원본은 자동으로 수정하지 않습니다.</p></div>
   <button type="button" disabled={busy} onClick={refresh}>복구본 조회</button></div>
  {loaded&&items.length===0&&<small role="status">현재 복구할 수 있는 삭제 캐릭터 프로필이 없습니다.</small>}
  {items.map(entry=><div className="look-row" key={entry.manifestKey}>
   <span>{entry.characterName} · 삭제 전 목록 위치 {entry.originalIndex+1}</span>
   <button type="button" disabled={busy} onClick={()=>restore(entry)}>이 프로필 복구</button>
  </div>)}
  <small>복구 전 현재 작업 공간을 별도로 보존하며, 다른 창의 변경·중복 ID·저장 실패 시 복구를 중단합니다. 원본 미디어 복구 기능이 아닙니다.</small>
 </section>;
}