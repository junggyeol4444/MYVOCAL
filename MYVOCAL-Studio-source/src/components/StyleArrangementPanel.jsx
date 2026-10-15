import React,{useState} from 'react';
import {composeStyleSketch} from '../lib/styleComposition.js';
import {createLearningReplayBundle,verifyLearningReplayBundle,REPLAY_MAX_JSON_BYTES} from '../lib/learningReplayBundle.js';
import {validateReferenceReport} from '../lib/referenceMusicAnalysis.js';

// Local-only: import a Step54 profile JSON, generate a Step55 sketch, arrange it, download MIDI.
// No network, no AI inference, no modification to existing projects/assets.
export default function StyleArrangementPanel(){
 const [profile,setProfile]=useState(null);
 const [fileName,setFileName]=useState('');
 const [bpm,setBpm]=useState(100),[bars,setBars]=useState(4),[rootMidi,setRootMidi]=useState(60);
 const [scale,setScale]=useState('major'),[complexity,setComplexity]=useState('balanced'),[seed,setSeed]=useState(1);
 const [selected,setSelected]=useState(['melody','bass','chords','drums']);
 const [result,setResult]=useState(null),[error,setError]=useState('');
 const [reference,setReference]=useState(null),[referenceName,setReferenceName]=useState(''),[strength,setStrength]=useState(65),[useReference,setUseReference]=useState(false);
 const [useDensity,setUseDensity]=useState(false),[densityStrength,setDensityStrength]=useState(65);
 const [replayName,setReplayName]=useState('');
 const importProfile=async e=>{
  setError('');setProfile(null);setResult(null);setFileName('');setReplayName('');
  const file=e.target.files?.[0];if(!file)return;
  if(file.size>1024*1024){setError('프로필 JSON은 1MB 이하여야 합니다.');return;}
  try{
   const parsed=JSON.parse(await file.text());
   if(!parsed||parsed.type!=='my-music-style'||parsed.schemaVersion!==1||parsed.trainingPerformed!==false||!Array.isArray(parsed.sources)||!parsed.sources.length)throw new Error('Step54 프로필 형식이 아닙니다.');
   // Full schema/descriptor checks also run in the composition and arrangement engines.
   composeStyleSketch({profile:parsed,bars:1});
   setProfile(parsed);setFileName(file.name);
  }catch(err){setError('프로필 가져오기 실패: '+err.message);}
 };
 const importReference=async e=>{
  setError('');setReference(null);setReferenceName('');setUseReference(false);setUseDensity(false);setResult(null);setReplayName('');
  const file=e.target.files?.[0];if(!file)return;
  try{
   if(!Number.isSafeInteger(file.size)||file.size>100*1024)throw new Error('Reference JSON은 100KB 이하여야 합니다.');
   const parsed=JSON.parse(await file.text());validateReferenceReport(parsed);
   setReference(parsed);setReferenceName(file.name);setUseReference(true);
  }catch(err){setError('Reference 보고서 불러오기 실패: '+err.message);}
 };
 const toggle=part=>{setSelected(prev=>prev.includes(part)?prev.filter(x=>x!==part):[...prev,part]);setResult(null);};
 const toResult=({bytes,arrangement,bundle},verified=false)=>({
  bytes,bundle,verified,referenceGuided:!!arrangement.referenceGuidance,
  densityGuided:!!arrangement.referenceDensityGuidance,
  removedNotes:arrangement.referenceDensityGuidance?.removedNotes||null,
  tracks:arrangement.tracks.map(t=>({part:t.part,name:t.name,count:t.notes.length}))
 });
 const generate=async()=>{
  setError('');setResult(null);setReplayName('');
  try{
   const recipe=await createLearningReplayBundle({profile,referenceReport:reference,options:{
    seed:Number(seed),bpm:Number(bpm),bars:Number(bars),rootMidi:Number(rootMidi),scale,
    complexity,parts:selected,velocityGuide:useReference,densityGuide:useDensity,
    velocityStrength:Number(strength),densityStrength:Number(densityStrength)
   }});
   setResult(toResult(recipe));
  }catch(err){setError('편곡 생성 실패: '+err.message);}
 };
 const importReplay=async e=>{
  setError('');setResult(null);setReplayName('');
  const file=e.target.files?.[0];if(!file)return;
  try{
   if(file.size>REPLAY_MAX_JSON_BYTES)throw Error('Step60 재현 JSON 크기 제한 초과');
   const replay=await verifyLearningReplayBundle(JSON.parse(await file.text()));
   const b=replay.bundle,o=b.options;
   setProfile(b.styleProfile);setFileName('Step60 재현 패키지');
   setReference(b.referenceReport);setReferenceName(b.referenceReport?'Step60 패키지':'');
   setBpm(o.bpm);setBars(o.bars);setRootMidi(o.rootMidi);setScale(o.scale);
   setComplexity(o.complexity);setSeed(o.seed);setSelected([...o.parts]);
   setUseReference(o.velocityGuide);setUseDensity(o.densityGuide);
   setStrength(o.velocityStrength);setDensityStrength(o.densityStrength);
   setResult(toResult(replay,true));setReplayName(file.name);
  }catch(err){setError('재현 검증 실패: '+err.message);}
 };
 const downloadReplay=()=>{
  if(!result?.bundle)return;
  const blob=new Blob([JSON.stringify(result.bundle,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=url;link.download='MYVOCAL-local-midi-replay.json';
  link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 const download=()=>{
  if(!result)return;
  const blob=new Blob([result.bytes],{type:'audio/midi'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=url;link.download=`MYVOCAL-arrangement-${Date.now()}.mid`;
  link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 return <section className="panel" aria-label="로컬 MIDI 편곡" style={{marginTop:16}}>
  <div className="panel-top"><div><h3>MY MUSIC STYLE · MIDI 스케치 편곡</h3><p>Step54 프로필로 규칙 기반 MIDI를 생성하고 Step57 Reference 에너지를 선택적으로 반영합니다. Step60에서는 결과를 재현·검증 가능한 로컬 JSON으로 저장할 수 있습니다.</p></div></div>
  <p><strong>스타일 프로필 JSON:</strong> <input type="file" accept=".json,application/json" aria-label="스타일 프로필 JSON" onChange={importProfile}/></p>
  {profile&&<p role="status">불러옴: {fileName} · {profile.name||profile.id} · 분석 자료 {profile.sources.length}개</p>}
  <div className="style-arrangement-options" style={{display:'flex',flexWrap:'wrap',gap:12,alignItems:'center',margin:'12px 0'}}>
   <label>BPM <input aria-label="BPM" type="number" min="40" max="240" value={bpm} onChange={e=>{setBpm(e.target.value);setResult(null)}} style={{width:76}}/></label>
   <label>마디 <input aria-label="마디" type="number" min="1" max="64" value={bars} onChange={e=>{setBars(e.target.value);setResult(null)}} style={{width:72}}/></label>
   <label>시드 <input aria-label="시드" type="number" min="0" max="4294967295" value={seed} onChange={e=>{setSeed(e.target.value);setResult(null)}} style={{width:105}}/></label>
   <label>루트 MIDI <input aria-label="루트 MIDI" type="number" min="36" max="84" value={rootMidi} onChange={e=>{setRootMidi(e.target.value);setResult(null)}} style={{width:70}}/></label>
   <label>스케일 <select aria-label="스케일" value={scale} onChange={e=>{setScale(e.target.value);setResult(null)}}><option value="major">Major</option><option value="minor">Minor</option></select></label>
   <label>편곡 밀도 <select aria-label="편곡 밀도" value={complexity} onChange={e=>{setComplexity(e.target.value);setResult(null)}}><option value="simple">Simple</option><option value="balanced">Balanced</option><option value="full">Full</option></select></label>
  </div>
  <fieldset style={{border:'1px solid var(--border,#555)',borderRadius:6,padding:10,marginTop:12}}><legend>Reference 다이내믹스·반주 밀도 (Step58–59 · 선택)</legend>
   <p><label>Step57 Reference 분석 보고서 JSON <input type="file" accept=".json,application/json" aria-label="Reference 에너지 보고서 JSON" onChange={importReference}/></label></p>
   {reference&&<p role="status">Reference: {reference.name} ({referenceName}) · 에너지 32구간</p>}
   <p><label><input type="checkbox" checked={useReference} disabled={!reference} onChange={e=>{setUseReference(e.target.checked);setResult(null)}}/> Reference 에너지 변화를 MIDI 세기에만 적용</label></p>
   <p><label>반영 강도 {strength}% <input type="range" min="0" max="100" step="5" aria-label="Reference 반영 강도" value={strength} disabled={!reference||!useReference} onChange={e=>{setStrength(Number(e.target.value));setResult(null)}}/></label></p>
   <p><label><input type="checkbox" checked={useDensity} disabled={!reference} onChange={e=>{setUseDensity(e.target.checked);setResult(null)}}/> Step59 · 낮은 에너지 구간의 보조 반주 음표만 줄이기 (멜로디·핵심 박자 유지)</label></p>
   <p><label>반주 밀도 반영 강도 {densityStrength}% <input type="range" min="0" max="100" step="5" aria-label="반주 밀도 반영 강도" value={densityStrength} disabled={!reference||!useDensity} onChange={e=>{setDensityStrength(Number(e.target.value));setResult(null)}}/></label></p>
   <small>원곡의 음정·멜로디·코드·박자는 복제하지 않습니다. 에너지 32구간만 이용해 MIDI velocity를 조정하거나 기존 보조 음표를 일부 생략합니다. 원본 트랙·프로젝트를 수정하지 않으며 학습하지 않습니다.</small>
  </fieldset>
  <fieldset style={{border:'1px solid var(--border,#555)',borderRadius:6,padding:10}}><legend>내보낼 트랙 선택</legend><div style={{display:'flex',gap:16,flexWrap:'wrap'}}>{[['melody','멜로디'],['bass','베이스'],['chords','코드'],['drums','드럼']].map(([id,title])=><label key={id}><input type="checkbox" checked={selected.includes(id)} onChange={()=>toggle(id)}/> {title}</label>)}</div></fieldset>
  <p style={{display:'flex',gap:10,marginTop:12}}><button disabled={!profile||selected.length===0} onClick={generate}>MIDI 생성</button><button disabled={!result} onClick={download}>MIDI 내려받기</button><button disabled={!result} onClick={downloadReplay}>재현 패키지 JSON 내보내기</button></p>
  <p><label>Step60 재현 패키지 검증·다시 열기 <input type="file" accept=".json,application/json" aria-label="재현 패키지 JSON" onChange={importReplay}/></label></p>
  {replayName&&result?.verified&&<p role="status">검증 완료: {replayName} · SHA-256 확인 후 MIDI를 재생성했습니다.</p>}
  {result&&<div role="status"><strong>{result.verified?'재현 검증 완료':'생성 완료'}:</strong> {result.bytes.length} bytes / {result.tracks.length}개 악기 트랙{result.referenceGuided?' · Reference 음량 윤곽 적용':''}{result.densityGuided?' · Reference 반주 밀도 적용':''}{!result.referenceGuided&&!result.densityGuided?' · Reference 미적용':''} · {result.tracks.map(t=>`${t.name} ${t.count}음`).join(' · ')}{result.removedNotes?` · 생략한 보조 음표 ${Object.values(result.removedNotes).reduce((a,b)=>a+b,0)}개`:''}</div>}
  {error&&<p role="alert" style={{color:'var(--danger,#f87171)'}}>{error}</p>}
  <p><small>실제 AI 학습·원곡 악기 분석·음원 렌더링이 아닙니다. 프로필은 서버에 전송하지 않습니다. 재현 패키지 JSON에는 원본 오디오 대신 스타일 통계·음악 ID·해시·Reference 에너지 32구간이 포함되므로 공유 시 주의하세요.</small></p>
 </section>;
}
