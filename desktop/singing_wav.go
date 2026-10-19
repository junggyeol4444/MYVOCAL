package main

// Accept only complete PCM/float WAV frames from local singing engines.
// This proves structural integrity, not that neural inference happened.
import (
 "encoding/binary"
 "math"
)
func validSingingWAV(b []byte) bool {
 if len(b)<46 || string(b[:4])!="RIFF" || string(b[8:12])!="WAVE" ||
    binary.LittleEndian.Uint32(b[4:8])!=uint32(len(b)-8) {return false}
 var fmtOK, dataOK bool
 var align uint16
 var encoding uint16
 var data []byte
 at:=12
 for at+8<=len(b) {
   name:=string(b[at:at+4]); n:=binary.LittleEndian.Uint32(b[at+4:at+8]);at+=8
   if uint64(n)>uint64(len(b)-at){return false}
   chunk:=b[at:at+int(n)]
   if name=="fmt " {
     if fmtOK||len(chunk)<16{return false}
     fmtOK=true
     encoding=binary.LittleEndian.Uint16(chunk[0:2])
     ch:=binary.LittleEndian.Uint16(chunk[2:4])
     rate:=binary.LittleEndian.Uint32(chunk[4:8])
     bytesPerSec:=binary.LittleEndian.Uint32(chunk[8:12])
     align=binary.LittleEndian.Uint16(chunk[12:14])
     bits:=binary.LittleEndian.Uint16(chunk[14:16])
     if !(encoding==1&&(bits==16||bits==24)||encoding==3&&bits==32)||
       ch<1||ch>2||rate<8000||rate>192000||
       align!=ch*bits/8||bytesPerSec!=rate*uint32(align){return false}
   }
   if name=="data" {
     if dataOK{return false}
     dataOK=true;data=chunk
   }
   at+=int(n)
   if n%2==1 {if at>=len(b){return false};at++}
 }
 if at!=len(b)||!fmtOK||!dataOK||len(data)==0||len(data)%int(align)!=0{return false}
 if encoding==3 {
   for i:=0;i<len(data);i+=4 {
     v:=float64(math.Float32frombits(binary.LittleEndian.Uint32(data[i:i+4])))
     if math.IsInf(v,0)||math.IsNaN(v){return false}
   }
 }
 return true
}
