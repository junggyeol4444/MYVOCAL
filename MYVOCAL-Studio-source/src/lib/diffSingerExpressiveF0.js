// Original #7: controllable pitch expression of real DiffSinger singing.
// Only F0 is modified. Do not claim a change of voice identity, vocal timbre,
// singing formant, or a neural style the installed acoustic model lacks.
const profiles=Object.freeze({
 Natural:Object.freeze({vibratoCents:0,vibratoHz:5.3,vibratoDelay:.38,scoopCents:0}),
 Ballad:Object.freeze({vibratoCents:27,vibratoHz:5.2,vibratoDelay:.38,scoopCents:21}),
 Soft:Object.freeze({vibratoCents:11,vibratoHz:4.8,vibratoDelay:.48,scoopCents:8}),
 Emotional:Object.freeze({vibratoCents:34,vibratoHz:5.6,vibratoDelay:.33,scoopCents:25}),
 Rock:Object.freeze({vibratoCents:23,vibratoHz:6.1,vibratoDelay:.23,scoopCents:12}),
 Power:Object.freeze({vibratoCents:20,vibratoHz:5.7,vibratoDelay:.25,scoopCents:16}),
});
export const DIFFSINGER_EXPRESSIVE_STYLES=Object.freeze(Object.keys(profiles));
export function diffSingerExpression(style='Natural'){
 if(!Object.hasOwn(profiles,style))
  throw Error('현재 로컬 DiffSinger Acoustic은 '+String(style)+
   ' 음색 변환(가성·속삭임 등)을 제공하지 않습니다. 가능한 음정 표현은 Natural, Ballad, Soft, Emotional, Rock, Power입니다.');
 return profiles[style];
}
export function expressedDiffSingerF0(midi,t,start,end,style='Natural'){
 const e=typeof style==='string'?diffSingerExpression(style):style;
 if(!Number.isFinite(midi)||midi<36||midi>96||
    !Number.isFinite(t)||!Number.isFinite(start)||!Number.isFinite(end)||
    end<=start)return 0;
 const local=t-start,duration=end-start;
 const natural=440*Math.pow(2,(midi-69)/12);
 if(!e?.vibratoCents&&!e?.scoopCents)return Math.round(natural*100)/100;
 const scoopFade=Math.max(0,1-local/.13);
 // A note must be long enough for a meaningful pitch modulation; do not
 // vibrate MIDI rests or exaggerate short consonant notes.
 const sustain=Math.min(1,Math.max(0,(local-e.vibratoDelay)/.13),
  Math.max(0,(duration-local)/.12));
 const vibrato=duration>.36&&local>=e.vibratoDelay?
  e.vibratoCents*sustain*Math.sin(2*Math.PI*e.vibratoHz*(local-e.vibratoDelay)):0;
 const cents=-e.scoopCents*scoopFade+vibrato;
 return Math.round(natural*Math.pow(2,cents/1200)*100)/100;
}
