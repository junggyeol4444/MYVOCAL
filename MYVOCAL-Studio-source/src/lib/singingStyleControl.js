// 원본 66항 #7: 누구의 목소리인가(Voice)와 어떻게 부르는가(Singing Style) 분리.
// 신경망 Singing Style은 실제 설치된 로컬 엔진이 해당 스타일을 신고할 때만 활성화한다.
export const SINGING_STYLES=Object.freeze([
 'Natural','Ballad','Soft','Power','Rock','Whisper','Falsetto','Emotional'
]);
export function normalizeSingingStyle(style){
 const selected=style??'Natural';
 if(typeof selected!=='string'||!SINGING_STYLES.includes(selected))
  throw Error('노래 스타일은 Natural·Ballad·Soft·Power·Rock·Whisper·Falsetto·Emotional 중에서 선택하세요.');
 return selected;
}
export function assertSingingStyleSupported(style,capabilities,model){
 const selected=normalizeSingingStyle(style);
 if(selected==='Natural')return selected;
 // 지원하지 않는 모델을 스타일로 합성했다고 주장하거나 효과 없는 요청을 보내지 않는다.
 const registered=capabilities?.models?.find(x=>x.id===model?.id);
 const supported=Array.isArray(registered?.singingStyles)?registered.singingStyles:
  Array.isArray(capabilities?.singingStyles)?capabilities.singingStyles:[];
 if(!supported.includes(selected))
  throw Error('선택한 실제 신경망 Singing 엔진/모델은 '+selected+' 스타일을 지원한다고 신고하지 않았습니다. 엔진 모델 목록을 확인하세요.');
 return selected;
}
