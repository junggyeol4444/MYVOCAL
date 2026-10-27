package main

import (
 "encoding/json"
 "errors"
 "fmt"
 "math"
 "os"
 "path/filepath"
 "strconv"
 "strings"
)

const maxPhonemeCues=4000

func dsFloats(raw json.RawMessage)([]float64,error){
 var nums []float64
 if json.Unmarshal(raw,&nums)==nil{return nums,nil}
 var words []string
 var text string
 if json.Unmarshal(raw,&words)==nil{
  text=strings.Join(words," ")
 }else if json.Unmarshal(raw,&text)!=nil{return nil,errors.New("DiffSinger ph_dur은 숫자 배열 또는 공백 구분 문자여야 합니다")}
 for _,word:=range strings.Fields(text){
  v,err:=strconv.ParseFloat(word,64)
  if err!=nil{return nil,err}
  nums=append(nums,v)
 }
 return nums,nil
}
func dsPhonemes(raw json.RawMessage)([]string,error){
 var tokens []string
 if json.Unmarshal(raw,&tokens)==nil{return tokens,nil}
 var text string
 if err:=json.Unmarshal(raw,&text);err!=nil{return nil,err}
 return strings.Fields(text),nil
}
func deriveDSPhonemeCues(path string,songDuration float64)([]lyricTimingCue,error){
 if err:=requireExistingFile(path);err!=nil{return nil,err}
 stat,err:=os.Lstat(path);if err!=nil{return nil,err}
 if stat.Size()>4<<20{return nil,errors.New("DiffSinger DS 악보는 4MB 이하여야 합니다")}
 raw,err:=os.ReadFile(path);if err!=nil{return nil,err}
 var segments []map[string]json.RawMessage
 if err=json.Unmarshal(raw,&segments);err!=nil{return nil,fmt.Errorf("DiffSinger 악보 JSON: %w",err)}
 if len(segments)==0||len(segments)>60{return nil,errors.New("DiffSinger 노래 구간은 1~60개여야 합니다")}
 cues:=[]lyricTimingCue{}
 last:= -1.0
 for number,segment:=range segments{
  var offset float64
  if err=json.Unmarshal(segment["offset"],&offset);err!=nil||math.IsNaN(offset)||math.IsInf(offset,0)||offset<0{
   return nil,fmt.Errorf("DiffSinger %d 구간 offset이 유효하지 않습니다",number+1)
  }
  phonemes,err:=dsPhonemes(segment["ph_seq"])
  if err!=nil{return nil,fmt.Errorf("DiffSinger %d 구간 음소: %w",number+1,err)}
  durations,err:=dsFloats(segment["ph_dur"])
  if err!=nil{return nil,fmt.Errorf("DiffSinger %d 구간 발음 길이: %w",number+1,err)}
  if len(phonemes)==0||len(phonemes)!=len(durations){
   return nil,fmt.Errorf("DiffSinger %d 구간 음소와 음소 길이 개수가 다릅니다",number+1)
  }
  cursor:=offset
  for i,ph:=range phonemes{
   length:=durations[i]
   if math.IsNaN(length)||math.IsInf(length,0)||length<=0||length>30{
    return nil,fmt.Errorf("DiffSinger %d 구간 %d 음소 길이가 유효하지 않습니다",number+1,i+1)
   }
   start:=cursor
   end:=cursor+length
   cursor=end
   if start<last-0.01{return nil,errors.New("DiffSinger 음소 시간이 겹쳐 자동 립싱크를 만들 수 없습니다")}
   if end>songDuration+.05{return nil,errors.New("DiffSinger 음소 타이밍이 실제 음악 길이를 초과합니다")}
   if end-start<.05 {
    // Very short phonemes must not be silently discarded: accumulate by
    // extending the immediately previous cue's speech window.
    if len(cues)>0&&start-cues[len(cues)-1].EndSec<.02{
     cues[len(cues)-1].EndSec=end
     last=end
     continue
    }
    return nil,errors.New("0.05초 미만 독립 음소를 안전하게 자동 정렬할 수 없습니다")
   }
   token:=strings.TrimSpace(ph)
   if token==""{token="sp"}
   if len([]rune(token))>100{return nil,errors.New("DiffSinger 음소 이름이 100자를 초과합니다")}
   cues=append(cues,lyricTimingCue{StartSec:start,EndSec:end,Lyric:token})
   last=end
   if len(cues)>maxPhonemeCues{return nil,errors.New("음소 구간이 4000개를 초과합니다")}
  }
 }
 if len(cues)==0{return nil,errors.New("추출한 DiffSinger 음소가 없습니다")}
 return cues,nil
}
func publishDSAlignment(scorePath,output string,duration float64)error{
 if !strings.EqualFold(filepath.Ext(output),".json"){return errors.New("음소 타임라인 출력은 JSON이어야 합니다")}
 if err:=preventOverwrite(output);err!=nil{return err}
 cues,err:=deriveDSPhonemeCues(scorePath,duration);if err!=nil{return err}
 raw,err:=encodeLyricTiming(cues);if err!=nil{return err}
 tmp,err:=os.CreateTemp(filepath.Dir(output),".myvocal-ds-phonemes-*.json")
 if err!=nil{return err}
 temp:=tmp.Name()
 defer os.Remove(temp)
 _,err=tmp.Write(raw)
 if err==nil{err=tmp.Sync()}
 if e:=tmp.Close();err==nil{err=e}
 if err!=nil{return err}
 if err=os.Link(temp,output);err!=nil{return fmt.Errorf("새 DiffSinger 음소 JSON 저장 실패: %w",err)}
 return nil
}
