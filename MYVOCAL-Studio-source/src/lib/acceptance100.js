// STEP100: do not mark the product complete without end-to-end real-machine evidence.
import {auditIntegration99} from './integrationAudit99.js';
export const ACCEPTANCE100_REQUIREMENTS=Object.freeze(['windows','gpu','aiModels']);
export function acceptance100(data,project,evidence={}){
 const audit=auditIntegration99(data,project,evidence);
 const required=new Set(['project','tracks','storyboard','characterLinks','wav','midi','lyrics',...ACCEPTANCE100_REQUIREMENTS]);
 const blocking=audit.items.filter(item=>required.has(item.id)&&item.status!=='pass');
 return {format:'MYVOCAL_ACCEPTANCE100',version:1,projectId:project?.id||'',ready:blocking.length===0,blocking:blocking.map(i=>({id:i.id,detail:i.detail})),audit,statement:blocking.length?'최종 완성 검증 미통과: 미검증 또는 미완료 조건이 남아 있습니다.':'전 항목 증거 확보 필요: 기록된 실기기 증빙 원본을 별도 확인해야 합니다.'};
}
