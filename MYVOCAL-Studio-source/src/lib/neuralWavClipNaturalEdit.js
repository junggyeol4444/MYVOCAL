// 원본 66항 #11·#61·#62: 기존 Windows EXE의 신경망 악기 WAV 클립을
// 자연어로 비파괴 편집한다. 실시간 재생과 오프라인 WAV 믹스는
// audioEngine.js의 clipTiming 게인·페이드·팬·트림을 공통으로 사용한다.
// 원본 PCM·MIDI·사용자 모델·이전 생성 WAV는 변경하지 않는다.
import {latestCompleteNeuralScore} from './neuralScoreBatch.js';
import {editClipLevel,editClipTiming,editClipPan,editClipFadeCurve,clipWindow} from './clipTiming.js';

const ROLES=Object.freeze({
 '멜로디':'melody','코드':'chords','베이스':'bass',
 '드럼':'drums','기타':'guitar','패드':'pad'
});
// 원본 WAV를 변경하지 않는 클립 단위 음소거와 비선형 페이드 곡선.
// 기존 DAW 재생·WAV 믹스의 clipTiming 기능을 그대로 사용한다.
const MUTE_COMMAND=/^(멜로디|코드|베이스|드럼|기타|패드)\s*(?:신경망\s*)?(?:WAV|오디오)(?:의|를|을)?\s*클립\s*(음소거\s*해제|음소거|소리\s*켜)\s*(?:해\s*줘|해\s*주세요|줘|주세요)$/iu;
const CURVE_COMMAND=/^(멜로디|코드|베이스|드럼|기타|패드)\s*(?:신경망\s*)?(?:WAV|오디오)(?:의|를|을)?\s*(페이드인|페이드아웃)\s*곡선(?:을|를)?\s*(선형|부드럽게|동일\s*파워)(?:으로|로)?\s*(?:설정해\s*줘|바꿔\s*줘|설정해\s*주세요|바꿔\s*주세요)$/iu;
const COMMAND=/^(멜로디|코드|베이스|드럼|기타|패드)\s*(?:신경망\s*)?(?:WAV|오디오)(?:의|를|을)?\s*(클립\s*음량|페이드인|페이드아웃|좌우\s*위치|시작|재생\s*길이)\s*(-?\d{1,3}(?:\.\d{1,3})?)\s*(%|초)\s*(?:로\s*)?(설정해\s*줘|맞춰\s*줘|잘라\s*줘)$/iu;
export function applyNeuralWavClipNaturalEdit(project,command){
 if(!project?.id||!Array.isArray(project.tracks)||typeof command!=='string')
  throw Error('기존 MYVOCAL 음악 프로젝트와 클립 수정 명령이 필요합니다.');
 const text=command.trim();
 const mute=MUTE_COMMAND.exec(text),curve=CURVE_COMMAND.exec(text),match=COMMAND.exec(text);
 if(!mute&&!curve&&!match)return null;
 const label=(mute||curve||match)[1];
 const field=mute?'클립음소거':curve?curve[2]+'곡선':match[2].replace(/\s+/gu,'');
 let value=null,unit='';
 if(match){
  const rawNumber=match[3],verb=match[5];
  unit=match[4];
  if((field==='클립음량'||field==='좌우위치')!== (unit==='%'))
   throw Error('클립 음량·좌우 위치는 %, 페이드·트림은 초 단위로 지정하세요.');
  if(field!=='시작'&&verb.replace(/\s+/gu,'')==='잘라줘')
   throw Error('시작 부분 자르기 외에는 설정해 줘 명령을 사용하세요.');
  if(field==='시작'&&verb.replace(/\s+/gu,'')!=='잘라줘')
   throw Error('시작 부분은 몇 초 잘라 줘 명령으로 지정하세요.');
  value=Number(rawNumber);
  if(!Number.isFinite(value))throw Error('신경망 WAV 클립 수치가 올바르지 않습니다.');
 }
 const role=ROLES[label],midi=latestCompleteNeuralScore(project)?.get(role);
 if(!midi?.id)throw Error('현재 6악기 신경망 MIDI 회차를 먼저 생성하세요.');
 const matches=project.tracks.filter(t=>t?.generatedBy==='musicgen-independent-audio'&&
  t.sourceRole===role&&t.sourceMidiTrackId===midi.id&&t.type==='instrument'&&
  Array.isArray(t.clips)&&t.clips.length===1&&t.clips[0]?.assetId);
 const track=matches.at(-1);
 if(!track)throw Error(label+' 최신 독립 신경망 WAV 클립을 찾지 못했습니다.');
 const original=track.clips[0];
 if(!Number.isFinite(original.durationSec)||original.durationSec<150||
    original.durationSec>360||original.startBar!==1)
  throw Error('3~6분 원곡과 연결된 실제 WAV 클립 길이를 확인하세요.');
 let changed;
 if(mute)changed=editClipLevel(original,'clipMuted',!/해제|켜/u.test(mute[2]));
 else if(curve){
  const curveName=curve[3].replace(/\s+/gu,'');
  const curveValue={선형:'linear',부드럽게:'smooth',동일파워:'equalPower'}[curveName];
  changed=editClipFadeCurve(original,curve[2]==='페이드인'?'in':'out',curveValue);
 }
 else if(field==='클립음량')changed=editClipLevel(original,'gainPercent',value);
 else if(field==='좌우위치')changed=editClipPan(original,value);
 else if(field==='페이드인'||field==='페이드아웃'){
  if(value<0||value>clipWindow(original,Number(project.bpm)).durationSec)
   throw Error('페이드 초는 현재 클립 재생 길이 안쪽이어야 합니다.');
  changed=editClipTiming(original,field==='페이드인'?'fadeInSec':'fadeOutSec',value);
 }else if(field==='시작'){
  if(value<0||value>=original.durationSec)
   throw Error('자르기 시작 시간은 원본 WAV 길이보다 짧아야 합니다.');
  changed=editClipTiming(original,'sourceOffsetSec',value);
 }else if(field==='재생길이'){
  if(value<.01||value>360)
   throw Error('재생 길이는 0.01~360초 범위여야 합니다.');
  changed=editClipTiming(original,'playDurationSec',value);
 }else return null;
 if(JSON.stringify(original)===JSON.stringify(changed))
  throw Error(label+' WAV 클립이 이미 해당 설정입니다.');
 const updated={...track,clips:[changed]};
 return {project:{...project,tracks:project.tracks.map(t=>t.id===track.id?updated:t)},
  kind:'neural-wav-clip-10',changed:1,
  response:label+' 최신 신경망 WAV 클립 '+(mute?('음소거 '+(/해제|켜/u.test(mute[2])?'해제':'적용')):
   curve?(curve[2]+' 곡선 '+curve[3]):(field+' '+value+unit))+
   ' 비파괴 편집을 실제 재생·믹스에 연결했습니다. 원본 WAV·MIDI·이전 생성본은 그대로입니다.'};
}
