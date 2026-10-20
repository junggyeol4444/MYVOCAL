// MYVOCAL Windows EXE: actual Korean lyric-aligned 2D lip-sync WebM.
// Requires a rights-cleared character portrait and actual vocal WAV.
import {assertUsableSingingWav} from './singingOutputValidation.js';

export function viseme2DAlignment(alignment){
 if(alignment?.format!=='MYVOCAL_LYRIC_ALIGNMENT'||alignment?.version!==1||!Array.isArray(alignment.cues)||alignment.cues.length<1||alignment.cues.length>400)
  throw Error('저장된 MYVOCAL 가사·MIDI 싱크(1~400개)가 필요합니다.');
 let prev=-1;
 const cues=alignment.cues.map(c=>({startSec:c.startSec,endSec:c.endSec,lyric:c.lyric}));
 for(const c of cues){
  if(!Number.isFinite(c.startSec)||!Number.isFinite(c.endSec)||c.startSec<prev||c.startSec<0||c.endSec>360||c.endSec-c.startSec<.05||typeof c.lyric!=='string'||[...c.lyric].length>100||/[\x00\r\n]/.test(c.lyric))
   throw Error('가사·MIDI 싱크 시간과 문자를 확인하세요.');
  prev=c.startSec;
 }
 return {format:'MYVOCAL_LYRIC_ALIGNMENT',version:1,cues};
}
function windowsExecutable(path,name){
 return typeof path==='string'&&path.length<2048&&(/^[A-Za-z]:[\\/]/.test(path)||/^\\\\[^\\]+\\/.test(path))&&new RegExp(`(?:^|[\\\\/])${name}\\.exe$`,'i').test(path);
}
export async function renderViseme2D({image,audio,soundtrack=null,sceneMode='static',alignment,python,ffmpeg,x=.5,y=.72,mouthWidth=.12,fps=12,size=512,rightsConfirmed=false},
 {session=globalThis.window?.__MYVOCAL_SESSION_KEY,request=fetch,signal}={}){
 if(!(image instanceof Blob)||image.size<44||image.size>12*1024*1024)throw Error('12MB 이하의 캐릭터 PNG/JPEG를 선택하세요.');
 if(!(audio instanceof Blob)||audio.size<44||audio.size>90*1024*1024)throw Error('90MB 이하의 실제 보컬 WAV가 필요합니다.');
 if(!windowsExecutable(python,'python')||!windowsExecutable(ffmpeg,'ffmpeg'))throw Error('설치된 Python.exe와 FFmpeg.exe의 절대 경로가 필요합니다.');
 if(!['static','performance','story','mixed'].includes(sceneMode))throw Error('2D MV 장면 모드를 확인하세요.');
 if(soundtrack!==null&&(!(soundtrack instanceof Blob)||soundtrack.size<44||soundtrack.size>90*1024*1024))throw Error('완성 음악 WAV 크기 오류');
 if(!session||typeof session!=='string')throw Error('Windows EXE 세션이 필요합니다.');
 if(!rightsConfirmed)throw Error('캐릭터 이미지와 보컬의 사용 권한을 확인하세요.');
 if(![x,y,mouthWidth].every(Number.isFinite)||x<.1||x>.9||y<.1||y>.9||mouthWidth<.03||mouthWidth>.3||![12,24].includes(fps)||![512,720].includes(size))
  throw Error('입 위치·크기·FPS·해상도 설정을 확인하세요.');
 const cues=viseme2DAlignment(alignment);
 assertUsableSingingWav(await audio.arrayBuffer(),{maxDurationSec:360});
 if(soundtrack)assertUsableSingingWav(await soundtrack.arrayBuffer(),{maxDurationSec:360});
 if(signal?.aborted)throw Error('2D 립싱크 렌더링이 취소됐습니다.');
 const body=new FormData();
 body.set('image',image,image.name||'character.png');
 body.set('audio',audio,audio.name||'vocal.wav');
 if(soundtrack)body.set('soundtrack',soundtrack,soundtrack.name||'full_music.wav');
 body.set('sceneMode',sceneMode);
 body.set('alignment',JSON.stringify(cues));
 for(const [k,v] of Object.entries({python,ffmpeg,x,y,mouthWidth,fps,size}))body.set(k,String(v));
 body.set('rights','confirmed');
 const response=await request('/api/mv/lipsync2d',{method:'POST',headers:{'X-MYVOCAL-Session':session},body,signal,cache:'no-store'});
 if(!response.ok){const err=await response.json().catch(()=>({error:`HTTP ${response.status}`}));throw Error(err.error||'2D 립싱크 WebM 생성 실패');}
 if(response.headers?.get('Content-Type')?.split(';')[0]!=='video/webm')throw Error('WebM 영상이 아닌 응답입니다.');
 const blob=await response.blob();
 if(blob.size<1000||blob.size>90*1024*1024)throw Error('2D 립싱크 WebM 크기 오류');
 const signature=new Uint8Array(await blob.slice(0,4).arrayBuffer());
 if(signature[0]!==0x1a||signature[1]!==0x45||signature[2]!==0xdf||signature[3]!==0xa3)throw Error('실제 WebM 파일 서명이 올바르지 않습니다.');
 return new File([blob],'MYVOCAL-2D-음악MV.webm',{type:'video/webm'});
}
