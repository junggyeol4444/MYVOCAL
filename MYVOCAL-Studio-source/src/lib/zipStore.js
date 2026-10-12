// Small ZIP (STORE, no compression) writer for local voice dataset export.
// Offline, no network and no third-party library. CRC32 checked by unzip tools.
const table=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
export function crc32(data){let c=0xffffffff;for(const byte of data)c=table[(c^byte)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
const u16=(a,o,v)=>{a[o]=v&255;a[o+1]=(v>>>8)&255;};
const u32=(a,o,v)=>{u16(a,o,v);u16(a,o+2,v>>>16);};
const encoder=new TextEncoder();
export function makeZip(entries){
 if(!Array.isArray(entries)||!entries.length||entries.length>65000)throw Error('ZIP 항목 수가 올바르지 않습니다.');
 const local=[],central=[];let offset=0,centSize=0;
 for(const entry of entries){
  const name=encoder.encode(entry.name),body=entry.data instanceof Uint8Array?entry.data:new Uint8Array(entry.data);
  if(!name.length||name.length>65535||entry.name.includes('..')||entry.name.startsWith('/'))throw Error('ZIP 경로가 안전하지 않습니다.');
  if(body.length>0xffffffff)throw Error('ZIP 항목이 너무 큽니다.');
  const crc=crc32(body),lf=new Uint8Array(30+name.length),cf=new Uint8Array(46+name.length);
  u32(lf,0,0x04034b50);u16(lf,4,20);u16(lf,6,0x0800);u16(lf,8,0);u32(lf,14,crc);u32(lf,18,body.length);u32(lf,22,body.length);u16(lf,26,name.length);lf.set(name,30);
  u32(cf,0,0x02014b50);u16(cf,4,20);u16(cf,6,20);u16(cf,8,0x0800);u16(cf,10,0);u32(cf,16,crc);u32(cf,20,body.length);u16(cf,28,name.length);u32(cf,42,offset);cf.set(name,46);
  local.push(lf,body);central.push(cf);offset+=lf.length+body.length;centSize+=cf.length;
 }
 if(offset+centSize>0xffffffff)throw Error('ZIP 크기 제한을 초과했습니다.');
 const end=new Uint8Array(22);u32(end,0,0x06054b50);u16(end,8,entries.length);u16(end,10,entries.length);u32(end,12,centSize);u32(end,16,offset);
 const result=new Uint8Array(offset+centSize+end.length);let at=0;
 for(const part of [...local,...central,end]){result.set(part,at);at+=part.length;}return result;
}
