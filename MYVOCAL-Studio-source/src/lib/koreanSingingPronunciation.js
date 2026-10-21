// MYVOCAL 한국어 가창 음소 힌트: 실제 가사와 MIDI 타이밍은 절대 수정하지 않는다.
// 한글 받침 연음·일부 비음화의 발음 힌트만 바꾼다. 사전 기반 전체 G2P/강제 정렬이 아니다.
const LINK={
 'ㄱ':['','ㄱ'],'ㄲ':['','ㄲ'],'ㄳ':['ㄱ','ㅅ'],'ㄴ':['','ㄴ'],
 'ㄵ':['ㄴ','ㅈ'],'ㄶ':['ㄴ',''],'ㄷ':['','ㄷ'],'ㄹ':['','ㄹ'],
 'ㄺ':['ㄹ','ㄱ'],'ㄻ':['ㄹ','ㅁ'],'ㄼ':['ㄹ','ㅂ'],'ㄽ':['ㄹ','ㅅ'],
 'ㄾ':['ㄹ','ㅌ'],'ㄿ':['ㄹ','ㅍ'],'ㅀ':['ㄹ',''],'ㅁ':['','ㅁ'],
 'ㅂ':['','ㅂ'],'ㅄ':['ㅂ','ㅆ'],'ㅅ':['','ㅅ'],'ㅆ':['','ㅆ'],
 'ㅈ':['','ㅈ'],'ㅊ':['','ㅊ'],'ㅋ':['','ㅋ'],'ㅌ':['','ㅌ'],
 'ㅍ':['','ㅍ'],'ㅎ':['','']
};
const ASPIRATE={'ㄱ':'ㅋ','ㄷ':'ㅌ','ㅈ':'ㅊ'};
const CODA_END={'ㄲ':'ㄱ','ㅋ':'ㄱ','ㄳ':'ㄱ','ㄺ':'ㄱ','ㅅ':'ㄷ','ㅆ':'ㄷ','ㅈ':'ㄷ','ㅊ':'ㄷ','ㅌ':'ㄷ','ㅎ':'ㄷ','ㅍ':'ㅂ','ㅄ':'ㅂ'};
const NASAL={
 'ㄱ':'ㅇ','ㄲ':'ㅇ','ㅋ':'ㅇ','ㄳ':'ㅇ','ㄺ':'ㅇ',
 'ㄷ':'ㄴ','ㅅ':'ㄴ','ㅆ':'ㄴ','ㅈ':'ㄴ','ㅊ':'ㄴ','ㅌ':'ㄴ',
 'ㅂ':'ㅁ','ㅍ':'ㅁ','ㅄ':'ㅁ'
};
// 배열 요소: {syllable, hint:{onset,nucleus,coda}|null,startSec,endSec,breakBefore}.
// 결과는 원본의 길이/시간/글자를 유지한 새 힌트 배열이다.
export function contextualKoreanSingingHints(units){
 if(!Array.isArray(units)||units.length>8192)throw Error('한국어 가창 음소 힌트 입력이 올바르지 않습니다.');
 const result=units.map(u=>u?.hint?{...u.hint}:null);
 for(let i=0;i+1<units.length;i++){
  const current=units[i],next=units[i+1],a=result[i],b=result[i+1];
  if(!a||!b||!a.coda||next.breakBefore||
    !Number.isFinite(current.endSec)||!Number.isFinite(next.startSec)||
    next.startSec-current.endSec>0.03||next.startSec-current.endSec<-.001)continue;
  if(['ㅎ','ㄶ','ㅀ'].includes(a.coda)&&ASPIRATE[b.onset]){
   a.coda=a.coda==='ㅎ'?'':a.coda==='ㄶ'?'ㄴ':'ㄹ';
   b.onset=ASPIRATE[b.onset];
  }else if(b.onset==='ㅇ'&&a.coda!=='ㅇ'){
   const split=LINK[a.coda];
   if(split){a.coda=split[0];b.onset=split[1]||'ㅇ';}
  }else if(b.onset==='ㄴ'||b.onset==='ㅁ'){
   a.coda=NASAL[a.coda]||a.coda;
  }
 }
 // 음절 끝에서 7종성 대표음으로 수렴하는 단순 받침을 정규화한다.
 for(const h of result)if(h?.coda&&Object.hasOwn(CODA_END,h.coda))h.coda=CODA_END[h.coda];
 return result;
}
