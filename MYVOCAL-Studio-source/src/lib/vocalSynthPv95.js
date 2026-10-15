// STEP95: deterministic image/lyrics effects plan; requires real aligned lyrics for syllable timing.
import {isAlignmentStale} from './lyricAlignment.js';
export const PV95_STYLES=Object.freeze(['2D Illustration','Anime','3D Stage','Lyric','Motion Graphic','Cyber','Rock']);
export const PV95_EFFECTS=Object.freeze(['none','pulse','shake','zoom','scanlines']);
export function validatePv95(settings){
 if(!settings||settings.version!==1||!PV95_STYLES.includes(settings.style)||!PV95_EFFECTS.includes(settings.effect)||!['center','lower','upper'].includes(settings.lyricPosition)||![24,30].includes(settings.fps)||!Number.isFinite(settings.intensity)||settings.intensity<0||settings.intensity>1)throw Error('PV 설정이 올바르지 않습니다.');
 return true;
}
export function savePv95(project,settings){validatePv95(settings);return {...project,pv95:{...settings}};}
export function pv95Cues(project){
 const plan=project?.vocalAlignment;
 if(!plan||isAlignmentStale(project,plan))return [];
 return (plan.cues||[]).filter(c=>Number.isFinite(c.startSec)&&Number.isFinite(c.endSec)&&c.endSec>c.startSec&&c.lyric&&c.lyric!=='—').map(c=>({text:String(c.lyric).slice(0,100),startSec:c.startSec,endSec:c.endSec})).slice(0,512);
}
export function pv95Frame(project,seconds){
 if(!Number.isFinite(seconds)||seconds<0)throw Error('프레임 시간이 올바르지 않습니다.');
 const scene=(project?.scenes||[]).find(s=>Number(s.start)<=seconds&&seconds<Number(s.end))||null;
 const cues=pv95Cues(project);const cue=cues.find(c=>c.startSec<=seconds&&seconds<c.endSec)||null;
 return {scene,lyric:cue?.text||'',hasAlignedLyrics:!!cues.length,progress:scene?Math.max(0,Math.min(1,(seconds-scene.start)/(scene.end-scene.start))):0};
}
export function pv95Duration(project){const end=Math.max(0,...(project?.scenes||[]).map(s=>Number(s.end)||0));if(!(end>0&&end<=7200))throw Error('유효한 PV 장면 시간이 없습니다.');return end;}
export function renderPv95Canvas(ctx,project,settings,seconds,image=null){
 validatePv95(settings);const {scene,lyric,hasAlignedLyrics,progress}=pv95Frame(project,seconds);
 const w=ctx.canvas.width,h=ctx.canvas.height,k=settings.intensity;
 ctx.save();try{
 const palette={Anime:['#13234a','#7ca4ea'],'2D Illustration':['#14243c','#64819f'],'3D Stage':['#080a18','#55459c'],Lyric:['#0b1025','#40667b'],'Motion Graphic':['#14162a','#df4e96'],Cyber:['#061522','#00b4be'],Rock:['#250d17','#bc3c50']}[settings.style];
 const bg=ctx.createLinearGradient(0,0,w,h);bg.addColorStop(0,palette[0]);bg.addColorStop(1,palette[1]);ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
 ctx.save();const beat=(Number(project?.bpm)||120)*seconds/60,phase=Math.sin(beat*Math.PI*2);
 if(settings.effect==='shake'){ctx.translate(Math.sin(seconds*29)*9*k,Math.cos(seconds*21)*6*k);}
 if(image){const sc=settings.effect==='zoom'?1+.13*k*progress:1+.035*k*Math.sin(seconds*.7);const iw=image.naturalWidth||image.width||w,ih=image.naturalHeight||image.height||h;const scale=Math.max(w/iw,h/ih)*sc;const dw=iw*scale,dh=ih*scale;ctx.drawImage(image,(w-dw)/2,(h-dh)/2,dw,dh);}
 else if(scene){ctx.fillStyle='rgba(255,255,255,.1)';ctx.fillRect(w*.15,h*.2,w*.7,h*.58);}
 ctx.restore();
 if(settings.effect==='pulse'){ctx.fillStyle=`rgba(255,255,255,${Math.max(0,phase)*.25*k})`;ctx.fillRect(0,0,w,h);}
 if(settings.effect==='scanlines'){ctx.fillStyle=`rgba(0,0,0,${.3*k})`;for(let y=0;y<h;y+=6)ctx.fillRect(0,y,w,2);}
 if(settings.style==='Cyber'||settings.style==='Motion Graphic'){ctx.strokeStyle='rgba(120,255,245,.45)';ctx.lineWidth=3;ctx.strokeRect(30,30,w-60,h-60);}
 if(settings.style==='Rock'){ctx.fillStyle=`rgba(255,70,110,${.1+.2*k})`;ctx.fillRect(w*.07,0,14,h);ctx.fillRect(w*.92,0,14,h);}
 if(scene){ctx.textAlign='left';ctx.fillStyle='#fff';ctx.font='bold 20px sans-serif';ctx.fillText(String(scene.title||'').slice(0,55),25,36,w-50);}
 const text=lyric||(hasAlignedLyrics?'':String(scene?.title||''));
 if(text){const y=settings.lyricPosition==='upper'?h*.24:settings.lyricPosition==='center'?h*.53:h*.85;ctx.font=`bold ${Math.round(h*.074)}px sans-serif`;ctx.textAlign='center';ctx.lineWidth=6;ctx.strokeStyle='rgba(0,0,0,.9)';ctx.strokeText(text,w/2,y,w*.9);ctx.fillStyle='#fff';ctx.fillText(text,w/2,y,w*.9);}
 return {sceneId:scene?.id||'',lyric,hasAlignedLyrics};
 }finally{ctx.restore();}
}
