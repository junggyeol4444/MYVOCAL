// Original #55: resume a completed REAL recorded WebM without re-recording
// the 3–6 minute song when only optional MP4/WAV delivery was interrupted.
// Proves same storyboard/DAW/lip state with SHA-256 over the existing native
// export revision, and reads the actual already-stored local WebM blob.
// Never creates a fake completed movie, substitutes media or deletes output.
import {mvExportRevision} from './mvExportRevision.js';
import {audioEnd} from './audioEngine.js';

export async function fingerprintNativeMovie55(project,characters,{
 includeLipSync=false
}={}){
 if(!project?.id||!Array.isArray(characters))throw Error('원곡·캐릭터를 선택하세요.');
 if(!(audioEnd(project)>0))throw Error('원곡 음악·보컬의 실제 오디오 트랙이 없는 MV는 음악 포함 완성물로 기록할 수 없습니다.');
 if(typeof crypto?.subtle?.digest!=='function')
  throw Error('Windows WebView2의 로컬 SHA-256 다이제스트 기능이 필요합니다.');
 const raw=JSON.stringify({version:1,
  hasRealSourceAudio:true,includeCaptions:true,includeLipSync:!!includeLipSync,
  revision:mvExportRevision(project,characters,{includeLipSync})});
 const bytes=new TextEncoder().encode(raw);
 if(bytes.length>12*1024*1024)throw Error('MV 타임라인이 너무 커서 로컬 이어하기 정보를 만들 수 없습니다.');
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export async function savedNativeMovie55(project,characters,{
 loadFile,lipIncluded=false,signal,current=()=>project,
 onProgress=()=>{}
}={}){
 if(!project?.id||typeof loadFile!=='function'||typeof current!=='function')
  throw Error('현재 음악+MV 프로젝트와 사용자 로컬 자산 연결이 필요합니다.');
 const currentRevision=await fingerprintNativeMovie55(project,characters,{
  includeLipSync:!!lipIncluded
 });
 const candidates=(project.deliverables||[]).filter(d=>
  d?.kind==='webm'&&d.variant==='base'&&
  d.source==='real-local-music-mv-production'&&
  d.sourceRevision55===currentRevision&&
  d.lipIncluded55===!!lipIncluded&&
  /^[A-Za-z0-9_-]{4,160}$/.test(String(d.assetId||'')));
 for(const entry of candidates.slice().reverse()){
  if(signal?.aborted||current()!==project)
   throw Error('MV 영상 재사용을 취소하거나 원곡이 변경됐습니다.');
  const movie=await loadFile(entry.assetId);
  if(!(movie instanceof Blob)||movie.type!=='video/webm'||
   movie.size<100||movie.size>160*1024*1024)continue;
  if(signal?.aborted||current()!==project)
   throw Error('완성 MV 파일 복원 중 프로젝트가 변경됐습니다.');
  onProgress('이전에 실제 녹화해 보관한 음악 포함 WebM 원본 '+entry.assetId+
   ' 재사용 · 새 GPU 장면 생성·실시간 재녹화 생략');
  return {file:movie,output:entry,sourceRevision55:currentRevision,
   lipIncluded:!!lipIncluded};
 }
 return null;
}
