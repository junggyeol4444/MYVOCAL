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
const CODA_END={'ㄲ':'ㄱ','ㅋ':'ㄱ','ㄳ':'ㄱ','ㄺ':'ㄱ','ㄵ':'ㄴ','ㄶ':'ㄴ','ㄻ':'ㅁ','ㄼ':'ㄹ','ㄽ':'ㄹ','ㄾ':'ㄹ','ㄿ':'ㅂ','ㅀ':'ㄹ','ㅅ':'ㄷ','ㅆ':'ㄷ','ㅈ':'ㄷ','ㅊ':'ㄷ','ㅌ':'ㄷ','ㅎ':'ㄷ','ㅍ':'ㅂ','ㅄ':'ㅂ'};
const TENSE={'ㄱ':'ㄲ','ㄷ':'ㄸ','ㅂ':'ㅃ','ㅅ':'ㅆ','ㅈ':'ㅉ'};
const STOP_CODA=new Set(['ㄱ','ㄲ','ㅋ','ㄳ','ㄺ','ㄷ','ㅅ','ㅆ','ㅈ','ㅊ','ㅌ','ㅎ','ㅂ','ㅍ','ㅄ','ㄿ']);
const H_ASPIRATE={'ㄱ':'ㅋ','ㄲ':'ㅋ','ㅋ':'ㅋ','ㄷ':'ㅌ','ㅅ':'ㅌ','ㅆ':'ㅌ','ㅈ':'ㅊ','ㅊ':'ㅊ','ㅌ':'ㅌ','ㅂ':'ㅍ','ㅍ':'ㅍ'};
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
  }else if(b.onset==='ㅎ'&&H_ASPIRATE[a.coda]){
   // 먹히다→머키다, 잡히다→자피다: 받침과 다음 ㅎ의 거센소리 결합.
   b.onset=H_ASPIRATE[a.coda];a.coda='';
  }else if(b.onset==='ㅇ'&&a.coda!=='ㅇ'){
   const original=a.coda,split=LINK[original];
   if(split){
    a.coda=split[0];b.onset=split[1]||'ㅇ';
    // 굳이→구지, 같이→가치: ㄷ/ㅌ 받침과 '이'의 구개음화.
    if(b.nucleus==='ㅣ'&&original==='ㄷ')b.onset='ㅈ';
    if(b.nucleus==='ㅣ'&&original==='ㅌ')b.onset='ㅊ';
   }
  }else if((a.coda==='ㄴ'&&b.onset==='ㄹ')||(a.coda==='ㄹ'&&b.onset==='ㄴ')){
   // 신라→실라, 설날→설랄: 연속 ㄴ/ㄹ의 유음화.
   a.coda='ㄹ';b.onset='ㄹ';
  }else if(b.onset==='ㄴ'||b.onset==='ㅁ'){
   a.coda=NASAL[a.coda]||a.coda;
  }else if(STOP_CODA.has(a.coda)&&TENSE[b.onset]){
   // 학교→학꾜, 국밥→국빱: 폐쇄음 받침 뒤 평음의 경음화.
   b.onset=TENSE[b.onset];
  }
 }
 // 음절 끝에서 7종성 대표음으로 수렴하는 단순 받침을 정규화한다.
 for(const h of result)if(h?.coda&&Object.hasOwn(CODA_END,h.coda))h.coda=CODA_END[h.coda];
 return result;
}
