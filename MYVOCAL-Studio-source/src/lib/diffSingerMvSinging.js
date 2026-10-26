// Original #06/#25/#55: a registered, actually trained DiffSinger voice
// may supply the lead vocal in the one-click native Music + MV pipeline.
// Existing external HTTP singing engines remain a separate supported choice.
// No guide-tone or fabricated WAV is ever substituted for neural inference.
import {listedDiffSingerModels} from './diffSingerVoiceRegistry.js';
import {parseDiffSingerDictionary,synthesizeDiffSingerWav} from './diffSingerNative.js';
import {getFile} from './assetDb.js';
import {sha256File} from './voiceTraining.js';
import {isAlignmentStale} from './lyricAlignment.js';
import {isPhonemePlanStale} from './phonemePlan.js';
import {convertLongSingingWithRVC} from './rvcLongConversion.js';
import {convertRegisteredRVC} from './rvcStoredConversion.js';
import {persistNeuralVocalTake} from './neuralVocalPersist.js';
import {makeOriginalLyricAdlibAlignment} from './mvNeuralAdlib.js';
import {assertUsableSingingWav} from './singingOutputValidation.js';
import {diffSingerExpression} from './diffSingerExpressiveF0.js';

export async function generateAndStoreDiffSingerMvSinging(project,{
 voice,model,session,confirmed=false,signal,singingStyle='Natural',
 convertRVC=false,rvcOptions=null,registeredRVCModel=null,
 scoreAlignment=null,scoreAlignmentKind='harmony',saveOptions,onProgress=()=>{},
 synthesize=synthesizeDiffSingerWav,convert=convertLongSingingWithRVC
}={}){
 if(!project?.id||!Array.isArray(project.tracks)||!voice||
  !['self','owned','licensed'].includes(voice.rights)||confirmed!==true)
  throw Error('현재 원곡, 사용 권한 있는 목소리와 가창 모델 사용 동의가 필요합니다.');
 if(voice.rights==='licensed'&&!String(voice.rightsNote||'').trim())
  throw Error('라이선스가 있는 목소리에는 사용 허가 범위를 기록하세요.');
 if(!project.vocalAlignment||isAlignmentStale(project,project.vocalAlignment))
  throw Error('신경망 가창 전에 원곡의 가사·MIDI 싱크를 저장하세요.');
 if(typeof session!=='string'||session.length<8||!saveOptions||
  typeof saveOptions.current!=='function')
  throw Error('Windows EXE 로컬 세션 및 원본 보존 프로젝트 저장 연결이 필요합니다.');
 diffSingerExpression(singingStyle);
 const matched=listedDiffSingerModels(voice,[model||{}])[0];
 if(!matched||matched.id!==model.id||!model.dictionaryAssetId||
  !/^[a-f0-9]{64}$/i.test(String(model.dictionarySha256||'')))
  throw Error('학습된 본인 DiffSinger 모델과 보존된 한국어 발음 사전을 Voice Library에서 선택하세요.');
 const guard=()=>{if(signal?.aborted||saveOptions.current()!==project)
  throw Error('한국어 신경망 가창이 취소되거나 원곡이 변경됐습니다. 기존 자료는 보존합니다.');};
 guard();
 onProgress('Voice Library의 실제 DiffSinger Acoustic 모델과 학습 발음 사전 로딩 중');
 const dictionaryFile=await getFile(model.dictionaryAssetId);
 if(!(dictionaryFile instanceof Blob)||dictionaryFile.size<10||
  dictionaryFile.size>2*1024*1024||await sha256File(dictionaryFile)!==model.dictionarySha256)
  throw Error('등록 가창 모델의 한국어 발음 사전 파일 또는 SHA-256이 일치하지 않습니다.');
 const dictionary=parseDiffSingerDictionary(await dictionaryFile.text());
 guard();
 // Harmony is a new generated score, not a mutation of the user's MIDI.
 // Only accept a copy anchored to the same original alignment and cue timings.
 if(scoreAlignment){
  if(scoreAlignment.sourceKey!==project.vocalAlignment.sourceKey||
     !Array.isArray(scoreAlignment.cues))
   throw Error('독립 가창 악보는 현재 원곡 가사·MIDI에서만 생성할 수 있습니다.');
  if(scoreAlignmentKind==='adlib'){
   // Ad-lib uses only the singer's actual original Korean lyric syllables,
   // placed in existing rests; it may not inject new unrelated lyrics.
   const source=makeOriginalLyricAdlibAlignment(project);
   if(JSON.stringify(scoreAlignment.cues)!==JSON.stringify(source.cues))
    throw Error('원본 가사·MIDI에서 자동 생성한 Ad-lib 음표만 허용합니다.');
  }else if(scoreAlignmentKind==='harmony'){
   if(scoreAlignment.cues.length!==project.vocalAlignment.cues.length||
    scoreAlignment.cues.some((cue,i)=>cue.startSec!==project.vocalAlignment.cues[i].startSec||
     cue.endSec!==project.vocalAlignment.cues[i].endSec||cue.lyric!==project.vocalAlignment.cues[i].lyric))
    throw Error('가창 화음 악보는 현재 원본의 가사·MIDI 타이밍과 같아야 합니다.');
  }else throw Error('지원하지 않는 신규 신경망 가창 악보입니다.');
 }
 const alignment=scoreAlignment||project.vocalAlignment;
 const phonemePlan=scoreAlignment?null:
  (project.phonemePlan&&!isPhonemePlanStale(alignment,project.phonemePlan)?project.phonemePlan:null);
 onProgress('설치된 DiffSinger 실제 Acoustic·Vocoder 신경망으로 원곡 가창 중');
 const vocal=await synthesize(alignment,{
  python:model.python,root:model.root,experiment:model.experiment,
  dictionary,phonemePlan,singingStyle,rightsConfirmed:true,session,signal
 });
 guard();
 if(!(vocal instanceof Blob)||vocal.size<44||vocal.size>90*1024*1024)
  throw Error('DiffSinger 신경망이 저장 가능한 가창 WAV를 생성하지 못했습니다.');
 assertUsableSingingWav(await vocal.arrayBuffer(),{maxDurationSec:360});
 let finished=vocal;
 if(convertRVC){
  if(!rvcOptions||!rvcOptions.root||!rvcOptions.python||(!registeredRVCModel&&!rvcOptions.model))
   throw Error('등록한 본인 RVC 신경망 모델·Python 설치 경로를 지정하세요.');
  const settings={...rvcOptions,rightsConfirmed:true};
  const conversion={session,signal,
   onProgress:(done,total)=>onProgress('본인 음색 RVC 변환 '+done+'/'+total+'구간')};
  if(registeredRVCModel){
   const entry=registeredRVCModel;
   if(entry.engineId!=='rvc'||entry.voiceId!==voice.id||!entry.assetId||
    !/^[a-f0-9]{64}$/i.test(String(entry.sha256||'')))
    throw Error('동일 목소리의 RVC 체크포인트만 연결할 수 있습니다.');
   const modelFile=await getFile(entry.assetId);
   if(!(modelFile instanceof Blob)||await sha256File(modelFile)!==entry.sha256)
    throw Error('등록된 RVC 체크포인트 원본 해시가 변경됐습니다.');
   let indexFile=null;
   if(entry.indexAssetId){
    indexFile=await getFile(entry.indexAssetId);
    if(!(indexFile instanceof Blob)||!/^[a-f0-9]{64}$/i.test(String(entry.indexSha256||''))||
       await sha256File(indexFile)!==entry.indexSha256)
     throw Error('등록된 RVC 인덱스 원본 해시가 변경됐습니다.');
   }
   if(Number(rvcOptions.indexRate)>0&&!indexFile)
    throw Error('FAISS 인덱스 비율을 적용하려면 등록된 실제 인덱스가 필요합니다.');
   conversion.convert=(chunk,options,requestOptions)=>
    convertRegisteredRVC(chunk,{...options,modelFile,indexFile},requestOptions);
  }
  const cues=alignment.cues||[];
  conversion.preferredSplitSeconds=cues.slice(1).flatMap((cue,i)=>{
   const earlier=cues[i],pause=Number(cue.startSec)-Number(earlier.endSec);
   return Number.isFinite(pause)&&pause>=.18?
    [(Number(cue.startSec)+Number(earlier.endSec))/2]:[];
  });
  guard();
  onProgress('선택된 본인 RVC 신경망 음색을 가창 WAV에 적용 중');
  finished=await convert(vocal,settings,conversion);
  guard();
  if(!(finished instanceof Blob)||finished.size<44)
   throw Error('RVC 신경망이 실제 WAV를 반환하지 않았습니다.');
  assertUsableSingingWav(await finished.arrayBuffer(),{maxDurationSec:360});
 }
 guard();
 const job={id:saveOptions.newId('ds-mv'),at:new Date().toISOString(),
  mode:convertRVC?'DiffSinger + RVC 신경망 가창':'DiffSinger 신경망 가창',
  engine:'등록한 본인 DiffSinger',modelId:model.id,experiment:model.experiment,
  singingExpressionStyle:singingStyle,expressionScope:'F0 pitch phrasing only (not neural timbre change)',
  notes:alignment.cues?.length||0,result:'실제 신경망 WAV 생성 후 신규 보컬 자산 저장'};
 const result=await persistNeuralVocalTake(project,convertRVC?[vocal,finished]:[finished],{
  ...saveOptions,signal,job,
  singerBinding:saveOptions.singerBinding||{
   voiceId:voice.id,...(project.characterId?{characterId:project.characterId}:{})
  }
 });
 onProgress('DiffSinger 신경망 보컬 '+result.assets+'개 신규 편집 WAV 트랙에 저장');
 return {project:result.project,vocalAssets:result.assets,convertedWithRVC:convertRVC,
  modelId:model.experiment,neuralSinging:true,diffSinger:true};
}
