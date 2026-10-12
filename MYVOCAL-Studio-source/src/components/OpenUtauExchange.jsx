import React,{useState,useEffect} from 'react';
import {Button,Field,Notice,Panel,Status} from './UI';
import {isAlignmentStale} from '../lib/lyricAlignment';
import {makeOpenUtauUstx,prepareUstxNotes,ustxOutputName} from '../lib/openUtauExchange';
import {parseOtoIni,parseAliasMappings,voicebankCoverage,makeVoicebankProfile} from '../lib/voicebankAliases';
import {genId} from '../lib/schema';
import {inspectVoicebankFolder} from '../lib/voicebankInventory';
import {makeOpenUtauHandoffPackage,inspectRenderedWav,expectedVocalSeconds} from '../lib/openUtauWorkflow';
import {putFile,removeFile} from '../lib/assetDb';
import {makeImportedVocalTrack} from '../lib/lyricAlignment';
import {readAudioInfo} from '../lib/audioEngine';

const preset=[
 {id:'default',label:'기본 (OpenUtau 기본 발음 처리기)',name:'OpenUtau.Core.DefaultPhonemizer',renderer:'CLASSIC'},
 {id:'custom',label:'사용자 지정 (별도 설치된 엔진 필요)',name:'',renderer:'DIFFSINGER'}
];
export default function OpenUtauExchange({project:p,onChange,data,add,remove,notify}){
 const profiles=data?.voicebanks||[];
 const [choice,setChoice]=useState('default'),[singer,setSinger]=useState(''),
  [phonemizer,setPhonemizer]=useState(preset[0].name),[renderer,setRenderer]=useState('CLASSIC'),[error,setError]=useState('');
 const [bankId,setBankId]=useState(p.openUtauVoicebankId||''),[newBankName,setNewBankName]=useState(''),
  [fileEncoding,setFileEncoding]=useState('shift_jis'),[mappingText,setMappingText]=useState(''),[useMapped,setUseMapped]=useState(false),
  [importSummary,setImportSummary]=useState(''),[inventory,setInventory]=useState(null),[checking,setChecking]=useState(false),
  [openUtauPath,setOpenUtauPath]=useState(''),[appCheck,setAppCheck]=useState(null),[checkBusy,setCheckBusy]=useState(false),
  [workflowBusy,setWorkflowBusy]=useState(false),[incomingWav,setIncomingWav]=useState(null),[wavInspection,setWavInspection]=useState(null);
 const profile=profiles.find(x=>x.id===bankId);
 useEffect(()=>{setError('');setSinger('');setChoice('default');setPhonemizer(preset[0].name);setRenderer('CLASSIC');setBankId(p.openUtauVoicebankId||'');setMappingText('');setUseMapped(false);setImportSummary('');setInventory(null);setAppCheck(null);setIncomingWav(null);setWavInspection(null);},[p.id]);
 const alignment=p.vocalAlignment&&!isAlignmentStale(p,p.vocalAlignment)?p.vocalAlignment:null;
 let count=0,warning='';
 if(alignment){try{count=prepareUstxNotes(p,alignment).length;}catch(e){warning=e.message;}}
 let mapping={},coverage=null, mappingError='';
 try{mapping=parseAliasMappings(mappingText);if(alignment&&profile)coverage=voicebankCoverage(alignment,profile,mapping);}catch(e){mappingError=e.message;}
 function updatePreset(id){setChoice(id);const item=preset.find(x=>x.id===id);if(item){setPhonemizer(item.name);setRenderer(item.renderer);}}
 function selectBank(id){
  setBankId(id);onChange({...p,openUtauVoicebankId:id});setUseMapped(false);setError('');const bank=profiles.find(x=>x.id===id);
  if(bank){setSinger(bank.singer||bank.name||'');setPhonemizer(bank.phonemizer||preset[0].name);setRenderer(bank.renderer||'CLASSIC');setMappingText(bank.mappingText||'');setChoice('custom');}
  else{setMappingText('');setSinger('');setChoice('default');setPhonemizer(preset[0].name);setRenderer('CLASSIC');}
 }
 async function importOto(event){
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  try{
   if(file.size>5*1024*1024)throw Error('oto.ini 파일은 최대 5MB까지 지원합니다.');
   const name=(newBankName.trim()||file.name.replace(/\.[^.]+$/,'')||'내 보이스뱅크');
   const text=new TextDecoder(fileEncoding,{fatal:false}).decode(await file.arrayBuffer());
   const parsed=parseOtoIni(text);
   const bank=makeVoicebankProfile({id:genId('bank'),name,singer:name,parsed,encoding:fileEncoding});
   add('voicebanks',bank);onChange({...p,openUtauVoicebankId:bank.id});setBankId(bank.id);setSinger(bank.singer);setPhonemizer(bank.phonemizer);setRenderer(bank.renderer);setMappingText('');setUseMapped(false);
   setImportSummary(`별칭 ${parsed.aliases.length}개 등록 · 유효한 행 ${parsed.validLines}개 · 무시한 행 ${parsed.invalidLines}개`);
   setError('');notify('oto.ini 별칭 목록을 로컬에 등록했습니다. 음원과 모델은 등록되지 않았습니다.');
  }catch(e){setError('oto.ini 가져오기: '+e.message);}
 }
 async function importFolder(event){
  const files=Array.from(event.target.files||[]);event.target.value='';if(!files.length)return;
  setChecking(true);setError('');
  try{
   if(files.length>25000)throw Error('폴더 파일이 너무 많습니다 (25,000개 초과).');
   const entries=[];
   for(const f of files){
    const path=f.webkitRelativePath||f.name;
    const item={path,size:f.size};
    if(/(^|[\\/])oto\.ini$/i.test(path)){
     if(f.size>5*1024*1024)throw Error('5MB가 넘는 oto.ini는 지원하지 않습니다.');
     item.otoText=new TextDecoder(fileEncoding,{fatal:false}).decode(await f.arrayBuffer());
    }
    entries.push(item);
   }
   const result=inspectVoicebankFolder(entries);
   const name=(newBankName.trim()||files[0].webkitRelativePath?.split('/')[0]||'보이스뱅크 폴더');
   const bank=makeVoicebankProfile({id:genId('bank'),name,singer:name,parsed:result.parsed,encoding:fileEncoding});
   bank.inventory={otoCount:result.otoCount,wavCount:result.wavCount,referenced:result.referenced,found:result.found,missingCount:result.missingCount,
    missing:result.missing,suspicious:result.suspicious,invalidOto:result.invalidOto,warnings:result.warnings,checkedAt:new Date().toISOString()};
   add('voicebanks',bank);onChange({...p,openUtauVoicebankId:bank.id});setBankId(bank.id);setSinger(bank.singer);
   setPhonemizer(bank.phonemizer);setRenderer(bank.renderer);setMappingText('');setUseMapped(false);
   setInventory(result);setImportSummary(result.summary);
   notify('폴더의 WAV 파일 존재 여부를 검사하고 보이스뱅크 메타데이터를 저장했어. 원본 WAV는 저장하지 않았어.');
  }catch(e){setError('보이스뱅크 폴더 검사: '+e.message);}finally{setChecking(false);}
 }
 async function checkOpenUtau(){
  setCheckBusy(true);setError('');
  try{
   if(!window.__MYVOCAL_SESSION_KEY)throw Error('Windows EXE에서만 설치 경로를 조회할 수 있습니다.');
   const url='/api/openutau/inspect'+(openUtauPath.trim()?'?path='+encodeURIComponent(openUtauPath.trim()):'');
   const response=await fetch(url,{headers:{'X-MYVOCAL-Session':window.__MYVOCAL_SESSION_KEY},cache:'no-store'});
   const output=await response.json();if(!response.ok)throw Error(output.error||'설치 확인 요청 실패');
   setAppCheck(output);
  }catch(e){setError('OpenUtau 설치 확인: '+e.message);}finally{setCheckBusy(false);}
 }
 function saveMapping(){try{
  if(!profile)throw Error('프로필을 먼저 선택하세요.');
  parseAliasMappings(mappingText);
  add('voicebanks',{...profile,mappingText,singer,phonemizer,renderer});setError('');notify('보이스뱅크 설정과 발음 대응표를 로컬에 저장했습니다.');
 }catch(e){setError(e.message);}}
 function exportUstx(){try{
  if(!alignment)throw Error('먼저 가사·MIDI 싱크를 만들고 저장해야 합니다.');
  if(mappingError)throw Error(mappingError);
  const made=makeOpenUtauUstx(p,alignment,{singer,phonemizer,renderer,useMappedLyrics:useMapped,voicebankProfile:profile,lyricMap:mapping});
  const file=new Blob([made.text],{type:'application/x-yaml;charset=utf-8'}),url=URL.createObjectURL(file),a=document.createElement('a');
  a.href=url;a.download=ustxOutputName(p.title);document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
  setError('');notify(`OpenUtau .ustx 내보내기: ${made.noteCount}개 음표. OpenUtau에서 Singer를 다시 확인하세요.`);
  }catch(e){setError(e.message);notify('OpenUtau 내보내기 실패: '+e.message);}}
 const exportOptions=()=>({singer,phonemizer,renderer,useMappedLyrics:useMapped,voicebankProfile:profile,lyricMap:mapping});
 async function exportHandoff(){
  if(workflowBusy)return;setWorkflowBusy(true);setError('');
  try{
   if(!alignment)throw Error('먼저 가사·MIDI 싱크를 저장해야 합니다.');
   if(mappingError)throw Error(mappingError);
   const built=await makeOpenUtauHandoffPackage(p,alignment,exportOptions());
   const blob=new Blob([built.bytes],{type:'application/zip'}),url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download=built.fileName;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
   const job={id:genId('utaujob'),at:new Date().toISOString(),kind:'handoff',name:built.fileName,notes:built.noteCount};
   onChange({...p,openUtauJobs:[...(p.openUtauJobs||[]),job].slice(-20)});
   notify(`외부 보컬 합성 작업 ZIP 저장: ${built.noteCount}개 MIDI 음표 · 실제 가창은 별도 엔진에서 수행해 주세요.`);
  }catch(e){setError('작업 ZIP 생성: '+e.message);}finally{setWorkflowBusy(false)}
 }
 async function selectRenderedWav(event){
  const file=event.target.files?.[0];event.target.value='';setIncomingWav(null);setWavInspection(null);setError('');
  if(!file)return;setWorkflowBusy(true);
  try{
   if(!/\.wav$/i.test(file.name))throw Error('확장자가 .wav인 파일을 선택하세요.');
   const report=inspectRenderedWav(await file.arrayBuffer(),expectedVocalSeconds(alignment));
   setIncomingWav(file);setWavInspection(report);
   notify('WAV 형식 검사 완료. 내용을 확인하고 트랙 추가를 선택하세요.');
  }catch(e){setError('보컬 WAV 검사: '+e.message);}finally{setWorkflowBusy(false)}
 }
 async function importRenderedWav(){
  if(!incomingWav||!wavInspection||workflowBusy)return;setWorkflowBusy(true);setError('');
  let assetId=null;
  try{
   const audio=await readAudioInfo(incomingWav);
   if(Math.abs(audio.duration-wavInspection.durationSec)>.1)throw Error('브라우저로 디코딩한 길이가 WAV 헤더와 일치하지 않습니다.');
   assetId=genId('openutau_wav');await putFile(assetId,incomingWav);
   const track=makeImportedVocalTrack(p,incomingWav,assetId,audio.duration);
   track.name='OpenUtau 보컬 WAV';
   const job={id:genId('utaujob'),at:new Date().toISOString(),kind:'import',name:incomingWav.name,
    trackId:track.id,durationSec:wavInspection.durationSec};
   onChange({...p,tracks:[...p.tracks,track],openUtauJobs:[...(p.openUtauJobs||[]),job].slice(-20)});
   notify('검사한 보컬 WAV를 오디오 트랙에 추가했습니다. 재생/믹스가 가능합니다.');
   setIncomingWav(null);setWavInspection(null);
  }catch(e){if(assetId)await removeFile(assetId).catch(()=>{});setError('WAV 트랙 추가: '+e.message);}finally{setWorkflowBusy(false)}
 }
 return <>
 <Panel title="OpenUtau · 보이스뱅크 교환 v1.7" description="USTX 파일로 MIDI·가사를 내보냅니다. UTAU oto.ini의 별칭 목록을 등록하고 수동 발음 대응표를 작성할 수 있습니다.">
  <div className="mv10-strip"><div><strong>보컬 트랙</strong><span>{alignment?`${count}개 음표 · ${alignment.bpm} BPM · ${alignment.trackName||'Lead Vocal'}`:'저장된 가사·MIDI 싱크 없음'}</span></div><Status>{alignment&&!warning?'내보내기 준비':'준비 필요'}</Status></div>
  {!alignment&&<Notice>가사 입력 → MIDI 멜로디 작성 → ‘가사·MIDI 싱크’ 탭에서 생성·저장한 다음 내보낼 수 있습니다.</Notice>}
  {warning&&<Notice>{warning}</Notice>}
  <div className="mv10-grid">
   <Field label="보이스뱅크 메타데이터 프로필"><select aria-label="보이스뱅크 프로필" value={bankId} onChange={e=>selectBank(e.target.value)}><option value="">등록 안 함 · 직접 설정</option>{profiles.map(b=><option key={b.id} value={b.id}>{b.name} ({b.aliases?.length||0}개 별칭)</option>)}</select></Field>
   <Field label="렌더러"><select value={renderer} onChange={e=>setRenderer(e.target.value)}><option value="CLASSIC">CLASSIC · UTAU형</option><option value="DIFFSINGER">DIFFSINGER · 별도 설치 필요</option></select></Field>
   <Field label="OpenUtau Singer 이름"><input aria-label="OpenUtau Singer 이름" value={singer} maxLength={180} placeholder="OpenUtau에 설치된 정확한 Singer 이름" onChange={e=>setSinger(e.target.value)}/></Field>
   <Field label="Phonemizer 클래스 (실제 설치한 플러그인)"><input aria-label="Phonemizer 클래스" value={phonemizer} maxLength={180} onChange={e=>{setPhonemizer(e.target.value);setChoice('custom')}}/></Field>
  </div>
  <div className="mv7-actions"><Button variant="primary" icon="download" disabled={!alignment||!!warning||(useMapped&&(!profile||!coverage||coverage.missing>0))} onClick={exportUstx}>OpenUtau .ustx 저장</Button><Button icon="download" disabled={!alignment||!!warning||workflowBusy||(useMapped&&(!profile||!coverage||coverage.missing>0))} onClick={exportHandoff}>{workflowBusy?'작업 중…':'USTX + MIDI + 가사 ZIP 묶기'}</Button><Status>USTX 0.6 · 480 ticks/beat</Status></div>
  {alignment&&alignment.cues.some(c=>!String(c.lyric||'').trim()||c.lyric==='—')&&<Notice>가사가 없는 음표는 내보내기 시 기본 가사 'a'를 사용합니다.</Notice>}
  {error&&<Notice>{error}</Notice>}
 </Panel>
 <Panel title="외부 보컬 WAV 검사 · 트랙 추가 (v1.7)" description="OpenUtau 등에서 렌더한 WAV를 검사한 뒤 현재 프로젝트에 오디오 트랙으로 추가합니다. 별도 합성 엔진이 실제로 실행됐다는 증명은 아닙니다.">
  <div className="mv7-actions"><label className="mv15-filepick">합성 결과 WAV 선택 <input type="file" aria-label="합성 결과 WAV 선택" accept=".wav,audio/wav" onChange={selectRenderedWav}/></label><Button variant="primary" disabled={!incomingWav||!wavInspection||workflowBusy} onClick={importRenderedWav}>검사 완료 WAV를 트랙에 추가</Button>{workflowBusy&&<Status>파일 검사/저장 중…</Status>}</div>
  {wavInspection&&<div className="mv16-inventory"><strong>{incomingWav?.name}</strong><p>{wavInspection.encoding} · {wavInspection.channels}채널 · {wavInspection.sampleRate.toLocaleString()}Hz · {wavInspection.bitsPerSample}bit · {wavInspection.durationSec.toFixed(2)}초</p>
    {wavInspection.warnings.length?wavInspection.warnings.map((x,i)=><Notice key={i}>{x}</Notice>):<p className="success-text">헤더·오디오 길이 검사 통과 (가창 품질·음정 정확도는 확인하지 않음)</p>}
   </div>}
  <Notice>지원 형식: PCM/32비트 Float WAV, 모노 또는 스테레오, 최대 8분·90MB. 길이 차이는 안내로 표시하며 자동으로 오디오를 잘라내거나 시간 정렬하지 않습니다. 가져온 원본 WAV는 로컬 프로젝트 백업에 포함됩니다.</Notice>
  {(p.openUtauJobs||[]).length>0&&<div className="mv15-alias-example"><span>최근 작업 기록 (최대 20개)</span><code>{(p.openUtauJobs||[]).slice(-5).reverse().map(j=>`${j.kind==='import'?'가져오기':'ZIP 저장'}: ${j.name}`).join(' · ')}</code></div>}
 </Panel>
 <Panel title="UTAU 보이스뱅크 등록 · 폴더 검증" description="oto.ini만 등록하거나 보이스뱅크 폴더를 선택해서 WAV 샘플 파일 존재 여부까지 확인할 수 있습니다. 원본 WAV는 저장하지 않습니다.">
  <div className="mv10-grid">
   <Field label="새 프로필 이름"><input value={newBankName} maxLength={120} placeholder="예: MY KOREAN CV" onChange={e=>setNewBankName(e.target.value)}/></Field>
   <Field label="oto.ini 파일 문자 인코딩"><select value={fileEncoding} onChange={e=>setFileEncoding(e.target.value)}><option value="shift_jis">Shift-JIS (일본어 UTAU에서 흔함)</option><option value="utf-8">UTF-8</option><option value="euc-kr">EUC-KR</option></select></Field>
  </div>
  <div className="mv7-actions">
   <label className="mv15-filepick">oto.ini만 선택 <input type="file" aria-label="oto.ini 파일 선택" accept=".ini,.txt" onChange={importOto}/></label>
   <label className="mv15-filepick">보이스뱅크 폴더 전체 검사 <input type="file" aria-label="보이스뱅크 폴더 전체 검사" webkitdirectory="" directory="" multiple onChange={importFolder}/></label>
   {checking&&<Status>파일 경로 검사 중…</Status>}
  </div>
  {importSummary&&<p className="field-hint">{importSummary}</p>}
  {profile&&<div className="mv15-profile"><div><strong>{profile.name}</strong><span>{profile.aliases?.length||0}개 별칭 · 입력 인코딩: {profile.encoding}</span></div><Button onClick={()=>{if(confirm(`'${profile.name}' 프로필을 삭제할까요?`)){remove('voicebanks',profile.id);selectBank('');notify('보이스뱅크 프로필을 삭제했습니다.')}}}>프로필 삭제</Button></div>}
  {profile&&<div className="mv15-alias-example"><span>oto.ini 별칭 샘플</span><code>{(profile.aliases||[]).slice(0,18).join(' · ')}</code></div>}
  {profile?.inventory&&<div className="mv16-inventory"><strong>폴더 검사 결과 (검사 시점 메타데이터)</strong><p>oto.ini {profile.inventory.otoCount}개 · WAV 파일 {profile.inventory.wavCount}개 · oto 참조 파일 확인 {profile.inventory.found}/{profile.inventory.referenced}개</p><p className={profile.inventory.missingCount||profile.inventory.suspicious?.length?'warn-text':'success-text'}>누락 {profile.inventory.missingCount}개 · 잘못되었거나 너무 작은 파일 {profile.inventory.suspicious?.length||0}개</p>{profile.inventory.missing?.length>0&&<div>누락 예: <code>{profile.inventory.missing.slice(0,15).join(' · ')}</code></div>}{profile.inventory.suspicious?.length>0&&<div>문제 파일: <code>{profile.inventory.suspicious.slice(0,10).join(' · ')}</code></div>}{profile.inventory.invalidOto?.length>0&&<Notice>읽지 못한 oto.ini: {profile.inventory.invalidOto.slice(0,4).join(' · ')}</Notice>}</div>}
  <Notice>폴더 검사는 WAV 파일의 경로와 크기만 확인합니다. 실제 음성 내용·발음 품질·OpenUtau 렌더링 호환성까지 검증하지는 않습니다. oto.ini 단독 등록에는 파일 존재 검사가 적용되지 않습니다.</Notice>
 </Panel>
 <Panel title="한국어 가사 → 발음 별칭 대응표" description="가사 음절을 보이스뱅크의 alias로 직접 연결합니다. 기본값은 원문 가사 내보내기이며, 매핑 적용은 선택 사항입니다.">
  <Field label="사용자 대응표: 한 줄에 가사=oto 별칭"><textarea aria-label="발음 대응표" rows={5} value={mappingText} placeholder={'안=an\n녕=nyeong\n하=ha'} onChange={e=>setMappingText(e.target.value)}/></Field>
  <div className="mv7-actions"><Button disabled={!profile||!!mappingError} onClick={saveMapping}>매핑·설정 저장</Button><label className="check-item"><input type="checkbox" disabled={!profile} checked={useMapped} onChange={e=>setUseMapped(e.target.checked)}/> 별칭으로 가사를 치환하여 USTX 내보내기</label></div>
  {mappingError&&<Notice>{mappingError}</Notice>}
  {profile&&alignment&&coverage&&<>
   <div className="mv15-summary"><strong>음표 {coverage.total}개 중 별칭 일치 {coverage.matched}개</strong><span className={coverage.missing?'warn-text':'success-text'}>미일치 {coverage.missing}개</span></div>
   {coverage.missing>0&&<Notice>일치하지 않는 가사: {coverage.missingUnique.slice(0,16).join(' · ')}{coverage.missingUnique.length>16?' 외 더 있음':''}. 별칭 치환 내보내기를 선택하면 미일치 항목은 차단돼.</Notice>}
   <div className="mv15-table-wrap"><table className="mv15-table"><thead><tr><th>가사</th><th>출력 후보 별칭</th><th>일치 여부</th></tr></thead><tbody>{coverage.rows.slice(0,24).map((r,i)=><tr key={i}><td>{r.lyric}</td><td><code>{r.alias}</code></td><td className={r.present?'success-text':'warn-text'}>{r.present?'별칭 목록에 있음':'없음'}</td></tr>)}</tbody></table></div>
  </>}
  {!profile&&<Notice>먼저 oto.ini를 등록해야 발음 별칭 대조가 가능해. 별칭 대조는 음원 파일·실제 발음·Phonemizer 호환 여부에 대한 보증이 아니야.</Notice>}
 </Panel>
 <Panel title="OpenUtau 설치·실행 준비 확인 (Windows EXE)" description="실행 파일 경로가 존재하는지만 검사합니다. OpenUtau나 AI 모델을 자동 설치·실행하지 않습니다.">
  <Field label="OpenUtau.exe 경로 (선택 사항 · 비우면 일반 설치 위치 검색)"><input aria-label="OpenUtau 실행 파일 경로" value={openUtauPath} onChange={e=>setOpenUtauPath(e.target.value)} placeholder="C:\\Apps\\OpenUtau\\OpenUtau.exe"/></Field>
  <div className="mv7-actions"><Button onClick={checkOpenUtau} disabled={checkBusy}>{checkBusy?'설치 확인 중…':'설치 경로 확인'}</Button><Status>{appCheck?.found?'실행 파일 발견':'검사 전 / 찾지 못함'}</Status></div>
  {appCheck&&<div className="mv16-inventory"><strong>{appCheck.found?'OpenUtau.exe 파일이 있습니다.':'OpenUtau.exe를 찾지 못했습니다.'}</strong><p>운영체제: {appCheck.platform} · 검사 결과: {appCheck.message}</p>{appCheck.paths?.map((item,i)=><div key={i}><code>{item}</code></div>)}</div>}
  <Notice>실행 파일 확인만으로 실제 Singer/Phonemizer/Renderer가 설치된 것은 아닙니다. .ustx를 내보낸 후 OpenUtau에서 가수와 렌더링 상태를 확인해야 합니다.</Notice>
 </Panel>
 <Panel title="외부 보컬 합성 순서" description="MYVOCAL 프로젝트와 OpenUtau를 연동하는 작업 흐름입니다.">
  <div className="mv14-step"><strong>1</strong><span>가사·MIDI 싱크 편집, 필요한 경우 oto.ini 별칭과 매핑 등록</span><strong>2</strong><span>USTX 저장 → OpenUtau에서 Singer·Phonemizer·Renderer 확인</span><strong>3</strong><span>OpenUtau에서 설치된 보이스뱅크를 통해 보컬 WAV 생성</span><strong>4</strong><span>이 화면에서 WAV 검사 후 ‘트랙에 추가’ 선택</span></div>
  <Notice>OpenUtau Singer에는 실제 보이스뱅크와 호환 Phonemizer가 별도로 설치되어 있어야 합니다. 여기의 매핑은 사용자가 정의한 별칭 치환일 뿐 한국어 음소를 자동 변환하거나 AI Singing 모델을 실행하지 않습니다.</Notice>
 </Panel>
 </>;
}
