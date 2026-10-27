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
 "unicode"
)

const nativeStoryboardFormat="MYVOCAL_NATIVE_STORYBOARD"
type mvStoryboardScene struct{
 StartSec float64 `json:"startSec"`
 EndSec float64 `json:"endSec"`
 Mode string `json:"mode"`
 Description string `json:"description"`
}
type mvStoryboard struct{
 Format string `json:"format"`
 Version int `json:"version"`
 Scenes []mvStoryboardScene `json:"scenes"`
}
func validateNativeStoryboard(doc mvStoryboard, songLength float64)error{
 if doc.Format!=nativeStoryboardFormat||doc.Version!=1{return errors.New("MYVOCAL 네이티브 스토리보드 버전 1만 지원합니다")}
 if len(doc.Scenes)<1||len(doc.Scenes)>100{return errors.New("장면은 1~100개여야 합니다")}
 last:= -1.0
 for index,scene:=range doc.Scenes{
  if math.IsNaN(scene.StartSec)||math.IsNaN(scene.EndSec)||math.IsInf(scene.StartSec,0)||
   math.IsInf(scene.EndSec,0)||scene.StartSec<0||scene.EndSec<=scene.StartSec||
   scene.EndSec>360||scene.StartSec<last||scene.EndSec-scene.StartSec<0.10{
   return fmt.Errorf("%d번 장면의 시작/종료가 범위를 벗어나거나 겹칩니다",index+1)
  }
  if songLength>0&&scene.EndSec>songLength+.05{return fmt.Errorf("%d번 장면이 음악 길이 %.2f초를 초과합니다",index+1,songLength)}
  switch scene.Mode{case "static","performance","story","mixed":default:return fmt.Errorf("%d번 장면의 연출 방식이 유효하지 않습니다",index+1)}
  if len([]rune(scene.Description))>160{return fmt.Errorf("%d번 장면의 설명은 160자 이하입니다",index+1)}
  for _,r:=range scene.Description{if unicode.IsControl(r){return fmt.Errorf("%d번 장면의 설명에 제어 문자가 있습니다",index+1)}}
  last=scene.EndSec
 }
 return nil
}
func parseNativeStoryboardText(source string)(mvStoryboard,error){
 result:=mvStoryboard{Format:nativeStoryboardFormat,Version:1}
 if len(source)>50000{return result,errors.New("스토리보드 편집 내용이 너무 큽니다")}
 lines:=strings.Split(strings.ReplaceAll(source,"\r\n","\n"),"\n")
 for lineNo,line:=range lines{
  line=strings.TrimSpace(line)
  if line==""||strings.HasPrefix(line,"#"){continue}
  parts:=strings.SplitN(line,"|",4)
  if len(parts)!=4{return result,fmt.Errorf("%d행: 시작초|종료초|연출|장면설명 형식입니다",lineNo+1)}
  start,err:=strconv.ParseFloat(strings.TrimSpace(parts[0]),64)
  if err!=nil{return result,fmt.Errorf("%d행: 시작 시간은 초 숫자여야 합니다",lineNo+1)}
  end,err:=strconv.ParseFloat(strings.TrimSpace(parts[1]),64)
  if err!=nil{return result,fmt.Errorf("%d행: 종료 시간은 초 숫자여야 합니다",lineNo+1)}
  result.Scenes=append(result.Scenes,mvStoryboardScene{StartSec:start,EndSec:end,
   Mode:strings.TrimSpace(parts[2]),Description:strings.TrimSpace(parts[3])})
 }
 return result,validateNativeStoryboard(result,0)
}
func storyboardText(doc mvStoryboard)string{
 var sb strings.Builder
 for _,s:=range doc.Scenes{
  fmt.Fprintf(&sb,"%.3f|%.3f|%s|%s\r\n",s.StartSec,s.EndSec,s.Mode,s.Description)
 }
 return sb.String()
}
func openNativeStoryboard(path string)(mvStoryboard,error){
 var empty mvStoryboard
 stat,err:=os.Lstat(path)
 if err!=nil||!stat.Mode().IsRegular()||stat.Size()>128<<10{return empty,errors.New("스토리보드 JSON이 없거나 128KB를 초과했습니다")}
 b,err:=os.ReadFile(path);if err!=nil{return empty,err}
 var doc mvStoryboard
 if err=json.Unmarshal(b,&doc);err!=nil{return empty,err}
 if err=validateNativeStoryboard(doc,0);err!=nil{return empty,err}
 return doc,nil
}
func saveNativeStoryboard(path,text string)error{
 if !strings.EqualFold(filepath.Ext(path),".json"){return errors.New("스토리보드 출력은 JSON이어야 합니다")}
 if err:=preventOverwrite(path);err!=nil{return err}
 doc,err:=parseNativeStoryboardText(text)
 if err!=nil{return err}
 payload,err:=json.MarshalIndent(doc,"","  ")
 if err!=nil{return err}
 tmp,err:=os.CreateTemp(filepath.Dir(path),".myvocal-storyboard-*.json")
 if err!=nil{return err}
 name:=tmp.Name()
 defer os.Remove(name)
 _,err=tmp.Write(payload)
 if err==nil{err=tmp.Sync()}
 if e:=tmp.Close();err==nil{err=e}
 if err!=nil{return err}
 if err=os.Link(name,path);err!=nil{return fmt.Errorf("기존 파일 보호를 위해 스토리보드 저장을 중단했습니다: %w",err)}
 return nil
}
