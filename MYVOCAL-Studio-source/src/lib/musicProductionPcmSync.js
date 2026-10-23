// MYVOCAL Windows EXE: 원본 MusicGen·Demucs 실제 WAV 재생시간 보존 검사.
// 모든 검사는 읽기 전용. 입력 오디오, 모델, 기존 프로젝트를 변경하지 않는다.
const MAX_WAV=90*1024*1024;
const name=(bytes,at)=>String.fromCharCode(...bytes.subarray(at,at+4));
export async function inspectGeneratedMusicPcm(file,label='MusicGen WAV'){
 if(!(file instanceof Blob)||file.size<44||file.size>MAX_WAV)
  throw Error(label+' 파일이 없거나 WAV 크기 제한을 벗어났습니다.');
 // 전체 다중 악기 WAV를 메모리에 복제하지 않고 RIFF 구조만 읽는다.
 const bytes=new Uint8Array(await file.slice(0,Math.min(file.size,65536)).arrayBuffer());
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(name(bytes,0)!=='RIFF'||name(bytes,8)!=='WAVE'||view.getUint32(4,true)+8!==file.size)
  throw Error(label+' 실제 RIFF/WAVE 원본 파일 길이가 손상됐습니다.');
 let at=12,format=null,data=null;
 while(at+8<=file.size){
  if(at+8>bytes.length)throw Error(label+' WAV 헤더가 너무 길어 확인할 수 없습니다.');
  const tag=name(bytes,at),size=view.getUint32(at+4,true),start=at+8;
  if(size>file.size-start)throw Error(label+' WAV 청크 경계가 잘못됐습니다.');
  if(tag==='fmt '){
   if(format||size<16||start+16>bytes.length)throw Error(label+' WAV PCM 형식이 손상됐습니다.');
   format={codec:view.getUint16(start,true),channels:view.getUint16(start+2,true),
    rate:view.getUint32(start+4,true),byteRate:view.getUint32(start+8,true),
    align:view.getUint16(start+12,true),bits:view.getUint16(start+14,true)};
  }else if(tag==='data'){
   if(data||size===0||start+size>file.size)throw Error(label+' PCM 데이터가 손상됐습니다.');
   data={offset:start,bytes:size};
  }
  if(data&&format)break;
  at=start+size+(size&1);
 }
 if(!format||!data||format.codec!==1||format.bits!==16||
   ![1,2].includes(format.channels)||format.rate<8000||format.rate>96000||
   format.align!==format.channels*2||format.byteRate!==format.rate*format.align||
   data.bytes%format.align!==0)
  throw Error(label+' PCM16 샘플레이트·채널·프레임 정보가 일치하지 않습니다.');
 // 샘플레이트마다 실제 프레임을 사용해 시간축을 판정한다.
 const frames=data.bytes/format.align,durationSec=frames/format.rate;
 if(!Number.isFinite(durationSec)||durationSec<.1||durationSec>360.05)
  throw Error(label+' 실제 오디오 재생시간이 0.1~360초 범위를 벗어납니다.');
 return {...format,frames,durationSec};
}
function closeSeconds(a,b,maxError,label){
 if(Math.abs(a-b)>maxError)
  throw Error(label+': 실제 PCM 시간축 불일치 ('+a.toFixed(3)+'초 / '+b.toFixed(3)+'초). 원본을 유지합니다.');
}
export async function inspectDemucsMusicAlignment(original,stems,{signal,maxDifferenceSec=.08}={}){
 if(!Array.isArray(stems)||![4,6].includes(stems.length))
  throw Error('실제 Demucs 분리 악기가 4개 또는 6개 필요합니다.');
 if(signal?.aborted)throw Error('신경망 음악 동기화 확인을 취소했습니다.');
 const source=await inspectGeneratedMusicPcm(original,'MusicGen 원곡');
 const profiles=[];
 for(const stem of stems){
  if(signal?.aborted)throw Error('신경망 음악 동기화 확인을 취소했습니다.');
  if(!stem?.name)throw Error('Demucs 악기 이름이 누락됐습니다.');
  const pcm=await inspectGeneratedMusicPcm(stem.file,'Demucs '+stem.name);
  closeSeconds(source.durationSec,pcm.durationSec,maxDifferenceSec,'MusicGen/Demucs '+stem.name);
  if(pcm.channels!==2||pcm.rate!==44100)
   throw Error('Demucs 악기 '+stem.name+'은 44.1kHz 스테레오 PCM16이어야 합니다.');
  if(profiles.length&&pcm.frames!==profiles[0].frames)
   throw Error('Demucs 악기 WAV들은 동일한 실제 PCM 프레임 수여야 합니다.');
  profiles.push({name:stem.name,...pcm});
 }
 return {source,stems:profiles,durationSec:profiles[0].durationSec};
}
export async function inspectRemixedMusicAlignment(master,reference,{maxDifferenceSec=.005}={}){
 if(!reference||!Number.isFinite(reference.durationSec))
  throw Error('악기 동기화 기준이 없습니다.');
 const pcm=await inspectGeneratedMusicPcm(master,'최종 음악 마스터');
 closeSeconds(reference.durationSec,pcm.durationSec,maxDifferenceSec,'Demucs/마스터');
 if(pcm.rate!==44100||pcm.channels!==2||pcm.frames!==reference.stems[0].frames)
  throw Error('최종 마스터가 실제 분리 악기 PCM 프레임을 정확히 유지하지 못했습니다.');
 return pcm;
}
