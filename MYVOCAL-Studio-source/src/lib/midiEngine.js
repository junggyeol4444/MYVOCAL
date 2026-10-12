// MYVOCAL v0.3 — local Web Audio instrument engine (simple synthesized sounds).
// MIDI notes contain a zero-based startBeat, duration in beats, velocity 1..127 and MIDI pitch 0..127.
export const instruments=[
 {id:'piano',name:'피아노'},
 {id:'bass',name:'베이스'},
 {id:'synth',name:'신스'},
 {id:'strings',name:'스트링'},
 {id:'guitar',name:'기타'},
 {id:'drums',name:'드럼(신스)'}
];
export const beatSeconds=bpm=>60/Math.max(1,Number(bpm)||120);
export const pitchName=pitch=>{
 const names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
 const n=Math.max(0,Math.min(127,Math.round(Number(pitch)||0)));
 return `${names[n%12]}${Math.floor(n/12)-1}`;
};
export const validNotes=track=>(Array.isArray(track?.midiNotes)?track.midiNotes:[]).filter(n=>Number.isFinite(Number(n.pitch))&&Number.isFinite(Number(n.startBeat))&&Number(n.length)>0);
export const midiEnd=project=>{
 const beat=beatSeconds(project.bpm);
 return Math.max(0,...(project.tracks||[]).flatMap(t=>validNotes(t).map(n=>(Math.max(0,Number(n.startBeat))+Math.max(.05,Number(n.length)))*beat)));
};
export function noteMidi(ctx,track,note,when,duration,destination){
 const pitch=Math.max(0,Math.min(127,Math.round(Number(note.pitch)||60)));
 const velocity=Math.max(1,Math.min(127,Number(note.velocity)||95));
 const instrument=track.instrument||'piano';
 const start=Math.max(ctx.currentTime||0,Number(when)||0);
 const dur=Math.max(.03,Number(duration)||.1);
 const oscillator=ctx.createOscillator(),envelope=ctx.createGain(),channel=ctx.createGain();
 let freq=440*Math.pow(2,(pitch-69)/12);
 if(instrument==='drums')freq=pitch<47?65:pitch<53?180:450;
 oscillator.frequency.setValueAtTime(freq,start);
 oscillator.type=({piano:'triangle',bass:'sawtooth',synth:'square',strings:'sawtooth',guitar:'triangle',drums:'sine'})[instrument]||'triangle';
 const amplitude=(instrument==='synth'?.095:instrument==='strings'?.08:instrument==='drums'?.2:.16)*(velocity/127);
 const attack=instrument==='strings'?.065:.006;
 const sustain=instrument==='piano'?.42:instrument==='guitar'?.38:instrument==='drums'?.09:.65;
 const release=instrument==='strings'?.23:instrument==='bass'?.055:.1;
 envelope.gain.setValueAtTime(0,start);
 envelope.gain.linearRampToValueAtTime(amplitude,start+Math.min(attack,dur*.35));
 envelope.gain.linearRampToValueAtTime(amplitude*sustain,start+Math.max(attack+.004,Math.min(dur*.4,dur-.02)));
 envelope.gain.setValueAtTime(amplitude*sustain,start+dur);
 envelope.gain.linearRampToValueAtTime(.00001,start+dur+release);
 channel.gain.value=1;
 oscillator.connect(envelope);envelope.connect(channel);channel.connect(destination);
 oscillator.start(start);oscillator.stop(start+dur+release+.01);
 return {source:oscillator,gain:channel,nodes:[oscillator,envelope,channel],trackId:track.id};
}
let previewContext;
export async function previewNote(pitch,instrument='piano'){
 const C=window.AudioContext||window.webkitAudioContext;
 if(!C)throw new Error('오디오 장치를 사용할 수 없습니다.');
 if(!previewContext)previewContext=new C();
 await previewContext.resume();
 const master=previewContext.createGain();master.gain.value=.55;master.connect(previewContext.destination);
 const entry=noteMidi(previewContext,{id:'preview',instrument},{pitch,velocity:98},previewContext.currentTime+.012,.4,master);
 setTimeout(()=>{try{entry.nodes.forEach(n=>n.disconnect());master.disconnect();}catch{}},1200);
}
// Deterministic triad / seventh chord spelling. No copyrighted melody generation.
const chromatic={C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11};
export function chordPitches(symbol,octave=4){
 const m=String(symbol||'').trim().match(/^([A-G])([#b]?)(maj7|m7|dim|sus4|m|7|maj)?$/);
 if(!m)throw new Error('지원하지 않는 코드입니다. 예: C, Am, Fmaj7, G7');
 const root=chromatic[m[1]+m[2]],kind=m[3]||'maj';
 const intervals=({maj:[0,4,7],m:[0,3,7],dim:[0,3,6],sus4:[0,5,7],maj7:[0,4,7,11],m7:[0,3,7,10],'7':[0,4,7,10]})[kind];
 return intervals.map(interval=>12*(octave+1)+root+interval);
}
