// 3~6분 MusicGen 연속 생성 중 동일 PCM 응답을 잘못 이어 붙이지 않는다.
// 파형 완전 동일만 검출한다. 음악적 유사성·지속성을 보증하지 않는다.
export function assertFreshMusicGenPcm(current,previous){
 if(!current||!previous||!(current.pcm instanceof Uint8Array)||!(previous.pcm instanceof Uint8Array))
  throw Error('MusicGen 구간 비교용 실제 PCM이 없습니다.');
 if(current.rate!==previous.rate||current.channels!==previous.channels||current.frames!==previous.frames)
  return true;
 const a=current.pcm,b=previous.pcm;
 if(a.byteLength!==b.byteLength)return true;
 let equal=true;
 for(let i=0;i<a.byteLength;i++){
  if(a[i]!==b[i]){equal=false;break;}
 }
 if(equal)throw Error('MusicGen이 이전 구간과 동일한 WAV를 다시 반환했습니다. 기존 자료는 보존합니다.');
 return true;
}
