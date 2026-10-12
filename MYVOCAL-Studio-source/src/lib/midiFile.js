// Standard MIDI File v0/v1 import and type-1 export, quarter-note beat timeline, 480 PPQ.
const PPQ=480;
const uint16=n=>[(n>>8)&255,n&255];
const uint32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
function variable(value){let v=Math.max(0,Math.floor(value))>>>0;const r=[v&127];while((v>>=7)>0)r.unshift((v&127)|128);return r;}
const ascii=text=>Array.from(String(text)).map(c=>c.charCodeAt(0)<128?c.charCodeAt(0):63);
function chunk(id,bytes){return [...ascii(id),...uint32(bytes.length),...bytes];}
const programs={piano:0,bass:33,synth:80,strings:48,guitar:24,drums:0};
export function createMidiFile(project){
 const tempo=Math.max(40,Math.min(300,Number(project.bpm)||120));const micro=Math.round(60000000/tempo);
 const control=[0,255,81,3,(micro>>>16)&255,(micro>>>8)&255,micro&255,0,255,88,4,4,2,24,8,0,255,47,0];
 const chunks=[chunk('MTrk',control)];
 for(const [index,track] of (project.tracks||[]).entries()){
  const notes=(track.midiNotes||[]).filter(n=>Number.isFinite(Number(n.startBeat))&&Number(n.length)>0);
  if(!notes.length)continue;
  const channel=index%15===9?10:index%15;const events=[];
  const trackName=ascii(track.name||'MIDI Track').slice(0,80);
  events.push({tick:0,pri:0,bytes:[255,3,...variable(trackName.length),...trackName]});
  const program=programs[track.instrument||'piano']||0;
  events.push({tick:0,pri:0,bytes:[0xc0|channel,program]});
  for(const n of notes){
   const tick=Math.max(0,Math.round(Number(n.startBeat)*PPQ)),end=tick+Math.max(1,Math.round(Number(n.length)*PPQ));
   const pitch=Math.max(0,Math.min(127,Math.round(Number(n.pitch)||60))),vel=Math.max(1,Math.min(127,Math.round(Number(n.velocity)||95)));
   events.push({tick,pri:2,bytes:[0x90|channel,pitch,vel]},{tick:end,pri:1,bytes:[0x80|channel,pitch,0]});
  }
  events.sort((a,b)=>a.tick-b.tick||a.pri-b.pri);
  const body=[];let last=0;for(const e of events){body.push(...variable(e.tick-last),...e.bytes);last=e.tick;}
  body.push(0,255,47,0);chunks.push(chunk('MTrk',body));
 }
 const header=chunk('MThd',[...uint16(1),...uint16(chunks.length),...uint16(PPQ)]);
 return new Blob([new Uint8Array([...header,...chunks.flat()])],{type:'audio/midi'});
}
function reader(buf){const data=new DataView(buf);let offset=0;const need=n=>{if(offset+n>data.byteLength)throw Error('손상되거나 불완전한 MIDI 파일입니다.');};return {
 get pos(){return offset;},get length(){return data.byteLength;},set pos(p){if(p<0||p>data.byteLength)throw Error('잘못된 MIDI 위치입니다.');offset=p;},
 u8(){need(1);return data.getUint8(offset++);},u16(){need(2);const v=data.getUint16(offset);offset+=2;return v;},u32(){need(4);const v=data.getUint32(offset);offset+=4;return v;},
 str(n){need(n);let s='';for(let i=0;i<n;i++)s+=String.fromCharCode(data.getUint8(offset++));return s;},
 vlq(){let v=0;for(let i=0;i<4;i++){const b=this.u8();v=(v<<7)|(b&127);if(!(b&128))return v;}throw Error('MIDI 가변 길이 값이 잘못되었습니다.');}
 };}
export async function parseMidiFile(file){
 if(file.size>4*1024*1024)throw Error('MIDI 파일은 최대 4MB까지 지원합니다.');
 const r=reader(await file.arrayBuffer());if(r.str(4)!=='MThd')throw Error('표준 MIDI 파일이 아닙니다.');
 const len=r.u32(),format=r.u16(),tracks=r.u16(),division=r.u16();
 if(format>1||division&0x8000||!division||tracks>128)throw Error('지원하지 않는 MIDI 형식입니다. Type 0/1 및 PPQ만 지원합니다.');
 r.pos=8+len;let bpm=null;const result=[];
 for(let trackIndex=0;trackIndex<tracks;trackIndex++){
  if(r.str(4)!=='MTrk')throw Error('MIDI 트랙이 손상되었습니다.');
  const length=r.u32(),stop=r.pos+length;if(stop>r.length)throw Error('MIDI 트랙 길이가 잘못되었습니다.');
  let tick=0,running=0,program=0,name=`MIDI ${trackIndex+1}`;const held=new Map(),notes=[];
  while(r.pos<stop){
   tick+=r.vlq();let status=r.u8();if(status<0x80){r.pos--;if(!running)throw Error('잘못된 Running Status입니다.');status=running;}else if(status<0xf0)running=status;
   if(status===0xff){const type=r.u8(),size=r.vlq();if(r.pos+size>stop)throw Error('메타 이벤트 범위를 벗어났습니다.');if(type===0x51&&size===3&&!bpm){const t=(r.u8()<<16)|(r.u8()<<8)|r.u8();bpm=Math.round(60000000/t);}else if(type===0x03&&size<256){name=r.str(size);}else r.pos+=size;continue;}
   if(status===0xf0||status===0xf7){const size=r.vlq();r.pos+=size;continue;}
   const event=status&0xf0,channel=status&0x0f;const a=r.u8(),b=(event===0xc0||event===0xd0)?0:r.u8();
   if(event===0xc0)program=a;
   if(event===0x90&&b>0){const k=channel+':'+a,stack=held.get(k)||[];stack.push({tick,velocity:b});held.set(k,stack);}
   if(event===0x80||(event===0x90&&b===0)){const k=channel+':'+a,stack=held.get(k);if(stack?.length){const start=stack.shift();notes.push({pitch:a,velocity:start.velocity,startBeat:+(start.tick/division).toFixed(4),length:+(Math.max(1,tick-start.tick)/division).toFixed(4)});}}
  }
  r.pos=stop;
  if(notes.length)result.push({name,instrument:program<8?'piano':program>=32&&program<40?'bass':program>=48&&program<56?'strings':program>=24&&program<32?'guitar':'synth',notes:notes.slice(0,6000)});
 }
 if(result.reduce((s,t)=>s+t.notes.length,0)>10000)throw Error('음표 수가 너무 많습니다. (최대 10,000개)');
 return {bpm:bpm||null,tracks:result};
}
