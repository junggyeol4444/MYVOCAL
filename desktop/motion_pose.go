package main

// 원본 31·32항: 기존 Windows EXE 내부에서만 실행하는 실제 자세 추출.
// 사용자가 등록·동의한 동작 영상과 설치된 MediaPipe Task 모델을
// 개별 임시 폴더로 복사해 추론한다. 원본/모델/사용자 데이터는 수정하지 않는다.
import (
 "bytes"
 "context"
 _ "embed"
 "encoding/json"
 "math"
 "net/http"
 "os"
 "os/exec"
 "path/filepath"
 "runtime"
 "strings"
 "time"
)

//go:embed motion_pose_worker.py
var motionPoseWorker []byte

const motionPoseMaxUpload int64 = 60 << 20
var motionPoseSlot = make(chan struct{}, 1)

type motionPoseFrame struct {
 TimeMs int `json:"timeMs"`
 Angles map[string]float64 `json:"angles"`
 Lift float64 `json:"lift"`
}
type motionPoseResult struct {
 Format string `json:"format"`
 Version int `json:"version"`
 Source string `json:"source"`
 DurationMs int `json:"durationMs"`
 Frames []motionPoseFrame `json:"frames"`
 Measurement string `json:"measurement"`
}

func (a *appServer) motionPoseAnalyze(w http.ResponseWriter,r *http.Request) {
 if r.Method!=http.MethodPost {jsonError(w,405,"실제 동작 영상의 POST 요청만 지원합니다");return}
 if !a.authorizeSinging(w,r) {return}
 select {case motionPoseSlot<-struct{}{}:defer func(){<-motionPoseSlot}();default:jsonError(w,409,"다른 실제 동작 추출이 진행 중입니다");return}
 r.Body=http.MaxBytesReader(w,r.Body,motionPoseMaxUpload+(2<<20))
 if err:=r.ParseMultipartForm(1<<20);err!=nil {jsonError(w,400,"동작 참고 영상 요청 크기 또는 형식 오류");return}
 if r.MultipartForm!=nil {defer r.MultipartForm.RemoveAll()}
 if r.FormValue("rights")!="confirmed" {jsonError(w,403,"본인 촬영 또는 사용 권한을 확보한 실제 영상이어야 합니다");return}
 python,model:=r.FormValue("python"),r.FormValue("model")
 if len(python)>1024||len(model)>1024||!filepath.IsAbs(python)||!filepath.IsAbs(model)||
  strings.ContainsAny(python+model,"\x00\r\n")||strings.ToLower(filepath.Ext(model))!=".task" {
  jsonError(w,400,"로컬 Python 및 MediaPipe Pose .task 모델의 절대 경로가 필요합니다");return
 }
 if runtime.GOOS=="windows"&&!strings.EqualFold(filepath.Base(python),"python.exe") {
  jsonError(w,400,"Windows Python.exe를 지정하세요");return
 }
 if ensureRegular(python)!=nil||ensureRegular(model)!=nil {
  jsonError(w,400,"설치된 Python 또는 MediaPipe Task 모델 파일을 찾을 수 없습니다");return
 }
 files:=r.MultipartForm.File["video"]
 if len(files)!=1||files[0].Size<1024||files[0].Size>motionPoseMaxUpload {
  jsonError(w,400,"동작 참고 영상 파일 한 개(60MB 이하)가 필요합니다");return
 }
 ext:=strings.ToLower(filepath.Ext(files[0].Filename))
 if ext!=".mp4"&&ext!=".webm"&&ext!=".mov"&&ext!=".m4v" {
  jsonError(w,400,"동작 참고 영상은 MP4/WebM/MOV/M4V만 가능합니다");return
 }
 dir,err:=os.MkdirTemp("","myvocal-motion-pose-")
 if err!=nil {jsonError(w,500,"원본과 분리된 자세 추출 폴더를 만들 수 없습니다");return}
 defer os.RemoveAll(dir)
 video:=filepath.Join(dir,"user-motion"+ext)
 script:=filepath.Join(dir,"motion_pose_worker.py")
 if err=stageRegisteredRVCUpload(files[0],video,motionPoseMaxUpload);err!=nil {
  jsonError(w,422,"실제 동작 참고 영상의 임시 사본을 만들지 못했습니다");return
 }
 if err=os.WriteFile(script,motionPoseWorker,0600);err!=nil {
  jsonError(w,500,"내장 자세 추출 엔진을 준비하지 못했습니다");return
 }
 ctx,cancel:=context.WithTimeout(r.Context(),5*time.Minute)
 defer cancel()
 cmd:=exec.CommandContext(ctx,python,"-I",script,"--video",video,"--model",model)
 cmd.Dir=dir;cmd.Stdin=nil
 var stdout,stderr bytes.Buffer
 cmd.Stdout=&limitedRVCLog{buffer:&stdout,max:2<<20}
 cmd.Stderr=&limitedRVCLog{buffer:&stderr,max:1200}
 if err=cmd.Run();err!=nil {
  if ctx.Err()!=nil {jsonError(w,504,"실제 동작 추출이 취소되었거나 제한 시간을 초과했습니다");return}
  jsonError(w,502,"로컬 MediaPipe 자세 추출 실패: "+stderr.String());return
 }
 var result motionPoseResult
 if err=json.Unmarshal(stdout.Bytes(),&result);err!=nil||result.Format!="MYVOCAL_MOTION_CAPTURE31"||
  result.Version!=1||result.Source!="installed-local-mediapipe-pose-task"||
  result.DurationMs<1||result.DurationMs>30000||len(result.Frames)<3||len(result.Frames)>300 {
  jsonError(w,502,"로컬 자세 추출 결과가 실제 관절 시간표 형식이 아닙니다");return
 }
 var previous=-1
 for _,frame:=range result.Frames {
  if frame.TimeMs<=previous||frame.TimeMs<0||frame.TimeMs>result.DurationMs||
   math.IsNaN(frame.Lift)||math.IsInf(frame.Lift,0)||math.Abs(frame.Lift)>.14||
   len(frame.Angles)!=10 {
   jsonError(w,502,"추출된 동작 시간표에 유효하지 않은 프레임이 있습니다");return
  }
  for _,key:=range []string{"spine","head","leftUpperArm","rightUpperArm","leftLowerArm",
   "rightLowerArm","leftUpperLeg","rightUpperLeg","leftLowerLeg","rightLowerLeg"} {
   value,ok:=frame.Angles[key]
   if !ok||math.IsNaN(value)||math.IsInf(value,0)||math.Abs(value)>70.01 {
    jsonError(w,502,"추출된 관절 회전이 모델의 안전 범위를 벗어났습니다");return
   }
  }
  previous=frame.TimeMs
 }
 w.Header().Set("Content-Type","application/json; charset=utf-8")
 w.Header().Set("Cache-Control","no-store")
 w.Header().Set("X-Content-Type-Options","nosniff")
 _,_=w.Write(stdout.Bytes())
}
