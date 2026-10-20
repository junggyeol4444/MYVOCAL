// Offline structural verification of a rendered singing WAV. Does not attest AI model identity.
export function inspectSingingWav(input) {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  const fail = reason => ({valid:false, reason});
  if (b.byteLength < 44) return fail('WAV header is incomplete');
  const v = new DataView(b.buffer,b.byteOffset,b.byteLength);
  const tag = (p,n) => String.fromCharCode(...b.subarray(p,p+n));
  if(tag(0,4)!=='RIFF'||tag(8,4)!=='WAVE')return fail('Not a RIFF/WAVE file');
  if(v.getUint32(4,true)+8!==b.length)return fail('RIFF size mismatch');
  let fmt=null, data=null, offset=12;
  while(offset+8<=b.length){
    const id=tag(offset,4),size=v.getUint32(offset+4,true),start=offset+8;
    if(size>b.length-start)return fail('Truncated WAV chunk');
    if(id==='fmt '){
      if(size<16)return fail('Invalid format chunk');
      fmt={encoding:v.getUint16(start,true),channels:v.getUint16(start+2,true),sampleRate:v.getUint32(start+4,true),byteRate:v.getUint32(start+8,true),blockAlign:v.getUint16(start+12,true),bits:v.getUint16(start+14,true)};
    }
    if(id==='data')data={start,size};
    offset=start+size+(size%2);
  }
  if(!fmt||!data)return fail('Missing fmt or data chunk');
  const {encoding,channels,sampleRate,byteRate,blockAlign,bits}=fmt;
  if(![1,3].includes(encoding)||![16,24,32].includes(bits)|| (encoding===3&&bits!==32)||(encoding===1&&bits===32))return fail('Unsupported audio encoding');
  if(channels<1||channels>2||sampleRate<8000||sampleRate>192000||blockAlign!==channels*bits/8||byteRate!==sampleRate*blockAlign)return fail('Invalid audio format');
  if(data.size===0||data.size%blockAlign!==0)return fail('Invalid audio frame count');
  const frames=data.size/blockAlign;
  let peak=0,nonFinite=0;
  for(let p=data.start;p<data.start+data.size;p+=bits/8){
    let s;
    if(encoding===3)s=v.getFloat32(p,true);
    else if(bits===16)s=v.getInt16(p,true)/32768;
    else {let x=b[p]|(b[p+1]<<8)|(b[p+2]<<16);if(x&0x800000)x-=0x1000000;s=x/8388608;}
    if(!Number.isFinite(s)){nonFinite++;continue;}
    peak=Math.max(peak,Math.abs(s));
  }
  if(nonFinite)return fail('Non-finite audio samples');
  return {valid:true,channels,sampleRate,bits,encoding,frames,durationSec:frames/sampleRate,peak,nonFinite};
}

/** Prevent an engine from claiming usable singing audio for a silent, cut-off
 * or malformed WAV. This is DSP integrity only, not an AI inference attestation. */
export function assertUsableSingingWav(input,{maxDurationSec=90}={}){
 const info=inspectSingingWav(input);
 if(!info.valid)throw Error('엔진에서 손상된 WAV를 반환했습니다: '+info.reason);
 if(!Number.isFinite(maxDurationSec)||maxDurationSec<.03||maxDurationSec>300||info.durationSec>maxDurationSec||info.durationSec<0.03)throw Error('가창 WAV 길이가 허용된 범위를 벗어났습니다.');
 if(info.peak<0.001)throw Error('가창 엔진에서 소리가 없는 WAV를 반환했습니다.');
 return info;
}
