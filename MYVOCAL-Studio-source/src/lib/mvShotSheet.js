// Step74: deterministic, offline, metadata-only storyboard contact sheets.
// SVG contains no external references, dynamic markup, images, lyrics, or binary media.
import {buildMvAnimatic, formatAnimaticTime} from './mvAnimatic.js';

export const MV_SHOT_SHEET_PAGE_SIZE=12;
const WIDTH=1200, COLUMNS=3, CELL_W=368, CELL_H=262, LEFT=30, TOP=135;
const xml=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const clean=value=>String(value??'').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g,' ').trim();
// Avoid splitting surrogate pairs and cap user-authored display content in each frame.
const shorten=(value,limit)=>{const points=Array.from(clean(value));return points.length>limit?points.slice(0,limit-1).join('')+'…':points.join('');};
const text=(x,y,string,{size=16,weight=400,fill='#dae5f2'}={})=>`<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${xml(string)}</text>`;
const rect=(x,y,w,h,fill,rx=0)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`;
const line=(x1,y1,x2,y2,color='#45576c')=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.5"/>`;

export function buildMvShotSheet(project,characters=[],page=1){
 const timeline=buildMvAnimatic(project,characters);
 if(!Number.isSafeInteger(page)||page<1)throw Error('컷 시트 페이지는 1 이상의 정수여야 합니다.');
 const pages=Math.ceil(timeline.sceneCount/MV_SHOT_SHEET_PAGE_SIZE);
 if(page>pages)throw Error('존재하지 않는 컷 시트 페이지입니다.');
 const charNames=new Map((Array.isArray(characters)?characters:[]).filter(c=>c&&typeof c.id==='string').map(c=>[c.id,typeof c.name==='string'?c.name:c.id]));
 const items=timeline.scenes.slice((page-1)*MV_SHOT_SHEET_PAGE_SIZE,page*MV_SHOT_SHEET_PAGE_SIZE);
 const rows=Math.ceil(items.length/COLUMNS),height=TOP+rows*CELL_H+45;
 const parts=[`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-label="MYVOCAL storyboard shot sheet">`,rect(0,0,WIDTH,height,'#0b1320'),rect(0,0,WIDTH,9,'#6587b8'),text(30,48,'MYVOCAL  /  STORYBOARD SHOT SHEET',{size:27,weight:700,fill:'#f7fbff'}),text(30,80,`Project: ${shorten(timeline.projectId,45)}    •    Page ${page} / ${pages}    •    Scenes ${timeline.sceneCount}`,{size:16}),text(30,104,'Manual scene plan only · No rendered frames or AI-generated images',{size:14,fill:'#aebcd0'})];
 for(let n=0;n<items.length;n++){
  const s=items[n],index=(page-1)*MV_SHOT_SHEET_PAGE_SIZE+n+1,col=n%COLUMNS,row=Math.floor(n/COLUMNS),x=LEFT+col*(CELL_W+18),y=TOP+row*CELL_H;
  const figure=charNames.get(s.characterId)||s.characterId||'No character';
  const start=formatAnimaticTime(s.start).slice(3),end=formatAnimaticTime(s.end).slice(3);
  parts.push(rect(x,y,CELL_W,CELL_H-14,'#182638',11),rect(x+12,y+12,CELL_W-24,128,'#273a50',7));
  parts.push(text(x+24,y+36,`SHOT ${String(index).padStart(3,'0')}`,{size:15,weight:700,fill:'#b4daff'}));
  // Deliberately abstract placeholder: NOT extracted/generated video imagery.
  parts.push(rect(x+37,y+54,CELL_W-74,67,'#314962',8));
  parts.push(text(x+CELL_W/2-81,y+87,'PLANNED SHOT',{size:21,weight:700,fill:'#d6e7fb'}));
  parts.push(text(x+CELL_W/2-70,y+109,'NO IMAGE FRAMES',{size:11,fill:'#b2c4d7'}));
  parts.push(text(x+18,y+160,shorten(s.title||'Untitled',28),{size:19,weight:700,fill:'#ffffff'}));
  parts.push(text(x+18,y+184,`${start}  →  ${end}  (${s.duration}s)`,{size:13,fill:'#a8d8ff'}));
  parts.push(text(x+18,y+208,`Cast: ${shorten(figure,35)}`,{size:13}));
  parts.push(text(x+18,y+230,`Camera: ${shorten(s.camera||'Unspecified',34)}`,{size:13}));
  parts.push(text(x+18,y+249,`Action: ${shorten(s.action||s.description||'Unspecified',33)}`,{size:12,fill:'#b9c7d8'}));
 }
 parts.push(text(30,height-15,`Page ${page}/${pages}  ·  Offline export  ·  Edit scene details in Video Studio`,{size:12,fill:'#91a7c2'}),'</svg>');
 const svg=parts.join('\n');
 return {format:'myvocal-shot-sheet-svg',version:1,projectId:timeline.projectId,page,pageCount:pages,sceneCount:timeline.sceneCount,renderedSceneCount:items.length,svg};
}
