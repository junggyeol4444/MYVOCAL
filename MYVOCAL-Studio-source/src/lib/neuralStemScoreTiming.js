// 3~6분 한국어 신경망 MIDI 작곡 길이에 실제 MusicGen WAV 길이를 맞춘다.
// 6악기는 동일 시간표를 사용하며 원래 모델 응답은 절대 수정하지 않는다.
export function planScoreMatchedMusicGenSegments(scoreSec,segments,{fadeSec=.5,bpm=null}={}){
 if(!Number.isFinite(scoreSec)||scoreSec<150||scoreSec>360||
    !Number.isInteger(segments)||![11,20].includes(segments)||
    !Number.isFinite(fadeSec)||fadeSec<.1||fadeSec>1.5)
  throw Error('원본 3~6분 신경망 MIDI 악기 길이 또는 MusicGen 구간이 올바르지 않습니다.');
 const expected=Math.ceil(scoreSec+(segments-1)*fadeSec);
 if(expected<segments*3||expected>segments*20)
  throw Error('현재 MusicGen 구간 수로 실제 MIDI 곡 길이를 재생할 수 없습니다.');
 const base=Math.floor(expected/segments),extra=expected-base*segments;
 let segmentSeconds=Array.from({length:segments},(_,i)=>base+(i*extra%segments<extra?1:0));
 // 실제 MIDI BPM이 있으면 크로스페이드 후의 경계를 마디·박자에
 // 가깝게 배치한다. MusicGen 호출 길이는 정수 초, 전체 길이는 유지한다.
 if(bpm!==null){
  if(!Number.isFinite(bpm)||bpm<40||bpm>240)
   throw Error('MIDI BPM은 40~240이어야 합니다.');
  const ideal=expected/segments;
  let states=new Map([[0,{cost:0,previous:null,duration:0}]]);
  const layers=[states];
  for(let part=1;part<=segments;part++){
   const next=new Map(),left=segments-part;
   for(const [sum,entry] of states){
    for(let duration=3;duration<=20;duration++){
     const total=sum+duration,remaining=expected-total;
     if(remaining<left*3||remaining>left*20)continue;
     let cost=entry.cost+.14*(duration-ideal)**2;
     if(part<segments){
      const seconds=total-part*fadeSec,beats=seconds*bpm/60;
      const beatDistance=Math.abs(beats-Math.round(beats));
      const barDistance=Math.abs(beats/4-Math.round(beats/4))*4;
      cost+=3*beatDistance**2+.65*barDistance**2;
     }
     const best=next.get(total);
     if(!best||cost<best.cost-1e-9)
      next.set(total,{cost,previous:sum,duration});
    }
   }
   if(!next.size)throw Error('MIDI 박자에 맞는 MusicGen 구간 시간표를 구성하지 못했습니다.');
   layers.push(next);states=next;
  }
  if(!states.has(expected))throw Error('MusicGen MIDI 구간 길이 합계 오류');
  const result=Array(segments);let sum=expected;
  for(let part=segments;part>=1;part--){
   const entry=layers[part].get(sum);
   result[part-1]=entry.duration;sum=entry.previous;
  }
  segmentSeconds=result;
 }
 // Above distribution is deterministic, bounded, and keeps all stems on one absolute clock.
 const audioSec=segmentSeconds.reduce((s,n)=>s+n,0)-(segments-1)*fadeSec;
 if(audioSec<scoreSec||audioSec-scoreSec>1.01||
    segmentSeconds.some(n=>n<3||n>20))
  throw Error('MusicGen 악기 생성 시간표가 6분 원본 MIDI를 벗어납니다.');
 const boundariesSec=segmentSeconds.slice(0,-1).map((_,i)=>
  segmentSeconds.slice(0,i+1).reduce((sum,n)=>sum+n,0)-(i+1)*fadeSec);
 return {segmentSeconds,targetSec:scoreSec,generatedSec:audioSec,excessSec:audioSec-scoreSec,boundariesSec};
}
export async function trimMusicGenWavToScore(blob,targetSec){
 if(!(blob instanceof Blob)||blob.type!=='audio/wav'||
    !Number.isFinite(targetSec)||targetSec<150||targetSec>360)
  throw Error('MusicGen 생성 WAV와 실제 MIDI 목표 길이가 올바르지 않습니다.');
 const bytes=new Uint8Array(await blob.arrayBuffer());
 if(bytes.length<44||String.fromCharCode(...bytes.subarray(0,4))!=='RIFF'||
    String.fromCharCode(...bytes.subarray(8,12))!=='WAVE'||
    String.fromCharCode(...bytes.subarray(12,16))!=='fmt '||
    String.fromCharCode(...bytes.subarray(36,40))!=='data')
  throw Error('MusicGen 원본은 표준 PCM16 WAV여야 합니다.');
 const v=new DataView(bytes.buffer);
 const codec=v.getUint16(20,true),channels=v.getUint16(22,true),
  rate=v.getUint32(24,true),bits=v.getUint16(34,true),data=v.getUint32(40,true);
 if(codec!==1||bits!==16||![1,2].includes(channels)||rate<8000||rate>96000||
    v.getUint32(4,true)+8!==bytes.length||44+data!==bytes.length||
    data%(channels*2)!==0)
  throw Error('MusicGen 원본 PCM 형식·길이가 손상됐습니다.');
 const present=data/(rate*channels*2),frames=Math.round(targetSec*rate);
 if(present+0.02<targetSec||present-targetSec>1.05||
    frames<1||frames*channels*2>data)
  throw Error('MusicGen 모델이 실제 MIDI 곡의 필요한 길이를 만들지 못했습니다.');
 const out=bytes.slice(0,44+frames*channels*2);
 const header=new DataView(out.buffer);
 header.setUint32(4,out.byteLength-8,true);
 header.setUint32(40,out.byteLength-44,true);
 // 실제 3~6분 MIDI 길이로 PCM을 재단할 때 음표 중간에서 발생하는
 // 최종 클릭을 방지한다. 원본 WAV는 수정하지 않고 새 출력의 마지막 20ms만 감쇠.
 const fadeFrames=Math.min(frames,Math.max(1,Math.round(rate*.02)));
 for(let i=0;i<fadeFrames;i++){
  const factor=fadeFrames===1?0:(fadeFrames-1-i)/(fadeFrames-1);
  const frame=frames-fadeFrames+i;
  for(let channel=0;channel<channels;channel++){
   const p=44+(frame*channels+channel)*2;
   header.setInt16(p,Math.round(header.getInt16(p,true)*factor),true);
  }
 }
 return new File([out],'MYVOCAL-신경망-6악기-MIDI동기화.wav',{type:'audio/wav'});
}
