// 3~6분 한국어 신경망 MIDI 작곡 길이에 실제 MusicGen WAV 길이를 맞춘다.
// 6악기는 동일 시간표를 사용하며 원래 모델 응답은 절대 수정하지 않는다.
export function planScoreMatchedMusicGenSegments(scoreSec,segments,{fadeSec=.5}={}){
 if(!Number.isFinite(scoreSec)||scoreSec<150||scoreSec>360||
    !Number.isInteger(segments)||![11,20].includes(segments)||
    !Number.isFinite(fadeSec)||fadeSec<.1||fadeSec>1.5)
  throw Error('원본 3~6분 신경망 MIDI 악기 길이 또는 MusicGen 구간이 올바르지 않습니다.');
 const expected=Math.ceil(scoreSec+(segments-1)*fadeSec);
 if(expected<segments*3||expected>segments*20)
  throw Error('현재 MusicGen 구간 수로 실제 MIDI 곡 길이를 재생할 수 없습니다.');
 const base=Math.floor(expected/segments),extra=expected-base*segments;
 const segmentSeconds=Array.from({length:segments},(_,i)=>base+(i*extra%segments<extra?1:0));
 // Above distribution is deterministic, bounded, and keeps all stems on one absolute clock.
 const audioSec=segmentSeconds.reduce((s,n)=>s+n,0)-(segments-1)*fadeSec;
 if(audioSec<scoreSec||audioSec-scoreSec>1.01||
    segmentSeconds.some(n=>n<3||n>20))
  throw Error('MusicGen 악기 생성 시간표가 6분 원본 MIDI를 벗어납니다.');
 return {segmentSeconds,targetSec:scoreSec,generatedSec:audioSec,excessSec:audioSec-scoreSec};
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
