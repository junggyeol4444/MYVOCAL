// MYVOCAL v1.7: offline project handoff and incoming-render validation.
// No voice model is trained or executed by these helpers.
import {makeZip} from './zipStore.js';
import {makeOpenUtauUstx,ustxOutputName} from './openUtauExchange.js';
import {createMidiFile} from './midiFile.js';
import {cuesToSrt} from './lyricAlignment.js';

const enc=new TextEncoder();
const cleanName=(s)=>String(s||'Untitled').replace(/[^a-zA-Z0-9가-힣_-]/g,'_').slice(0,55)||'Untitled';
export const OPENUTAU_SESSION_FORMAT='MYVOCAL_OPENUTAU_HANDOFF';
export function expectedVocalSeconds(alignment){
 const cues=alignment?.cues||[];
 return cues.length?Math.max(...cues.map(c=>Number(c.endSec)||0)):0;
}

export async function makeOpenUtauHandoffPackage(project,alignment,options={}){
 const result=makeOpenUtauUstx(project,alignment,options); // validates non-stale notes and aliases
 const notes=alignment.cues.map(c=>({pitch:c.pitch,startBeat:c.startBeat,length:c.length,velocity:c.velocity||95}));
 const midiProject={bpm:alignment.bpm,tracks:[{name:'Lead Vocal',type:'vocal',instrument:'synth',midiNotes:notes}]};
 const midiBytes=new Uint8Array(await createMidiFile(midiProject).arrayBuffer());
 const filename=ustxOutputName(project.title);
 const manifest={format:OPENUTAU_SESSION_FORMAT,version:1,createdAt:new Date().toISOString(),
  project:{id:project.id,title:project.title,bpm:alignment.bpm},
  singer:options.singer||'',phonemizer:options.phonemizer||'',renderer:options.renderer||'CLASSIC',
  noteCount:result.noteCount,expectedVocalSeconds:expectedVocalSeconds(alignment),
  mappedLyrics:!!options.useMappedLyrics,files:{ustx:filename,midi:'lead-vocal.mid',lyrics:'lyrics.srt',renderedWav:'rendered-vocal.wav'},
  remarks:'Audio samples, singer binaries, and AI models are NOT included. An external synthesizer and valid voicebank are required.'};
 const guide=[
  'MYVOCAL Studio v1.7 - OpenUtau handoff (offline)',
  '',
  '1. Open '+filename+' in separately installed OpenUtau.',
  '2. In OpenUtau, verify that the singer/phonemizer/renderer is installed and compatible.',
  '3. Render the vocal to a PCM or IEEE-float WAV file.',
  '4. In MYVOCAL Music Studio > OpenUtau workflow, select the resulting WAV.',
  '5. Check WAV information, then click Add WAV Track.',
  '',
  'lead-vocal.mid and lyrics.srt are references, not AI-generated vocal audio.',
  'This archive does not contain a singer, training data, or a neural model.',
  'Use voicebanks and performances for which you have rights.',
  '',
 ].join('\n');
 const entries=[
  {name:filename,data:enc.encode(result.text)},
  {name:'lead-vocal.mid',data:midiBytes},
  {name:'lyrics.srt',data:enc.encode(cuesToSrt(alignment.cues))},
  {name:'manifest.json',data:enc.encode(JSON.stringify(manifest,null,2))},
  {name:'README.txt',data:enc.encode(guide)}
 ];
 return {bytes:makeZip(entries),fileName:`MYVOCAL-${cleanName(project.title)}-OpenUtau-handoff.zip`,manifest,noteCount:result.noteCount};
}

function readFour(view,pos){return String.fromCharCode(view.getUint8(pos),view.getUint8(pos+1),view.getUint8(pos+2),view.getUint8(pos+3));}
export function inspectRenderedWav(input,expectedSeconds=0){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 if(bytes.byteLength<44)throw Error('WAV 파일이 너무 작거나 손상됐습니다.');
 if(bytes.byteLength>90*1024*1024)throw Error('WAV 파일은 90MB까지 지원합니다.');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(readFour(view,0)!=='RIFF'||readFour(view,8)!=='WAVE')throw Error('RIFF/WAVE 형식이 아닙니다.');
 const riffEnd=view.getUint32(4,true)+8;
 if(riffEnd>view.byteLength||riffEnd<44)throw Error('WAV RIFF 길이가 올바르지 않습니다.');
 let fmt=null,dataSize=null,at=12;
 while(at+8<=riffEnd){
  const tag=readFour(view,at),size=view.getUint32(at+4,true),start=at+8;
  if(size>riffEnd-start)throw Error('WAV 청크가 파일 범위를 벗어납니다.');
  if(tag==='fmt '){
   if(size<16)throw Error('WAV fmt 청크가 잘못되었습니다.');
   fmt={encoding:view.getUint16(start,true),channels:view.getUint16(start+2,true),sampleRate:view.getUint32(start+4,true),
    byteRate:view.getUint32(start+8,true),blockAlign:view.getUint16(start+12,true),bitsPerSample:view.getUint16(start+14,true)};
  }else if(tag==='data'){
   if(dataSize===null)dataSize=size;
  }
  at=start+size+(size%2);
 }
 if(!fmt||dataSize===null)throw Error('WAV에 fmt 또는 data 청크가 없습니다.');
 if(![1,3].includes(fmt.encoding))throw Error('PCM 또는 IEEE Float WAV만 지원합니다.');
 if(fmt.channels<1||fmt.channels>2)throw Error('WAV 채널은 모노/스테레오만 지원합니다.');
 if(fmt.sampleRate<8000||fmt.sampleRate>192000)throw Error('WAV 샘플레이트가 지원 범위를 벗어났습니다.');
 if(![8,16,24,32].includes(fmt.bitsPerSample)||(fmt.encoding===3&&fmt.bitsPerSample!==32))throw Error('WAV 비트 깊이를 지원하지 않습니다.');
 if(fmt.blockAlign!==fmt.channels*(fmt.bitsPerSample/8)||fmt.byteRate!==fmt.blockAlign*fmt.sampleRate)throw Error('WAV 오디오 블록 정보가 일치하지 않습니다.');
 if(!dataSize||dataSize%fmt.blockAlign)throw Error('WAV 샘플 길이가 잘못되었습니다.');
 const seconds=Math.round(dataSize/fmt.blockAlign/fmt.sampleRate*1000)/1000;
 if(seconds<=0||seconds>480)throw Error('보컬 WAV는 0초 초과, 8분 이하여야 합니다.');
 const expected=Number(expectedSeconds)||0,warnings=[];
 if(expected>0&&seconds<expected-0.65)warnings.push(`원본 보컬 MIDI 예상 종료(${expected.toFixed(2)}초)보다 WAV가 짧습니다. 싱크를 확인하세요.`);
 if(expected>0&&seconds>expected+2)warnings.push(`WAV가 보컬 MIDI 종료(${expected.toFixed(2)}초)보다 길어 여음 또는 침묵을 포함할 수 있습니다.`);
 return {encoding:fmt.encoding===1?'PCM':'IEEE Float',channels:fmt.channels,sampleRate:fmt.sampleRate,bitsPerSample:fmt.bitsPerSample,
  durationSec:seconds,dataBytes:dataSize,warnings};
}
