// Original MYVOCAL item #6: REAL voiced-F0 coverage + user-labelled
// Korean vowel prompt coverage. Does not claim to hear/identify a vowel,
// verify voice ownership, detect falsetto, or certify training success.
// Guidance always stays inside pitch range ACTUALLY detected in user WAV.
import {VOICE_GUIDES,checkSampleQuality} from './voiceDataset.js';
import {sampleEntries} from './voiceTraining.js';

const voicePermitted=v=>v&&['self','owned','licensed'].includes(v.rights)&&
 (v.rights!=='licensed'||String(v.rightsNote||'').trim());
const hzMidi=hz=>69+12*Math.log2(hz/440);
const rounded=n=>Math.round(n*100)/100;
const note=midi=>{
 if(!Number.isFinite(midi))return '음역 미측정';
 const n=Math.max(0,Math.min(127,Math.round(midi)));
 return ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'][n%12]+
  (Math.floor(n/12)-1);
};
const quantile=(values,q)=>{
 if(!values.length)return null;
 const sorted=values.slice().sort((a,b)=>a-b);
 return sorted[Math.min(sorted.length-1,Math.max(0,Math.floor((sorted.length-1)*q)))];
};
const goodPoint=x=>x&&Number.isFinite(x.hz)&&x.hz>=75&&x.hz<=900&&
 Number.isFinite(x.confidence)&&x.confidence>=.72;
export function voicePitchVowelCoverage6(voice){
 if(!voicePermitted(voice))
  throw Error('본인 또는 사용 허가된 목소리에서만 녹음 부족 구간을 안내합니다.');
 const samples=sampleEntries(voice);
 if(samples.length>500)throw Error('목소리 녹음 자산 수가 과도합니다.');
 const byGuide=new Map(VOICE_GUIDES.map(g=>[g.id,[]]));
 const allPitch=[],used=new Set(),records=[];
 for(const item of samples){
  if(!item?.id||used.has(item.id))throw Error('음성 원본 샘플 ID가 누락·중복됐습니다.');
  used.add(item.id);
  const guide=VOICE_GUIDES.find(g=>g.id===item.capturePromptId);
  const analysis=item.analysis;
  const quality=checkSampleQuality(analysis);
  const points=Array.isArray(analysis?.points)?analysis.points.filter(goodPoint):[];
  if(points.length>120)throw Error('원본 피치 분석 프레임 수가 허용량을 초과했습니다.');
  const midi=points.map(p=>hzMidi(p.hz));
  if(quality.status==='usable')allPitch.push(...midi);
  if(guide)byGuide.get(guide.id).push({
   sampleId:item.id,quality:quality.status,sourceLabel:guide.title,
   userLabelNotPhonemeRecognition:true,pitchCount:midi.length,
   medianMidi:quantile(midi,.5),highMidi:quantile(midi,.8),
   lowMidi:quantile(midi,.2),analysisPitchPointsMeasured:midi.length
  });
  records.push({id:item.id,capturePromptId:item.capturePromptId||'',
   quality:quality.status,pitchCount:midi.length});
 }
 const actualLow=quantile(allPitch,.15),actualMiddle=quantile(allPitch,.5),
  actualHigh=quantile(allPitch,.85);
 const candidate={low:actualLow,middle:actualMiddle,high:actualHigh};
 // Quantiles reflect measured values rather than arbitrary fixed G4.
 const prompts=VOICE_GUIDES.map(guide=>{
  const items=byGuide.get(guide.id),usable=items.filter(x=>
   x.quality==='usable'&&x.pitchCount>=3);
  const observed=usable.flatMap(item=>[item.lowMidi,item.medianMidi,item.highMidi]).
   filter(Number.isFinite);
  const target=candidate[guide.register];
  const matched=Number.isFinite(target)&&usable.some(sample=>
   sample.medianMidi!==null&&
   Math.abs(sample.medianMidi-target)<=4.0);
  const status=matched?'recorded-at-measured-target':
   usable.length?'label-recorded-pitch-range-uncertain':'missing-usable-labelled-recording';
  return {id:guide.id,register:guide.register,vowel:guide.letter,title:guide.title,
   prompt:guide.prompt,measuredTargetNote:note(target),targetMidi:Number.isFinite(target)?rounded(target):null,
   status,usableCount:usable.length,labelledCount:items.length,
   medianRecordedNote:observed.length?note(quantile(observed,.5)):null,
   caveat:'모음은 사용자가 녹음 전에 지정한 라벨이며 실제 발음 음성인식 검증이 아님'};
 });
 const missing=prompts.filter(p=>p.status!=='recorded-at-measured-target');
 const suggestions=missing.slice(0,8).map(p=>({
  promptId:p.id,
  title:p.title,
  guidance:p.targetMidi!==null?
   p.measuredTargetNote+' 부근의 편안한 음정에서 '+p.vowel+
   ' 모음을 5~8초간 단독으로 불러주세요. 실제 발음과 음정은 녹음 후 직접 확인하세요.':
   '현재 실제 음정이 충분히 측정되지 않았습니다. 반주 없이 편안한 음높이에서 '+
   p.vowel+' 모음을 5~8초간 불러 피치를 측정하세요.',
  needsVerification:p.status!=='missing-usable-labelled-recording'
 }));
 return {version:1,source:'measured-f0-and-user-labelled-vowel-prompts',
  voiceId:voice.id,totalSamples:records.length,
  usablePitchObservations:allPitch.length,
  measuredRange:allPitch.length?
   {low:note(actualLow),middle:note(actualMiddle),high:note(actualHigh),
    lowHz:rounded(440*Math.pow(2,(actualLow-69)/12)),
    highHz:rounded(440*Math.pow(2,(actualHigh-69)/12))}:null,
  slots:prompts,covered:prompts.length-missing.length,
  total:VOICE_GUIDES.length,suggestions,
  phonemeRecognitionPerformed:false,falsettoDetected:false,
  voiceModelTrainingPerformed:false,
  note:'녹음 분석에서 실제 검출한 F0와 사용자 선택 12개 모음 프롬프트의 조합. 발음·가창 화법 및 신경망 모델 학습 성공을 확증하지 않습니다.'};
}
