// 기존 Windows x64 EXE의 VRM 무대에서 실제 작곡 MIDI 드럼/멜로디와
// 원본 Verse·Chorus 구간에 맞춰 3~6분 카메라·조명 렌더 설정을 구동한다.
// 실제 오디오와 독립된 더미 비트는 만들지 않는다. 원본 VRM/스테이지 설정 불변.
import {latestCompleteNeuralScore} from './neuralScoreBatch.js';

const within=(v,a,b)=>Math.min(b,Math.max(a,v));
const energyAt=(events,t)=>{
 let intensity=0;for(const n of events){
  if(n.sec>t)break;
  if(t-n.sec<=.32)intensity=Math.max(intensity,n.velocity*(1-(t-n.sec)/.32));
 }return intensity;
};
export function makeOriginalMidiStageDirection(project,{durationSec}={}){
 const bpm=Number(project?.bpm),duration=Number(durationSec);
 if(!project?.id||!Number.isFinite(bpm)||bpm<40||bpm>240||
    !Number.isFinite(duration)||duration<150||duration>360)
  throw Error('3~6분 MIDI 공연에는 현재 음악 프로젝트의 실제 BPM·길이가 필요합니다.');
 const score=latestCompleteNeuralScore(project),midi=[];
 if(score){
  for(const role of ['drums','melody','bass']){
   const notes=score.get(role)?.midiNotes||[];
   for(const note of notes){
    if(!Number.isFinite(note.startBeat)||note.startBeat<0||!Number.isFinite(note.length)||
       note.length<=0||!Number.isFinite(note.velocity))continue;
    const sec=note.startBeat*60/bpm;
    if(sec>=duration)continue;
    midi.push({sec,role,velocity:within(note.velocity/127,0,1)});
   }
  }
 }else{
  for(const track of project.tracks||[]){
   if(track?.mute||!Array.isArray(track.midiNotes))continue;
   const role=String(track.sourceRole||track.role||track.instrument||'').toLowerCase();
   if(!['drums','percussion','melody','lead','bass'].includes(role))continue;
   for(const note of track.midiNotes){
    if(!Number.isFinite(note.startBeat)||note.startBeat<0||!Number.isFinite(note.length)||
      note.length<=0||!Number.isFinite(note.velocity))continue;
    const sec=note.startBeat*60/bpm;
    if(sec<duration)midi.push({sec,role,velocity:within(note.velocity/127,0,1)});
   }
  }
 }
 if(!midi.length||midi.length>30000)
  throw Error('3~6분 원곡에 실제 악기 MIDI 음표가 없어 무대 연출을 생성하지 않습니다.');
 midi.sort((a,b)=>a.sec-b.sec||b.velocity-a.velocity);
 // 6분·30FPS에서 per-frame 전체 MIDI 탐색을 피하기 위해 초당 cue만 구축.
 const positions=[];
 for(let second=0;second<=Math.ceil(duration);second++){
  let sum=0,peak=0,observed=0;
  const from=Math.max(0,second-1),to=second+1;
  for(const e of midi){
   if(e.sec<from)continue;
   if(e.sec>to)break;
   const v=e.velocity*(e.role==='drums'||e.role==='percussion'?1:.7);
   sum+=v;peak=Math.max(peak,v);observed++;
  }
  positions.push(within(observed?Math.max(peak,sum/Math.max(1,observed)*.9):0,0,1));
 }
 const sections=[];
 let start=0;
 for(const section of (project.sections||[]).slice(0,128)){
  const bars=Number(section?.bars);
  if(!Number.isInteger(bars)||bars<1||bars>512)continue;
  const end=Math.min(duration,start+bars*4*60/bpm);
  const name=String(section.name||section.title||'').slice(0,100);
  sections.push({start,end,isChorus:/chorus|후렴|drop|클라이맥스|final/i.test(name),name});
  start=end;
  if(start>=duration)break;
 }
 return {projectId:project.id,durationSec:duration,bpm,
  events:midi,perSecond:positions,sections,source:'real-project-MIDI-no-fake-audio'};
}
export function stageSettingsAtMusicBeat(settings,plan,time){
 if(!settings||!plan||!Number.isFinite(time)||time<0||time>plan.durationSec+.1)
  throw Error('VRM 원곡 MIDI 카메라·조명 동기화 시간이 올바르지 않습니다.');
 const sec=Math.min(plan.durationSec,time);
 const nearby=plan.perSecond[Math.min(plan.perSecond.length-1,Math.floor(sec))]||0;
 const pulse=energyAt(plan.events,sec);
 const chorus=plan.sections.find(s=>s.start<=sec&&sec<s.end)?.isChorus||false;
 // 모든 값은 기존 유효한 stage3D 설정 범위에 속하고 사용자 저장 설정은 불변.
 const intensity=within(Number(settings.lightIntensity)||1,.2,2);
 const lightIntensity=within(intensity*(.8+.15*nearby+.23*pulse),.2,2);
 return {...settings,duration:plan.durationSec,
  camera:chorus?'cuts':settings.camera,
  lights:chorus?'pulse':settings.lights,
  cameraMotion:within((Number(settings.cameraMotion)||1)*(chorus?1.2:1),0,2),
  lightIntensity,lightMotion:within((Number(settings.lightMotion)||1)*(1+.25*nearby),0,2)};
}
