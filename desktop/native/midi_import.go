package main

import (
 "encoding/binary"
 "errors"
 "fmt"
 "math"
 "os"
 "sort"
 "strings"
)

type midiActiveNote struct { start uint32; velocity byte }
type midiImportedNote struct { pitch byte; start, end uint32; velocity byte }

func midiReadVLQ(data []byte,position *int)(uint32,error){
 var value uint32
 for i:=0;i<4;i++{
  if *position>=len(data){return 0,errors.New("MIDI 가변 길이 값이 잘렸습니다")}
  b:=data[*position];*position++
  value=(value<<7)|uint32(b&0x7f)
  if b&0x80==0{return value,nil}
 }
 return 0,errors.New("MIDI 가변 길이가 4바이트를 초과합니다")
}
func parseImportedMIDI(raw []byte)(string,int,int,error){
 if len(raw)<22||string(raw[:4])!="MThd"{return "",0,0,errors.New("MIDI 헤더가 없습니다")}
 headerSize:=int(binary.BigEndian.Uint32(raw[4:8]))
 if headerSize<6||headerSize>4096||8+headerSize>len(raw){return "",0,0,errors.New("MIDI 헤더 길이가 잘못됐습니다")}
 format:=binary.BigEndian.Uint16(raw[8:10])
 trackCount:=binary.BigEndian.Uint16(raw[10:12])
 ppq:=binary.BigEndian.Uint16(raw[12:14])
 if ppq==0||ppq&0x8000!=0{return "",0,0,errors.New("SMPTE MIDI 시간 단위는 지원하지 않습니다")}
 if format==1{return parseImportedMultiMIDI(raw,headerSize,int(trackCount),ppq)}
 if format!=0||trackCount!=1{return "",0,0,errors.New("이 MIDI 형식/트랙 구성을 지원하지 않습니다")}
 index:=8+headerSize
 if index+8>len(raw)||string(raw[index:index+4])!="MTrk"{return "",0,0,errors.New("MIDI 트랙을 찾을 수 없습니다")}
 size:=int(binary.BigEndian.Uint32(raw[index+4:index+8]))
 if size<=0||size>len(raw)-index-8{return "",0,0,errors.New("MIDI 트랙 길이 오류")}
 track:=raw[index+8:index+8+size]
 pos:=0
 var tick uint32
 var running byte
 tempo:=120
 program:=0
 haveTempo:=false
 haveProgram:=false
 active:=map[byte]midiActiveNote{}
 notes:=make([]midiImportedNote,0,256)
 for pos<len(track){
  dt,err:=midiReadVLQ(track,&pos)
  if err!=nil{return "",0,0,err}
  if uint64(tick)+uint64(dt)>0x0fffffff{return "",0,0,errors.New("MIDI 시간 범위 초과")}
  tick+=dt
  if pos>=len(track){return "",0,0,errors.New("MIDI 이벤트가 잘렸습니다")}
  status:=track[pos]
  if status&0x80!=0{pos++;if status<0xf0{running=status}else{running=0}}else{
   if running==0{return "",0,0,errors.New("유효하지 않은 MIDI 러닝 상태")}
   status=running
  }
  if status==0xff{
   if pos>=len(track){return "",0,0,errors.New("MIDI 메타 이벤트가 잘렸습니다")}
   tag:=track[pos];pos++
   count,err:=midiReadVLQ(track,&pos)
   if err!=nil||uint64(pos)+uint64(count)>uint64(len(track)){return "",0,0,errors.New("MIDI 메타 이벤트 길이 오류")}
   payload:=track[pos:pos+int(count)];pos+=int(count)
   if tag==0x51&&count==3{
    micros:=uint32(payload[0])<<16|uint32(payload[1])<<8|uint32(payload[2])
    if micros==0{return "",0,0,errors.New("MIDI BPM 값 오류")}
    next:=int(math.Round(60000000.0/float64(micros)))
    if next<20||next>320{return "",0,0,errors.New("MIDI BPM 지원 범위는 20~320입니다")}
    if haveTempo&&tempo!=next{return "",0,0,errors.New("템포 변경이 있는 MIDI는 현재 단일 BPM 편집기로 불러올 수 없습니다")}
    tempo=next;haveTempo=true
   }
   if tag==0x2f{break}
   continue
  }
  if status==0xf0||status==0xf7{
   count,err:=midiReadVLQ(track,&pos)
   if err!=nil||uint64(pos)+uint64(count)>uint64(len(track)){return "",0,0,errors.New("MIDI 시스템 이벤트 길이 오류")}
   pos+=int(count);continue
  }
  category:=status&0xf0
  channel:=status&0x0f
  if category<0x80||category>0xe0{return "",0,0,fmt.Errorf("알 수 없는 MIDI 상태: %x",status)}
  size:=2
  if category==0xc0||category==0xd0{size=1}
  if pos+size>len(track){return "",0,0,errors.New("MIDI 이벤트 데이터가 잘렸습니다")}
  first:=track[pos];pos++
  if first>=128{return "",0,0,errors.New("MIDI 이벤트 피치/데이터 오류")}
  var second byte
  if size==2{second=track[pos];pos++;if second>=128{return "",0,0,errors.New("MIDI 이벤트 속도/데이터 오류")}}
  if category==0xc0{
   if !haveProgram{program=int(first);haveProgram=true}else if program!=int(first){return "",0,0,errors.New("악기 변경 MIDI는 단일 악기 편집기에 가져올 수 없습니다")}
  }
  if category!=0x90&&category!=0x80{continue}
  if channel==9{return "",0,0,errors.New("MIDI 드럼 채널은 별도 드럼 편집이 필요합니다")}
  if category==0x90&&second!=0{
   if _,ok:=active[first];ok{return "",0,0,errors.New("같은 피치의 겹친 음표는 자동 변환하지 않습니다")}
   active[first]=midiActiveNote{start:tick,velocity:second}
   continue
  }
  before,ok:=active[first]
  if !ok{return "",0,0,errors.New("MIDI 노트 오프에 대응하는 노트 온이 없습니다")}
  delete(active,first)
  if before.start>=tick{return "",0,0,errors.New("MIDI 음표 길이가 0입니다")}
  notes=append(notes,midiImportedNote{pitch:first,start:before.start,end:tick,velocity:before.velocity})
  if len(notes)>10000{return "",0,0,errors.New("MIDI 노트가 10000개를 초과합니다")}
 }
 if len(active)>0{return "",0,0,errors.New("MIDI 노트가 끝나지 않았습니다")}
 if len(notes)==0{return "",0,0,errors.New("MIDI에 음표가 없습니다")}
 sort.SliceStable(notes,func(i,j int)bool{
  if notes[i].start!=notes[j].start{return notes[i].start<notes[j].start}
  return notes[i].pitch<notes[j].pitch
 })
 var text strings.Builder
 for _,note:=range notes{
  fmt.Fprintf(&text,"%d %.4f %.4f %d\r\n",note.pitch,float64(note.start)/float64(ppq),float64(note.end-note.start)/float64(ppq),note.velocity)
 }
 return text.String(),tempo,program,nil
}
func readExistingMIDI(path string)(string,int,int,error){
 stat,err:=os.Lstat(path)
 if err!=nil||!stat.Mode().IsRegular()||stat.Size()>5<<20{return "",0,0,errors.New("MIDI 입력 파일이 없거나 5MB를 넘었습니다")}
 data,err:=os.ReadFile(path)
 if err!=nil{return "",0,0,err}
 return parseImportedMIDI(data)
}
