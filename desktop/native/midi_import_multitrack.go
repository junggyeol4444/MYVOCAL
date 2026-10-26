package main

import (
 "encoding/binary"
 "errors"
 "fmt"
 "math"
 "sort"
 "strings"
)

type midiMultiImportedTrack struct{
 name string
 program int
 notes []midiImportedNote
}
func parseImportedMultiMIDI(raw []byte,headerSize,trackCount int,ppq uint16)(string,int,int,error){
 if trackCount<1||trackCount>16{return "",0,0,errors.New("MIDI 다중 트랙은 최대 16개까지 가져올 수 있습니다")}
 index:=8+headerSize
 bpm:=120
 tempoSeen:=false
 parsed:=make([]midiMultiImportedTrack,0,trackCount)
 for t:=0;t<trackCount;t++{
  if index+8>len(raw)||string(raw[index:index+4])!="MTrk"{return "",0,0,errors.New("MIDI 다중 트랙 헤더 오류")}
  size:=int(binary.BigEndian.Uint32(raw[index+4:index+8]))
  if size<=0||size>len(raw)-index-8{return "",0,0,errors.New("MIDI 다중 트랙 데이터 길이 오류")}
  data:=raw[index+8:index+8+size];index+=8+size
  track:=midiMultiImportedTrack{name:fmt.Sprintf("Track%d",t+1)}
  pos:=0
  var tick uint32
  var running byte
  active:=map[int]midiActiveNote{}
  selectedChannel:= -1
  programSeen:=false
  for pos<len(data){
   delta,err:=midiReadVLQ(data,&pos)
   if err!=nil{return "",0,0,err}
   if uint64(tick)+uint64(delta)>0x0fffffff{return "",0,0,errors.New("MIDI 트랙 시간 범위 초과")}
   tick+=delta
   if pos>=len(data){return "",0,0,errors.New("MIDI 트랙 이벤트 누락")}
   status:=data[pos]
   if status>=128{
    pos++
    if status<0xf0{running=status}else{running=0}
   }else{
    if running==0{return "",0,0,errors.New("MIDI 트랙 러닝 상태 오류")}
    status=running
   }
   if status==0xff{
    if pos>=len(data){return "",0,0,errors.New("MIDI 메타 이벤트 누락")}
    kind:=data[pos];pos++
    length,err:=midiReadVLQ(data,&pos)
    if err!=nil||uint64(pos)+uint64(length)>uint64(len(data)){return "",0,0,errors.New("MIDI 메타 길이 오류")}
    meta:=data[pos:pos+int(length)]
    pos+=int(length)
    if kind==3&&len(meta)>0{
     text:=strings.TrimSpace(string(meta))
     if text!=""&&len([]byte(text))<=64&&!strings.ContainsAny(text,"\r\n@"){track.name=text}
    }
    if kind==0x51&&length==3{
     micros:=uint32(meta[0])<<16|uint32(meta[1])<<8|uint32(meta[2])
     if micros==0{return "",0,0,errors.New("MIDI 템포 오류")}
     next:=int(math.Round(60000000.0/float64(micros)))
     if next<20||next>320{return "",0,0,errors.New("MIDI 템포는 20~320 BPM 범위여야 합니다")}
     if tempoSeen&&bpm!=next{return "",0,0,errors.New("곡 중간의 BPM 변경은 현재 편집기로 안전하게 변환할 수 없습니다")}
     bpm=next;tempoSeen=true
    }
    if kind==0x2f{break}
    continue
   }
   if status==0xf0||status==0xf7{
    length,err:=midiReadVLQ(data,&pos)
    if err!=nil||uint64(pos)+uint64(length)>uint64(len(data)){return "",0,0,errors.New("MIDI SysEx 길이 오류")}
    pos+=int(length);continue
   }
   kind:=status&0xf0
   channel:=int(status&0x0f)
   if kind<0x80||kind>0xe0{return "",0,0,fmt.Errorf("지원되지 않는 MIDI 이벤트 상태: 0x%x",status)}
   count:=2
   if kind==0xc0||kind==0xd0{count=1}
   if pos+count>len(data){return "",0,0,errors.New("MIDI 채널 데이터 누락")}
   first:=data[pos];pos++
   if first>=128{return "",0,0,errors.New("MIDI 채널 값 오류")}
   var second byte
   if count==2{second=data[pos];pos++;if second>=128{return "",0,0,errors.New("MIDI 채널 값 오류")}}
   if kind==0xb0||kind==0xe0||kind==0xd0||kind==0xa0{
    return "",0,0,errors.New("컨트롤·피치벤드·압력 이벤트가 포함된 MIDI는 표현 손실 방지를 위해 가져오지 않습니다")
   }
   if kind==0xc0{
    if !programSeen{track.program=int(first);programSeen=true}else if track.program!=int(first){
     return "",0,0,errors.New("한 트랙에 악기 변경이 있으면 안전하게 편집기로 가져올 수 없습니다")
    }
    continue
   }
   if kind!=0x90&&kind!=0x80{continue}
   if channel==9{return "",0,0,errors.New("드럼 채널은 현재 멜로디 MIDI 편집기에서 지원되지 않습니다")}
   if selectedChannel<0{selectedChannel=channel}else if selectedChannel!=channel{
    return "",0,0,errors.New("하나의 트랙에 MIDI 채널이 여러 개 있습니다")
   }
   key:=channel*128+int(first)
   if kind==0x90&&second>0{
    if _,exists:=active[key];exists{return "",0,0,errors.New("한 트랙의 동일 음높이 겹침을 지원하지 않습니다")}
    active[key]=midiActiveNote{start:tick,velocity:second}
   }else{
    before,exists:=active[key]
    if !exists||before.start>=tick{return "",0,0,errors.New("짝이 없거나 길이가 0인 MIDI 노트")}
    delete(active,key)
    track.notes=append(track.notes,midiImportedNote{pitch:first,start:before.start,end:tick,velocity:before.velocity})
    if len(track.notes)>12000{return "",0,0,errors.New("MIDI 음표 12000개 초과")}
   }
  }
  if len(active)>0{return "",0,0,errors.New("노트 오프가 없는 MIDI 트랙입니다")}
  if len(track.notes)>0{
   if len(parsed)>=15{return "",0,0,errors.New("최대 15개의 악기 트랙까지 가져올 수 있습니다")}
   sort.SliceStable(track.notes,func(i,j int)bool{
    if track.notes[i].start!=track.notes[j].start{return track.notes[i].start<track.notes[j].start}
    return track.notes[i].pitch<track.notes[j].pitch
   })
   parsed=append(parsed,track)
  }
 }
 if len(parsed)==0{return "",0,0,errors.New("가져올 노트가 없습니다")}
 var notation strings.Builder
 total:=0
 for _,track:=range parsed{
  fmt.Fprintf(&notation,"@ %s %d\r\n",track.name,track.program)
  for _,n:=range track.notes{
   fmt.Fprintf(&notation,"%d %.4f %.4f %d\r\n",n.pitch,float64(n.start)/float64(ppq),float64(n.end-n.start)/float64(ppq),n.velocity)
   total++
   if total>12000{return "",0,0,errors.New("전체 MIDI 음표 12000개 초과")}
  }
 }
 return notation.String(),bpm,0,nil
}
