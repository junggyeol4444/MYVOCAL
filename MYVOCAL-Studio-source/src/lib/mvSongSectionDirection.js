// 기존 프로젝트의 실제 BPM·구간·가사·MIDI만으로 3~6분 자동 MV의
// 장면별 이미지/SVD 입력을 구체화한다. 신경망 모델을 가장하지 않는다.
// 사용자가 작성한 장면/가사/캐릭터/의상은 절대 수정하지 않는다.
import {latestCompleteNeuralScore} from './neuralScoreBatch.js';

const clean=(value,max=180)=>[...String(value??'')
 .replace(/[\u0000-\u001f\u007f]/g,' ').trim()].slice(0,max).join('');
function sectionAt(project,beat){
 const list=Array.isArray(project?.sections)?project.sections:[];
 let start=0;
 for(const section of list.slice(0,256)){
  const bars=Number(section?.bars);
  if(!Number.isInteger(bars)||bars<1||bars>512)break;
  const end=start+4*bars;
  if(beat<end)return {name:clean(section.name||section.title||'원곡 연속 장면',75),
   genre:clean((section.genreMix||[]).map(g=>g?.name||'').filter(Boolean).join(', '),90),
   startBeat:start,endBeat:end};
  start=end;
 }
 return {name:'원곡 연속 장면',genre:clean(project.genre||'K-pop',90),startBeat:0,endBeat:Infinity};
}
export function describeOriginalSongMvScene(project,startSec,endSec,{index=0}={}){
 if(!project?.id||!Number.isFinite(startSec)||!Number.isFinite(endSec)||
    startSec<0||endSec<=startSec||endSec>360.005)
  throw Error('원곡 자동 MV 장면의 실제 길이가 올바르지 않습니다.');
 const bpm=Number(project.bpm);
 if(!Number.isFinite(bpm)||bpm<40||bpm>240)
  throw Error('음악 BPM이 없어 SD/SVD 자동 장면과 MIDI를 맞출 수 없습니다.');
 const startBeat=startSec*bpm/60,endBeat=endSec*bpm/60;
 const section=sectionAt(project,(startBeat+endBeat)/2);
 const mode=project.mvMode||'Story MV';
 const performance=mode==='Performance MV'||mode==='Mixed MV'&&index%2===1;
 const lyrics=Array.isArray(project.vocalAlignment?.cues)?project.vocalAlignment.cues
  .filter(c=>Number(c.startSec)<endSec&&Number(c.endSec)>startSec)
  .slice(0,8).map(c=>clean(c.lyric,50)).filter(Boolean).join(' '):'';
 const score=latestCompleteNeuralScore(project);
 const midi=score?.get('drums')?.midiNotes||[];
 const active=midi.filter(n=>Number.isFinite(n.startBeat)&&Number.isFinite(n.length)&&
    n.startBeat<endBeat&&n.startBeat+n.length>startBeat).slice(0,64);
 const strength=active.length?
  active.reduce((sum,n)=>sum+Number(n.velocity||0),0)/active.length:65;
 const energy=strength>=95?'강한 리듬':strength<=55?'차분한 리듬':'균형 잡힌 리듬';
 const action=performance?'실제 음악의 음표·박자에 맞춘 가창과 악기 연주 장면':
  '기존 프로젝트 줄거리를 이어가는 자연스러운 인물·배경 스토리 장면';
 const description=[
  '원본 한국어 노래의 '+clean(section.name,75)+' 구간',
  section.genre&&'편곡 장르 '+section.genre,
  'BPM '+bpm+', '+energy,
  action,
  lyrics&&'원곡 이 시점의 가사: '+lyrics,
  '같은 등록 인물·캐릭터의 얼굴·의상·헤어·색상·소품이 전 장면 일관되도록 유지',
  '원본 프로젝트 구성과 배경에 맞는 새로운 실제 SVD 영상 장면'
 ].filter(Boolean).join('; ');
 return {title:clean(section.name,75)+' · '+String(index+1)+'장면',
  description:clean(description,600),
  action:clean(action,250),
  role:performance?'performance':'story'};
}
