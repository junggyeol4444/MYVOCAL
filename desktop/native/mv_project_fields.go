package main

import (
 "errors"
 "fmt"
 "os"
 "os/exec"
 "path/filepath"
 "strings"
)

// Project selections are suggestions shown to the operator, never automatic
// execution. Missing and replaced files are not silently accepted.
type mvProjectFields struct {
 Python string
 FFmpeg string
 Portrait string
 Vocal string
 Backing string
 Alignment string
 VoiceModel string
 Output string
}

func regularStudioAsset(path string)bool{
 if !filepath.IsAbs(path){return false}
 info,err:=os.Lstat(path)
 return err==nil&&info.Mode().IsRegular()
}
func currentMVProjectFields()(mvProjectFields,error){
 p,projectPath:=studioSnapshot()
 if projectPath==""{return mvProjectFields{},errors.New("먼저 프로젝트를 생성하거나 열어야 합니다")}
 var result mvProjectFields
 for _,name:=range []string{"python.exe","python"}{
  if val,err:=exec.LookPath(name);err==nil{
   if path,err:=filepath.Abs(val);err==nil&&regularStudioAsset(path){
    result.Python=path;break
   }
  }
 }
 if val,err:=exec.LookPath("ffmpeg.exe");err==nil{
  if path,err:=filepath.Abs(val);err==nil&&regularStudioAsset(path){result.FFmpeg=path}
 }
 if regularStudioAsset(p.Character){
  ext:=strings.ToLower(filepath.Ext(p.Character))
  if ext==".png"||ext==".jpg"||ext==".jpeg"{result.Portrait=p.Character}
 }
 if regularStudioAsset(p.VoiceModel)&&strings.EqualFold(filepath.Ext(p.VoiceModel),".pth"){
  result.VoiceModel=p.VoiceModel
 }
 for _,asset:=range p.Assets{
  if !regularStudioAsset(asset.Path){continue}
  ext:=strings.ToLower(filepath.Ext(asset.Path))
  switch ext{
  case ".png",".jpg",".jpeg":
   // Explicit project Character field always takes priority over library order.
   if result.Portrait==""{result.Portrait=asset.Path}
  case ".wav":
   switch asset.Task{
   case taskNames[taskScoreVocal],taskNames[taskRVCConvert],taskNames[taskDiffSinger],taskNames[taskMicRecord]:
    result.Vocal=asset.Path
   case taskNames[taskMusicGen],taskNames[taskLongMusicGen],taskNames[taskSoundFont]:
    result.Backing=asset.Path
   case taskNames[taskMixWAV]:
    // Full mix is not a backing track; do not double-mix it.
   default:
    // An arbitrary WAV is not presumed to be a vocal or backing track.
   }
  case ".json":
   // Check actual format, not just the filename.
   if validateMVAlignment(asset.Path,360)==nil{result.Alignment=asset.Path}
  }
 }
 // Select a new path; never replace an existing clip or project file.
 folder:=filepath.Dir(projectPath)
 for i:=1;i<=999;i++{
  candidate:=filepath.Join(folder,fmt.Sprintf("MYVOCAL-MV-%03d.mp4",i))
  if _,err:=os.Lstat(candidate);os.IsNotExist(err){result.Output=candidate;break}
 }
 return result,nil
}
