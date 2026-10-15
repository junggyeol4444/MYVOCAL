import React,{useState} from 'react';
import {Button,Field,Notice} from './UI';
import {createExpressionPlan,validateExpressionPlan,saveExpressionPlan,expressionLines,parseExpressionLines,expressionAt} from '../lib/characterExpressionDirector.js';
const LABELS={auto:'가사 규칙 자동',neutral:'기본',happy:'기쁨',sad:'슬픔',angry:'분노',relaxed:'평온',surprised:'놀람'};
export default function CharacterExpressionEditor({character,onSave,notify}){
 const initial=()=>{try{if(character.expression87)return expressionLines(validateExpressionPlan(character,character.expression87));}catch{}try{return expressionLines(createExpressionPlan(character));}catch{return '';}};
 const [source,setSource]=useState(initial),[time,setTime]=useState(0);
 let plan=null,error='';try{plan=parseExpressionLines(character,source);}catch(e){error=e.message;}
 const duration=plan?.cues.at(-1)?.endMs/1000||0,active=plan?expressionAt(character,plan,Math.min(time,duration)):null;
 const rebuild=()=>{try{setSource(expressionLines(createExpressionPlan(character)));setTime(0);notify('현재 STEP85 음소 기준으로 표정 타임라인을 다시 만들었습니다. 저장 전에는 기존 설정이 유지됩니다.');}catch(e){notify(e.message);}};
 return <div className="modal-form" style={{maxHeight:'75vh',overflowY:'auto'}}>
  <Notice>**STEP87 · AI 표정 연출** — STEP85 가사·음소 타이밍에서 감정 단어를 규칙 기반으로 분석합니다. 보컬 Dynamics(강약)와 음악 에너지(0~1)는 사용자가 직접 검토·설정합니다. 실제 학습된 감정 AI나 오디오 에너지 자동 분석은 아닙니다. 저장하면 기존 STEP82 2D와 STEP83·84 3D 캐릭터 미리보기/녹화에 시간별 표정이 반영됩니다. VRM 표정 모프가 없는 모델에서는 해당 표정이 보이지 않을 수 있습니다.</Notice>
  <p>감정 값: {Object.entries(LABELS).map(([key,label])=>`${key}=${label}`).join(' · ')}</p>
  <Field label="시작초,종료초,감정(auto/happy/sad/angry/relaxed/surprised/neutral),강약(0~1),에너지(0~1)"><textarea rows={10} value={source} onChange={e=>setSource(e.target.value)} spellCheck={false}/></Field>
  {error?<p role="alert">입력 확인: {error}</p>:<><p>표정 구간 {plan.cues.length}개 · {duration.toFixed(2)}초</p><Field label="표정 타임라인 확인"><input type="range" aria-label="표정 연출 시간" min={0} max={Math.max(.001,duration)} step=".01" value={Math.min(time,duration)} onChange={e=>setTime(Number(e.target.value))} style={{width:'100%'}}/></Field><p aria-live="polite">{time.toFixed(2)}초 · {active?`${LABELS[active.expression]} (${Math.round(active.weight*100)}%) · ${active.source} · 가사: ${active.lyric||'(없음)'}`:'표정 없음 / 재생 구간 밖'}</p></>}
  <div className="modal-actions"><Button onClick={rebuild}>현재 가사 기준 타임라인 재생성</Button><Button variant="primary" disabled={!!error} onClick={()=>{try{onSave(saveExpressionPlan(character,plan));notify('STEP87 표정 타임라인 저장 완료 · 기존 가사와 캐릭터 자산 유지');}catch(e){notify('표정 저장 실패: '+e.message);}}}>표정 연출 저장</Button></div>
  <Notice>가사에 감정 단어가 없으면 기본 표정을 사용하며 높은 에너지에서는 놀람, 낮은 에너지에서는 평온을 선택합니다. 자동 추정은 검토 가능한 보조 기능이며 임의로 사용자의 가사·음소·영상 원본을 변경하지 않습니다.</Notice>
 </div>;
}
