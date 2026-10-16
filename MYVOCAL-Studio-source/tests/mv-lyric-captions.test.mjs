import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newProject} from '../src/lib/schema.js';
import {alignLyricNotes} from '../src/lib/lyricAlignment.js';
import {buildMvLyricCaptions,captionAtTime} from '../src/lib/mvLyricCaptions.js';
import {planMvVideoRender,drawMvVideoFrame} from '../src/lib/mvVideoRender.js';

function vocalSong(){
 const p=newProject({title:'가사 영상',prompt:'나의 음악'});
 p.lyrics='가나다라마바사아자차카타파하';
 p.tracks[0].midiNotes=Array.from({length:13},(_,i)=>({
  id:'lead_'+i,pitch:60+i%4,startBeat:i*.5,length:.4,velocity:86
 }));
 p.vocalAlignment=alignLyricNotes(p,p.tracks[0].id);
 return p;
}
test('existing real text-to-MIDI alignment yields ordered, grouped lyric subtitles',()=>{
 const p=vocalSong(),original=structuredClone(p),r=buildMvLyricCaptions(p);
 assert.equal(r.status,'ready');
 assert.ok(r.captions.length>0);
 assert.ok(r.captions.every(c=>c.text.length>0&&c.endSec>c.startSec));
 assert.ok(r.captions.some(c=>c.cueCount>1),'syllables should form caption phrases');
 assert.ok(r.captions.reduce((total,c)=>total+c.cueCount,0)>=12);
 assert.deepEqual(p,original,'must never change source project');
});
test('lyrics follow musical MIDI note start and end; captions never appear after their end',()=>{
 const p=vocalSong(),r=buildMvLyricCaptions(p);
 const first=r.captions[0];
 assert.equal(first.startSec,0);
 assert.equal(captionAtTime(r.captions,0)?.text,first.text);
 assert.equal(captionAtTime(r.captions,-1),null);
 assert.equal(captionAtTime(r.captions,60),null);
 assert.equal(captionAtTime(r.captions,NaN),null);
 assert.equal(captionAtTime(r.captions,'0'),null);
});
test('editing lyrics, BPM or vocal MIDI refuses out-of-date lyric captions',()=>{
 const p=vocalSong(),prior=structuredClone(p);
 const variants=[
  {...p,lyrics:p.lyrics+'더'},
  {...p,bpm:p.bpm+1},
  {...p,tracks:p.tracks.map((t,i)=>i===0?{...t,midiNotes:t.midiNotes.map((n,j)=>j===0?{...n,pitch:n.pitch+2}:n)}:t)}
 ];
 for(const v of variants){
  const subtitles=buildMvLyricCaptions(v);
  assert.equal(subtitles.status,'stale');
  assert.deepEqual(subtitles.captions,[]);
 }
 assert.deepEqual(p,prior);
});
test('incomplete or unsafe alignment is rejected instead of inventing subtitles',()=>{
 const p=vocalSong();
 assert.equal(buildMvLyricCaptions({...p,vocalAlignment:null}).status,'missing');
 assert.equal(buildMvLyricCaptions({...p,vocalAlignment:{format:'bad',cues:[]}}).status,'invalid');
 const bad={...p.vocalAlignment,cues:[{...p.vocalAlignment.cues[0],endSec:-1}]};
 assert.equal(buildMvLyricCaptions({...p,vocalAlignment:bad}).status,'invalid');
 assert.equal(buildMvLyricCaptions({...p,vocalAlignment:{...p.vocalAlignment,cues:p.vocalAlignment.cues.map(c=>({...c,lyric:'—'}))}}).status,'empty');
});
test('a silent note with an empty lyric never turns into invented caption text',()=>{
 const p=vocalSong();
 p.vocalAlignment={...p.vocalAlignment,cues:p.vocalAlignment.cues.map((c,i)=>i===0?{...c,lyric:'—'}:c)};
 const r=buildMvLyricCaptions(p);
 assert.equal(r.status,'ready');
 assert.notEqual(r.captions[0].text[0],'—');
});
test('burn subtitles into canvas at exact cue time only when enabled',()=>{
 const p=vocalSong(),captions=buildMvLyricCaptions(p).captions,plan=planMvVideoRender(p);
 const shown=[];
 const ctx={fillRect(){},drawImage(){},fillText:(text)=>shown.push(String(text)),createLinearGradient:()=>({addColorStop(){}})};
 const canvas={width:640,height:360,getContext:()=>ctx};
 drawMvVideoFrame(canvas,plan,new Map(),.1,{captions,showCaptions:true});
 assert.ok(shown.some(t=>t.includes(captions[0].text)),'timed lyric is actually painted');
 shown.length=0;
 drawMvVideoFrame(canvas,plan,new Map(),.1,{captions,showCaptions:false});
 assert.ok(!shown.some(t=>t.includes(captions[0].text)));
 shown.length=0;
 drawMvVideoFrame(canvas,plan,new Map(),60,{captions,showCaptions:true});
 assert.ok(!shown.some(t=>t.includes(captions[0].text)));
});
test('video exporter preserves a user-toggle and passes the SAME lyric cues to WebM recording',()=>{
 const ui=readFileSync(new URL('../src/components/MvVideoExporter.jsx',import.meta.url),'utf8');
 const recorder=readFileSync(new URL('../src/lib/mvWebmRecorder.js',import.meta.url),'utf8');
 for(const token of ['buildMvLyricCaptions(project)','가사 싱크 자막 영상 포함','captions:lyricCaptions.captions','showCaptions:captionsEnabled'])
  assert.ok(ui.includes(token),token);
 for(const token of ['showCaptions=false','drawMvVideoFrame(canvas,plan,allAssets,elapsed,{captions,showCaptions})','includesCaptions:'])
  assert.ok(recorder.includes(token),token);
});

test('long manually edited lyric captions wrap without dropping user text',()=>{
 const p=vocalSong();
 const lyric='서로 다른 세상에서 살아가다 결국 다시 만나며 함께 우리의 이야기를 노래하는 아름다운 밤의 새로운 꿈이야기';
 p.vocalAlignment={...p.vocalAlignment,cues:p.vocalAlignment.cues.map((c,i)=>i===0?{...c,lyric}:({...c,lyric:'—'}))};
 const result=buildMvLyricCaptions(p);
 assert.equal(result.status,'ready');
 assert.equal(result.captions[0].text,lyric);
 const shown=[];
 const ctx={fillRect(){},drawImage(){},fillText:text=>shown.push(String(text)),createLinearGradient:()=>({addColorStop(){}})};
 drawMvVideoFrame({width:640,height:360,getContext:()=>ctx},planMvVideoRender(p),new Map(),.1,{showCaptions:true,captions:result.captions});
 assert.equal(shown.filter(t=>lyric.includes(t)).join(''),lyric,'canvas must preserve every original lyric character');
});

test('overlapping lyric phrases switch when the new phrase starts, not after the old sustain ends',()=>{
 const captions=[
  {startSec:0,endSec:3,text:'앞 가사'},
  {startSec:2.5,endSec:5,text:'다음 가사'}
 ];
 assert.equal(captionAtTime(captions,2.49).text,'앞 가사');
 assert.equal(captionAtTime(captions,2.5).text,'다음 가사');
 assert.equal(captionAtTime(captions,3).text,'다음 가사');
 assert.equal(captionAtTime(captions,5),null);
});
