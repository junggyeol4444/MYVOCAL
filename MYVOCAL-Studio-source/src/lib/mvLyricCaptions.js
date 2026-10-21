// Display-only lyric captions for a music-timed MV. Timings come from the
// existing user-editable MIDI/text alignment, NOT speech, phoneme or lip sync.
import {isAlignmentStale} from './lyricAlignment.js';

const MAX_CUES=4096;
const MAX_GROUP_UNITS=11;
const MAX_GROUP_SECONDS=3.4;
const MAX_GROUP_CHARACTERS=64;
const MAX_GAP_SECONDS=.45;
const roundMs=n=>Math.round(n*1000)/1000;
const cleanText=text=>String(text||'').replace(/[\u0000-\u001f\u007f\u2028\u2029]/g,' ').replace(/\s+/g,' ').trim();
function asCaptionText(cues){
 let text='';
 for(const cue of cues){
  const word=cue.text;
  if(text&&/[A-Za-z0-9]$/.test(text)&&/^[A-Za-z0-9]/.test(word))text+=' ';
  text+=word;
 }
 return text;
}
export function buildMvLyricCaptions(project){
 const alignment=project?.vocalAlignment;
 if(!alignment)return {status:'missing',captions:[],note:'보컬 가사 싱크가 없습니다. 가사 싱크에서 MIDI 음표에 가사를 연결해 주세요.'};
 if(alignment.format!=='MYVOCAL_LYRIC_ALIGNMENT'||alignment.version!==1||
    !Array.isArray(alignment.cues)||alignment.cues.length===0||alignment.cues.length>MAX_CUES)
  return {status:'invalid',captions:[],note:'저장된 가사 싱크 형식이 올바르지 않습니다. 가창 편집기에서 다시 확인해 주세요.'};
 if(isAlignmentStale(project,alignment))
  return {status:'stale',captions:[],note:'가사·BPM·보컬 MIDI가 변경돼 이전 싱크를 사용할 수 없습니다. 가사 싱크를 다시 생성해 주세요.'};
 const entries=[];
 for(const cue of alignment.cues){
  if(!cue||typeof cue.lyric!=='string'||!Number.isFinite(cue.startSec)||
    !Number.isFinite(cue.endSec)||cue.startSec<0||cue.endSec<=cue.startSec||cue.endSec>360)
   return {status:'invalid',captions:[],note:'가사 싱크의 시간 또는 텍스트가 잘못되었습니다.'};
  const text=cleanText(cue.lyric);
  if(!text||text==='—')continue;
  if(text.length>80)return {status:'invalid',captions:[],note:'가사 자막 길이가 지원 범위를 초과했습니다.'};
  entries.push({text,startSec:roundMs(cue.startSec),endSec:roundMs(cue.endSec)});
 }
 if(!entries.length)return {status:'empty',captions:[],note:'연결된 보컬 음표에 표시할 가사 글자가 없습니다.'};
 entries.sort((a,b)=>a.startSec-b.startSec||a.endSec-b.endSec);
 const groups=[];
 let items=[];
 const finish=()=>{
  if(!items.length)return;
  groups.push({startSec:items[0].startSec,endSec:Math.max(...items.map(x=>x.endSec)),
   text:asCaptionText(items),cueCount:items.length});
  items=[];
 };
 for(const entry of entries){
  const previous=items.at(-1);
  // Preserve timing boundaries: a long pause, long phrase or many syllables
  // begins a new caption line instead of showing future lyrics too early.
  if(previous&&(items.length>=MAX_GROUP_UNITS||
    asCaptionText(items).length+entry.text.length>MAX_GROUP_CHARACTERS||
    entry.endSec-items[0].startSec>MAX_GROUP_SECONDS||
    entry.startSec-previous.endSec>MAX_GAP_SECONDS||
    entry.startSec<previous.startSec))finish();
  items.push(entry);
 }
 finish();
 return {status:'ready',captions:groups,note:'기존 MIDI·텍스트 싱크 기반 자막입니다. 자동 음성 인식이나 립싱크가 아닙니다.'};
}
export function captionAtTime(captions,seconds){
 if(!Array.isArray(captions)||!Number.isFinite(seconds))return null;
 // A newly starting phrase takes precedence when sustained MIDI notes
 // overlap the previous caption's final note.
 let active=null;
 for(const cue of captions){
  if(cue.startSec<=seconds&&seconds<cue.endSec&&
     (!active||cue.startSec>=active.startSec))active=cue;
 }
 return active;
}
