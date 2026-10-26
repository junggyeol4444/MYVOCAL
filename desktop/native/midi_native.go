package main

import (
 "bytes"
 "context"
 "encoding/binary"
 "errors"
 "fmt"
 "math"
 "os"
 "path/filepath"
 "sort"
 "strconv"
 "strings"
)

const midiPPQ=480
type midiNote struct { note, velocity byte; start, end uint32 }
type midiEvent struct { tick uint32; data [3]byte; size int; priority int }

func parseMidiNotes(source string)([]midiNote,error){
 if len(source)>500000{return nil,errors.New("MIDI 악보 입력이 너무 큽니다")}
 result:=[]midiNote{}
 for i,line:=range strings.Split(strings.ReplaceAll(source,"\r\n","\n"),"\n"){
  line=strings.TrimSpace(line)
  if line==""||strings.HasPrefix(line,"#"){continue}
  fields:=strings.FieldsFunc(line,func(r rune)bool{return r==','||r==' '||r=='\t'||r==';'})
  if len(fields)!=4{return nil,fmt.Errorf("%d행: 음높이, 시작박, 길이박, 세기를 입력하세요",i+1)}
  pitch,err:=strconv.Atoi(fields[0])
  if err!=nil||pitch<0||pitch>127{return nil,fmt.Errorf("%d행: MIDI 음높이는 0~127입니다",i+1)}
  begin,err:=strconv.ParseFloat(fields[1],64)
  if err!=nil||math.IsNaN(begin)||math.IsInf(begin,0)||begin<0||begin>30000{return nil,fmt.Errorf("%d행: 시작박 오류",i+1)}
  length,err:=strconv.ParseFloat(fields[2],64)
  if err!=nil||math.IsNaN(length)||math.IsInf(length,0)||length<=0||length>2000{return nil,fmt.Errorf("%d행: 길이박 오류",i+1)}
  volume,err:=strconv.Atoi(fields[3])
  if err!=nil||volume<1||volume>127{return nil,fmt.Errorf("%d행: 세기는 1~127입니다",i+1)}
  start:=uint32(math.Round(begin*midiPPQ))
  end:=uint32(math.Round((begin+length)*midiPPQ))
  if end<=start||end>0x0fffffff{return nil,fmt.Errorf("%d행: 길이 오류",i+1)}
  result=append(result,midiNote{note:byte(pitch),velocity:byte(volume),start:start,end:end})
  if len(result)>10000{return nil,errors.New("최대 10000개 MIDI 음표")}
 }
 if len(result)==0{return nil,errors.New("입력된 MIDI 음표가 없습니다")}
 return result,nil
}
func midiVLQ(w *bytes.Buffer,v uint32){
 var b [4]byte
 i:=3
 b[i]=byte(v&127)
 for v>>=7;v>0;v>>=7{i--;b[i]=byte(v&127)|128}
 w.Write(b[i:])
}
func buildMidi(bpm,program int,notation string)([]byte,error){
 if bpm<20||bpm>320{return nil,errors.New("BPM은 20~320이어야 합니다")}
 if program<0||program>127{return nil,errors.New("MIDI 악기 번호는 0~127이어야 합니다")}
 notes,err:=parseMidiNotes(notation)
 if err!=nil{return nil,err}
 events:=make([]midiEvent,0,len(notes)*2)
 for _,n:=range notes{
  events=append(events,midiEvent{tick:n.start,data:[3]byte{0x90,n.note,n.velocity},size:3,priority:1})
  events=append(events,midiEvent{tick:n.end,data:[3]byte{0x80,n.note,0},size:3,priority:0})
 }
 sort.SliceStable(events,func(i,j int)bool{
  if events[i].tick!=events[j].tick{return events[i].tick<events[j].tick}
  if events[i].priority!=events[j].priority{return events[i].priority<events[j].priority}
  return events[i].data[1]<events[j].data[1]
 })
 track:=new(bytes.Buffer)
 tempo:=uint32(60000000/bpm)
 track.Write([]byte{0,255,81,3,byte(tempo>>16),byte(tempo>>8),byte(tempo)})
 track.Write([]byte{0,0xc0,byte(program)})
 var previous uint32
 for _,e:=range events{
  midiVLQ(track,e.tick-previous)
  track.Write(e.data[:e.size])
  previous=e.tick
 }
 track.Write([]byte{0,255,47,0})
 var file bytes.Buffer
 file.WriteString("MThd")
 binary.Write(&file,binary.BigEndian,uint32(6))
 binary.Write(&file,binary.BigEndian,uint16(0))
 binary.Write(&file,binary.BigEndian,uint16(1))
 binary.Write(&file,binary.BigEndian,uint16(midiPPQ))
 file.WriteString("MTrk")
 binary.Write(&file,binary.BigEndian,uint32(track.Len()))
 file.Write(track.Bytes())
 return file.Bytes(),nil
}
func exportNativeMIDI(ctx context.Context,path string,bpm,program int,notation string)error{
 if err:=preventOverwrite(path);err!=nil{return err}
 payload,err:=buildMidi(bpm,program,notation)
 if err!=nil{return err}
 if err=ctx.Err();err!=nil{return err}
 tmp,err:=os.CreateTemp(filepath.Dir(path),".myvocal-midi-*.mid")
 if err!=nil{return err}
 name:=tmp.Name()
 defer os.Remove(name)
 _,err=tmp.Write(payload)
 if err==nil{err=tmp.Sync()}
 if closeErr:=tmp.Close();err==nil{err=closeErr}
 if err!=nil{return err}
 if err=os.Link(name,path);err!=nil{return fmt.Errorf("MIDI 출력 파일을 새로 저장할 수 없습니다: %w",err)}
 return nil
}
