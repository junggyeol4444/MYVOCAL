package main

import (
 "bytes"
 "context"
 "encoding/json"
 "errors"
 "fmt"
 "io"
 "math"
 "os"
 "path/filepath"
 "strconv"
 "strings"
)

// One local pipeline: user-licensed voice -> optional RVC -> PCM music mix ->
// phoneme-aligned 2D scene rendering -> H.264/AAC MP4 publication.
// No HTTP server, browser, online account, or silent user-file replacement.
type mvProductionRequest struct {
 Python string
 FFmpeg string
 Portrait string
 Vocal string
 Accompaniment string
 Alignment string
 Storyboard string
 VoiceModel string
 RVCInstall string
 Output string
 Style string
 Pitch int
}

type mvAlignment struct {
 Format string `json:"format"`
 Version int `json:"version"`
 Cues []struct{
  Start float64 `json:"startSec"`
  End float64 `json:"endSec"`
  Lyric string `json:"lyric"`
 } `json:"cues"`
}
func validateMVAlignment(path string,duration float64)error{
 if err:=requireExistingFile(path);err!=nil{return err}
 file,err:=os.Lstat(path)
 if err!=nil{return err}
 if file.Size()>1<<20{return errors.New("가사 싱크 JSON은 최대 1MB입니다")}
 raw,err:=os.ReadFile(path);if err!=nil{return err}
 var document mvAlignment
 if err=json.Unmarshal(raw,&document);err!=nil{return fmt.Errorf("음소·가사 시간 JSON 읽기: %w",err)}
 if document.Format!="MYVOCAL_LYRIC_ALIGNMENT"||document.Version!=1{return errors.New("가사 싱크 형식 MYVOCAL_LYRIC_ALIGNMENT / version 1이 필요합니다")}
 if len(document.Cues)==0||len(document.Cues)>400{return errors.New("가사 싱크 구간은 1~400개여야 합니다")}
 prev:= -1.0
 for i,c:=range document.Cues{
  if math.IsNaN(c.Start)||math.IsNaN(c.End)||math.IsInf(c.Start,0)||math.IsInf(c.End,0)||
  c.Start<0||c.End<=c.Start||c.Start<prev||c.End>duration+0.05||c.End-c.Start<0.05||
  len([]rune(c.Lyric))>100{return fmt.Errorf("가사 싱크 %d번의 시간/가사 범위 오류",i+1)}
  prev=c.Start
 }
 return nil
}
func validateMVProduction(r mvProductionRequest)error{
 for _,field:=range []string{r.Python,r.FFmpeg,r.Portrait,r.Vocal,r.Accompaniment,r.Alignment,r.Storyboard,r.VoiceModel,r.RVCInstall,r.Output,r.Style}{
  if strings.ContainsRune(field,0)||strings.ContainsAny(field,"\r\n"){return errors.New("경로·설정에 제어 문자가 있습니다")}
 }
 for label,path:=range map[string]string{"Python":r.Python,"FFmpeg":r.FFmpeg,"캐릭터 이미지":r.Portrait,"보컬 음원":r.Vocal,"반주 음원":r.Accompaniment,"가사 싱크":r.Alignment}{
  if err:=requireExistingFile(path);err!=nil{return fmt.Errorf("%s: %w",label,err)}
 }
 if strings.ToLower(filepath.Ext(r.Output))!=".mp4"{return errors.New("출력은 새로운 .mp4 파일이어야 합니다")}
 if err:=preventOverwrite(r.Output);err!=nil{return err}
 if ext:=strings.ToLower(filepath.Ext(r.Portrait));ext!=".png"&&ext!=".jpg"&&ext!=".jpeg"{
  return errors.New("이미지는 PNG/JPG/JPEG 파일이어야 합니다")
 }
 if !strings.EqualFold(filepath.Ext(r.FFmpeg),".exe")||!strings.EqualFold(filepath.Ext(r.Python),".exe"){
  return errors.New("Windows용 Python.exe와 FFmpeg.exe가 필요합니다")
 }
 switch r.Style{
 case "static","performance","story","mixed":
 default:return errors.New("영상 연출 방식은 static / performance / story / mixed만 지원합니다")
 }
 if r.Pitch< -24||r.Pitch>24{return errors.New("음색 변환 반음 이동은 -24~24입니다")}
 if r.VoiceModel!=""{
  if err:=requireDirectory(r.RVCInstall);err!=nil{return fmt.Errorf("RVC 설치 폴더: %w",err)}
  if err:=requireExistingFile(r.VoiceModel);err!=nil{return fmt.Errorf("본인 음색 모델: %w",err)}
  if !strings.EqualFold(filepath.Ext(r.VoiceModel),".pth"){return errors.New("보컬 음색 모델은 .pth 파일이어야 합니다")}
  if err:=requireExistingFile(filepath.Join(r.RVCInstall,"infer","cli.py"));err!=nil{return errors.New("RVC 설치 폴더에 infer/cli.py가 없습니다")}
 }
 voice,err:=openNativePCM(r.Vocal);if err!=nil{return fmt.Errorf("원본 보컬 PCM: %w",err)}
 defer voice.file.Close()
 backing,err:=openNativePCM(r.Accompaniment);if err!=nil{return fmt.Errorf("반주 PCM: %w",err)}
 defer backing.file.Close()
 if voice.rate!=backing.rate||voice.channels!=backing.channels||voice.frames!=backing.frames{
  return errors.New("보컬과 반주 WAV의 샘플레이트·채널·프레임 수가 달라 동기화할 수 없습니다")
 }
 seconds:=float64(voice.frames)/float64(voice.rate)
 if seconds<.2||seconds>360{return errors.New("음악+MV 제작의 전체 곡 길이는 0.2~360초입니다")}
 if err:=validateMVAlignment(r.Alignment,seconds);err!=nil{return err}
 if r.Storyboard!=""{
  doc,err:=openNativeStoryboard(r.Storyboard);if err!=nil{return fmt.Errorf("스토리보드: %w",err)}
  if err=validateNativeStoryboard(doc,seconds);err!=nil{return err}
 }
 if _,err:=locateWorker("viseme_2d_worker.py");err!=nil{return err}
 return nil
}

func runMusicMVProduction(ctx context.Context,r mvProductionRequest,logLine func(string))error{
 if err:=validateMVProduction(r);err!=nil{return err}
 scratch,err:=os.MkdirTemp(filepath.Dir(r.Output),".myvocal-music-video-*")
 if err!=nil{return err}
 defer os.RemoveAll(scratch)
 vocal:=r.Vocal
 if r.VoiceModel!=""{
  logLine("\r\n1/4 본인 음색 RVC 모델로 보컬 변환\r\n")
  rawVoice:=filepath.Join(scratch,"vocal-voice-model-raw.wav")
  req:=request{Task:taskRVCConvert,Python:r.Python,Engine:r.RVCInstall,
   Input:r.Vocal,Auxiliary:r.VoiceModel,Output:rawVoice,Option:strconv.Itoa(r.Pitch)}
  if err=executeJob(ctx,req,logLine);err!=nil{return fmt.Errorf("RVC 음색 변환 중단: %w",err)}
  // Actual RVC neural output commonly changes source rate and may contain
  // metadata chunks. Convert to the backing's exact PCM frame layout.
  backing,openErr:=openNativePCM(r.Accompaniment)
  if openErr!=nil{return fmt.Errorf("반주 PCM 읽기: %w",openErr)}
  rate,channels,frames:=backing.rate,backing.channels,backing.frames
  backing.file.Close()
  vocal=filepath.Join(scratch,"vocal-voice-model.wav")
  if err=matchSongPCM(ctx,r.FFmpeg,rawVoice,vocal,rate,channels,frames,logLine);err!=nil{
   return fmt.Errorf("RVC 음색 변환 길이·채널 정렬: %w",err)
  }
 }
 // The lip animation requires a guide vocal with exact song timing.
 // A pitch/voice model is not allowed to silently change duration/channel/rate.
 guide,err:=openNativePCM(vocal);if err!=nil{return fmt.Errorf("보컬 PCM 확인: %w",err)}
 backup,err:=openNativePCM(r.Accompaniment)
 if err!=nil{guide.file.Close();return err}
 matching:=guide.rate==backup.rate&&guide.channels==backup.channels&&guide.frames==backup.frames
 guide.file.Close();backup.file.Close()
 if !matching{return errors.New("보컬 변환 결과와 반주의 PCM 길이/채널/샘플레이트 불일치. 원본은 유지됩니다")}
 logLine("\r\n2/4 로컬 반주·보컬 전체 길이 WAV 믹싱\r\n")
 soundtrack:=filepath.Join(scratch,"full-song.wav")
 if err=mixNativePCM(ctx,request{Task:taskMixWAV,Input:r.Accompaniment,Auxiliary:vocal,Output:soundtrack,Option:"100"},logLine);err!=nil{return err}
 worker,err:=locateWorker("viseme_2d_worker.py")
 if err!=nil{return err}
 logLine("\r\n3/4 가사 시간에 맞춘 2D 립싱크·MV 장면 제작\r\n")
 webm:=filepath.Join(scratch,"lip-sync.webm")
 task:=jobSpec{exe:r.Python,args:[]string{worker,
  "--image",r.Portrait,"--audio",vocal,"--alignment",r.Alignment,
  "--soundtrack",soundtrack,"--scene-mode",r.Style,"--output",webm,
  "--ffmpeg",r.FFmpeg}}
 if r.Storyboard!=""{task.args=append(task.args,"--storyboard",r.Storyboard)}
 if err=runProcess(ctx,task,logLine);err!=nil{return fmt.Errorf("2D 립싱크 생성 실패: %w",err)}
 if err=requireExistingFile(webm);err!=nil{return fmt.Errorf("가창 영상 WebM 누락: %w",err)}
 logLine("\r\n4/4 완성 반주·보컬이 들어 있는 H.264/AAC MP4 출력\r\n")
 temp:=filepath.Join(scratch,"complete-song-mv.mp4")
 ffmpegArgs:=[]string{
  "-hide_banner","-loglevel","error","-nostdin","-n",
  "-i",webm,"-map","0:v:0","-map","0:a:0",
  "-c:v","libx264","-preset","medium","-crf","20","-pix_fmt","yuv420p",
  "-c:a","aac","-b:a","192k","-movflags","+faststart",temp,
 }
 if err=runProcess(ctx,jobSpec{exe:r.FFmpeg,args:ffmpegArgs},logLine);err!=nil{return fmt.Errorf("MP4 H.264/AAC 인코딩 실패: %w",err)}
 f,err:=os.Open(temp);if err!=nil{return err}
 var header [12]byte
 _,err=io.ReadFull(f,header[:])
 f.Close()
 if err!=nil||!bytes.Equal(header[4:8],[]byte("ftyp")){return errors.New("최종 MP4 헤더가 잘못됐습니다")}
 stat,err:=os.Stat(temp);if err!=nil{return err}
 if stat.Size()<2048{return errors.New("완성 MP4가 비어 있습니다")}
 if err=ctx.Err();err!=nil{return err}
 if err=os.Link(temp,r.Output);err!=nil{return fmt.Errorf("기존 파일 보호를 위해 완성 MP4를 덮어쓰지 않았습니다: %w",err)}
 logLine(fmt.Sprintf("\r\n전체 음악+2D MV 파일 완성: %s (%d bytes)\r\n",r.Output,stat.Size()))
 return nil
}
