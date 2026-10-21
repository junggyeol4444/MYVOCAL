// MusicGen 실제 WAV 연결부의 클릭음을 줄이는 매끄러운 크로스페이드 가중치.
// 원본 WAV, 트랙, 모델은 변경하지 않는다. 신경망 작곡 품질을 보증하지 않는다.
export function smoothMusicGenCrossfade(t){
 if(!Number.isFinite(t)||t<0||t>1)throw Error('MusicGen 연결 구간의 시간 비율이 올바르지 않습니다.');
 return t*t*(3-2*t);
}
