// MYVOCAL v0.6 guided recording / dataset manifest.
// All prompt assignments are made by the user. There is NO phoneme recognizer,
// singing range certification, speaker-verification, or AI voice training here.
import {getFile} from './assetDb.js';
import {makeZip} from './zipStore.js';
const vowels=[['a','ㅏ','아—'],['eo','ㅓ','어—'],['i','ㅣ','이—'],['u','ㅜ','우—']];
const registers=[['low','저음','편안한 낮은 음'],['middle','중음','자연스러운 중간 음'],['high','고음','무리 없는 높은 음']];
export const VOICE_GUIDES=registers.flatMap(([reg,label,instruction])=>vowels.map(([vowel,letter,utterance])=>({
 id:`${reg}-${vowel}`,register:reg,registerLabel:label,vowel,letter,title:`${label} · ${letter}`,
 prompt:`${instruction}에서 '${utterance}'를 5~8초간 일정하게 부르세요. 목에 힘이 들어가면 중단하세요.`,
 notes:'같은 높이에서 2~3회 반복하고 각 발음의 시작과 끝을 분명하게 하세요.'
})));
export const getVoiceGuide=id=>VOICE_GUIDES.find(x=>x.id===id)||null;
export function checkSampleQuality(analysis){
 if(!analysis)return {status:'pending',title:'분석 전',issues:['분석 결과가 없어 품질을 판단할 수 없습니다.']};
 const issues=[];
 if(!Number.isFinite(analysis.duration)||analysis.duration<5)issues.push('샘플이 5초보다 짧습니다.');
 if(analysis.clippedPercent>0.5)issues.push('클리핑이 검출되었습니다. 입력 볼륨을 줄이세요.');
 if(analysis.meanRmsDb<-38)issues.push('평균 음량이 작습니다. 마이크 거리·입력 레벨을 확인하세요.');
 if(analysis.voicedFrames<10||analysis.voicedPercent<20)issues.push('피치가 검출된 구간이 적습니다. 반주 없이 선명하게 발성해 보세요.');
 if(analysis.duration>90)issues.push('첫 90초만 분석됩니다. 짧은 샘플로 나눠 주세요.');
 return issues.length?{status:'attention',title:'점검 필요',issues}:{status:'usable',title:'신호 품질 통과',issues:[]};
}
export function voiceDatasetSummary(voice){
 const samples=[...(voice.assetId?[{id:voice.assetId,analysis:voice.analysis,capturePromptId:voice.capturePromptId||''}]:[]),...(voice.assets||[])];
 const completed=new Set(samples.filter(s=>checkSampleQuality(s.analysis).status==='usable'&&getVoiceGuide(s.capturePromptId)).map(s=>s.capturePromptId));
 const count=VOICE_GUIDES.length;return {count,completed:completed.size,percent:Math.round(100*completed.size/count),passed:samples.filter(s=>checkSampleQuality(s.analysis).status==='usable').length,total:samples.length,seconds:Math.round(samples.reduce((sum,s)=>sum+(s.analysis?.duration||0),0)),completedIds:[...completed]};
}
export function voiceDatasetManifest(voice,samples){
 return {format:'MYVOCAL_VOICE_DATASET',version:1,createdAt:new Date().toISOString(),
  voice:{name:voice.name,rights:voice.rights,style:voice.style},
  notice:'Collection only: quality checks analyze signal level / pitch detectability. Prompt and actual phoneme identity are NOT verified; no voice model is trained.',
  samples:samples.map((s,i)=>({path:s.path,originalFileName:s.fileName,mediaType:s.type,bytes:s.bytes,promptId:s.capturePromptId||null,prompt:getVoiceGuide(s.capturePromptId)?.prompt||null,register:getVoiceGuide(s.capturePromptId)?.registerLabel||null,
    vowel:getVoiceGuide(s.capturePromptId)?.letter||null,userNotes:s.notes||'',status:checkSampleQuality(s.analysis).status,issues:checkSampleQuality(s.analysis).issues,
    analysis:s.analysis?{duration:s.analysis.duration,analyzedSeconds:s.analysis.analyzedSeconds,medianHz:s.analysis.medianHz,lowNote:s.analysis.lowNote,highNote:s.analysis.highNote,clippedPercent:s.analysis.clippedPercent,meanRmsDb:s.analysis.meanRmsDb,voicedPercent:s.analysis.voicedPercent}:null}))};
}
const safeName=name=>(name||'voice').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,60)||'voice';
const extFor=(file)=>{const m=(file.name||'').match(/\.(wav|mp3|ogg|m4a|aac|webm|flac)$/i);return m?m[0].toLowerCase():file.type?.includes('wav')?'.wav':file.type?.includes('mpeg')?'.mp3':file.type?.includes('webm')?'.webm':'.audio';};
export async function packageVoiceDataset(voice,loadFile=getFile){
 if(!voice||!['self','owned','licensed'].includes(voice.rights))throw Error('본인 목소리 또는 권한이 확인된 샘플만 내보낼 수 있습니다.');
 const entries=[],records=[],samples=[...(voice.assetId?[{id:voice.assetId,fileName:voice.fileName,analysis:voice.analysis,capturePromptId:voice.capturePromptId,notes:voice.notes}]:[]),...(voice.assets||[])];
 if(samples.length===0)throw Error('내보낼 음성 샘플이 없습니다.');
 let size=0;
 for(let i=0;i<samples.length;i++){
  const s=samples[i],file=await loadFile(s.id);
  if(!file||!file.size)throw Error(`샘플 ${i+1}의 원본 음성 파일을 찾을 수 없습니다. 다시 등록해 주세요.`);
  size+=file.size;if(size>150*1024*1024)throw Error('원본 파일의 합계가 150MB를 초과합니다. 샘플을 나눠 내보내세요.');
  const path=`audio/sample-${String(i+1).padStart(3,'0')}${extFor(file)}`;
  entries.push({name:path,data:new Uint8Array(await file.arrayBuffer())});
  records.push({...s,path,fileName:s.fileName||file.name||'',type:file.type||'',bytes:file.size});
 }
 const manifest=voiceDatasetManifest(voice,records);
 entries.unshift({name:'manifest.json',data:new TextEncoder().encode(JSON.stringify(manifest,null,2))});
 return {bytes:makeZip(entries),fileName:safeName(voice.name)+'-voice-dataset.zip',manifest};
}
export async function downloadVoiceDataset(voice,loadFile=getFile){
 const result=await packageVoiceDataset(voice,loadFile),url=URL.createObjectURL(new Blob([result.bytes],{type:'application/zip'}));
 try{const a=document.createElement('a');a.href=url;a.download=result.fileName;a.click();}
 finally{setTimeout(()=>URL.revokeObjectURL(url),2000);}
 return result.manifest.samples.length;
}
