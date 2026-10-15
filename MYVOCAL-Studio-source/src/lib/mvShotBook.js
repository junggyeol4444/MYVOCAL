// Step75 — deterministic, offline, print-ready *manual storyboard* book.
// Embeds Step74's sanitized SVGs only; never fetches media or invokes an AI model.
import {buildMvShotSheet,MV_SHOT_SHEET_PAGE_SIZE} from './mvShotSheet.js';
import {buildMvAnimatic} from './mvAnimatic.js';

export const MV_SHOT_BOOK_FORMAT='myvocal-printable-shot-book';
const escapeHtml=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

export function buildMvShotBook(project,characters=[]){
 const timeline=buildMvAnimatic(project,characters); // reject invalid IDs, overlaps, unsupported scene fields
 const count=Math.ceil(timeline.sceneCount/MV_SHOT_SHEET_PAGE_SIZE);
 if(!Number.isSafeInteger(count)||count<1||count>22)throw Error('출력 페이지 수가 올바르지 않습니다.');
 const pages=[];
 for(let i=1;i<=count;i++)pages.push(buildMvShotSheet(project,characters,i).svg);
 // No external URLs, scripts, images, video, or user data beyond previously sanitized scene metadata.
 const sections=pages.map((svg,i)=>`<section class="sheet" aria-label="컷 시트 ${i+1}페이지">${svg}</section>`).join('\n');
 const html=`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; object-src 'none'">
<title>MYVOCAL 컷북 - ${escapeHtml(timeline.projectId)}</title>
<style>
@page { size: A4 portrait; margin: 10mm; }
* { box-sizing: border-box; }
html { background: #e6eaf0; }
body { margin: 0; padding: 18px; font-family: Arial, sans-serif; color: #102030; }
header { max-width: 1000px; margin: 0 auto 18px; }
header p { font-size: 14px; }
.sheet { margin: 0 auto 22px; max-width: 1000px; background: #0b1320; break-after: page; page-break-after: always; }
.sheet:last-child { break-after: auto; page-break-after: auto; }
.sheet svg { width: 100%; height: auto; display: block; }
@media print { html { background: white; } body { padding: 0; } header { display: none; } .sheet { width: 100%; max-width: none; margin: 0; break-inside: avoid; page-break-inside: avoid; } }
</style></head><body><header><h1>MYVOCAL · 전체 스토리보드 컷북</h1><p>프로젝트: ${escapeHtml(timeline.projectId)} · ${timeline.sceneCount}컷 · ${count}페이지 · 인쇄 대화상자에서 PDF 저장 가능</p><p>수동 제작 계획만 표시됩니다. 실제 영상 프레임·원본 미디어·AI 생성 이미지는 포함하지 않습니다.</p></header>
<main>${sections}</main></body></html>`;
 return {format:MV_SHOT_BOOK_FORMAT,version:1,projectId:timeline.projectId,sceneCount:timeline.sceneCount,pageCount:count,mediaIncluded:false,generatedFrames:false,html};
}
