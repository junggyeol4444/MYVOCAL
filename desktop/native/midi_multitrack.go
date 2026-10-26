package main

import (
 "bytes"
 "context"
 "encoding/binary"
 "errors"
 "fmt"
 "os"
 "path/filepath"
 "sort"
 "strconv"
 "strings"
)

type midiInstrumentTrack struct {
 Name string
 Program byte
 Notes []midiNote
}
func parseMultiTrackMIDI(source string)([]midiInstrumentTrack,error){
 var tracks []midiInstrumentTrack
 var body strings.Builder
 flush:=func()error{
  if len(tracks)==0{return nil}
  notes,err:=parseMidiNotes(body.String())
  if err!=nil{return fmt.Errorf("%s 악기 노트: %w",tracks[len(tracks)-1].Name,err)}
  tracks[len(tracks)-1].Notes=notes
  body.Reset()
  return nil
 }
 total:=0
 for row,line:=range strings.Split(strings.ReplaceAll(source,"\r\n","\n"),"\n"){
  line=strings.TrimSpace(line)
  if line==""||strings.HasPrefix(line,"#"){continue}
  if strings.HasPrefix(line,"@"){
   if err:=flush();err!=nil{return nil,err}
   spec:=strings.Fields(strings.TrimSpace(strings.TrimPrefix(line,"@")))
   if len(spec)<2{return nil,fmt.Errorf("%d행: @ 악기이름 악기번호(0~127)",row+1)}
   program,err:=strconv.Atoi(spec[len(spec)-1])
   if err!=nil||program<0||program>127{return nil,fmt.Errorf("%d행: 악기 프로그램 범위 오류",row+1)}
   name:=strings.Join(spec[:len(spec)-1]," ")
   if name==""||len([]byte(name))>64{return nil,errors.New("악기 이름은 UTF-8 64바이트 이내여야 합니다")}
   if len(tracks)>=15{return nil,errors.New("서로 다른 악기는 15트랙까지 지원합니다")}
   tracks=append(tracks,midiInstrumentTrack{Name:name,Program:byte(program)})
  }else{
   if len(tracks)==0{return nil,fmt.Errorf("%d행: 첫 줄에 @ 악기이름 악기번호를 지정하세요",row+1)}
   body.WriteString(line)
   body.WriteByte('\n')
   total++
   if total>12000{return nil,errors.New("다중 악기 전체 MIDI 노트는 최대 12000개입니다")}
  }
 }
 if len(tracks)==0{return nil,errors.New("다중 트랙 악기 지정(@)이 없습니다")}
 if err:=flush();err!=nil{return nil,err}
 return tracks,nil
}
func buildMultiMIDI(bpm int,source string)([]byte,error){
 if bpm<20||bpm>320{return nil,errors.New("MIDI BPM은 20~320이어야 합니다")}
 tracks,err:=parseMultiTrackMIDI(source)
 if err!=nil{return nil,err}
 var result bytes.Buffer
 result.WriteString("MThd")
 binary.Write(&result,binary.BigEndian,uint32(6))
 binary.Write(&result,binary.BigEndian,uint16(1))
 binary.Write(&result,binary.BigEndian,uint16(len(tracks)))
 binary.Write(&result,binary.BigEndian,uint16(midiPPQ))
 for index,t:=range tracks{
  channel:=byte(index)
  if channel>=9{channel++}
  if channel>=16{return nil,errors.New("MIDI 채널 범위 초과")}
  var stream bytes.Buffer
  stream.WriteByte(0)
  stream.Write([]byte{0xff,0x03})
  midiVLQ(&stream,uint32(len([]byte(t.Name))))
  stream.WriteString(t.Name)
  if index==0{
   tempo:=uint32(60000000/bpm)
   stream.Write([]byte{0,0xff,0x51,0x03,byte(tempo>>16),byte(tempo>>8),byte(tempo)})
  }
  stream.Write([]byte{0,0xc0|channel,t.Program})
  events:=make([]midiEvent,0,len(t.Notes)*2)
  for _,n:=range t.Notes{
   events=append(events,midiEvent{tick:n.start,data:[3]byte{0x90|channel,n.note,n.velocity},size:3,priority:1})
   events=append(events,midiEvent{tick:n.end,data:[3]byte{0x80|channel,n.note,0},size:3,priority:0})
  }
  sort.SliceStable(events,func(i,j int)bool{
   if events[i].tick!=events[j].tick{return events[i].tick<events[j].tick}
   if events[i].priority!=events[j].priority{return events[i].priority<events[j].priority}
   return events[i].data[1]<events[j].data[1]
  })
  var previous uint32
  for _,ev:=range events{
   midiVLQ(&stream,ev.tick-previous)
   stream.Write(ev.data[:ev.size])
   previous=ev.tick
  }
  stream.Write([]byte{0,255,47,0})
  result.WriteString("MTrk")
  binary.Write(&result,binary.BigEndian,uint32(stream.Len()))
  result.Write(stream.Bytes())
 }
 return result.Bytes(),nil
}
func exportNativeMultiMIDI(ctx context.Context,path string,bpm int,source string)error{
 if err:=preventOverwrite(path);err!=nil{return err}
 data,err:=buildMultiMIDI(bpm,source)
 if err!=nil{return err}
 if err=ctx.Err();err!=nil{return err}
 tmp,err:=os.CreateTemp(filepath.Dir(path),".myvocal-multitrack-midi-*.mid")
 if err!=nil{return err}
 name:=tmp.Name()
 defer os.Remove(name)
 _,err=tmp.Write(data)
 if err==nil{err=tmp.Sync()}
 if closeErr:=tmp.Close();err==nil{err=closeErr}
 if err!=nil{return err}
 if err=os.Link(name,path);err!=nil{return fmt.Errorf("MIDI 다중 트랙 저장 실패: %w",err)}
 return nil
}
