import React,{useState} from 'react';
import {Button,Field,Icon,Notice,Panel,SectionHead} from '../components/UI';
import {steps} from '../lib/schema';
import {validateGenreMix} from '../lib/genreMix';
import GenreMixEditor from '../components/GenreMixEditor';
import {virtualSingerProjectSelection,resolveVirtualSingerProfile} from '../lib/virtualSingerProjectBinding.js';
import {ownedMusicGuideForProject8,validateOwnedMusicStyle8} from '../lib/ownedMusicStyle8.js';
import {suggestOwnedMusicTempoKey8} from '../lib/ownedMusicTempoTonal8.js';
const options=[['lyrics','가사 초안'],['composition','코드·작곡'],['arrangement','MIDI 편곡'],['singing','AI Singing (로컬 신경망 모델 필요)'],['mix','Mix 준비'],['master','Master 준비'],['storyboard','영상 장면 초안'],['musicVideo','AI Music Video (로컬 SD/SVD 모델 필요)']];
export default function AutoCreate({data,createProject}){
 const [pipeline97,setPipeline97]=useState(true);const [title,setTitle]=useState('');const [prompt,setPrompt]=useState('');const [genreMix,setGenreMix]=useState([{name:'Rock',weight:100}]);const [genreAuto,setGenreAuto]=useState(false);const [mixError,setMixError]=useState('');const [virtualSingerId,setVirtualSingerId]=useState(''),[virtualSingerError,setVirtualSingerError]=useState('');const [voice,setVoice]=useState('');const [ownedStyleId,setOwnedStyleId]=useState('');const [useStyleBpmKey,setUseStyleBpmKey]=useState(false);const [videoMode,setVideoMode]=useState('auto');const [char,setChar]=useState('');const [withVideo,setWithVideo]=useState(true);const [selected,setSelected]=useState(Object.fromEntries(options.map(([k])=>[k,true])));
 const analyzedStyle=(data.musicStyles||[]).find(p=>p.id===ownedStyleId);
 const candidateStyleSettings=suggestOwnedMusicTempoKey8(analyzedStyle);
 const submit=(e,openMv=false)=>{e.preventDefault();try{const validated=validateGenreMix(genreMix);setMixError('');createProject({title:title.trim()||'새 음악 프로젝트',prompt:prompt.trim(),genre:validated[0].name,genreMix:validated,genreAuto,voiceId:voice,characterId:char,virtualSingerId,
 singingModelId:virtualSingerId?virtualSingerProjectSelection(virtualSingerId,data).singingModelId:'',
 singingStyle:virtualSingerId?virtualSingerProjectSelection(virtualSingerId,data).singingStyle:'Natural',
 ownedMusicGuide8:ownedStyleId?ownedMusicGuideForProject8(
   (data.musicStyles||[]).find(s=>s.id===ownedStyleId)
  ):null,
  ownedMusicSuggested8:useStyleBpmKey&&candidateStyleSettings?
   candidateStyleSettings:null,
  videoMode,withVideo,options:{...selected,storyboard:withVideo&&selected.storyboard,musicVideo:withVideo&&selected.musicVideo},pipeline97,openMv:openMv&&withVideo&&selected.musicVideo});}catch(err){setMixError(err.message);}};
 return <><SectionHead eyebrow="OFFLINE MUSIC WORKSPACE" title="음악과 뮤직비디오 만들기" description="설명과 장르를 입력하면 가사·코드·MIDI·장면 초안을 실제 편집 가능한 프로젝트로 만들고 엽니다. 신경망 실제 신경망 가창·영상은 아래 제작 화면에서 로컬 모델을 선택한 후 실행합니다."/><div className="two-column create-columns"><form className="panel create-form" onSubmit={submit}><div className="panel-top"><div><h3>새 프로젝트 설정</h3><p>기본 정보부터 원하는 창작 방향까지</p></div><span className="mini-step">01 / 03</span></div>
 <Field label="프로젝트 이름"><input value={title} maxLength={80} onChange={e=>setTitle(e.target.value)} placeholder="예: 다시 만나는 밤"/></Field>
 <Field label="만들고 싶은 노래 설명"><textarea rows={5} value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder={'애니메이션 록 발라드를 만들어줘.\n오래 헤어져 있던 친구를 다시 만나는 이야기.\n마지막 후렴은 웅장하게.'}/></Field>
 {(data.virtualSingers||[]).length>0&&<Field label="내 Virtual Singer (목소리·캐릭터·학습 모델 일괄 적용)">
  <select value={virtualSingerId} onChange={e=>{
   const id=e.target.value;
   if(!id){setVirtualSingerId('');setVirtualSingerError('');return;}
   try{
    const linked=virtualSingerProjectSelection(id,data);
    setVirtualSingerId(id);setVoice(linked.voiceId);setChar(linked.characterId);
    setVideoMode(linked.videoMode);setVirtualSingerError('');
   }catch(error){setVirtualSingerError(error.message);}
  }}>
  <option value="">개별 목소리·캐릭터 직접 선택</option>
  {(data.virtualSingers||[]).map(v=>{
   let label=v.name;try{const p=resolveVirtualSingerProfile(v.id,data);
    label+=' · '+p.voice.name+' / '+p.character.name+
      (p.trainedSingingReady?' / 로컬 DiffSinger 연결':' / 실제 가창 모델 확인 필요');
   }catch{label+=' · 라이브러리 연결 확인 필요';}
   return <option key={v.id} value={v.id}>{label}</option>;
  })}
  </select>
  {virtualSingerError&&<small role="alert">{virtualSingerError}</small>}
 </Field>}
 <div className="form-two"><Field label="목소리"><select value={voice} onChange={e=>{setVoice(e.target.value);setVirtualSingerId('');}}> <option value="">선택 안 함 (나중에 연결)</option>{data.voices.map(v=><option value={v.id} key={v.id}>{v.name}</option>)}</select></Field><div className="genre-auto-toggle"><label><input type="checkbox" checked={genreAuto} onChange={e=>setGenreAuto(e.target.checked)}/> AI AUTO (추후 AI 엔진 연결)</label><small>현재는 선택한 혼합 비율을 저장하고 로컬 작곡 기준으로 사용합니다.</small></div></div>
 {(data.musicStyles||[]).some(p=>p?.analysisSource==='actual-owned-local-pcm')&&
  <Field label="내 음악 스타일 재사용 (본인 음악 32구간 PCM 강약)">
   <select value={ownedStyleId} onChange={e=>{setOwnedStyleId(e.target.value);setUseStyleBpmKey(false);setMixError('');}}>
    <option value="">새 곡 독립 제작 (이전 음악 스타일 미적용)</option>
    {(data.musicStyles||[]).filter(p=>{try{return validateOwnedMusicStyle8(p)}catch{return false}}).map(p=>
     <option key={p.id} value={p.id}>{p.name} · 원본 PCM 강약만 반영 · 멜로디/가사 미복제</option>)}
   </select>
   <small>Music Learning에서 권한 있는 원곡을 분석한 강약을 MusicGen 생성 구간 연출에 사용합니다.</small>
   {ownedStyleId&&<div>
    <p className="muted">실제 PCM 추정: BPM {candidateStyleSettings?.bpm??'판별 어려움'} · Key {candidateStyleSettings?.key??'판별 어려움'}
     (템포 하프타임·전조·다른 화성 때문에 정확하지 않을 수 있습니다)</p>
    <label><input type="checkbox" checked={useStyleBpmKey}
     disabled={!candidateStyleSettings?.bpm&&!candidateStyleSettings?.key}
     onChange={e=>setUseStyleBpmKey(e.target.checked)}/>
     추정된 BPM·Key를 새 곡의 초기 설정으로 사용 (기존 곡은 변경하지 않음)</label>
    {useStyleBpmKey&&<small>사용자가 선택한 BPM·Key를 기준으로 새로운 코드 진행을 생성합니다. 원곡 실제 멜로디·오디오·가사·코드를 복제하지 않습니다.</small>}
   </div>}
  </Field>}
 <GenreMixEditor mix={genreMix} onChange={value=>{setGenreMix(value);setMixError('')}}/>{mixError&&<p className="genre-mix-validation" role="alert">{mixError}</p>}
 <div className="input-separator"/><div className="field-label">뮤직비디오 제작</div><div className="toggle-line"><div><strong>음악 + 영상 프로젝트</strong><p>영상 타임라인과 스토리보드를 함께 준비</p></div><input type="checkbox" checked={withVideo} onChange={e=>setWithVideo(e.target.checked)}/></div>
 {withVideo&&<><div className="choice-grid">{[['auto','✦','AI 자동 캐릭터'],['character','◈','내 캐릭터'],['person','◉','실제 사람']].map(([value,icon,label])=><button type="button" key={value} onClick={()=>{setVideoMode(value);setVirtualSingerId('');}} className={`choice ${videoMode===value?'selected':''}`}><span>{icon}</span>{label}</button>)}</div>{videoMode!=='auto'&&<Field label="메인 캐릭터"><select value={char} onChange={e=>{setChar(e.target.value);setVirtualSingerId('');}}><option value="">나중에 선택</option>{data.characters.filter(c=>videoMode==='person'?c.kind==='person':c.kind!=='person').map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></Field>}</>}
 <div className="input-separator"/><div className="field-label">제작 항목 (미연결 AI 기능은 실행되지 않음)</div><div className="checkbox-grid">{options.map(([key,name])=><label className="check-item" key={key}><input type="checkbox" checked={selected[key]} onChange={e=>setSelected(prev=>({...prev,[key]:e.target.checked}))}/>{name}</label>)}</div>
 <label className="check-item"><input type="checkbox" checked={pipeline97} onChange={e=>setPipeline97(e.target.checked)}/> 가사·MIDI·스토리보드 초안도 함께 만들어 열기 (끄면 빈 프로젝트)</label>
 <Button variant="primary" className="full-width large-button" icon="spark" onClick={submit}>{pipeline97?'곡 만들고 편집기 열기':'빈 프로젝트 열기'}</Button>
 {withVideo&&selected.musicVideo&&<Button variant="primary" className="full-width large-button" icon="video" onClick={e=>submit(e,true)}>곡 만들고 실제 음악 + MV 제작 화면 열기</Button>}
 <p className="form-note">위 두 번째 버튼은 선택한 가사·MIDI 초안 생성 후 기존 Windows MV 일괄 제작으로 이어집니다. 신경망 가창·영상은 설치된 모델 선택과 권한 확인 후 실제 생성 버튼을 눌러야 실행되며, 준비되지 않은 모델을 실행한 것으로 표시하지 않습니다.</p>
 <p className="form-note">곡 만들기는 기존 로컬 작곡 기능으로 실제 편집 가능한 MIDI 트랙과 가사를 작성합니다. 노래를 내 목소리로 부르는 AI 가창과 장면의 실제 AI 영상 생성은 아직 실행하지 않습니다.</p>
 </form><aside className="create-side"><Panel title="제작 파이프라인" description="현재 로컬 기능으로 만든 결과는 실제 프로젝트에 저장됩니다. 모델이 없는 AI 가창·영상 생성은 예정 상태입니다."><div className="pipeline">{steps.map((s,i)=><div className="pipeline-row" key={s}><span className="pipeline-index">{String(i+1).padStart(2,'0')}</span><span>{s}</span><span className="pipeline-not-yet">예정</span></div>)}</div></Panel><Notice>‘곡 만들고 편집기 열기’를 누르면 바로 가사와 연주 가능한 MIDI 트랙을 확인할 수 있습니다. 음표는 편집하고 WAV·MIDI로 출력할 수 있습니다. 실제 실제 AI Singing/MV 생성에는 설치된 로컬 신경망 모델이 필요합니다.</Notice></aside></div></>;
}
