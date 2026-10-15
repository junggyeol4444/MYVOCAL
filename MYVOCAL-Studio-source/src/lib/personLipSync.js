// STEP86: offline *person-video* lip synchronisation. Uses real user-authorized video
// frames, manually calibrated mouth ROI, and STEP85 reviewed phoneme timestamps.
// This is local geometric compositing, not AI face reenactment or face tracking.
import {validateLipSync,visemeAt} from './characterLipSync.js';

export const PERSON_LIP_AUDIO_MAX_BYTES=40*1024*1024;
const supportedVideo=/\.(mp4|webm|mov|m4v)$/i;
const supportedAudio=/\.(wav|mp3|m4a|ogg|oga|webm|flac)$/i;
export function personVideoAssets(character){return (character?.assets||[]).filter(a=>a?.id&&supportedVideo.test(a.name||'')&&typeof a.type==='string'&&a.type.startsWith('video/'));}
export function personAudioAssets(character){return (character?.assets||[]).filter(a=>a?.id&&supportedAudio.test(a.name||'')&&typeof a.type==='string'&&a.type.startsWith('audio/'));}
export function validatePersonLipAudio(file){
 if(!file||typeof file.name!=='string'||!supportedAudio.test(file.name)||!file.type?.startsWith('audio/')||!Number.isSafeInteger(file.size)||file.size<=0||file.size>PERSON_LIP_AUDIO_MAX_BYTES)throw Error('가창 오디오는 WAV/MP3/M4A/OGG/WebM/FLAC 형식이며 40MB 이하여야 합니다.');
 return file;
}
export function createPersonLipSettings(character){return {version:1,videoAssetId:personVideoAssets(character)[0]?.id||'',audioAssetId:personAudioAssets(character)[0]?.id||'',mouth:{x:.42,y:.62,width:.16,height:.10},offsetMs:0,strength:.8,duration:10};}
export function validatePersonLipSettings(character,settings){
 if(character?.kind!=='person'||!['owned','self','licensed'].includes(character.rights)||(character.rights==='licensed'&&!character.rightsNote?.trim()))throw Error('본인 또는 명시적으로 허가받은 실제 사람만 사용할 수 있습니다.');
 if(!character.lipSync)throw Error('먼저 STEP85 음소·발음 시간표를 등록해야 합니다.');validateLipSync(character.lipSync);
 if(!character.lipSync.cues.length)throw Error('Lip Sync 음소 시간표가 비어 있습니다.');
 if(settings?.version!==1||!personVideoAssets(character).some(a=>a.id===settings.videoAssetId)||!personAudioAssets(character).some(a=>a.id===settings.audioAssetId))throw Error('등록된 실제 사람 영상과 가창 오디오를 선택해야 합니다.');
 const m=settings.mouth;
 if(!m||!['x','y','width','height'].every(k=>typeof m[k]==='number'&&Number.isFinite(m[k]))||m.x<0||m.y<0||m.width<.02||m.height<.02||m.width>.6||m.height>.6||m.x+m.width>1||m.y+m.height>1)throw Error('입 영역은 영상 안의 2~60% 크기여야 합니다.');
 if(!Number.isInteger(settings.offsetMs)||Math.abs(settings.offsetMs)>10000||!Number.isFinite(settings.strength)||settings.strength<0||settings.strength>1||!Number.isFinite(settings.duration)||settings.duration<2||settings.duration>30)throw Error('음소 시간 보정·입 움직임 강도·출력 길이를 확인하세요.');
 return settings;
}
export function savePersonLipSettings(character,settings){validatePersonLipSettings(character,settings);return {...character,personLipSync:{...settings,mouth:{...settings.mouth}},updatedAt:new Date().toISOString()};}
export function personMouthAt(character,settings,audioTime){
 if(!Number.isFinite(audioTime))throw Error('가창 재생 시간이 올바르지 않습니다.');
 const state=visemeAt(character.lipSync,Math.max(0,audioTime+settings.offsetMs/1000));
 const factors={sil:[.48,.16],A:[1.0,1.35],I:[1.35,.58],U:[.62,1.2],E:[1.22,.80],O:[.76,1.45],M:[.95,.10],F:[1.08,.23]};
 const [w,h]=factors[state.viseme]||factors.sil;
 const applied=state.weight*settings.strength;
 return {...state,widthScale:1+(w-1)*applied,heightScale:1+(h-1)*applied};
}
// Draw the unmodified frame first, then restrict the deformation to the mouth oval.
// Context, source media and output are supplied by the caller; no files are modified.
export function renderPersonLipFrame(ctx,video,character,settings,audioTime,width,height,{guide=false}={}){
 validatePersonLipSettings(character,settings);
 if(!ctx||!video||!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1)throw Error('영상 프레임을 그릴 수 없습니다.');
 ctx.clearRect(0,0,width,height);
 ctx.drawImage(video,0,0,width,height);
 const m=settings.mouth,sx=m.x*width,sy=m.y*height,sw=m.width*width,sh=m.height*height;
 const state=personMouthAt(character,settings,audioTime);
 if(state.weight>.001&&state.viseme!=='sil'){
  const midX=sx+sw/2,midY=sy+sh/2;
  ctx.save();ctx.beginPath();ctx.ellipse(midX,midY,sw*.55,sh*.65,0,0,2*Math.PI);ctx.clip();
  const dw=sw*state.widthScale,dh=sh*state.heightScale;
  ctx.drawImage(video,sx,sy,sw,sh,midX-dw/2,midY-dh/2,dw,dh);
  ctx.restore();
 }
 if(guide){ctx.save();ctx.strokeStyle='#25edcf';ctx.lineWidth=2;ctx.strokeRect(sx,sy,sw,sh);ctx.restore();}
 return state;
}
