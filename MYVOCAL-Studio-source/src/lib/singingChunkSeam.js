// 실제 한국어 6분 가창 PCM16 구간의 경계 클릭을 완화한다.
// 기존 음소·MIDI 길이와 사용자 원본 오디오를 변경하지 않는다.
export function smoothSingingPcm16ChunkEdges(output,{
 startFrame,frames,sampleRate,channels,fadeIn=false,fadeOut=false,dataOffset=44
}={}){
 if(!(output instanceof Uint8Array)||!Number.isSafeInteger(startFrame)||startFrame<0||
    !Number.isSafeInteger(frames)||frames<1||!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000||
    ![1,2].includes(channels)||!Number.isSafeInteger(dataOffset)||dataOffset<0||
    dataOffset+(startFrame+frames)*channels*2>output.byteLength)
  throw Error('가창 WAV 경계 보정 입력이 올바르지 않습니다.');
 const fadeFrames=Math.min(Math.round(sampleRate*.005),Math.floor(frames/4));
 if(!fadeFrames||(!fadeIn&&!fadeOut))return {fadeFrames:0};
 const view=new DataView(output.buffer,output.byteOffset,output.byteLength);
 const fade=(first,incoming)=>{
  for(let i=0;i<fadeFrames;i++){
   const ratio=incoming?(i+1)/(fadeFrames+1):(fadeFrames-i)/(fadeFrames+1);
   for(let channel=0;channel<channels;channel++){
    const at=dataOffset+((startFrame+first+i)*channels+channel)*2;
    const sample=view.getInt16(at,true);
    view.setInt16(at,Math.round(sample*ratio),true);
   }
  }
 };
 if(fadeIn)fade(0,true);
 if(fadeOut)fade(frames-fadeFrames,false);
 return {fadeFrames};
}
