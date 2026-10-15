import {putFile,getFile,removeFile} from './assetDb.js';

// Feature status is based on implemented code, not the number in the version name.
export const CAPABILITY_AUDIT=[
 {key:'editor',name:'프로젝트 / 기본 음악 편집',state:'basic',detail:'프로젝트·트랙·가사·WAV 재생·기본 믹싱 작동. 정식 DAW 수준은 아님'},
 {key:'midi',name:'MIDI 작곡 / 피아노 롤',state:'basic',detail:'MIDI 음표 편집, 코드, 내장 합성음, MIDI 교환 구현'},
 {key:'composer',name:'AI 작사 / 작곡 / 편곡',state:'partial',detail:'가사 템플릿과 규칙 기반 MIDI 생성은 오프라인 사용 가능. 신경망 음악 생성 AI는 미구현'},
 {key:'voice',name:'목소리 녹음 / 분석 / 데이터셋',state:'partial',detail:'녹음·기초 피치·품질 검사·학습 자료 수집. 신경망 학습은 미구현'},
 {key:'singing',name:'실제 AI Voice Training / Singing',state:'blocked',detail:'외부 엔진 인터페이스·샘플 기반 미리보기만 있음. 학습된 모델과 추론 실행 환경이 필요'},
 {key:'characters',name:'캐릭터 / 사람 / 가상 가수',state:'partial',detail:'등록과 라이브러리 연결만 가능. Identity Lock 생성 보장은 불가'},
 {key:'storyboard',name:'영상 스토리보드',state:'basic',detail:'씬·캐릭터·카메라·의상 계획 편집. 실제 영상 프레임 생성 기능은 없음'},
 {key:'video',name:'AI MV / Lip Sync / 2D·3D 애니메이션',state:'blocked',detail:'모션, 립싱크, 영상 생성·출력 엔진이 아직 없음'},
 {key:'delivery',name:'Windows 배포 / 실기기 검증',state:'partial',detail:'Windows EXE 교차 빌드. 실제 Windows PC 실행·장치 테스트 필요'}
];
export const STATUS_NAMES={basic:'기본 구현',partial:'부분 구현',blocked:'핵심 미구현'};
export function capabilityCounts(items=CAPABILITY_AUDIT){return items.reduce((v,c)=>({...v,[c.state]:(v[c.state]||0)+1}),{basic:0,partial:0,blocked:0})}
export function systemCheckLabels(){return {desktop_browser:'데스크톱 화면 엔진',data_folder:'앱 데이터 저장 폴더',app_server:'앱 내부 로컬 서버'}}
export function summarizeReadiness(report,stored){
 const checks=report?.checks||[];
 return {
   ready:checks.filter(c=>c.available).length,
   checks:checks.length,
   storage:stored===true,
   engine:report?.managedEngineRunning===true,
   neural:report?.bundledNeuralSinging===true,
   video:report?.bundledVideoGenerator===true,
 };
}
export async function checkAssetPersistence(){
 if(typeof indexedDB==='undefined')throw new Error('IndexedDB를 사용할 수 없습니다.');
 const id='diag_v18_'+Date.now()+'_'+Math.random().toString(36).slice(2);
 try{
  const test=new Blob(['myvocal asset round-trip v1.8'],{type:'text/plain'});
  await putFile(id,test);
  const received=await getFile(id);
  if(!received||await received.text()!==await test.text())throw Error('오디오·이미지 저장소의 읽기 결과가 일치하지 않습니다.');
  return true;
 }finally{await removeFile(id).catch(()=>{})}
}
