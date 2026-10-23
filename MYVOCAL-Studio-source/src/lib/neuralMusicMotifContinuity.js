// 기존 6악기 신경망 MIDI의 공통 선율/화성을 전곡 MusicGen 구간에 유지한다.
// 생성한 새 선율이 아니라 프로젝트의 실제 MIDI 음표만 요약한다.
const NOTE=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const pitch=n=>NOTE[n%12]+Math.floor(n/12-1);
const eligible=n=>Number.isInteger(n?.pitch)&&n.pitch>=0&&n.pitch<=127&&
 Number.isFinite(n.startBeat)&&Number.isFinite(n.length)&&n.length>0;
export function summarizeOriginalMidiTheme(score,{limit=10}={}){
 if(!score||typeof score.get!=='function'||!Number.isInteger(limit)||limit<4||limit>16)
  throw Error('실제 MIDI의 공통 선율을 확인할 수 없습니다.');
 const melody=(score.get('melody')?.midiNotes||[]).filter(eligible)
  .sort((a,b)=>a.startBeat-b.startBeat||a.pitch-b.pitch);
 const harmony=(score.get('chords')?.midiNotes||[]).filter(eligible);
 if(!melody.length)throw Error('원곡 MIDI 멜로디 음표가 없어 전곡 연속 작곡을 진행할 수 없습니다.');
 // 구간이 끝나도 첫 오리지널 주제가 반복되어야 같은 곡으로 들린다.
 const theme=melody.slice(0,limit).map(n=>pitch(n.pitch));
 const classes=new Map();
 for(const n of harmony.slice(0,128))classes.set(n.pitch%12,(classes.get(n.pitch%12)||0)+1);
 const chords=[...classes].sort((a,b)=>b[1]-a[1]||a[0]-b[0]).slice(0,4)
  .map(([pc])=>NOTE[pc]);
 return {theme:theme.join(' '),harmony:chords.join(' ')};
}
export function prependSongTheme(prompt,theme,{maxCharacters=600}={}){
 if(typeof prompt!=='string'||!theme||!theme.theme||
 !Number.isInteger(maxCharacters)||maxCharacters<100||maxCharacters>600)
  throw Error('원곡 연속 MIDI 프롬프트 조건을 확인하세요.');
 const directive='Original recurring melodic hook '+theme.theme+
  '; established harmony '+(theme.harmony||'same chords as original')+
  '; preserve key, tempo and motif across every segment; ';
 return [...(directive+prompt)].slice(0,maxCharacters).join('');
}
