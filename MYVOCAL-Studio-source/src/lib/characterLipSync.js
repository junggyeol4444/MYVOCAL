// STEP85: offline, explicitly timed phoneme-to-viseme character animation.
// No fabricated speech alignment: timing must be supplied or reviewed by the user.
export const VISEMES=['sil','A','I','U','E','O','M','F'];
const vowel={a:'A',ah:'A',aa:'A',ㅏ:'A',ㅑ:'A',ㅐ:'E',ㅒ:'E',e:'E',eh:'E',ㅔ:'E',ㅖ:'E',ㅓ:'O',ㅕ:'O',ㅗ:'O',ㅛ:'O',o:'O',oh:'O',u:'U',oo:'U',ㅜ:'U',ㅠ:'U',ㅡ:'U',i:'I',ee:'I',ㅣ:'I',ㅢ:'I',ㅚ:'E',ㅟ:'I',ㅘ:'A',ㅝ:'O',ㅙ:'E',ㅞ:'E',m:'M',b:'M',p:'M',ㅁ:'M',ㅂ:'M',ㅃ:'M',f:'F',v:'F'};
export function phonemeViseme(phoneme){if(typeof phoneme!=='string')throw Error('음소는 문자열이어야 합니다.');return vowel[phoneme.trim().toLowerCase()]||'sil';}
export function validateLipSync(value){
 if(!value||value.version!==1||!Array.isArray(value.cues)||value.cues.length>2000)throw Error('Lip Sync 형식 또는 2000개 제한 오류');
 let end=0;
 for(const c of value.cues){if(!c||typeof c.phoneme!=='string'||c.phoneme.length>32||typeof c.lyric!=='string'||c.lyric.length>120||!Number.isInteger(c.startMs)||!Number.isInteger(c.endMs)||c.startMs<end||c.endMs<=c.startMs||c.endMs>3600000||c.viseme!==phonemeViseme(c.phoneme))throw Error('음소·Viseme·타이밍이 잘못되었거나 겹칩니다.');end=c.endMs;}
 return value;
}
export function parseLipSyncLines(lines){if(typeof lines!=='string'||lines.length>120000)throw Error('입력 크기 제한 초과');
 const cues=lines.split(/\r?\n/).filter(x=>x.trim()).map(line=>{const a=line.split(',');if(a.length<3||a.length>4)throw Error('각 줄: 시작초,종료초,음소,가사');const startMs=Math.round(Number(a[0])*1000),endMs=Math.round(Number(a[1])*1000),phoneme=a[2].trim();return {startMs,endMs,phoneme,lyric:(a[3]||'').trim(),viseme:phonemeViseme(phoneme)};});
 return validateLipSync({version:1,cues});
}
export function visemeAt(lipSync,time){if(!lipSync)return {viseme:'sil',weight:0,lyric:''};validateLipSync(lipSync);const ms=Math.round(time*1000);const cue=lipSync.cues.find(c=>ms>=c.startMs&&ms<c.endMs);if(!cue)return {viseme:'sil',weight:0,lyric:''};const edge=Math.min(1,(ms-cue.startMs)/60,(cue.endMs-ms)/60);return {viseme:cue.viseme,weight:Math.max(0,edge),lyric:cue.lyric};}
export function saveLipSync(character,lipSync){validateLipSync(lipSync);if(!character?.id)throw Error('캐릭터가 필요합니다.');return {...character,lipSync:{version:1,cues:lipSync.cues.map(c=>({...c}))},updatedAt:new Date().toISOString()};}
export function lipSyncLines(lipSync){validateLipSync(lipSync);return lipSync.cues.map(c=>`${(c.startMs/1000).toFixed(3)},${(c.endMs/1000).toFixed(3)},${c.phoneme},${c.lyric}`).join('\n');}
