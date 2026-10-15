// STEP99: deterministic project safety/readiness audit. Windows hardware checks require actual Windows.
import {exportCapabilities98} from './finalExport98.js';
export function auditIntegration99(data,project,{windowsReal=false,gpuReal=false,aiModelsReal=false}={}){
 const items=[];const add=(id,label,ok,detail='',kind='automated')=>items.push({id,label,status:ok?'pass':'blocked',detail,kind});
 add('project','프로젝트 식별자',!!project?.id&&Array.isArray(project.tracks),'저장 구조 필수 필드');
 add('tracks','오디오·MIDI 트랙',!!project?.tracks?.length,'실제 오디오 재생 품질 미판정');
 add('storyboard','영상 장면',!!project?.scenes?.length&&project.scenes.every(s=>Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.end>s.start),'장면 시간 검증');
 const charIds=new Set((data?.characters||[]).map(c=>c.id));
 add('characterLinks','캐릭터 연결',![project?.characterId,...(project?.scenes||[]).map(s=>s.characterId)].filter(Boolean).some(id=>!charIds.has(id)),'연결된 프로필 참조');
 const media=exportCapabilities98(project,undefined);
 add('wav','WAV로 렌더링할 오디오',media.wav,'출력 전 실제 렌더링 필요');
 add('midi','MIDI 음표',media.midi,'출력 시 MIDI 파서 재검증 필요');
 add('lyrics','정렬된 가사 자막',media.srt,'정렬이 없는 경우 자동으로 시간을 날조하지 않음');
 add('windows','실제 Windows 10/11 EXE 실행',windowsReal,'Linux 크로스빌드는 실제 Windows 동작의 증거가 아님','manual');
 add('gpu','실제 GPU 렌더링 및 인코딩',gpuReal,'브라우저·GPU 실기기 검사 필요','manual');
 add('aiModels','실제 AI 음악·가창·영상 모델 종단 간 추론',aiModelsReal,'모델 및 권한 있는 데이터로 출력물을 검사해야 함','manual');
 return {format:'MYVOCAL_INTEGRATION_AUDIT99',version:1,projectId:project?.id||'',items,passed:items.filter(i=>i.status==='pass').length,blocked:items.filter(i=>i.status==='blocked').length};
}
