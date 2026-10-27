package main

import (
 "encoding/json"
 "errors"
 "fmt"
 "math"
 "os"
 "path/filepath"
 "sort"
 "strconv"
 "strings"
 "unicode"
)

type lyricTimingCue struct {
 StartSec float64 `json:"startSec"`
 EndSec float64 `json:"endSec"`
 Lyric string `json:"lyric"`
}
type lyricTimingFile struct{
 Format string `json:"format"`
 Version int `json:"version"`
 Cues []lyricTimingCue `json:"cues"`
}
func parseLyricCueEditor(source string)([]lyricTimingCue,error){
 lines:=strings.Split(strings.ReplaceAll(source,"\r\n","\n"),"\n")
 cues:=make([]lyricTimingCue,0,len(lines))
 var lastStart float64=-1
 for i,line:=range lines{
  line=strings.TrimSpace(line)
  if line==""||strings.HasPrefix(line,"#"){continue}
  fields:=strings.SplitN(line,"|",3)
  if len(fields)!=3{return nil,fmt.Errorf("%d행: 시작초|종료초|가사 순서여야 합니다",i+1)}
  a,ea:=strconv.ParseFloat(strings.TrimSpace(fields[0]),64)
  b,eb:=strconv.ParseFloat(strings.TrimSpace(fields[1]),64)
  lyric:=strings.TrimSpace(fields[2])
  if ea!=nil||eb!=nil||math.IsNaN(a)||math.IsNaN(b)||math.IsInf(a,0)||math.IsInf(b,0)||
   a<0||b<=a||b>360||a<lastStart||b-a<0.05||lyric==""||len([]rune(lyric))>100{
   return nil,fmt.Errorf("%d행: 초(0~360), 시작 순서, 구간 길이(0.05초 이상), 가사(100자 이하) 오류",i+1)
  }
  for _,r:=range lyric{if unicode.IsControl(r){return nil,fmt.Errorf("%d행: 가사에 제어 문자가 있습니다",i+1)}}
  cues=append(cues,lyricTimingCue{StartSec:a,EndSec:b,Lyric:lyric})
  lastStart=a
  if len(cues)>400{return nil,errors.New("립싱크 가사 구간은 400개 이하여야 합니다")}
 }
 if len(cues)==0{return nil,errors.New("가사 시간 구간이 하나도 없습니다")}
 return cues,nil
}
func encodeLyricTiming(cues []lyricTimingCue)([]byte,error){
 if len(cues)==0||len(cues)>400{return nil,errors.New("가사 구간은 1~400개가 필요합니다")}
 var lines strings.Builder
 for _,c:=range cues{fmt.Fprintf(&lines,"%.3f|%.3f|%s\n",c.StartSec,c.EndSec,c.Lyric)}
 if _,err:=parseLyricCueEditor(lines.String());err!=nil{return nil,err}
 return json.MarshalIndent(lyricTimingFile{Format:"MYVOCAL_LYRIC_ALIGNMENT",Version:1,Cues:cues},"","  ")
}
func writeLyricTimingFile(path,source string)error{
 if !strings.EqualFold(filepath.Ext(path),".json"){return errors.New("가사 싱크 출력은 JSON 파일이어야 합니다")}
 if err:=preventOverwrite(path);err!=nil{return err}
 cues,err:=parseLyricCueEditor(source);if err!=nil{return err}
 raw,err:=encodeLyricTiming(cues);if err!=nil{return err}
 file,err:=os.CreateTemp(filepath.Dir(path),".myvocal-sync-*.json")
 if err!=nil{return err}
 tmp:=file.Name()
 defer os.Remove(tmp)
 _,err=file.Write(raw)
 if err==nil{err=file.Sync()}
 if ce:=file.Close();err==nil{err=ce}
 if err!=nil{return err}
 if err=os.Link(tmp,path);err!=nil{return fmt.Errorf("기존 파일을 덮어쓰지 않고 JSON 저장 실패: %w",err)}
 return nil
}
func readLyricTimingEditor(path string)(string,error){
 stat,err:=os.Lstat(path)
 if err!=nil||!stat.Mode().IsRegular()||stat.Size()>1<<20{return "",errors.New("가사 싱크 JSON이 없거나 1MB를 초과합니다")}
 raw,err:=os.ReadFile(path)
 if err!=nil{return "",err}
 var doc lyricTimingFile
 if err=json.Unmarshal(raw,&doc);err!=nil{return "",err}
 if doc.Format!="MYVOCAL_LYRIC_ALIGNMENT"||doc.Version!=1{return "",errors.New("MYVOCAL_LYRIC_ALIGNMENT 버전 1만 불러옵니다")}
 if _,err=encodeLyricTiming(doc.Cues);err!=nil{return "",err}
 var sb strings.Builder
 for _,c:=range doc.Cues{fmt.Fprintf(&sb,"%.3f|%.3f|%s\r\n",c.StartSec,c.EndSec,c.Lyric)}
 return sb.String(),nil
}
func lyricLines(source string)[]string{
 result:=[]string{}
 for _,line:=range strings.Split(strings.ReplaceAll(source,"\r\n","\n"),"\n"){
  line=strings.TrimSpace(line)
  if line==""||strings.HasPrefix(line,"[")&&strings.HasSuffix(line,"]"){continue}
  if len([]rune(line))>100{continue}
  result=append(result,line)
 }
 return result
}
// This is an editable draft, not phoneme alignment: line boundaries are
// assigned to actual MIDI note onsets, and must be reviewed before rendering.
func midiLyricDraft(p studioProject)(string,error){
 lines:=lyricLines(p.Lyrics)
 if len(lines)==0{return "",errors.New("프로젝트에 구간별 가사를 먼저 저장하세요")}
 if len(lines)>400{return "",errors.New("가사 줄이 400개를 초과합니다")}
 if strings.TrimSpace(p.MIDINotes)==""{return "",errors.New("프로젝트에 MIDI 멜로디를 먼저 저장하세요")}
 var notes []midiNote
 var err error
 if strings.HasPrefix(strings.TrimSpace(p.MIDINotes),"@"){
  tracks,e:=parseMultiTrackMIDI(p.MIDINotes);if e!=nil{return "",e}
  selectIndex:=0
  for i,t:=range tracks{
   name:=strings.ToLower(t.Name)
   if strings.Contains(name,"vocal")||strings.Contains(name,"melody")||
    strings.Contains(name,"lead")||strings.Contains(name,"보컬")||strings.Contains(name,"멜로디"){
    selectIndex=i;break
   }
  }
  notes=tracks[selectIndex].Notes
 }else{
  notes,err=parseMidiNotes(p.MIDINotes);if err!=nil{return "",err}
 }
 sort.Slice(notes,func(i,j int)bool{
  if notes[i].start!=notes[j].start{return notes[i].start<notes[j].start}
  return notes[i].note<notes[j].note
 })
 unique:=[]midiNote{}
 for _,n:=range notes{
  if len(unique)>0&&unique[len(unique)-1].start==n.start{
   if n.end>unique[len(unique)-1].end{unique[len(unique)-1].end=n.end}
  }else{unique=append(unique,n)}
 }
 if len(unique)<len(lines){return "",fmt.Errorf("가사 %d줄인데 고유 MIDI 음표 시작이 %d개뿐이라 시간 초안을 만들 수 없습니다",len(lines),len(unique))}
 if p.BPM<20||p.BPM>320{return "",errors.New("프로젝트 BPM 범위 오류")}
 ticksPerSecond:=float64(midiPPQ)*float64(p.BPM)/60
 cues:=make([]lyricTimingCue,0,len(lines))
 for i,line:=range lines{
  first:=i*len(unique)/len(lines)
  last:=(i+1)*len(unique)/len(lines)-1
  start:=float64(unique[first].start)/ticksPerSecond
  end:=float64(unique[last].end)/ticksPerSecond
  if end-start<0.05||end>360{return "",fmt.Errorf("%d번째 가사의 MIDI 시간 범위가 올바르지 않습니다",i+1)}
  cues=append(cues,lyricTimingCue{StartSec:math.Round(start*1000)/1000,EndSec:math.Round(end*1000)/1000,Lyric:line})
 }
 if _,err=encodeLyricTiming(cues);err!=nil{return "",err}
 var sb strings.Builder
 sb.WriteString("# MIDI 음표 위치를 기준으로 만든 초안입니다. 보컬 실제 발음 시간에 맞게 수정하세요.\r\n")
 for _,c:=range cues{fmt.Fprintf(&sb,"%.3f|%.3f|%s\r\n",c.StartSec,c.EndSec,c.Lyric)}
 return sb.String(),nil
}
